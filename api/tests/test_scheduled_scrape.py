import json
import os
import subprocess
import sys
import types
import unittest
from unittest.mock import patch
from test_manufacturer import functions
import run_scheduled_scrape as job


TARGET = 'https://pedalokos.com.br/collections/componentes'


class MemoryLedger:
    def __init__(self): self.started, self.finished = [], []
    def start(self, target):
        self.started.append(target)
        return len(self.started)
    def finish(self, run_id, status, products=None, error_code=None):
        self.finished.append((run_id, status, products, error_code))


class ScheduledScrapeTests(unittest.TestCase):
    def test_targets_require_explicit_configured_sources_and_are_deduplicated(self):
        self.assertEqual(job.load_targets(json.dumps([TARGET, TARGET + '?utm_source=a'])), [TARGET])
        for raw in ['', '[]', '{}', '[true]', 'invalid', '["https://unknown.test/p"]', '["file:///tmp/p"]']:
            with self.assertRaises((ValueError, TypeError)):
                job.load_targets(raw)

    def test_failed_source_is_recorded_and_does_not_prevent_next_source(self):
        ledger = MemoryLedger()
        def collect(target, timeout):
            if target == 'first': raise RuntimeError('database-password-must-not-be-logged')
            return 4
        self.assertEqual(job.run_targets(['first', 'second'], collect, ledger), 1)
        self.assertEqual(ledger.finished, [(1, 'error', None, 'RuntimeError'), (2, 'success', 4, None)])

    def test_timeout_budget_and_invalid_results_never_claim_success(self):
        for collect in [lambda *a: (_ for _ in ()).throw(subprocess.TimeoutExpired('scraper', 1)), lambda *a: 0, lambda *a: True]:
            ledger = MemoryLedger()
            self.assertEqual(job.run_targets([TARGET], collect, ledger), 1)
            self.assertEqual(ledger.finished[0][1], 'error')
            self.assertIsNone(ledger.finished[0][2])
        clock = iter([0, 0, 3000])
        ledger = MemoryLedger()
        self.assertEqual(job.run_targets(['first', 'second'], lambda *a: 1, ledger, clock=lambda: next(clock)), 1)
        self.assertEqual(ledger.finished[-1], (2, 'error', None, 'budget_exhausted'))

    def test_child_process_result_is_verified_without_shell_or_raw_error_output(self):
        for returncode, output, expected in [(0, 'BIKONFIG_RESULT {"products": 3}', 3),
                                            (0, 'no result', None), (1, 'error', None),
                                            (0, 'BIKONFIG_RESULT {"products": 0}', None)]:
            with patch.object(job.subprocess, 'run', return_value=types.SimpleNamespace(returncode=returncode, stdout=output)) as run:
                if expected:
                    self.assertEqual(job.collect_source(TARGET, 10), expected)
                else:
                    with self.assertRaises((ValueError, RuntimeError)):
                        job.collect_source(TARGET, 10)
                self.assertIsInstance(run.call_args.args[0], list)
                self.assertNotIn('shell', run.call_args.kwargs)
                self.assertEqual(run.call_args.kwargs['timeout'], 10)

    def test_database_log_and_lease_use_parameters_and_release_only_their_owner(self):
        queries = []
        class Cursor:
            def __enter__(self): return self
            def __exit__(self, *a): pass
            def execute(self, sql, params):
                queries.append((sql, params))
                self_outer.assertEqual(sql.count('%s'), len(params))
            def fetchone(self): return {'id': 1, 'owner': 'owner'}
        self_outer = self
        ledger = job.RunLedger(types.SimpleNamespace(cursor=Cursor))
        self.assertTrue(ledger.acquire('owner'))
        run_id = ledger.start(TARGET)
        ledger.finish(run_id, 'success', 4)
        ledger.release('owner')
        self.assertIn('expires_at <= now()', queries[0][0])
        self.assertIn('owner = %s', queries[-1][0])
        self.assertEqual(queries[-1][1], (job.LOCK_KEY, 'owner'))

    def test_no_credentials_or_targets_do_not_open_database(self):
        database = types.SimpleNamespace(get_connection=lambda: self.fail('Banco não deve ser acessado'))
        modules = {'dotenv': types.SimpleNamespace(load_dotenv=lambda *a: None), 'db': database}
        with patch.dict(sys.modules, modules), patch.dict(os.environ, {'COLETA_URLS_JSON': '[]'}, clear=True):
            self.assertEqual(job.main(), 2)
        with patch.dict(sys.modules, modules), patch.dict(os.environ, {'COLETA_URLS_JSON': json.dumps([TARGET])}, clear=True):
            self.assertEqual(job.main(), 2)

    def test_concurrent_run_is_skipped_and_database_connection_is_closed(self):
        closed = []
        class Cursor:
            def __enter__(self): return self
            def __exit__(self, *a): pass
            def execute(self, *a): pass
            def fetchone(self): return None
        conn = types.SimpleNamespace(cursor=Cursor, close=lambda: closed.append(True))
        with patch.dict(sys.modules, {'dotenv': types.SimpleNamespace(load_dotenv=lambda *a: None),
            'db': types.SimpleNamespace(get_connection=lambda: conn)}), patch.dict(os.environ, {
                'COLETA_URLS_JSON': json.dumps([TARGET]), 'DATABASE_URL': 'configured', 'OPENAI_API_KEY': 'configured'
            }, clear=True), patch.object(job, 'collect_source', side_effect=AssertionError('Não iniciar coleta')):
            self.assertEqual(job.main(), 0)
        self.assertEqual(closed, [True])

    def test_price_check_date_is_written_even_without_price_change_but_not_for_invalid_price(self):
        for price, valid in [(100, True), (None, False), (0, False), (float('nan'), False)]:
            queries = []
            class Cursor:
                def __enter__(self): return self
                def __exit__(self, *a): pass
                def execute(self, sql, params):
                    queries.append((sql, params))
                    self_outer.assertEqual(sql.count('%s'), len(params))
                def fetchone(self): return {'id': 'p', 'current_price': 100, 'specs': {}}
            self_outer = self
            scope = functions('db.py', ['upsert_product'], {'json': json, 'get_category_id': lambda *a: None})
            scope['upsert_product'](types.SimpleNamespace(cursor=Cursor, commit=lambda: None),
                1, 'Produto', TARGET, None, price, None, {}, 1, False, price_observed_at='2026-11-16T09:17:00+00:00')
            sql, params = next(q for q in queries if 'SET name = %s' in q[0])
            self.assertIn('price_checked_at = CASE WHEN %s THEN COALESCE(%s::timestamptz, now()) ELSE NULL END', sql)
            self.assertIs(params[3], valid)
            self.assertEqual(params[4], '2026-11-16T09:17:00+00:00')
            if not valid: self.assertIsNone(params[2])
            self.assertFalse(any('INSERT INTO price_history' in sql for sql, _ in queries))


if __name__ == '__main__':
    unittest.main()
