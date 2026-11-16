"""
Camada de persistência no PostgreSQL.

Usa psycopg (v3). Instale com: pip install "psycopg[binary]"

Configuração via variável de ambiente:
    export DATABASE_URL="postgresql://usuario:senha@localhost:5432/bikonfig"
"""

import os
import json
from datetime import datetime, timezone

import psycopg
from psycopg.rows import dict_row
from product_identity import normalize_product_url

def get_connection():
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        raise RuntimeError(
            "Variável de ambiente DATABASE_URL não definida. "
            "Ex: export DATABASE_URL='postgresql://user:pass@localhost:5432/bikonfig'"
        )
    return psycopg.connect(dsn, row_factory=dict_row)

def get_or_create_source(conn, domain: str, display_name: str) -> int:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO sources (domain, name)
            VALUES (%s, %s)
            ON CONFLICT (domain) DO UPDATE SET name = EXCLUDED.name
            RETURNING id
            """,
            (domain, display_name),
        )
        row = cur.fetchone()
        conn.commit()
        return row["id"]

def save_raw_scrape(conn, source_id: int, product_url: str, raw_name: str,
                     raw_price_text: str, raw_image_url: str | None,
                     raw_html_snippet: str = "") -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO raw_scrapes
                (source_id, product_url, raw_name, raw_price_text,
                 raw_image_url, raw_html_snippet)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (source_id, product_url, raw_name, raw_price_text,
             raw_image_url, raw_html_snippet),
        )
    conn.commit()

def get_category_id(conn, slug: str) -> int | None:
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM categories WHERE slug = %s", (slug,))
        row = cur.fetchone()
        return row["id"] if row else None

def get_categories_tree(conn) -> list[dict]:
    """
    Devolve as categorias já organizadas em árvore (topo + filhos), pra
    a API expor pronto pro front expandir "câmbio dianteiro" e ver as
    subcategorias dele, por exemplo.
    """
    with conn.cursor() as cur:
        cur.execute("SELECT id, slug, name, parent_id FROM categories ORDER BY parent_id NULLS FIRST, name")
        rows = cur.fetchall()

    by_id = {row["id"]: {**row, "children": []} for row in rows}
    tree = []
    for row in rows:
        node = by_id[row["id"]]
        if row["parent_id"] is None:
            tree.append(node)
        else:
            parent = by_id.get(row["parent_id"])
            if parent:
                parent["children"].append(node)
    return tree

def get_compatibility_rules(conn) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute("SELECT category_a, category_b, spec_key, description FROM compatibility_rules")
        return cur.fetchall()

def upsert_product(
    conn,
    source_id: int,
    name: str,
    product_url: str,
    image_url: str | None,
    price: float | None,
    category_slug: str | None,
    specs: dict,
    ai_confidence: float | None,
    needs_review: bool,
    is_optional: bool = False,
    manufacturer: str | None = None,
    in_stock: bool | None = None,
    external_product_id: str | None = None,
    external_variant_id: str | None = None,
    sku: str | None = None,
    variant_title: str | None = None,
    variant_options: dict | None = None,
) -> str:
    """
    Insere ou atualiza um produto. Se o preço mudou em relação ao que já
    está salvo, também grava uma linha em price_history (é isso que
    alimenta o "vigia de preço").

    Retorna o UUID do produto.
    """
    product_url = normalize_product_url(product_url)
    external_product_id = str(external_product_id) if external_product_id is not None else None
    external_variant_id = str(external_variant_id) if external_variant_id is not None else None
    sku = sku.strip() if isinstance(sku, str) and sku.strip() else None
    variant_title = variant_title.strip() if isinstance(variant_title, str) and variant_title.strip() else None
    variant_options = variant_options if isinstance(variant_options, dict) else {}
    manufacturer = " ".join(manufacturer.split()) if isinstance(manufacturer, str) else None
    manufacturer = manufacturer or None
    # Ausência de evidência não deve ser convertida em "sem estoque".
    in_stock = in_stock if isinstance(in_stock, bool) else None
    category_id = get_category_id(conn, category_slug) if category_slug else None

    with conn.cursor() as cur:
        # Serializa recoletas da mesma identidade, inclusive por URLs com rastreamento.
        cur.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))",
                    (f"{source_id}:{external_variant_id or product_url}",))
        cur.execute(
            """SELECT id, current_price FROM products
               WHERE source_id = %s AND duplicate_of IS NULL AND (
                   (%s::text IS NOT NULL AND external_variant_id = %s)
                   OR (%s::text IS NULL AND (canonical_url = %s OR product_url = %s)
                       AND external_variant_id IS NULL))
               ORDER BY (external_variant_id = %s) DESC NULLS LAST, (product_url = %s) DESC, created_at, id LIMIT 1""",
            (source_id, external_variant_id, external_variant_id, external_variant_id, product_url, product_url, external_variant_id, product_url),
        )
        existing = cur.fetchone()

        if existing:
            product_id = existing["id"]
            price_changed = (
                price is not None
                and (existing["current_price"] is None or float(existing["current_price"]) != float(price))
            )
            cur.execute(
                """
                UPDATE products
                SET name = %s, image_url = %s, current_price = %s,
                    product_url = CASE WHEN EXISTS (
                        SELECT 1 FROM products other WHERE other.source_id = products.source_id
                        AND other.id <> products.id AND other.product_url = %s
                    ) THEN product_url ELSE %s END, canonical_url = %s,
                    external_product_id = COALESCE(%s, external_product_id),
                    external_variant_id = COALESCE(%s, external_variant_id),
                    sku = %s, variant_title = %s, variant_options = %s::jsonb,
                    category_id = COALESCE(%s, category_id),
                    specs = specs || %s::jsonb,
                    ai_confidence = COALESCE(%s, ai_confidence),
                    needs_review = %s,
                    is_optional = %s,
                    in_stock = %s,
                    stock_checked_at = now(),
                    manufacturer = COALESCE(%s, manufacturer),
                    updated_at = now()
                WHERE id = %s
                """,
                (name, image_url, price, product_url, product_url, product_url, external_product_id, external_variant_id,
                 sku, variant_title, json.dumps(variant_options), category_id, json.dumps(specs),
                 ai_confidence, needs_review, is_optional, in_stock, manufacturer, product_id),
            )
        else:
            cur.execute(
                """
                INSERT INTO products
                    (source_id, category_id, name, product_url, image_url,
                     canonical_url, external_product_id, external_variant_id, sku, variant_title, variant_options,
                     current_price, specs, ai_confidence, needs_review, is_optional, in_stock, manufacturer, stock_checked_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s::jsonb, %s, %s, %s, %s, %s, now())
                RETURNING id
                """,
                (source_id, category_id, name, product_url, image_url,
                 product_url, external_product_id, external_variant_id, sku, variant_title, json.dumps(variant_options),
                 price, json.dumps(specs), ai_confidence, needs_review, is_optional, in_stock, manufacturer),
            )
            product_id = cur.fetchone()["id"]
            price_changed = price is not None

        if external_variant_id is not None:
            # Oferta antiga sem variante não identifica qual opção foi salva.
            # Encaminha para revisão em vez de atribuir uma opção arbitrária ou apagar dados.
            from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
            parsed = urlsplit(product_url)
            base_url = urlunsplit((parsed.scheme, parsed.netloc, parsed.path,
                urlencode([(k, v) for k, v in parse_qsl(parsed.query, keep_blank_values=True) if k != "variant"]), ""))
            cur.execute("""UPDATE products SET needs_review = true
                           WHERE source_id = %s AND id <> %s AND external_variant_id IS NULL
                           AND (canonical_url = %s OR product_url = %s)""",
                        (source_id, product_id, base_url, base_url))

        if price_changed:
            cur.execute(
                "INSERT INTO price_history (product_id, price) VALUES (%s, %s)",
                (product_id, price),
            )

    conn.commit()
    return str(product_id)


def reconcile_product_urls(conn, source_id: int) -> set[str]:
    """Normaliza identidades antigas sem excluir produtos, itens salvos ou histórico."""
    with conn.cursor() as cur:
        cur.execute("SELECT id, product_url, name, external_variant_id FROM products WHERE source_id = %s ORDER BY created_at, id", (source_id,))
        groups = {}
        for row in cur.fetchall():
            try:
                canonical = normalize_product_url(row["product_url"])
            except (ValueError, TypeError, AttributeError):
                continue
            # Variantes explícitas distintas nunca são agrupadas só por compartilhar URL.
            groups.setdefault((canonical, row.get("external_variant_id")), []).append(row)
        conflicts = set()
        for (canonical, _variant), rows in groups.items():
            rows.sort(key=lambda row: row["product_url"] != canonical)
            different_names = len({row["name"] for row in rows}) > 1
            if different_names:
                conflicts.add(canonical)
            for index, row in enumerate(rows):
                cur.execute("""UPDATE products SET canonical_url = %s, duplicate_of = %s,
                               needs_review = CASE WHEN %s THEN true ELSE needs_review END WHERE id = %s""",
                            (canonical, rows[0]["id"] if index > 0 else None, index > 0 or different_names, row["id"]))
    conn.commit()
    return conflicts
