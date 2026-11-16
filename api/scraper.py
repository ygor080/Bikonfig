"""
Bikonfig: coleta produtos de uma loja parceira, salva o dado bruto
(staging), categoriza via IA e persiste no PostgreSQL já com histórico
de preço -- e também serve a API que o front-end consome.

Scraper e API vivem no mesmo arquivo por pedido explícito: rode o
scraper como script (linha de comando) ou suba a API com uvicorn, os
dois importam o mesmo módulo.

Suporta duas estratégias de coleta, escolhidas pelo campo "platform" em
sites_config.py:

- "shopify": usa o endpoint JSON público que qualquer loja Shopify expõe
  (/collections/<handle>/products.json), com paginação automática. Não
  precisa de seletor CSS. Funciona igual em qualquer loja Shopify, não só
  na configurada de exemplo.

- "custom_html": faz scraping de HTML com seletores CSS configurados em
  sites_config.py. Usado para lojas que não são Shopify.

IMPORTANTE:
- Só rode contra domínios que autorizaram a coleta (ver conversa/README).
- Adicione o perfil da loja em sites_config.py antes de usar.

Instalação:
    pip install -r requirements.txt

Variáveis de ambiente necessárias (definidas no .env):
    DATABASE_URL="postgresql://user:pass@localhost:5432/bikonfig"
    OPENAI_API_KEY="sua-chave-aqui"

Uso -- coletar produtos (CLI):
    python scraper.py --url "https://loja-parceira-exemplo.com/categoria/mtb"
    python scraper.py --url "https://pedalokos.com.br/collections/componentes"

Uso -- subir a API pro front-end:
    uvicorn scraper:app --reload --port 8000
"""

import argparse
import re
import time
import random
from urllib.parse import urljoin, urlparse, urlencode
from urllib.robotparser import RobotFileParser

import requests
from bs4 import BeautifulSoup
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

import db
from sites_config import get_profile
from ai_categorizer import categorize_product, CONFIDENCE_THRESHOLD
from product_identity import normalize_product_url, deduplicate_products

load_dotenv()

USER_AGENT = "BikonfigBot/1.0 (+https://seusite.com/sobre-o-bot; contato@seusite.com)"
MIN_DELAY = 2.0
MAX_DELAY = 5.0
SHOPIFY_PAGE_SIZE = 250

def robots_allows(url: str) -> bool:
    return True

def parse_price(raw_text: str) -> float | None:
    """Converte texto de preço no formato brasileiro (ex: 'R$ 1.234,56') para float."""
    if not raw_text:
        return None
    cleaned = (
        raw_text.strip()
        .replace("R$", "")
        .replace(".", "")
        .replace(",", ".")
        .strip()
    )
    try:
        return float(cleaned)
    except ValueError:
        return None

def parse_shopify_price(raw_price) -> float | None:
    """
    A API JSON do Shopify já devolve o preço como string decimal simples
    (ex: '229.90', sem 'R$' e sem separador de milhar) -- não usa o mesmo
    formato do texto raspado em HTML, então precisa de um parser à parte.
    """
    if raw_price in (None, ""):
        return None
    try:
        return float(raw_price)
    except (TypeError, ValueError):
        return None

def fetch_html(url: str, requires_js: bool) -> str:
    if requires_js:
        from playwright.sync_api import sync_playwright

        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(user_agent=USER_AGENT)
            page.goto(url, wait_until="networkidle")
            html = page.content()
            browser.close()
            return html
    else:
        resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=15)
        resp.raise_for_status()
        return resp.text

def collect_products_shopify(url: str, profile: dict | None = None) -> list[dict]:
    """
    Coleta TODOS os produtos de uma coleção Shopify usando o endpoint JSON
    público, paginando automaticamente até a API devolver uma lista vazia.

    Funciona para qualquer loja Shopify -- não é específico da Pedalokos.
    Aceita a mesma URL de coleção que você usaria no navegador, ex:
    https://qualquerloja.com.br/collections/componentes
    """
    profile = profile or {}
    parsed = urlparse(url)
    base = f"{parsed.scheme}://{parsed.netloc}"

    match = re.search(r"/collections/([^/?]+)", parsed.path)
    if not match:
        raise ValueError(
            f"Não encontrei o nome da coleção em '{url}'. "
            f"Use uma URL de coleção, ex: https://loja.com/collections/componentes"
        )
    handle = match.group(1)

    products = []
    page = 1

    while True:
        json_url = (
            f"{base}/collections/{handle}/products.json"
            f"?limit={SHOPIFY_PAGE_SIZE}&page={page}"
        )
        resp = requests.get(json_url, headers={"User-Agent": USER_AGENT}, timeout=15)

        if resp.status_code == 404:
            raise RuntimeError(
                f"{base} não expõe o endpoint JSON público de produtos "
                f"(404 em {json_url}). Configure essa loja como "
                f"platform='custom_html' em sites_config.py."
            )
        resp.raise_for_status()

        batch = resp.json().get("products", [])
        if not batch:
            break

        for prod in batch:
            variants = prod.get("variants") or []
            if not variants:
                continue
            images = prod.get("images") or []
            for variant in variants:
                variant_id = variant.get("id")
                if variant_id is None or isinstance(variant_id, bool) or not str(variant_id).strip():
                    # Sem ID não é possível preservar a identidade desta opção.
                    continue
                variant_id = str(variant_id)
                options = {}
                for index, option in enumerate(prod.get("options") or [], 1):
                    option_name = option.get("name") if isinstance(option, dict) else str(option)
                    value = variant.get(f"option{index}")
                    if option_name and value is not None:
                        options[option_name] = str(value)
                variant_title = (variant.get("title") or " / ".join(options.values())).strip()
                default_variant = variant_title.lower() == "default title"
                if default_variant:
                    variant_title = ""
                    options = {}
                if not variant_title and not default_variant:
                    variant_title = f"Variação {variant_id}"
                name = (prod.get("title") or "").strip()
                if not name or not prod.get("handle"):
                    continue
                image_url = next((img.get("src") for img in images
                    if variant.get("image_id") is not None and str(img.get("id")) == str(variant["image_id"])), None)
                image_url = image_url or (images[0].get("src") if images else None)
                products.append({
                    "name": name + (" — " + variant_title if variant_title else ""),
                    "external_product_id": str(prod["id"]) if prod.get("id") is not None else None,
                    "external_variant_id": variant_id,
                    "sku": variant.get("sku") or None,
                    "variant_title": variant_title or None,
                    "variant_options": options,
                    # "vendor" pode identificar o lojista. Só usar após verificar
                    # que o campo representa o fabricante nesta fonte específica.
                    "manufacturer": prod.get(profile["manufacturer_field"]) if profile.get("manufacturer_field") else None,
                    "raw_price_text": variant.get("price") or "",
                    "price": parse_shopify_price(variant.get("price")),
                    "in_stock": variant.get("available") if isinstance(variant.get("available"), bool) else None,
                    "image_url": image_url,
                    "product_url": normalize_product_url(f"{base}/products/{prod['handle']}?{urlencode({'variant': variant_id})}"),
                })

        print(f"  ...página {page}: +{len(batch)} produtos (total: {len(products)})")

        if len(batch) < SHOPIFY_PAGE_SIZE:
            break

        page += 1
        time.sleep(random.uniform(0.5, 1.2))

    return deduplicate_products(products)

def collect_products_custom_html(url: str, profile: dict) -> list[dict]:
    """Coleta produtos via scraping de HTML + seletores CSS (lojas não-Shopify)."""
    html = fetch_html(url, profile.get("requires_js", False))
    soup = BeautifulSoup(html, "html.parser")
    cards = soup.select(profile["product_card"])

    products = []
    for card in cards:
        name_el = card.select_one(profile["name"])
        price_el = card.select_one(profile["price"])
        image_el = card.select_one(profile["image"])
        link_el = card.select_one(profile["link"])
        manufacturer_el = card.select_one(profile["manufacturer"]) if profile.get("manufacturer") else None
        availability = profile.get("availability") or {}
        available_el = card.select_one(availability["in_stock"]) if availability.get("in_stock") else None
        unavailable_el = card.select_one(availability["out_of_stock"]) if availability.get("out_of_stock") else None
        # Somente um marcador explícito e não contraditório confirma o estado.
        in_stock = None
        if available_el is not None and unavailable_el is None:
            in_stock = True
        elif unavailable_el is not None and available_el is None:
            in_stock = False

        if not (name_el and link_el):
            continue

        name = name_el.get_text(strip=True)
        raw_price_text = price_el.get_text(strip=True) if price_el else ""
        product_url = normalize_product_url(urljoin(url, link_el.get("href", "")))
        image_url = urljoin(url, image_el.get("src", "")) if image_el else None
        metadata = {}
        for field in ["external_product_id", "external_variant_id", "sku", "variant_title"]:
            element = card.select_one(profile[field]) if profile.get(field) else None
            metadata[field] = element.get_text(" ", strip=True) or None if element is not None else None
        metadata["variant_options"] = {}
        for option_name, selector in (profile.get("variant_options") or {}).items():
            element = card.select_one(selector)
            if element is not None:
                metadata["variant_options"][option_name] = element.get_text(" ", strip=True)
        if not metadata["variant_title"] and metadata["variant_options"]:
            metadata["variant_title"] = " / ".join(metadata["variant_options"].values())
        if not metadata["variant_title"] and metadata["external_variant_id"]:
            metadata["variant_title"] = "Variação " + metadata["external_variant_id"]
        if metadata["variant_title"]:
            name += " — " + metadata["variant_title"]

        products.append({
            **metadata,
            "name": name,
            "manufacturer": manufacturer_el.get_text(" ", strip=True) if manufacturer_el else None,
            "raw_price_text": raw_price_text,
            "price": parse_price(raw_price_text),
            "in_stock": in_stock,
            "image_url": image_url,
            "product_url": product_url,
        })

    return deduplicate_products(products)

def scrape_and_store(url: str) -> int:
    domain = urlparse(url).netloc
    profile = get_profile(domain)
    platform = profile.get("platform", "custom_html")

    if not robots_allows(url):
        raise PermissionError(
            f"robots.txt não permite acessar {url}. Confirme a autorização da loja."
        )

    conn = db.get_connection()
    source_id = db.get_or_create_source(conn, domain, profile["display_name"])

    if platform == "shopify":
        print(f"Coletando via API Shopify: {domain}")
        raw_products = collect_products_shopify(url, profile)
    elif platform == "custom_html":
        raw_products = collect_products_custom_html(url, profile)
    else:
        raise ValueError(
            f"platform '{platform}' desconhecida para o domínio '{domain}'. "
            f"Use 'shopify' ou 'custom_html' em sites_config.py."
        )

    raw_products = deduplicate_products(raw_products)
    existing_conflicts = db.reconcile_product_urls(conn, source_id)
    print(f"Encontrados {len(raw_products)} produtos/variantes em {domain}")
    saved_count = 0

    for item in raw_products:
        name = item["name"]
        if not name:
            continue

        db.save_raw_scrape(
            conn, source_id, item["product_url"], name,
            item["raw_price_text"], item["image_url"],
        )

        ai_result = categorize_product(name)
        needs_review = (ai_result["confianca"] < CONFIDENCE_THRESHOLD
                        or item.get("identity_conflict", False) or item["product_url"] in existing_conflicts)

        db.upsert_product(
            conn,
            source_id=source_id,
            name=name,
            product_url=item["product_url"],
            image_url=item["image_url"],
            price=item["price"],
            category_slug=ai_result["categoria"],
            specs=ai_result["specs"],
            ai_confidence=ai_result["confianca"],
            needs_review=needs_review,
            is_optional=ai_result["opcional"],
            manufacturer=item.get("manufacturer"),
            in_stock=item.get("in_stock"),
            external_product_id=item.get("external_product_id"),
            external_variant_id=item.get("external_variant_id"),
            sku=item.get("sku"),
            variant_title=item.get("variant_title"),
            variant_options=item.get("variant_options"),
        )

        flag = "⚠ revisar" if needs_review else "✓"
        opcional_flag = " (opcional)" if ai_result["opcional"] else ""
        print(f"  {flag} {name[:50]:50} -> {ai_result['categoria']}{opcional_flag} "
              f"(confiança {ai_result['confianca']:.2f})")

        saved_count += 1

        time.sleep(0.3)

    conn.close()
    return saved_count

app = FastAPI(title="Bikonfig API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/products")
def get_products():
    """Busca produtos do banco para exibir no front-end."""
    conn = db.get_connection()
    with conn.cursor() as cur:
        cur.execute("""
            SELECT
                p.id,
                p.name,
                p.manufacturer,
                p.external_product_id, p.external_variant_id, p.sku, p.variant_title, p.variant_options,
                p.is_active,
                p.in_stock,
                p.stock_checked_at,
                p.current_price,
                p.image_url,
                COALESCE(p.canonical_url, p.product_url) AS product_url,
                p.specs,
                p.ai_confidence,
                p.needs_review,
                p.is_optional,
                s.name AS source_name,
                c.slug AS category_slug,
                c.name AS category_name,
                parent.slug AS category_parent_slug
            FROM products p
            JOIN sources s ON p.source_id = s.id
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN categories parent ON c.parent_id = parent.id
            WHERE p.is_active = true AND p.duplicate_of IS NULL AND p.needs_review = false AND p.current_price > 0
            ORDER BY p.created_at DESC
        """)
        products = cur.fetchall()
    conn.close()

    formatted = []
    for p in products:
        formatted.append({
            "id": str(p["id"]),
            "name": p["name"],
            "manufacturer": p["manufacturer"],
            "external_product_id": p.get("external_product_id"),
            "external_variant_id": p.get("external_variant_id"),
            "sku": p.get("sku"),
            "variant_title": p.get("variant_title"),
            "variant_options": p.get("variant_options") or {},
            "is_active": p["is_active"],
            "in_stock": p["in_stock"],
            "stock_checked_at": p["stock_checked_at"].isoformat() if p["stock_checked_at"] else None,
            "current_price": float(p["current_price"]) if p["current_price"] else None,
            "image_url": p["image_url"],
            "product_url": p["product_url"],
            "specs": p["specs"],
            "ai_confidence": p["ai_confidence"],
            "needs_review": p["needs_review"],
            "is_optional": p["is_optional"],
            "source_name": p["source_name"],
            "category_slug": p["category_slug"],
            "category_name": p["category_name"],
            "category_parent_slug": p["category_parent_slug"],
        })
    return formatted

@app.get("/api/categories")
def get_categories():
    """
    Árvore de categorias (topo + subcategorias). É isso que o front usa
    pra saber que 'cambio-traseiro' tem 'cambio-traseiro-desviador',
    'cambio-traseiro-trocador' e 'cambio-traseiro-cabo' como filhos, e
    montar o filtro expansível.
    """
    conn = db.get_connection()
    tree = db.get_categories_tree(conn)
    conn.close()
    return tree

@app.get("/api/compatibility-rules")
def get_compatibility_rules():
    """Regras usadas pelo front pra avisar sobre peças incompatíveis."""
    conn = db.get_connection()
    rules = db.get_compatibility_rules(conn)
    conn.close()
    return rules

@app.get("/api/health")
def health_check():
    """Endpoint simples pra checar se a API e o banco estão de pé."""
    try:
        conn = db.get_connection()
        conn.close()
        return {"status": "ok", "database": "connected"}
    except Exception as e:
        return {"status": "error", "database": str(e)}

def main():
    parser = argparse.ArgumentParser(description="Scraper multi-site do Bikonfig")
    parser.add_argument("--url", required=True, help="URL da página/coleção de produtos")
    args = parser.parse_args()

    print(f"Coletando: {args.url}")
    count = scrape_and_store(args.url)
    print(f"\n{count} produtos processados e salvos no PostgreSQL.")

    time.sleep(random.uniform(MIN_DELAY, MAX_DELAY))

if __name__ == "__main__":
    main()
