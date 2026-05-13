"""Money + display filters for the design system."""
from decimal import Decimal, InvalidOperation

from django import template

register = template.Library()


def _format_money(value):
    if value is None or value == '':
        return ''
    try:
        amount = Decimal(value)
    except (InvalidOperation, ValueError, TypeError):
        return value
    sign = '-' if amount < 0 else ''
    amount = abs(amount).quantize(Decimal('0.01'))
    whole, frac = format(amount, 'f').split('.')
    groups = []
    while len(whole) > 3:
        groups.insert(0, whole[-3:])
        whole = whole[:-3]
    groups.insert(0, whole)
    return f"{sign}{','.join(groups)}.{frac}"


@register.filter(name='money')
def money(value):
    """Plain formatted money: -1,234.56"""
    return _format_money(value)


@register.filter(name='abs_money')
def abs_money(value):
    """Absolute value formatted: 1,234.56"""
    if value is None:
        return ''
    try:
        return _format_money(abs(Decimal(value)))
    except (InvalidOperation, ValueError, TypeError):
        return value


@register.filter(name='usd')
def usd(value):
    """Currency-prefixed amount: USD 1,234.56 (or USD (1,234.56) for negatives)."""
    if value is None or value == '':
        return ''
    try:
        amount = Decimal(value)
    except (InvalidOperation, ValueError, TypeError):
        return value
    if amount < 0:
        return f"USD ({_format_money(abs(amount))})"
    return f"USD {_format_money(amount)}"


@register.filter(name='paren_neg')
def paren_neg(value):
    """1,234.56 or (1,234.56) for negatives — no currency."""
    if value is None or value == '':
        return ''
    try:
        amount = Decimal(value)
    except (InvalidOperation, ValueError, TypeError):
        return value
    if amount < 0:
        return f"({_format_money(abs(amount))})"
    return _format_money(amount)


@register.filter(name='status_pill')
def status_pill(status):
    """Map a status string to a pill variant class."""
    s = (status or '').lower()
    mapping = {
        'posted': 'active',
        'paid': 'active',
        'reconciled': 'active',
        'open': 'active',

        'draft': 'pending',
        'pending': 'pending',
        'pending approval': 'pending',
        'partial': 'pending',
        'closing': 'pending',

        'sent': 'formation',
        'approved': 'formation',

        'void': 'review',
        'overdue': 'review',

        'closed': 'neutral',
        'inactive': 'neutral',
    }
    return mapping.get(s, 'neutral')


@register.filter(name='status_label')
def status_label(status):
    """Human-readable label for a status string."""
    return (status or '').replace('_', ' ').title()
