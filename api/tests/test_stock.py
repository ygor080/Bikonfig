"""Estoque em três estados, sem dependências externas, banco ou rede."""
import json
import re
import types
import unittest
from datetime import datetime, timezone
from urllib.parse import urlparse, urljoin
from test_manufacturer import functions


class StockTests(unittest.TestCase):
    def shopify(self, variants):
        response = types.SimpleNamespace(status_code=200, raise_for_status=lambda: None,
            json=lambda: {"products": [{"title": "Produto", "handle": "produto", "variants": [dict(v, id=i) for i, v in enumerate(variants, 1)]}]})
        scope = functions("scraper.py", ["collect_products_shopify", "parse_shopify_price"], {
            "re": re, "urlparse": urlparse, "SHOPIFY_PAGE_SIZE": 250, "USER_AGENT": "Teste",
            "requests": types.SimpleNamespace(get=lambda *a, **k: response)})
        return scope["collect_products_shopify"]("https://loja.test/collections/pecas")

    def test_shopify_requires_explicit_boolean(self):
        for value in [True, False, None, "false", 0]:
            product = self.shopify([{"available": value, "price": "10"}])[0]
            self.assertIs(product["in_stock"], value if isinstance(value, bool) else None)

    def test_price_and_stock_belong_to_each_variant(self):
        products = self.shopify([{"available": False, "price": "10"}, {"available": True, "price": "20"}])
        self.assertEqual(len(products), 2)
        self.assertIs(products[0]["in_stock"], False)
        self.assertEqual(products[0]["price"], 10)
        self.assertIs(products[1]["in_stock"], True)
        self.assertEqual(products[1]["price"], 20)
        product = self.shopify([{"available": False, "price": "10"}, {"price": "30"}])[1]
        self.assertIsNone(product["in_stock"])
        self.assertEqual(product["price"], 30)
        self.assertEqual(self.shopify([]), [])

    def test_html_missing_and_contradictory_markers_mean_unknown(self):
        class Node:
            def get_text(self, *a, **k): return "Produto"
            def get(self, key, default=""): return "/produto"
        profile = {k: k for k in ["product_card", "name", "price", "image", "link"]}
        for markers, expected in [([], None), ([".available"], True), ([".sold-out"], False), ([".available", ".sold-out"], None)]:
            card = types.SimpleNamespace(select_one=lambda selector: Node() if selector in markers or selector in profile.values() else None)
            scope = functions("scraper.py", ["collect_products_custom_html"], {
                "fetch_html": lambda *a: "HTML", "urljoin": urljoin, "parse_price": lambda _: 10,
                "BeautifulSoup": lambda *a: types.SimpleNamespace(select=lambda *a: [card])})
            result = scope["collect_products_custom_html"]("https://loja.test", {**profile,
                "availability": {"in_stock": ".available", "out_of_stock": ".sold-out"}})
            self.assertIs(result[0]["in_stock"], expected)
            self.assertIsNone(scope["collect_products_custom_html"]("https://loja.test", profile)[0]["in_stock"])

    def test_upsert_stores_all_three_states_without_changing_active_flag(self):
        for existing in [None, {"id": "p", "current_price": 10}]:
            for state in [True, False, None, "false"]:
                queries = []
                class Cursor:
                    def __enter__(self): return self
                    def __exit__(self, *a): pass
                    def execute(self, sql, values):
                        self.sql = sql
                        queries.append((sql, values))
                    def fetchone(self): return existing if self.sql.lstrip().startswith("SELECT") else {"id": "p"}
                scope = functions("db.py", ["upsert_product"], {"json": json, "get_category_id": lambda *a: None})
                scope["upsert_product"](types.SimpleNamespace(cursor=Cursor, commit=lambda: None),
                    1, "Produto", "https://loja.test/p", None, 10, None, {}, 1, False, in_stock=state)
                sql, params = next(q for q in queries if "UPDATE products" in q[0] or "INSERT INTO products" in q[0])
                self.assertEqual(sql.count("%s"), len(params))
                self.assertIn("stock_checked_at", sql)
                self.assertNotIn("is_active =", sql)
                self.assertIs(params[-3] if existing else params[-2], state if isinstance(state, bool) else None)
                if existing:
                    self.assertIn("in_stock = %s", sql)  # NULL substitui informação antiga, sem manter confirmação obsoleta.

    def test_api_returns_stock_separate_from_active_and_serializes_timestamp(self):
        checked = datetime(2026, 11, 15, tzinfo=timezone.utc)
        product = {"id": "p", "name": "Produto", "manufacturer": None, "is_active": True,
            "in_stock": None, "stock_checked_at": checked, "current_price": 10, "image_url": None,
            "product_url": "https://loja.test/p", "specs": {}, "ai_confidence": 1, "needs_review": False,
            "is_optional": False, "source_name": "Loja", "category_slug": "quadro", "category_name": "Quadro",
            "category_parent_slug": None}
        class Cursor:
            def __enter__(self): return self
            def __exit__(self, *a): pass
            def execute(self, *a): pass
            def fetchall(self): return [product]
        scope = functions("scraper.py", ["get_products"], {"db": types.SimpleNamespace(
            get_connection=lambda: types.SimpleNamespace(cursor=Cursor, close=lambda: None))})
        result = scope["get_products"]()[0]
        self.assertIs(result["is_active"], True)
        self.assertIsNone(result["in_stock"])
        self.assertEqual(result["stock_checked_at"], checked.isoformat())


if __name__ == "__main__":
    unittest.main()
