import json
import re
import types
import unittest
from urllib.parse import urlparse
from test_manufacturer import functions
from product_identity import normalize_product_url, deduplicate_products


class IdentityTests(unittest.TestCase):
    def test_tracking_and_fragment_are_removed_without_discarding_variant_or_size(self):
        self.assertEqual(normalize_product_url("HTTPS://LOJA.TEST:443/p?variant=12&utm_source=x&size=M#foto"),
                         "https://loja.test/p?variant=12&size=M")
        self.assertNotEqual(normalize_product_url("https://loja.test/p?variant=12"), normalize_product_url("https://loja.test/p?variant=13"))
        self.assertNotEqual(normalize_product_url("https://loja.test/p?size=M"), normalize_product_url("https://loja.test/p?size=G"))
        self.assertIn("ref=parceiro", normalize_product_url("https://loja.test/p?ref=parceiro&fbclid=abc"))
        self.assertNotEqual(normalize_product_url("https://loja.test/P"), normalize_product_url("https://loja.test/p"))

    def test_equal_names_and_skus_do_not_merge_different_options(self):
        products = [{"name": "Pneu", "sku": "igual", "price": 10, "product_url": f"https://loja.test/p?variant={v}",
                     "external_variant_id": v} for v in [1, 2]]
        self.assertEqual(len(deduplicate_products(products)), 2)
        self.assertEqual(len(deduplicate_products([products[0], {**products[0], "product_url": "https://outra.test/p?variant=1"}])), 2)
        self.assertEqual(len(deduplicate_products([{k: val for k, val in p.items() if k != "external_variant_id"} for p in products])), 2)

    def test_repeated_listing_is_deduplicated_but_conflicting_values_require_review(self):
        first = {"name": "Pneu M", "price": 10, "in_stock": True, "product_url": "https://loja.test/p?utm_source=a"}
        repeated = {**first, "product_url": "https://loja.test/p?utm_source=b"}
        unique = deduplicate_products([first, repeated])
        self.assertEqual(len(unique), 1)
        self.assertFalse(unique[0].get("identity_conflict", False))
        conflict = deduplicate_products([first, {**repeated, "price": 20, "name": "Pneu G"}])
        self.assertTrue(conflict[0]["identity_conflict"])

    def test_shopify_preserves_each_variant_options_price_stock_image_and_purchase_link(self):
        product = {"id": 90, "title": "Quadro", "handle": "quadro", "options": [{"name": "Tamanho"}, {"name": "Cor"}],
            "images": [{"id": 1, "src": "https://loja.test/m.jpg"}, {"id": 2, "src": "https://loja.test/g.jpg"}],
            "variants": [
                {"id": 10, "title": "M / Azul", "option1": "M", "option2": "Azul", "sku": "M-A", "price": "100", "available": False, "image_id": 1},
                {"id": 11, "title": "G / Verde", "option1": "G", "option2": "Verde", "sku": "G-V", "price": "200", "available": True, "image_id": 2}]}
        response = types.SimpleNamespace(status_code=200, raise_for_status=lambda: None, json=lambda: {"products": [product, product]})
        scope = functions("scraper.py", ["collect_products_shopify", "parse_shopify_price"], {
            "re": re, "urlparse": urlparse, "SHOPIFY_PAGE_SIZE": 250, "USER_AGENT": "Teste",
            "requests": types.SimpleNamespace(get=lambda *a, **k: response)})
        result = scope["collect_products_shopify"]("https://loja.test/collections/quadros")
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]["variant_options"], {"Tamanho": "M", "Cor": "Azul"})
        self.assertEqual(result[0]["price"], 100)
        self.assertIs(result[0]["in_stock"], False)
        self.assertEqual(result[1]["price"], 200)
        self.assertIs(result[1]["in_stock"], True)
        self.assertEqual(result[1]["image_url"], "https://loja.test/g.jpg")
        self.assertEqual(result[1]["product_url"], "https://loja.test/products/quadro?variant=11")
        self.assertEqual(result[1]["name"], "Quadro — G / Verde")
        product["variants"].append({"title": "Sem ID", "price": "300"})
        self.assertEqual(len(scope["collect_products_shopify"]("https://loja.test/collections/quadros")), 2)

    def test_html_extracts_explicit_variant_metadata(self):
        class Node:
            def __init__(self, text): self.text = text
            def get_text(self, *a, **k): return self.text
            def get(self, key, default=""): return "/p?size=M&utm_campaign=teste" if key == "href" else "/m.jpg"
        values = {"name": "Quadro", "price": "100", "image": "", "link": "", "size": "M", "sku": "Q-M"}
        card = types.SimpleNamespace(select_one=lambda selector: Node(values[selector]) if selector in values else None)
        scope = functions("scraper.py", ["collect_products_custom_html"], {
            "fetch_html": lambda *a: "HTML", "urljoin": __import__('urllib.parse', fromlist=['urljoin']).urljoin,
            "parse_price": lambda _: 100, "BeautifulSoup": lambda *a: types.SimpleNamespace(select=lambda *a: [card])})
        profile = {k: k for k in ["name", "price", "image", "link"]}
        profile.update(product_card="card", sku="sku", variant_options={"Tamanho": "size"})
        result = scope["collect_products_custom_html"]("https://loja.test", profile)[0]
        self.assertEqual(result["product_url"], "https://loja.test/p?size=M")
        self.assertEqual(result["sku"], "Q-M")
        self.assertEqual(result["variant_title"], "M")
        self.assertEqual(result["name"], "Quadro — M")

    def test_existing_url_duplicates_are_archived_without_deleting_saved_links_or_history(self):
        rows = [
            {"id": "old-tracking", "product_url": "https://loja.test/p?utm_source=a", "name": "Quadro", "external_variant_id": None},
            {"id": "canonical", "product_url": "https://loja.test/p", "name": "Quadro", "external_variant_id": None},
            {"id": "other-size", "product_url": "https://loja.test/p?size=M", "name": "Quadro M", "external_variant_id": None}]
        rows.extend([
            {"id": "variant-m", "product_url": "https://loja.test/shared?utm_source=m", "name": "M", "external_variant_id": "10"},
            {"id": "variant-g", "product_url": "https://loja.test/shared?utm_source=g", "name": "G", "external_variant_id": "11"}
        ])
        queries = []
        class Cursor:
            def __enter__(self): return self
            def __exit__(self, *a): pass
            def execute(self, sql, values): queries.append((sql, values))
            def fetchall(self): return rows
        scope = functions("db.py", ["reconcile_product_urls"], {})
        conflicts = scope["reconcile_product_urls"](types.SimpleNamespace(cursor=Cursor, commit=lambda: None), 1)
        self.assertEqual(conflicts, set())
        updates = [params for sql, params in queries if sql.lstrip().startswith("UPDATE")]
        duplicate = next(params for params in updates if params[-1] == "old-tracking")
        self.assertEqual(duplicate[1], "canonical")
        self.assertIs(duplicate[2], True)
        self.assertIsNone(next(params for params in updates if params[-1] == "other-size")[1])
        self.assertIsNone(next(params for params in updates if params[-1] == "variant-m")[1])
        self.assertIsNone(next(params for params in updates if params[-1] == "variant-g")[1])
        self.assertFalse(any("DELETE" in sql or "configuracao_itens" in sql or "price_history" in sql for sql, _ in queries))

    def test_upsert_uses_source_and_variant_id_and_records_first_known_price(self):
        queries = []
        class Cursor:
            def __enter__(self): return self
            def __exit__(self, *a): pass
            def execute(self, sql, values):
                self.sql = sql
                queries.append((sql, values))
                self_outer.assertEqual(sql.count("%s"), len(values))
            def fetchone(self): return {"id": "existing-uuid", "current_price": None}
        self_outer = self
        scope = functions("db.py", ["upsert_product"], {"json": json, "get_category_id": lambda *a: None})
        result = scope["upsert_product"](types.SimpleNamespace(cursor=Cursor, commit=lambda: None),
            7, "Quadro M", "https://loja.test/new-handle?variant=10&utm_source=x", None, 100, None, {}, 1, False,
            external_product_id="90", external_variant_id="10", sku="Q-M", variant_title="M", variant_options={"Tamanho": "M"})
        self.assertEqual(result, "existing-uuid")
        lookup_sql, lookup = next(q for q in queries if "SELECT id, current_price" in q[0])
        self.assertEqual(lookup[0], 7)
        self.assertEqual(lookup[1], "10")
        self.assertIn("external_variant_id = %s", lookup_sql)
        self.assertIn("%s::text IS NOT NULL", lookup_sql)
        self.assertFalse(any("INSERT INTO products" in sql for sql, _ in queries))
        self.assertTrue(any("INSERT INTO price_history" in sql and params[0] == "existing-uuid" for sql, params in queries))
        self.assertTrue(any("external_variant_id IS NULL" in sql and "needs_review = true" in sql for sql, _ in queries))


if __name__ == "__main__":
    unittest.main()
