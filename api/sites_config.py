"""
Configuração por site parceiro.

Cada loja tem uma "platform":

- "shopify": não precisa de seletor CSS nenhum. O scraper usa o endpoint
  JSON público que toda loja Shopify expõe (/collections/<handle>/products.json),
  com paginação automática. Basta declarar display_name e platform.
  manufacturer_field é opcional: use "vendor" somente se tiver confirmado
  que esse campo identifica o fabricante nessa loja, e não o próprio lojista.

- "custom_html": para lojas que não são Shopify (WooCommerce, VTEX,
  Nuvemshop, sistema próprio etc.). Aqui você ainda precisa configurar os
  seletores CSS manualmente, igual antes.

Para adicionar uma loja Shopify nova, basta isso:

    "outraloja.com.br": {
        "display_name": "Outra Loja",
        "platform": "shopify",
    },

Para adicionar uma loja que não é Shopify:
1. Abra a página de listagem de produtos da loja no navegador
2. Use o DevTools (aba Elements, não Network) para achar os seletores CSS
   do card do produto, nome, preço, imagem e link
3. Adicione uma entrada abaixo com platform="custom_html" e os seletores.
   O seletor opcional "manufacturer" deve apontar ao fabricante explícito
   do produto. Se ausente, o fabricante permanece desconhecido.
   Para estoque, configure "availability" com os seletores opcionais
   "in_stock" e "out_of_stock". Sem marcador explícito, o estado é desconhecido.
"""

SITE_PROFILES = {
    "pedalokos.com.br": {
        "display_name": "Pedalokos Bike Shop",
        "platform": "shopify",
    },

    "loja-parceira-exemplo.com": {
        "display_name": "Loja Parceira Exemplo",
        "platform": "custom_html",
        "product_card": "div.product-card",
        "name": ".product-card__name",
        "price": ".product-card__price",
        "image": ".product-card__image img",
        "link": "a.product-card__link",
        "requires_js": False,
    },
}

def get_profile(domain: str) -> dict:
    """Retorna o perfil de configuração para um domínio, ou levanta erro claro."""
    profile = SITE_PROFILES.get(domain)
    if not profile:
        raise ValueError(
            f"Nenhum perfil configurado para o domínio '{domain}'. "
            f"Adicione uma entrada em SITE_PROFILES (sites_config.py) "
            f"antes de rodar o scraper para essa loja."
        )
    return profile
