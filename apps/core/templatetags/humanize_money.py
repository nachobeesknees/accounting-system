"""Custom template filters for money formatting in the demo app."""
from decimal import Decimal, InvalidOperation

from django import template

register = template.Library()


@register.filter(name='money')
def money(value):
    """Format a Decimal/number as 1,234,567.89 (no currency symbol)."""
    if value is None or value == '':
        return ''
    try:
        amount = Decimal(value)
    except (InvalidOperation, ValueError, TypeError):
        return value
    # Always 2 decimals, grouped by thousands
    sign = '-' if amount < 0 else ''
    amount = abs(amount).quantize(Decimal('0.01'))
    whole, frac = format(amount, 'f').split('.')
    # Insert thousands separators
    groups = []
    while len(whole) > 3:
        groups.insert(0, whole[-3:])
        whole = whole[:-3]
    groups.insert(0, whole)
    return f"{sign}{','.join(groups)}.{frac}"


@register.filter(name='abs_money')
def abs_money(value):
    """Format the absolute value of a Decimal/number with thousands separators."""
    if value is None:
        return ''
    try:
        amount = abs(Decimal(value))
    except (InvalidOperation, ValueError, TypeError):
        return value
    return money(amount)
