"""Identidade por fonte e variante/URL; nunca por semelhança de nomes ou SKU."""
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


def normalize_product_url(url: str) -> str:
    parsed = urlsplit(url.strip())
    if parsed.scheme.lower() not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("URL pública de produto inválida")
    host = parsed.hostname.lower()
    if ":" in host:
        host = f"[{host}]"
    if parsed.port and (parsed.scheme.lower(), parsed.port) not in (("http", 80), ("https", 443)):
        host += f":{parsed.port}"
    params = [(key, value) for key, value in parse_qsl(parsed.query, keep_blank_values=True)
              if not key.lower().startswith("utm_") and key.lower() not in {"gclid", "fbclid", "msclkid", "dclid"}]
    # Mantém opções, variant e outros parâmetros funcionais, inclusive sua ordem.
    return urlunsplit((parsed.scheme.lower(), host, parsed.path or "/", urlencode(params), ""))


def deduplicate_products(products: list[dict]) -> list[dict]:
    found = {}
    for raw in products:
        item = {**raw, "product_url": normalize_product_url(raw["product_url"])}
        variant = item.get("external_variant_id")
        source = item.get("source_id") or urlsplit(item["product_url"]).netloc
        key = (source, "variant", str(variant)) if variant is not None else (source, "url", item["product_url"])
        if key not in found:
            found[key] = item
            continue
        previous = found[key]
        fields = ["name", "price", "in_stock", "sku", "variant_title", "variant_options", "manufacturer"]
        if any(previous.get(field) is not None and item.get(field) is not None
               and previous[field] != item[field] for field in fields):
            previous["identity_conflict"] = True
        previous["identity_conflict"] = previous.get("identity_conflict", False) or item.get("identity_conflict", False)
    return list(found.values())
