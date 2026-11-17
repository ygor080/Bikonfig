"""Prepara texto de anúncios como dados, sem executar HTML ou seguir instruções."""
import re
import math
from html.parser import HTMLParser

MAX_DESCRIPTION = 12000
MAX_ATTRIBUTES = 40
MAX_VALUE = 1000


class ProductTextParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.ignored = []

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style', 'noscript', 'template'):
            self.ignored.append(tag)
        elif not self.ignored:
            self.parts.append(' ')

    def handle_endtag(self, tag):
        if self.ignored:
            if tag == self.ignored[-1]:
                self.ignored.pop()
        else:
            self.parts.append(' ')

    def handle_data(self, data):
        if not self.ignored:
            self.parts.append(data)


def clean_product_text(value):
    if not isinstance(value, str):
        return ''
    parser = ProductTextParser()
    parser.feed(value)
    return re.sub(r'\s+', ' ', ''.join(parser.parts)).strip()


def prepare_product_context(description='', technical_attributes=None, variant_options=None):
    text = clean_product_text(description)
    incomplete = len(text) > MAX_DESCRIPTION

    def attributes(values):
        nonlocal incomplete
        if values is None:
            return {}
        if not isinstance(values, dict):
            incomplete = True
            return {}
        result = {}
        if len(values) > MAX_ATTRIBUTES:
            incomplete = True
        for key, value in list(values.items())[:MAX_ATTRIBUTES]:
            if not isinstance(key, str) or not isinstance(value, (str, int, float, bool)):
                incomplete = True
                continue
            if isinstance(value, float) and not math.isfinite(value):
                incomplete = True
                continue
            key = clean_product_text(key)
            value = clean_product_text(str(value))
            if len(key) > 80 or len(value) > MAX_VALUE:
                incomplete = True
            if key and value:
                result[key[:80]] = value[:MAX_VALUE]
        return result

    technical = attributes(technical_attributes)
    options = attributes(variant_options)
    return {'description': text[:MAX_DESCRIPTION], 'technical_attributes': technical,
            'variant_options': options, 'context_incomplete': incomplete}
