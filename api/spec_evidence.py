"""Validação conservadora das especificações retornadas pela categorização."""
import math
import re
import unicodedata


def comparable(value):
    text = unicodedata.normalize('NFKD', str(value)).lower()
    text = ''.join(c for c in text if not unicodedata.combining(c))
    return re.sub(r'\s+', '', text).replace(',', '.')


def validate_categorization(result, name, context, categories):
    if not isinstance(result, dict):
        result = {}
    review = bool(context.get('context_incomplete'))
    category = result.get('categoria')
    if category not in categories:
        category = 'outros'
        review = True
    confidence = result.get('confianca', 0)
    if isinstance(confidence, bool) or not isinstance(confidence, (int, float)) or not math.isfinite(confidence) or not 0 <= confidence <= 1:
        confidence = 0
        review = True
    optional = result.get('opcional', False)
    if not isinstance(optional, bool):
        optional = False
        review = True
    specs = result.get('specs', {})
    evidence = result.get('evidencias', {})
    if not isinstance(specs, dict) or not isinstance(evidence, dict):
        specs, evidence, review = {}, {}, True
    source = [name, context['description']]
    source += [f'{key}: {value}' for key, value in context['technical_attributes'].items()]
    source += [f'{key}: {value}' for key, value in context['variant_options'].items()]
    aliases = {'aro': 'aro', 'velocidades': 'velocidades', 'numero_coroas': 'numero_coroas',
               'padrao_freio': 'padrao_freio', 'diametro_eixo': 'diametro_eixo', 'padrao_freehub': 'padrao_freehub',
               'tamanho': 'tamanho', 'cor': 'cor'}
    alias_lookup = {comparable(key).replace('_', ''): field for key, field in aliases.items()}
    alias_lookup.update({'numerodecoroas': 'numero_coroas', 'size': 'tamanho', 'color': 'cor', 'colour': 'cor',
                         'padraodefreio': 'padrao_freio', 'diametrodoeixo': 'diametro_eixo'})
    explicit = {}
    for key, value in {**context['technical_attributes'], **context['variant_options']}.items():
        field = alias_lookup.get(comparable(key).replace('_', ''))
        if field:
            explicit[field] = value
    valid = {}
    for key, value in specs.items():
        quote = evidence.get(key)
        if (not isinstance(key, str) or not key or len(key) > 80
            or not isinstance(value, (str, int, float, bool))
            or isinstance(value, float) and not math.isfinite(value)
            or not isinstance(quote, str) or not quote.strip() or len(quote) > 1000):
            review = True
            continue
        if not any(comparable(quote) in comparable(part) for part in source):
            review = True
            continue
        literal = comparable(value)
        pattern = (r'(?<![\d.])' if literal[:1].isdigit() else '') + re.escape(literal)
        if literal[-1:].isdigit():
            pattern += r'(?![\d.])'
        if not literal or not re.search(pattern, comparable(quote)):
            review = True
            continue
        if key in explicit and comparable(value) != comparable(explicit[key]):
            review = True
            continue
        valid[key] = value
    return {'categoria': category, 'produto_principal': result.get('produto_principal', ''),
            'specs': valid, 'opcional': optional, 'confianca': min(confidence, 0.49) if review else confidence,
            'requires_review': review}
