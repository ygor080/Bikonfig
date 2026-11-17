"""Testes isolados: sem rede, banco real ou chamadas de IA."""
import ast
import json
import re
import types
import sys
import unittest
from pathlib import Path
from urllib.parse import urljoin, urlparse, urlencode

API = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(API))
from product_identity import normalize_product_url, deduplicate_products
from product_context import prepare_product_context
from spec_evidence import validate_categorization


def functions(filename, names, namespace):
    namespace.setdefault('normalize_product_url', normalize_product_url)
    namespace.setdefault('deduplicate_products', deduplicate_products)
    namespace.setdefault('urlencode', urlencode)
    namespace.setdefault('prepare_product_context', prepare_product_context)
    namespace.setdefault('validate_categorization', validate_categorization)
    tree = ast.parse((API / filename).read_text(encoding="utf-8-sig"))
    selected = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in names]
    for node in selected:
        node.decorator_list = []
    exec(compile(ast.Module(body=selected, type_ignores=[]), filename, "exec"), namespace)
    return namespace


class ManufacturerTests(unittest.TestCase):
    def shopify(self, profile=None):
        product = {"title": "Produto", "handle": "produto", "vendor": "Fabricante explícito",
                   "variants": [{"id": 1, "available": True, "price": "10.00"}]}
        response = types.SimpleNamespace(status_code=200, raise_for_status=lambda: None,
                                         json=lambda: {"products": [product]})
        scope = functions("scraper.py", ["collect_products_shopify", "parse_shopify_price"], {
            "re": re, "urlparse": urlparse, "SHOPIFY_PAGE_SIZE": 250, "USER_AGENT": "Teste",
            "requests": types.SimpleNamespace(get=lambda *a, **k: response)})
        return scope["collect_products_shopify"]("https://loja.test/collections/pecas", profile)[0]

    def test_vendor_not_assumed_to_be_manufacturer(self):
        self.assertIsNone(self.shopify()["manufacturer"])

    def test_explicit_profile_can_map_verified_manufacturer(self):
        self.assertEqual(self.shopify({"manufacturer_field": "vendor"})["manufacturer"], "Fabricante explícito")
        self.assertIsNone(self.shopify({"manufacturer_field": "missing"})["manufacturer"])

    def test_html_uses_optional_manufacturer_selector(self):
        class Node:
            def get_text(self, *a, **k):
                return "Fabricante A"

            def get(self, key, default=""):
                return "/produto"

        card = types.SimpleNamespace(select_one=lambda selector: Node())
        scope = functions("scraper.py", ["collect_products_custom_html"], {
            "fetch_html": lambda *a: "HTML",
            "BeautifulSoup": lambda *a: types.SimpleNamespace(select=lambda *a: [card]),
            "urljoin": urljoin, "parse_price": lambda _: 10})
        profile = {key: key for key in ["product_card", "name", "price", "image", "link"]}
        collect = scope["collect_products_custom_html"]
        self.assertIsNone(collect("https://loja.test/", profile)[0]["manufacturer"])
        self.assertEqual(collect("https://loja.test/", {**profile, "manufacturer": ".brand"})[0]["manufacturer"], "Fabricante A")

    def save(self, manufacturer, existing=None):
        queries = []

        class Cursor:
            def __enter__(self):
                return self

            def __exit__(self, *args):
                pass

            def execute(self, sql, values):
                self.sql = sql
                queries.append((sql, values))
                self_outer.assertEqual(sql.count("%s"), len(values))

            def fetchone(self):
                return existing if self.sql.lstrip().startswith("SELECT") else {"id": "product"}

        self_outer = self
        conn = types.SimpleNamespace(cursor=Cursor, commit=lambda: None)
        scope = functions("db.py", ["upsert_product"], {"json": json, "get_category_id": lambda *a: None})
        scope["upsert_product"](conn, source_id=1, name="Produto", product_url="https://loja.test/p",
                                image_url=None, price=10, category_slug=None, specs={}, ai_confidence=1,
                                needs_review=False, manufacturer=manufacturer)
        return queries

    def test_insert_stores_manufacturer_separately_from_source(self):
        queries = self.save("  Fabricante   A  ")
        sql, params = next(q for q in queries if "INSERT INTO products" in q[0])
        self.assertIn("manufacturer", sql)
        self.assertEqual(params[0], 1)
        self.assertEqual(params[-1], "Fabricante A")

    def test_recollection_without_manufacturer_preserves_known_value(self):
        for value in [None, "  ", {"invalid": True}]:
            queries = self.save(value, {"id": "product", "current_price": 10})
            sql, params = next(q for q in queries if "UPDATE products" in q[0])
            self.assertIn("ELSE COALESCE(%s, manufacturer) END", sql)
            self.assertIsNone(params[-2])

    def test_pipeline_passes_explicit_manufacturer_to_database(self):
        saved = []
        conn = types.SimpleNamespace(close=lambda: None)
        db = types.SimpleNamespace(get_connection=lambda: conn, get_or_create_source=lambda *a: 1,
                                   reconcile_product_urls=lambda *a: set(),
                                   save_raw_scrape=lambda *a, **k: None, upsert_product=lambda *a, **k: saved.append(k))
        scope = functions("scraper.py", ["scrape_and_store"], {
            "urlparse": urlparse, "get_profile": lambda domain: {"platform": "shopify", "display_name": "Loja A"},
            "robots_allows": lambda _: True, "db": db,
            "collect_products_shopify": lambda *a: [{"name": "Produto", "product_url": "https://loja.test/p",
                "raw_price_text": "10", "image_url": None, "price": 10, "manufacturer": "Fabricante A", "in_stock": False}],
            "categorize_product": lambda *a, **k: {"categoria": "quadro", "confianca": 1, "specs": {}, "opcional": False},
            "CONFIDENCE_THRESHOLD": 0.7, "time": types.SimpleNamespace(sleep=lambda _: None)})
        self.assertEqual(scope["scrape_and_store"]("https://loja.test/collections/pecas"), 1)
        self.assertEqual(saved[0]["manufacturer"], "Fabricante A")
        self.assertEqual(saved[0]["source_id"], 1)
        self.assertIs(saved[0]["in_stock"], False)


if __name__ == "__main__":
    unittest.main()
