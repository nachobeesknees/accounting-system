"""
Views for the demo accounting system.

This implementation deliberately avoids Django's auth/session/database
machinery so the application works in a serverless environment (Vercel)
where the filesystem is ephemeral and there is no persistent database.

Authentication state is carried in a signed cookie ("demo_role"), and
all dashboard data is generated in-memory.
"""

from __future__ import annotations

import json
from datetime import date, timedelta
from decimal import Decimal

from django.http import HttpResponse, HttpResponseRedirect, JsonResponse
from django.shortcuts import render
from django.urls import reverse
from django.views.decorators.csrf import csrf_protect
from django.views.decorators.http import require_http_methods
from django.core.signing import BadSignature, Signer

# ---------------------------------------------------------------------------
# Demo accounts
# ---------------------------------------------------------------------------

DEMO_ACCOUNTS = [
    {
        'username': 'demo_admin',
        'password': 'demo123',
        'role': 'Admin',
        'full_name': 'Demo Admin',
        'description': 'Full access to all entities and operations',
        'icon': '👨‍💼',
        'permissions': ['view', 'create', 'edit', 'delete', 'approve', 'configure'],
    },
    {
        'username': 'demo_accountant',
        'password': 'demo123',
        'role': 'Accountant',
        'full_name': 'Demo Accountant',
        'description': 'Create and post journal entries, view GL',
        'icon': '📊',
        'permissions': ['view', 'create', 'edit'],
    },
    {
        'username': 'demo_cfo',
        'password': 'demo123',
        'role': 'CFO',
        'full_name': 'Demo CFO',
        'description': 'Reports, consolidation, approval authority',
        'icon': '💼',
        'permissions': ['view', 'approve', 'reports'],
    },
    {
        'username': 'demo_controller',
        'password': 'demo123',
        'role': 'Controller',
        'full_name': 'Demo Controller',
        'description': 'Setup, approval, period locks',
        'icon': '🔐',
        'permissions': ['view', 'approve', 'configure', 'lock_periods'],
    },
]

ACCOUNTS_BY_USERNAME = {a['username']: a for a in DEMO_ACCOUNTS}
COOKIE_NAME = 'demo_role'

signer = Signer(salt='accounting-demo-role')


def _get_current_user(request):
    """Return the demo user dict from the signed cookie, or None."""
    raw = request.COOKIES.get(COOKIE_NAME)
    if not raw:
        return None
    try:
        username = signer.unsign(raw)
    except BadSignature:
        return None
    return ACCOUNTS_BY_USERNAME.get(username)


def _require_login(request):
    user = _get_current_user(request)
    if user is None:
        return None, HttpResponseRedirect(reverse('core:demo_login'))
    return user, None


# ---------------------------------------------------------------------------
# Authentication views
# ---------------------------------------------------------------------------

@require_http_methods(["GET", "POST"])
def demo_login(request):
    """Demo login page with one-click buttons for all demo accounts."""
    if request.method == 'POST':
        username = (request.POST.get('username') or '').strip()
        password = (request.POST.get('password') or '').strip()
        account = ACCOUNTS_BY_USERNAME.get(username)

        if account and password == account['password']:
            response = HttpResponseRedirect(reverse('core:dashboard'))
            response.set_cookie(
                COOKIE_NAME,
                signer.sign(username),
                max_age=60 * 60 * 24 * 30,  # 30 days
                httponly=True,
                samesite='Lax',
            )
            return response

        return render(request, 'demo_login.html', {
            'demo_accounts': DEMO_ACCOUNTS,
            'error': 'Login failed. Please try a different demo account.',
        })

    # Already logged in? Send them to the dashboard.
    if _get_current_user(request):
        return HttpResponseRedirect(reverse('core:dashboard'))

    return render(request, 'demo_login.html', {
        'demo_accounts': DEMO_ACCOUNTS,
    })


def logout_view(request):
    response = HttpResponseRedirect(reverse('core:demo_login'))
    response.delete_cookie(COOKIE_NAME)
    return response


# ---------------------------------------------------------------------------
# Demo data (in-memory, deterministic for the user experience)
# ---------------------------------------------------------------------------

def _today():
    return date(2026, 5, 12)


CHART_OF_ACCOUNTS = [
    {'code': '1000', 'name': 'Cash & Cash Equivalents', 'type': 'Asset', 'balance': Decimal('482350.00')},
    {'code': '1100', 'name': 'Accounts Receivable', 'type': 'Asset', 'balance': Decimal('215800.00')},
    {'code': '1200', 'name': 'Inventory', 'type': 'Asset', 'balance': Decimal('132500.00')},
    {'code': '1500', 'name': 'Property, Plant & Equipment', 'type': 'Asset', 'balance': Decimal('845000.00')},
    {'code': '1510', 'name': 'Accumulated Depreciation', 'type': 'Asset', 'balance': Decimal('-185000.00')},
    {'code': '2000', 'name': 'Accounts Payable', 'type': 'Liability', 'balance': Decimal('-98750.00')},
    {'code': '2100', 'name': 'Accrued Expenses', 'type': 'Liability', 'balance': Decimal('-42300.00')},
    {'code': '2500', 'name': 'Long-Term Debt', 'type': 'Liability', 'balance': Decimal('-350000.00')},
    {'code': '3000', 'name': 'Common Stock', 'type': 'Equity', 'balance': Decimal('-500000.00')},
    {'code': '3100', 'name': 'Retained Earnings', 'type': 'Equity', 'balance': Decimal('-499600.00')},
    {'code': '4000', 'name': 'Sales Revenue', 'type': 'Revenue', 'balance': Decimal('-1250000.00')},
    {'code': '4100', 'name': 'Service Revenue', 'type': 'Revenue', 'balance': Decimal('-385000.00')},
    {'code': '5000', 'name': 'Cost of Goods Sold', 'type': 'Expense', 'balance': Decimal('625000.00')},
    {'code': '6000', 'name': 'Salaries & Wages', 'type': 'Expense', 'balance': Decimal('342000.00')},
    {'code': '6100', 'name': 'Rent Expense', 'type': 'Expense', 'balance': Decimal('48000.00')},
    {'code': '6200', 'name': 'Utilities', 'type': 'Expense', 'balance': Decimal('12500.00')},
    {'code': '6300', 'name': 'Marketing', 'type': 'Expense', 'balance': Decimal('65000.00')},
    {'code': '6400', 'name': 'Depreciation Expense', 'type': 'Expense', 'balance': Decimal('45000.00')},
]


JOURNAL_ENTRIES = [
    {
        'id': 'JE-2026-0142',
        'date': date(2026, 5, 11),
        'description': 'Monthly office rent payment',
        'status': 'Posted',
        'lines': [
            {'account': '6100 Rent Expense', 'debit': Decimal('4000.00'), 'credit': Decimal('0')},
            {'account': '1000 Cash & Cash Equivalents', 'debit': Decimal('0'), 'credit': Decimal('4000.00')},
        ],
    },
    {
        'id': 'JE-2026-0141',
        'date': date(2026, 5, 10),
        'description': 'Customer payment - Acme Corp invoice INV-1842',
        'status': 'Posted',
        'lines': [
            {'account': '1000 Cash & Cash Equivalents', 'debit': Decimal('18500.00'), 'credit': Decimal('0')},
            {'account': '1100 Accounts Receivable', 'debit': Decimal('0'), 'credit': Decimal('18500.00')},
        ],
    },
    {
        'id': 'JE-2026-0140',
        'date': date(2026, 5, 9),
        'description': 'Payroll - first half of May',
        'status': 'Posted',
        'lines': [
            {'account': '6000 Salaries & Wages', 'debit': Decimal('28500.00'), 'credit': Decimal('0')},
            {'account': '1000 Cash & Cash Equivalents', 'debit': Decimal('0'), 'credit': Decimal('28500.00')},
        ],
    },
    {
        'id': 'JE-2026-0139',
        'date': date(2026, 5, 8),
        'description': 'Sales invoice INV-1851 - Globex Industries',
        'status': 'Posted',
        'lines': [
            {'account': '1100 Accounts Receivable', 'debit': Decimal('22750.00'), 'credit': Decimal('0')},
            {'account': '4000 Sales Revenue', 'debit': Decimal('0'), 'credit': Decimal('22750.00')},
        ],
    },
    {
        'id': 'JE-2026-0138',
        'date': date(2026, 5, 7),
        'description': 'Marketing campaign - Q2 digital ads',
        'status': 'Pending Approval',
        'lines': [
            {'account': '6300 Marketing', 'debit': Decimal('8500.00'), 'credit': Decimal('0')},
            {'account': '2000 Accounts Payable', 'debit': Decimal('0'), 'credit': Decimal('8500.00')},
        ],
    },
    {
        'id': 'JE-2026-0137',
        'date': date(2026, 5, 6),
        'description': 'Utility bill - electric and water',
        'status': 'Posted',
        'lines': [
            {'account': '6200 Utilities', 'debit': Decimal('1240.00'), 'credit': Decimal('0')},
            {'account': '2000 Accounts Payable', 'debit': Decimal('0'), 'credit': Decimal('1240.00')},
        ],
    },
    {
        'id': 'JE-2026-0136',
        'date': date(2026, 5, 5),
        'description': 'Inventory purchase - components batch #4421',
        'status': 'Posted',
        'lines': [
            {'account': '1200 Inventory', 'debit': Decimal('15800.00'), 'credit': Decimal('0')},
            {'account': '2000 Accounts Payable', 'debit': Decimal('0'), 'credit': Decimal('15800.00')},
        ],
    },
    {
        'id': 'JE-2026-0135',
        'date': date(2026, 5, 4),
        'description': 'Monthly depreciation - PP&E',
        'status': 'Posted',
        'lines': [
            {'account': '6400 Depreciation Expense', 'debit': Decimal('3750.00'), 'credit': Decimal('0')},
            {'account': '1510 Accumulated Depreciation', 'debit': Decimal('0'), 'credit': Decimal('3750.00')},
        ],
    },
]


ENTITIES = [
    {'code': 'US-PARENT', 'name': 'Acme Holdings, Inc.', 'currency': 'USD', 'country': 'United States'},
    {'code': 'US-OPCO', 'name': 'Acme Operations LLC', 'currency': 'USD', 'country': 'United States'},
    {'code': 'UY-SUB', 'name': 'Acme Uruguay S.A.', 'currency': 'UYU', 'country': 'Uruguay'},
    {'code': 'EU-SUB', 'name': 'Acme Europe GmbH', 'currency': 'EUR', 'country': 'Germany'},
]


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

def _kpis():
    revenue = sum(-a['balance'] for a in CHART_OF_ACCOUNTS if a['type'] == 'Revenue')
    expenses = sum(a['balance'] for a in CHART_OF_ACCOUNTS if a['type'] == 'Expense')
    net_income = revenue - expenses
    assets = sum(a['balance'] for a in CHART_OF_ACCOUNTS if a['type'] == 'Asset')
    liabilities = sum(-a['balance'] for a in CHART_OF_ACCOUNTS if a['type'] == 'Liability')
    equity = sum(-a['balance'] for a in CHART_OF_ACCOUNTS if a['type'] == 'Equity')
    cash = next(a['balance'] for a in CHART_OF_ACCOUNTS if a['code'] == '1000')
    return {
        'revenue': revenue,
        'expenses': expenses,
        'net_income': net_income,
        'assets': assets,
        'liabilities': liabilities,
        'equity': equity,
        'cash': cash,
    }


def dashboard(request):
    user, redirect = _require_login(request)
    if redirect:
        return redirect

    kpis = _kpis()
    recent_entries = JOURNAL_ENTRIES[:5]
    pending = [j for j in JOURNAL_ENTRIES if j['status'] == 'Pending Approval']

    return render(request, 'dashboard.html', {
        'user': user,
        'kpis': kpis,
        'recent_entries': recent_entries,
        'pending_entries': pending,
        'entities': ENTITIES,
        'today': _today(),
    })


def journal_entries(request):
    user, redirect = _require_login(request)
    if redirect:
        return redirect

    return render(request, 'journal_entries.html', {
        'user': user,
        'journal_entries': JOURNAL_ENTRIES,
        'today': _today(),
    })


def journal_entry_detail(request, entry_id):
    user, redirect = _require_login(request)
    if redirect:
        return redirect

    entry = next((j for j in JOURNAL_ENTRIES if j['id'] == entry_id), None)
    if entry is None:
        return render(request, '404.html', status=404)

    total_debit = sum(line['debit'] for line in entry['lines'])
    total_credit = sum(line['credit'] for line in entry['lines'])

    return render(request, 'journal_entry_detail.html', {
        'user': user,
        'entry': entry,
        'total_debit': total_debit,
        'total_credit': total_credit,
    })


def chart_of_accounts(request):
    user, redirect = _require_login(request)
    if redirect:
        return redirect

    grouped = {}
    for account in CHART_OF_ACCOUNTS:
        grouped.setdefault(account['type'], []).append(account)

    ordered_types = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense']
    groups = [(t, grouped[t]) for t in ordered_types if t in grouped]

    return render(request, 'chart_of_accounts.html', {
        'user': user,
        'account_groups': groups,
    })


def reports(request):
    user, redirect = _require_login(request)
    if redirect:
        return redirect

    kpis = _kpis()

    # Income statement
    revenues = [(a['code'], a['name'], -a['balance']) for a in CHART_OF_ACCOUNTS if a['type'] == 'Revenue']
    expenses = [(a['code'], a['name'], a['balance']) for a in CHART_OF_ACCOUNTS if a['type'] == 'Expense']

    # Balance sheet
    assets = [(a['code'], a['name'], a['balance']) for a in CHART_OF_ACCOUNTS if a['type'] == 'Asset']
    liabilities = [(a['code'], a['name'], -a['balance']) for a in CHART_OF_ACCOUNTS if a['type'] == 'Liability']
    equity_accts = [(a['code'], a['name'], -a['balance']) for a in CHART_OF_ACCOUNTS if a['type'] == 'Equity']

    return render(request, 'reports.html', {
        'user': user,
        'kpis': kpis,
        'revenues': revenues,
        'expenses': expenses,
        'assets': assets,
        'liabilities': liabilities,
        'equity_accts': equity_accts,
        'today': _today(),
    })


def entities(request):
    user, redirect = _require_login(request)
    if redirect:
        return redirect

    return render(request, 'entities.html', {
        'user': user,
        'entities': ENTITIES,
    })


# ---------------------------------------------------------------------------
# API / health
# ---------------------------------------------------------------------------

def health_check(request):
    """Health check endpoint - no database dependency."""
    return JsonResponse({
        'status': 'healthy',
        'service': 'accounting-system',
        'demo_accounts': len(DEMO_ACCOUNTS),
        'entities': len(ENTITIES),
        'chart_of_accounts': len(CHART_OF_ACCOUNTS),
        'journal_entries': len(JOURNAL_ENTRIES),
    })


def api_overview(request):
    """JSON API summary for programmatic clients."""
    kpis = _kpis()
    return JsonResponse({
        'kpis': {k: str(v) for k, v in kpis.items()},
        'entity_count': len(ENTITIES),
        'journal_entry_count': len(JOURNAL_ENTRIES),
    })
