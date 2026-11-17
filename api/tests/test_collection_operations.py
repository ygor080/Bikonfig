import json
import os
import ssl
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import URLError
from test_scheduled_scrape import MemoryLedger, TARGET
import run_scheduled_scrape as job
import check_scheduled_scrape as check


class CollectionOperationsTests(unittest.TestCase):
    def test_preview_is_limited_and_requires_real_positive_prices(self):
        calls = []
        def fetch(url):
            calls.append(url)
            return {'products': [{'variants': [{'price': '12.50'}, {'price': None}]}]}
        result = check.preview(TARGET, fetch)
        self.assertEqual(result['precos_validos'], 1)
        self.assertEqual(result['variantes_amostradas'], 2)
        self.assertTrue(calls[0].endswith('/products.json?limit=3&page=1'))
        self.assertNotIn('products', result)
        for payload in [{}, {'products': []}, {'products': [None]}, {'products': [{'variants': [{'price': 'NaN'}]}]}]:
            with self.assertRaises(ValueError): check.preview(TARGET, lambda url: payload)

    def test_preview_blocks_unsupported_profiles_and_redirects(self):
        with self.assertRaises(ValueError): check.preview('http://pedalokos.com.br/collections/componentes')
        handler = check.SameHostRedirect()
        request = check.Request(TARGET)
        for target in ['https://evil.test/products.json', 'http://pedalokos.com.br/products.json']:
            with self.assertRaises(ValueError): handler.redirect_request(request, None, 302, '', {}, target)

    def test_preview_reports_tls_error_without_raw_exception(self):
        with patch.object(check, 'preview', side_effect=URLError(ssl.SSLError('private-message'))), \
             patch('sys.argv', ['check', '--targets', json.dumps([TARGET])]), \
             patch('builtins.print') as output:
            self.assertEqual(check.main(), 1)
        printed = str(output.call_args_list)
        self.assertIn('tls_error', printed)
        self.assertNotIn('private-message', printed)

    def test_collection_report_tracks_success_failure_and_does_not_leak_messages(self):
        rows = []
        def collect(target, timeout):
            if target.endswith('/error'): raise RuntimeError('password-not-for-report')
            return 3
        code = job.run_targets([TARGET, 'https://pedalokos.com.br/error'], collect, MemoryLedger(), report=rows)
        self.assertEqual(code, 1)
        self.assertEqual(rows[0], {'fonte': 'pedalokos.com.br', 'status': 'success', 'produtos': 3})
        self.assertEqual(rows[1]['codigo'], 'RuntimeError')
        self.assertNotIn('password-not-for-report', json.dumps(rows))
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'report.json'
            with patch.dict(os.environ, {'COLETA_RELATORIO_PATH': str(path)}): job.write_report(rows)
            self.assertEqual(json.loads(path.read_text(encoding='utf-8'))['execucoes'], rows)


if __name__ == '__main__': unittest.main()
