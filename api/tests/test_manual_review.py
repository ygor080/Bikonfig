import json
import types
import unittest
from test_manufacturer import functions


class ManualReviewTests(unittest.TestCase):
    def collect_update(self, protected=False, needs_review=True, force_review=False):
        queries = []
        class Cursor:
            def __enter__(self): return self
            def __exit__(self, *a): pass
            def execute(self, sql, params):
                queries.append((sql, params))
                self_outer.assertEqual(sql.count('%s'), len(params))
            def fetchone(self): return {'id': 'p', 'current_price': 100,
                'specs': {'aro': '29', 'campo_manual': 'preservar'}, 'specs_manually_reviewed': protected}
        self_outer = self
        scope = functions('db.py', ['upsert_product'], {'json': json, 'get_category_id': lambda *a: 42})
        scope['upsert_product'](types.SimpleNamespace(cursor=Cursor, commit=lambda: None),
            1, 'Pneu coletado', 'https://loja.test/p', 'https://loja.test/nova.jpg', 150,
            'pneus', {'aro': '26'}, .3, needs_review, manufacturer='Fabricante da coleta', in_stock=False,
            force_review=force_review)
        return queries, next(q for q in queries if 'SET name = %s' in q[0])

    def test_protection_is_enforced_atomically_in_update_not_from_old_snapshot(self):
        _, (sql, params) = self.collect_update(True)
        self.assertIn('CASE WHEN category_manually_reviewed THEN category_id ELSE', sql)
        self.assertIn('CASE WHEN specs_manually_reviewed THEN specs ELSE', sql)
        self.assertIn('CASE WHEN manufacturer_manually_reviewed THEN manufacturer ELSE', sql)
        # Verificação na própria atualização protege também uma revisão concorrente.
        self.assertIn('WHEN category_manually_reviewed AND specs_manually_reviewed AND manufacturer_manually_reviewed THEN needs_review', sql)
        self.assertIs(params[-6], False)  # Confiança baixa, sozinha, não força nova revisão de identidade.

    def test_price_stock_image_and_history_continue_updating(self):
        queries, (sql, params) = self.collect_update(True)
        self.assertIn('image_url = %s, current_price = %s', sql)
        self.assertIn('in_stock = %s', sql)
        self.assertEqual(params[1], 'https://loja.test/nova.jpg')
        self.assertEqual(params[2], 150)
        self.assertIs(params[-3], False)
        self.assertTrue(any('INSERT INTO price_history' in q and values == ('p', 150) for q, values in queries))
        self.assertNotIn('manual_reviewed_at =', sql)
        self.assertNotIn('manual_reviewed_by =', sql)

    def test_missing_manual_spec_does_not_reopen_review_but_missing_automatic_spec_does(self):
        _, (_, protected_params) = self.collect_update(True, needs_review=False)
        _, (_, automatic_params) = self.collect_update(False, needs_review=False)
        self.assertIs(protected_params[-5], False)
        self.assertIs(automatic_params[-5], True)

    def test_identity_conflict_can_reopen_queue_without_overwriting_protected_values(self):
        _, (sql, params) = self.collect_update(True, needs_review=False, force_review=True)
        self.assertIn('needs_review = CASE WHEN %s THEN true', sql)
        self.assertIs(params[-6], True)
        self.assertIn('CASE WHEN specs_manually_reviewed THEN specs ELSE', sql)


if __name__ == '__main__':
    unittest.main()
