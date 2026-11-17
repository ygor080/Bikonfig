"""Prévia pública e limitada: não importa IA, não abre banco e não grava produtos."""
import argparse
import json
import os
import ssl
from decimal import Decimal, InvalidOperation
from urllib.parse import urlparse
from urllib.request import Request, build_opener, HTTPRedirectHandler
from run_scheduled_scrape import load_targets
from sites_config import get_profile


class SameHostRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if urlparse(newurl).hostname != urlparse(req.full_url).hostname or urlparse(newurl).scheme != 'https':
            raise ValueError('redirect_blocked')
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def preview(target, fetch=None):
    parsed = urlparse(target)
    if parsed.scheme != 'https' or get_profile(parsed.netloc)['platform'] != 'shopify':
        raise ValueError('preview_unsupported')
    endpoint = target.split('?', 1)[0].rstrip('/') + '/products.json?limit=3&page=1'
    if fetch is None:
        def fetch(url):
            request = Request(url, headers={'User-Agent': 'BikonfigBot/1.0', 'Accept': 'application/json'})
            with build_opener(SameHostRedirect).open(request, timeout=20) as response:
                raw = response.read(1024 * 1024 + 1)
                if len(raw) > 1024 * 1024:
                    raise ValueError('response_too_large')
                return json.loads(raw)
    payload = fetch(endpoint)
    products = payload.get('products') if isinstance(payload, dict) else None
    if not isinstance(products, list) or not products:
        raise ValueError('empty_collection')
    valid_prices = 0
    variants = 0
    for product in products[:3]:
        if not isinstance(product, dict) or not isinstance(product.get('variants'), list):
            raise ValueError('invalid_response')
        for variant in product['variants'][:100]:
            variants += 1
            try:
                price = Decimal(str(variant.get('price')))
                valid_prices += int(price.is_finite() and price > 0)
            except (InvalidOperation, TypeError, AttributeError):
                pass
    if not valid_prices:
        raise ValueError('no_valid_prices')
    return {'fonte': parsed.hostname, 'produtos_amostrados': min(len(products), 3),
            'variantes_amostradas': variants, 'precos_validos': valid_prices}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--targets', help='Lista JSON de URLs; alternativa a COLETA_URLS_JSON.')
    args = parser.parse_args()
    try:
        targets = load_targets(args.targets or os.environ.get('COLETA_URLS_JSON'))
    except (ValueError, TypeError):
        print('Configuração de alvos inválida; nenhuma prévia iniciada.')
        return 2
    failed = False
    for target in targets:
        try:
            print(json.dumps({'status': 'preview_ok', **preview(target)}, ensure_ascii=False))
        except Exception as error:
            reason = getattr(error, 'reason', error)
            code = 'tls_error' if isinstance(reason, ssl.SSLError) else 'preview_failed'
            print(json.dumps({'status': 'preview_failed', 'fonte': urlparse(target).hostname, 'codigo': code}))
            failed = True
    return 1 if failed else 0


if __name__ == '__main__':
    raise SystemExit(main())
