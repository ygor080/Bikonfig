"""Uma execução finita da coleta, adequada a cron/GitHub Actions.

Não inicia agendadores dentro do servidor web. Sem chaves ou alvos, falha
antes de importar a coleta, acessar o banco ou chamar a IA.
"""
import json
import os
import subprocess
import sys
import time
import uuid
from pathlib import Path
from urllib.parse import urlparse

from product_identity import normalize_product_url
from sites_config import get_profile

API_DIR = Path(__file__).resolve().parent
LOCK_KEY = 'bikonfig:scheduled-scrape'


def load_targets(raw):
    targets = json.loads(raw or '[]')
    if not isinstance(targets, list) or not 1 <= len(targets) <= 20:
        raise ValueError('COLETA_URLS_JSON deve conter uma lista com 1 a 20 URLs.')
    result = []
    for target in targets:
        if not isinstance(target, str):
            raise ValueError('Cada alvo de coleta deve ser uma URL.')
        target = normalize_product_url(target)
        get_profile(urlparse(target).netloc)
        if target not in result:
            result.append(target)
    return result


class RunLedger:
    def __init__(self, conn):
        self.conn = conn

    def acquire(self, owner):
        with self.conn.cursor() as cur:
            # Lease com expiração funciona também com pool de transações do Supabase.
            cur.execute('''INSERT INTO scrape_job_locks (job_key, owner, expires_at)
                           VALUES (%s, %s, now() + interval '75 minutes')
                           ON CONFLICT (job_key) DO UPDATE SET owner = EXCLUDED.owner,
                               expires_at = EXCLUDED.expires_at
                           WHERE scrape_job_locks.expires_at <= now() RETURNING owner''', (LOCK_KEY, owner))
            return cur.fetchone() is not None

    def release(self, owner):
        with self.conn.cursor() as cur:
            cur.execute('DELETE FROM scrape_job_locks WHERE job_key = %s AND owner = %s', (LOCK_KEY, owner))

    def start(self, target):
        with self.conn.cursor() as cur:
            cur.execute('INSERT INTO scrape_runs (target_url) VALUES (%s) RETURNING id', (target,))
            return cur.fetchone()['id']

    def finish(self, run_id, status, products=None, error_code=None):
        with self.conn.cursor() as cur:
            cur.execute('''UPDATE scrape_runs SET finished_at = now(), status = %s,
                           products_processed = %s, error_code = %s WHERE id = %s''',
                        (status, products, error_code, run_id))


def collect_source(target, timeout):
    result = subprocess.run([sys.executable, str(API_DIR / 'scraper.py'), '--url', target],
                            cwd=str(API_DIR), timeout=timeout, capture_output=True, text=True, encoding='utf-8',
                            env={**os.environ, 'PYTHONIOENCODING': 'utf-8'})
    # Não republicar stderr bruto de serviços que podem conter informações de conexão.
    if result.returncode:
        raise RuntimeError('scraper_failed')
    lines = [line for line in result.stdout.splitlines() if line.startswith('BIKONFIG_RESULT ')]
    if not lines:
        raise ValueError('missing_result')
    count = json.loads(lines[-1].split(' ', 1)[1])['products']
    if isinstance(count, bool) or not isinstance(count, int) or count < 0:
        raise ValueError('invalid_result')
    # Uma listagem vazia não comprova uma atualização bem-sucedida de preços.
    if count == 0:
        raise ValueError('empty_collection')
    return count


def run_targets(targets, collect, ledger, timeout=900, budget=2700, clock=time.monotonic, report=None):
    deadline = clock() + budget
    failed = False
    for target in targets:
        run_id = ledger.start(target)
        remaining = int(deadline - clock())
        if remaining <= 0:
            ledger.finish(run_id, 'error', error_code='budget_exhausted')
            if report is not None:
                report.append({'fonte': urlparse(target).hostname, 'status': 'error', 'codigo': 'budget_exhausted'})
            failed = True
            continue
        try:
            count = collect(target, min(timeout, remaining))
            if isinstance(count, bool) or not isinstance(count, int) or count <= 0:
                raise ValueError('invalid_result')
            ledger.finish(run_id, 'success', products=count)
            if report is not None:
                report.append({'fonte': urlparse(target).hostname, 'status': 'success', 'produtos': count})
            print(f'Coleta concluída: {target} ({count} produtos/variantes)')
        except subprocess.TimeoutExpired:
            ledger.finish(run_id, 'error', error_code='timeout')
            if report is not None:
                report.append({'fonte': urlparse(target).hostname, 'status': 'error', 'codigo': 'timeout'})
            failed = True
        except Exception as error:
            known_errors = {'scraper_failed', 'missing_result', 'invalid_result', 'empty_collection'}
            code = str(error) if str(error) in known_errors else type(error).__name__
            ledger.finish(run_id, 'error', error_code=code)
            if report is not None:
                report.append({'fonte': urlparse(target).hostname, 'status': 'error', 'codigo': code})
            failed = True
        # Itens gravados antes de uma falha continuam no banco; falha não informa zero itens.
    return 1 if failed else 0


def write_report(report):
    destination = os.environ.get('COLETA_RELATORIO_PATH')
    if destination:
        Path(destination).write_text(json.dumps({'execucoes': report}, ensure_ascii=False), encoding='utf-8')


def main():
    from dotenv import load_dotenv
    load_dotenv(API_DIR / '.env')
    try:
        targets = load_targets(os.environ.get('COLETA_URLS_JSON'))
        if not os.environ.get('DATABASE_URL') or not os.environ.get('OPENAI_API_KEY'):
            raise ValueError('Configure DATABASE_URL e OPENAI_API_KEY no ambiente do agendador.')
    except (ValueError, TypeError):
        print('Configuração inválida: confira COLETA_URLS_JSON, os perfis de lojas e os segredos do agendador.', file=sys.stderr)
        return 2
    import db
    try:
        conn = db.get_connection()
    except Exception:
        print('Falha ao conectar ao banco da coleta; confira configuração e disponibilidade.', file=sys.stderr)
        return 2
    conn.autocommit = True
    acquired = False
    owner = str(uuid.uuid4())
    ledger = RunLedger(conn)
    report = []
    try:
        acquired = ledger.acquire(owner)
        if not acquired:
            print('Já existe uma coleta agendada em execução; nenhuma nova coleta iniciada.')
            return 0
        return run_targets(targets, collect_source, ledger, report=report)
    except Exception:
        print('Falha ao registrar ou executar a coleta. Confira a migração da etapa 15 e a conexão com o banco.', file=sys.stderr)
        return 1
    finally:
        try:
            if acquired:
                ledger.release(owner)
        finally:
            conn.close()
            write_report(report)


if __name__ == '__main__':
    sys.exit(main())
