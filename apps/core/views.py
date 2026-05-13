"""
Views for the Thistlewood & Associates demo accounting system.

This implementation deliberately avoids Django's auth/session/database
machinery so the application works in a serverless environment (Vercel)
where the filesystem is ephemeral and there is no persistent database.

Authentication state is carried in a signed cookie ("demo_role"), and
all data is generated in-memory.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date
from decimal import Decimal

from django.http import HttpResponseRedirect, JsonResponse
from django.shortcuts import render
from django.urls import reverse
from django.views.decorators.http import require_http_methods
from django.core.signing import BadSignature, Signer

# ---------------------------------------------------------------------------
# Demo accounts (cookie-based auth)
# ---------------------------------------------------------------------------

DEMO_ACCOUNTS = [
    {
        'username': 'demo_admin',
        'password': 'demo123',
        'role': 'Admin',
        'full_name': 'Demo Admin',
        'description': 'Full access to all entities and operations',
        'icon': '👤',
        'permissions': ['view', 'create', 'edit', 'delete', 'approve', 'configure'],
    },
    {
        'username': 'demo_accountant',
        'password': 'demo123',
        'role': 'Bookkeeper',
        'full_name': 'Margery Crumplebottom',
        'description': 'Create and post journal entries, view GL',
        'icon': '📒',
        'permissions': ['view', 'create', 'edit'],
    },
    {
        'username': 'demo_cfo',
        'password': 'demo123',
        'role': 'CFO',
        'full_name': 'Aldous Pepperton',
        'description': 'Reports, consolidation, approval authority',
        'icon': '🧮',
        'permissions': ['view', 'approve', 'reports'],
    },
    {
        'username': 'demo_controller',
        'password': 'demo123',
        'role': 'Controller',
        'full_name': 'Eustace Brindleworth',
        'description': 'Setup, approval, period locks',
        'icon': '🗂',
        'permissions': ['view', 'approve', 'configure', 'lock_periods'],
    },
]

ACCOUNTS_BY_USERNAME = {a['username']: a for a in DEMO_ACCOUNTS}
COOKIE_NAME = 'demo_role'
signer = Signer(salt='accounting-demo-role')


def _get_current_user(request):
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


def _nav_context(extras=None):
    """Counts shown in the sidebar."""
    ctx = {
        'je_count': len(JOURNAL_ENTRIES),
        'invoice_count': len(INVOICES),
        'bill_count': len(BILLS),
    }
    if extras:
        ctx.update(extras)
    return ctx


# ---------------------------------------------------------------------------
# Authentication views
# ---------------------------------------------------------------------------

@require_http_methods(["GET", "POST"])
def demo_login(request):
    if request.method == 'POST':
        username = (request.POST.get('username') or '').strip()
        password = (request.POST.get('password') or '').strip()
        account = ACCOUNTS_BY_USERNAME.get(username)
        if account and password == account['password']:
            response = HttpResponseRedirect(reverse('core:dashboard'))
            response.set_cookie(
                COOKIE_NAME, signer.sign(username),
                max_age=60 * 60 * 24 * 30,
                httponly=True, samesite='Lax',
            )
            return response
        return render(request, 'demo_login.html', {
            'demo_accounts': DEMO_ACCOUNTS,
            'error': 'Login failed. Please try a different demo account.',
        })
    if _get_current_user(request):
        return HttpResponseRedirect(reverse('core:dashboard'))
    return render(request, 'demo_login.html', {'demo_accounts': DEMO_ACCOUNTS})


def logout_view(request):
    response = HttpResponseRedirect(reverse('core:demo_login'))
    response.delete_cookie(COOKIE_NAME)
    return response


# ---------------------------------------------------------------------------
# Seed data — Thistlewood & Associates, LLC
# ---------------------------------------------------------------------------

COMPANY_NAME = "Thistlewood & Associates, LLC"
DEFAULT_CURRENCY = "USD"


def _today():
    return date(2026, 5, 13)


CHART_OF_ACCOUNTS = [
    {'code': '1000', 'name': 'Cash', 'type': 'asset', 'sub_type': 'current_asset', 'normal': 'debit', 'balance': Decimal('428350.00')},
    {'code': '1200', 'name': 'Accounts Receivable', 'type': 'asset', 'sub_type': 'current_asset', 'normal': 'debit', 'balance': Decimal('215800.00')},
    {'code': '1300', 'name': 'Prepaid Expenses', 'type': 'asset', 'sub_type': 'current_asset', 'normal': 'debit', 'balance': Decimal('18250.00')},
    {'code': '1500', 'name': 'Office Equipment', 'type': 'asset', 'sub_type': 'long_term_asset', 'normal': 'debit', 'balance': Decimal('86000.00')},
    {'code': '1510', 'name': 'Accumulated Depreciation', 'type': 'asset', 'sub_type': 'long_term_asset', 'normal': 'credit', 'balance': Decimal('-22500.00')},

    {'code': '2000', 'name': 'Accounts Payable', 'type': 'liability', 'sub_type': 'current_liability', 'normal': 'credit', 'balance': Decimal('-72400.00')},
    {'code': '2100', 'name': 'Accrued Liabilities', 'type': 'liability', 'sub_type': 'current_liability', 'normal': 'credit', 'balance': Decimal('-18750.00')},

    {'code': '3000', 'name': "Owner's Equity", 'type': 'equity', 'sub_type': 'capital', 'normal': 'credit', 'balance': Decimal('-200000.00')},
    {'code': '3100', 'name': 'Retained Earnings', 'type': 'equity', 'sub_type': 'retained', 'normal': 'credit', 'balance': Decimal('-225350.00')},

    {'code': '4000', 'name': 'Service Revenue', 'type': 'revenue', 'sub_type': 'operating', 'normal': 'credit', 'balance': Decimal('-845000.00')},
    {'code': '4100', 'name': 'Interest Income', 'type': 'revenue', 'sub_type': 'non_operating', 'normal': 'credit', 'balance': Decimal('-4200.00')},

    {'code': '5000', 'name': 'Rent Expense', 'type': 'expense', 'sub_type': 'operating', 'normal': 'debit', 'balance': Decimal('48000.00')},
    {'code': '5100', 'name': 'Salaries Expense', 'type': 'expense', 'sub_type': 'operating', 'normal': 'debit', 'balance': Decimal('342000.00')},
    {'code': '5200', 'name': 'Office Supplies', 'type': 'expense', 'sub_type': 'operating', 'normal': 'debit', 'balance': Decimal('6400.00')},
    {'code': '5300', 'name': 'Utilities', 'type': 'expense', 'sub_type': 'operating', 'normal': 'debit', 'balance': Decimal('11200.00')},
    {'code': '5400', 'name': 'Professional Fees', 'type': 'expense', 'sub_type': 'operating', 'normal': 'debit', 'balance': Decimal('38900.00')},
    {'code': '5500', 'name': 'Depreciation', 'type': 'expense', 'sub_type': 'operating', 'normal': 'debit', 'balance': Decimal('5500.00')},
]

ACCOUNT_BY_CODE = {a['code']: a for a in CHART_OF_ACCOUNTS}


FISCAL_PERIODS = [
    {'name': '2026-Q1', 'start': date(2026, 1, 1), 'end': date(2026, 3, 31), 'status': 'closed'},
    {'name': '2026-Q2', 'start': date(2026, 4, 1), 'end': date(2026, 6, 30), 'status': 'open'},
    {'name': '2026-Q3', 'start': date(2026, 7, 1), 'end': date(2026, 9, 30), 'status': 'open'},
    {'name': '2026-Q4', 'start': date(2026, 10, 1), 'end': date(2026, 12, 31), 'status': 'open'},
]


CUSTOMERS = [
    {'code': 'CUST-001', 'name': 'Pumpernickel Industries', 'email': 'ap@pumpernickel.co', 'phone': '(415) 555-2210', 'terms': 30, 'is_active': True, 'balance': Decimal('48500.00')},
    {'code': 'CUST-002', 'name': 'Snickerthorpe Holdings', 'email': 'finance@snickerthorpe.com', 'phone': '(212) 555-0930', 'terms': 45, 'is_active': True, 'balance': Decimal('62300.00')},
    {'code': 'CUST-003', 'name': 'Mumblethrottle Capital', 'email': 'ar@mumblethrottle.io', 'phone': '(617) 555-7188', 'terms': 30, 'is_active': True, 'balance': Decimal('21750.00')},
    {'code': 'CUST-004', 'name': 'Tsukimomo Ventures', 'email': 'billing@tsukimomo.jp', 'phone': '+81 3 5555 4019', 'terms': 60, 'is_active': True, 'balance': Decimal('83250.00')},
    {'code': 'CUST-005', 'name': 'Frogsworth & Partners', 'email': 'invoices@frogsworth.co.uk', 'phone': '+44 20 5555 0144', 'terms': 30, 'is_active': True, 'balance': Decimal('0.00')},
]

VENDORS = [
    {'code': 'VEND-001', 'name': 'Bramblewick Office Supply', 'email': 'orders@bramblewick.com', 'terms': 30, 'default_account': '5200', 'is_active': True, 'balance': Decimal('-1240.00')},
    {'code': 'VEND-002', 'name': 'Quillfeather Technology', 'email': 'ar@quillfeather.tech', 'terms': 30, 'default_account': '1500', 'is_active': True, 'balance': Decimal('-12800.00')},
    {'code': 'VEND-003', 'name': 'Nettlesome Property Management', 'email': 'leases@nettlesome.com', 'terms': 30, 'default_account': '5000', 'is_active': True, 'balance': Decimal('-4000.00')},
    {'code': 'VEND-004', 'name': 'Thundermuffin Consulting', 'email': 'finance@thundermuffin.io', 'terms': 30, 'default_account': '5400', 'is_active': True, 'balance': Decimal('-38900.00')},
    {'code': 'VEND-005', 'name': 'Wobblesworth Insurance Group', 'email': 'billing@wobblesworth.com', 'terms': 30, 'default_account': '5400', 'is_active': True, 'balance': Decimal('-15460.00')},
]

CUSTOMER_BY_CODE = {c['code']: c for c in CUSTOMERS}
VENDOR_BY_CODE = {v['code']: v for v in VENDORS}


INVOICES = [
    {'number': 'INV-000018', 'customer': 'CUST-004', 'date': date(2026, 5, 11), 'due': date(2026, 7, 10), 'total': Decimal('83250.00'), 'balance': Decimal('83250.00'), 'status': 'sent'},
    {'number': 'INV-000017', 'customer': 'CUST-002', 'date': date(2026, 5, 8),  'due': date(2026, 6, 22), 'total': Decimal('62300.00'), 'balance': Decimal('62300.00'), 'status': 'sent'},
    {'number': 'INV-000016', 'customer': 'CUST-001', 'date': date(2026, 5, 4),  'due': date(2026, 6, 3),  'total': Decimal('48500.00'), 'balance': Decimal('48500.00'), 'status': 'partial'},
    {'number': 'INV-000015', 'customer': 'CUST-003', 'date': date(2026, 4, 27), 'due': date(2026, 5, 27), 'total': Decimal('21750.00'), 'balance': Decimal('21750.00'), 'status': 'sent'},
    {'number': 'INV-000014', 'customer': 'CUST-005', 'date': date(2026, 4, 20), 'due': date(2026, 5, 20), 'total': Decimal('17500.00'), 'balance': Decimal('0.00'),     'status': 'paid'},
    {'number': 'INV-000013', 'customer': 'CUST-001', 'date': date(2026, 3, 28), 'due': date(2026, 4, 27), 'total': Decimal('12400.00'), 'balance': Decimal('12400.00'), 'status': 'overdue'},
    {'number': 'INV-000012', 'customer': 'CUST-002', 'date': date(2026, 3, 14), 'due': date(2026, 4, 28), 'total': Decimal('28200.00'), 'balance': Decimal('0.00'),     'status': 'paid'},
]

BILLS = [
    {'number': 'BILL-2026-058', 'vendor': 'VEND-003', 'date': date(2026, 5, 1),  'due': date(2026, 5, 31), 'total': Decimal('4000.00'),  'balance': Decimal('4000.00'),  'status': 'approved'},
    {'number': 'BILL-2026-057', 'vendor': 'VEND-004', 'date': date(2026, 5, 4),  'due': date(2026, 6, 3),  'total': Decimal('38900.00'), 'balance': Decimal('38900.00'), 'status': 'approved'},
    {'number': 'BILL-2026-056', 'vendor': 'VEND-002', 'date': date(2026, 4, 28), 'due': date(2026, 5, 28), 'total': Decimal('12800.00'), 'balance': Decimal('12800.00'), 'status': 'approved'},
    {'number': 'BILL-2026-055', 'vendor': 'VEND-001', 'date': date(2026, 4, 21), 'due': date(2026, 5, 21), 'total': Decimal('1240.00'),  'balance': Decimal('1240.00'),  'status': 'overdue'},
    {'number': 'BILL-2026-054', 'vendor': 'VEND-005', 'date': date(2026, 4, 15), 'due': date(2026, 5, 15), 'total': Decimal('15460.00'), 'balance': Decimal('15460.00'), 'status': 'overdue'},
    {'number': 'BILL-2026-053', 'vendor': 'VEND-001', 'date': date(2026, 3, 30), 'due': date(2026, 4, 29), 'total': Decimal('860.00'),   'balance': Decimal('0.00'),     'status': 'paid'},
]


JOURNAL_ENTRIES = [
    {
        'number': 'JE-000142', 'date': date(2026, 5, 11),
        'description': 'Monthly office rent payment', 'reference': 'CHK-2418',
        'source': 'manual', 'status': 'posted', 'period': '2026-Q2',
        'lines': [
            {'account': '5000', 'description': 'May rent', 'debit': Decimal('4000.00'), 'credit': Decimal('0')},
            {'account': '1000', 'description': 'Cash payment', 'debit': Decimal('0'),   'credit': Decimal('4000.00')},
        ],
    },
    {
        'number': 'JE-000141', 'date': date(2026, 5, 10),
        'description': 'Customer payment received', 'reference': 'INV-000014',
        'source': 'invoice', 'status': 'posted', 'period': '2026-Q2',
        'lines': [
            {'account': '1000', 'description': 'Deposit',   'debit': Decimal('17500.00'), 'credit': Decimal('0')},
            {'account': '1200', 'description': 'Apply AR',  'debit': Decimal('0'),        'credit': Decimal('17500.00')},
        ],
    },
    {
        'number': 'JE-000140', 'date': date(2026, 5, 9),
        'description': 'Payroll - first half of May', 'reference': 'PAY-202605-1',
        'source': 'manual', 'status': 'posted', 'period': '2026-Q2',
        'lines': [
            {'account': '5100', 'description': 'Payroll',  'debit': Decimal('28500.00'), 'credit': Decimal('0')},
            {'account': '1000', 'description': 'Cash out', 'debit': Decimal('0'),        'credit': Decimal('28500.00')},
        ],
    },
    {
        'number': 'JE-000139', 'date': date(2026, 5, 8),
        'description': 'Service invoice issued', 'reference': 'INV-000017',
        'source': 'invoice', 'status': 'posted', 'period': '2026-Q2',
        'lines': [
            {'account': '1200', 'description': 'Receivable', 'debit': Decimal('62300.00'), 'credit': Decimal('0')},
            {'account': '4000', 'description': 'Service rev','debit': Decimal('0'),        'credit': Decimal('62300.00')},
        ],
    },
    {
        'number': 'JE-000138', 'date': date(2026, 5, 4),
        'description': 'Consulting fees - Thundermuffin', 'reference': 'BILL-2026-057',
        'source': 'bill', 'status': 'draft', 'period': '2026-Q2',
        'lines': [
            {'account': '5400', 'description': 'Pro fees', 'debit': Decimal('38900.00'), 'credit': Decimal('0')},
            {'account': '2000', 'description': 'AP',       'debit': Decimal('0'),        'credit': Decimal('38900.00')},
        ],
    },
    {
        'number': 'JE-000137', 'date': date(2026, 5, 2),
        'description': 'Utility bill', 'reference': 'BILL-2026-052',
        'source': 'bill', 'status': 'posted', 'period': '2026-Q2',
        'lines': [
            {'account': '5300', 'description': 'Utilities', 'debit': Decimal('1180.00'), 'credit': Decimal('0')},
            {'account': '2000', 'description': 'AP',        'debit': Decimal('0'),       'credit': Decimal('1180.00')},
        ],
    },
    {
        'number': 'JE-000136', 'date': date(2026, 4, 28),
        'description': 'Laptops - Quillfeather Tech', 'reference': 'BILL-2026-056',
        'source': 'bill', 'status': 'posted', 'period': '2026-Q2',
        'lines': [
            {'account': '1500', 'description': 'Equipment', 'debit': Decimal('12800.00'), 'credit': Decimal('0')},
            {'account': '2000', 'description': 'AP',        'debit': Decimal('0'),        'credit': Decimal('12800.00')},
        ],
    },
    {
        'number': 'JE-000135', 'date': date(2026, 4, 30),
        'description': 'Monthly depreciation', 'reference': '',
        'source': 'manual', 'status': 'posted', 'period': '2026-Q2',
        'lines': [
            {'account': '5500', 'description': 'Depreciation', 'debit': Decimal('1100.00'), 'credit': Decimal('0')},
            {'account': '1510', 'description': 'Accum. dep',   'debit': Decimal('0'),       'credit': Decimal('1100.00')},
        ],
    },
    {
        'number': 'JE-000134', 'date': date(2026, 4, 25),
        'description': 'Customer payment received', 'reference': 'INV-000012',
        'source': 'invoice', 'status': 'posted', 'period': '2026-Q2',
        'lines': [
            {'account': '1000', 'description': 'Deposit',  'debit': Decimal('28200.00'), 'credit': Decimal('0')},
            {'account': '1200', 'description': 'Apply AR', 'debit': Decimal('0'),        'credit': Decimal('28200.00')},
        ],
    },
    {
        'number': 'JE-000133', 'date': date(2026, 4, 20),
        'description': 'Voided test entry', 'reference': '',
        'source': 'manual', 'status': 'void', 'period': '2026-Q2',
        'lines': [
            {'account': '5200', 'description': 'Test', 'debit': Decimal('100.00'), 'credit': Decimal('0')},
            {'account': '1000', 'description': 'Test', 'debit': Decimal('0'),      'credit': Decimal('100.00')},
        ],
    },
]


BANK_ACCOUNTS = [
    {'name': 'Operating Account', 'account': '1000', 'institution': 'First National', 'last_four': '4521', 'currency': 'USD'},
]

BANK_TRANSACTIONS = [
    {'date': date(2026, 5, 11), 'description': 'Wire — Nettlesome Property Mgmt', 'amount': Decimal('-4000.00'), 'reference': 'WIRE-99812', 'reconciled': True,  'match': 'JE-000142'},
    {'date': date(2026, 5, 10), 'description': 'Deposit — Frogsworth & Partners', 'amount': Decimal('17500.00'), 'reference': 'ACH-50220',  'reconciled': True,  'match': 'JE-000141'},
    {'date': date(2026, 5, 9),  'description': 'Payroll batch',                  'amount': Decimal('-28500.00'), 'reference': 'PAY-202605-1','reconciled': True,  'match': 'JE-000140'},
    {'date': date(2026, 5, 6),  'description': 'Card fee — Wobblesworth',        'amount': Decimal('-145.00'),  'reference': 'CARD-77110', 'reconciled': False, 'match': None},
    {'date': date(2026, 5, 5),  'description': 'Deposit — Mumblethrottle',       'amount': Decimal('5400.00'),  'reference': 'ACH-50140',  'reconciled': False, 'match': None},
    {'date': date(2026, 5, 3),  'description': 'Bank fee',                       'amount': Decimal('-25.00'),   'reference': 'FEE-04015',  'reconciled': False, 'match': None},
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _balances():
    revenue = sum(-a['balance'] for a in CHART_OF_ACCOUNTS if a['type'] == 'revenue')
    expenses = sum(a['balance'] for a in CHART_OF_ACCOUNTS if a['type'] == 'expense')
    net_income = revenue - expenses
    assets = sum(a['balance'] for a in CHART_OF_ACCOUNTS if a['type'] == 'asset')
    liabilities = sum(-a['balance'] for a in CHART_OF_ACCOUNTS if a['type'] == 'liability')
    equity = sum(-a['balance'] for a in CHART_OF_ACCOUNTS if a['type'] == 'equity')
    cash = next(a['balance'] for a in CHART_OF_ACCOUNTS if a['code'] == '1000')
    return {
        'revenue': revenue, 'expenses': expenses, 'net_income': net_income,
        'assets': assets, 'liabilities': liabilities, 'equity': equity,
        'cash': cash,
    }


def _ar_aging():
    today = _today()
    buckets = {'current': Decimal('0'), 'd30': Decimal('0'), 'd60': Decimal('0'), 'd90': Decimal('0')}
    for inv in INVOICES:
        if inv['balance'] <= 0:
            continue
        days_overdue = (today - inv['due']).days
        if days_overdue <= 0:
            buckets['current'] += inv['balance']
        elif days_overdue <= 30:
            buckets['d30'] += inv['balance']
        elif days_overdue <= 60:
            buckets['d60'] += inv['balance']
        else:
            buckets['d90'] += inv['balance']
    return buckets


def _ap_aging():
    today = _today()
    buckets = {'current': Decimal('0'), 'd30': Decimal('0'), 'd60': Decimal('0'), 'd90': Decimal('0')}
    for bill in BILLS:
        if bill['balance'] <= 0:
            continue
        days_overdue = (today - bill['due']).days
        if days_overdue <= 0:
            buckets['current'] += bill['balance']
        elif days_overdue <= 30:
            buckets['d30'] += bill['balance']
        elif days_overdue <= 60:
            buckets['d60'] += bill['balance']
        else:
            buckets['d90'] += bill['balance']
    return buckets


def _je_total(entry):
    return sum(l['debit'] for l in entry['lines'])


# ---------------------------------------------------------------------------
# Pages
# ---------------------------------------------------------------------------

def dashboard(request):
    user, redirect = _require_login(request)
    if redirect:
        return redirect
    kpis = _balances()
    ar = _ar_aging()
    ap = _ap_aging()
    recent = JOURNAL_ENTRIES[:8]
    overdue_invoices = [i for i in INVOICES if i['status'] == 'overdue']
    upcoming_bills = sorted([b for b in BILLS if b['balance'] > 0], key=lambda x: x['due'])[:5]
    return render(request, 'dashboard.html', _nav_context({
        'user': user,
        'kpis': kpis, 'ar': ar, 'ap': ap,
        'recent': recent,
        'overdue_invoices': overdue_invoices,
        'upcoming_bills': upcoming_bills,
        'company_name': COMPANY_NAME,
        'today': _today(),
    }))


def chart_of_accounts(request):
    user, redirect = _require_login(request)
    if redirect:
        return redirect

    type_filter = request.GET.get('type')
    accounts = CHART_OF_ACCOUNTS
    if type_filter:
        accounts = [a for a in accounts if a['type'] == type_filter]

    grouped = defaultdict(list)
    for a in accounts:
        grouped[a['type']].append(a)
    order = ['asset', 'liability', 'equity', 'revenue', 'expense']
    groups = [(t, grouped[t]) for t in order if t in grouped]

    return render(request, 'chart_of_accounts.html', _nav_context({
        'user': user,
        'account_groups': groups,
        'type_filter': type_filter,
        'all_count': len(CHART_OF_ACCOUNTS),
    }))


def journal_entries(request):
    user, redirect = _require_login(request)
    if redirect:
        return redirect

    status = request.GET.get('status', '')
    source = request.GET.get('source', '')
    q = (request.GET.get('q') or '').lower().strip()

    rows = JOURNAL_ENTRIES
    if status:
        rows = [r for r in rows if r['status'] == status]
    if source:
        rows = [r for r in rows if r['source'] == source]
    if q:
        rows = [r for r in rows if q in r['description'].lower() or q in r['number'].lower() or q in (r.get('reference') or '').lower()]

    rows = [dict(r, total=_je_total(r)) for r in rows]

    return render(request, 'journal_entries.html', _nav_context({
        'user': user,
        'rows': rows,
        'status': status,
        'source': source,
        'q': q,
        'total_count': len(JOURNAL_ENTRIES),
    }))


def journal_entry_detail(request, entry_id):
    user, redirect = _require_login(request)
    if redirect:
        return redirect

    entry = next((j for j in JOURNAL_ENTRIES if j['number'] == entry_id), None)
    if entry is None:
        return render(request, '404.html', _nav_context({'user': user}), status=404)

    total_debit = sum(l['debit'] for l in entry['lines'])
    total_credit = sum(l['credit'] for l in entry['lines'])
    balanced = total_debit == total_credit

    return render(request, 'journal_entry_detail.html', _nav_context({
        'user': user,
        'entry': entry,
        'total_debit': total_debit, 'total_credit': total_credit,
        'balanced': balanced,
        'account_by_code': ACCOUNT_BY_CODE,
    }))


def general_ledger(request):
    user, redirect = _require_login(request)
    if redirect:
        return redirect

    code = request.GET.get('account') or CHART_OF_ACCOUNTS[0]['code']
    account = ACCOUNT_BY_CODE.get(code) or CHART_OF_ACCOUNTS[0]

    rows = []
    running = Decimal('0')
    sign = 1 if account['normal'] == 'debit' else -1
    matching = []
    for entry in sorted(JOURNAL_ENTRIES, key=lambda x: x['date']):
        if entry['status'] != 'posted':
            continue
        for line in entry['lines']:
            if line['account'] == code:
                delta = (line['debit'] - line['credit']) * sign
                running += delta
                matching.append({
                    'date': entry['date'], 'number': entry['number'],
                    'description': entry['description'],
                    'debit': line['debit'], 'credit': line['credit'],
                    'balance': running,
                })

    return render(request, 'general_ledger.html', _nav_context({
        'user': user,
        'accounts': CHART_OF_ACCOUNTS,
        'account': account,
        'rows': matching,
        'ending': running,
    }))


def invoices(request):
    user, redirect = _require_login(request)
    if redirect:
        return redirect
    rows = []
    for inv in INVOICES:
        rows.append(dict(inv, customer_name=CUSTOMER_BY_CODE[inv['customer']]['name']))
    return render(request, 'invoices.html', _nav_context({
        'user': user, 'rows': rows,
    }))


def customers(request):
    user, redirect = _require_login(request)
    if redirect:
        return redirect
    return render(request, 'customers.html', _nav_context({
        'user': user, 'rows': CUSTOMERS,
    }))


def bills(request):
    user, redirect = _require_login(request)
    if redirect:
        return redirect
    rows = []
    for b in BILLS:
        rows.append(dict(b, vendor_name=VENDOR_BY_CODE[b['vendor']]['name']))
    return render(request, 'bills.html', _nav_context({
        'user': user, 'rows': rows,
    }))


def vendors(request):
    user, redirect = _require_login(request)
    if redirect:
        return redirect
    return render(request, 'vendors.html', _nav_context({
        'user': user, 'rows': VENDORS,
    }))


def reports(request):
    user, redirect = _require_login(request)
    if redirect:
        return redirect
    kpis = _balances()

    revenues = [(a['code'], a['name'], -a['balance']) for a in CHART_OF_ACCOUNTS if a['type'] == 'revenue']
    expenses = [(a['code'], a['name'], a['balance']) for a in CHART_OF_ACCOUNTS if a['type'] == 'expense']
    assets = [(a['code'], a['name'], a['balance']) for a in CHART_OF_ACCOUNTS if a['type'] == 'asset']
    liabilities = [(a['code'], a['name'], -a['balance']) for a in CHART_OF_ACCOUNTS if a['type'] == 'liability']
    equity_accts = [(a['code'], a['name'], -a['balance']) for a in CHART_OF_ACCOUNTS if a['type'] == 'equity']

    # Trial balance: debit-normal accounts show debit; credit-normal show credit
    trial = []
    for a in CHART_OF_ACCOUNTS:
        if a['normal'] == 'debit':
            debit = max(a['balance'], Decimal('0'))
            credit = abs(min(a['balance'], Decimal('0')))
        else:
            debit = abs(min(a['balance'], Decimal('0')))
            credit = max(-a['balance'], Decimal('0'))
        trial.append({'code': a['code'], 'name': a['name'], 'debit': debit, 'credit': credit})
    trial_total_debit = sum(t['debit'] for t in trial)
    trial_total_credit = sum(t['credit'] for t in trial)

    return render(request, 'reports.html', _nav_context({
        'user': user,
        'kpis': kpis,
        'revenues': revenues, 'expenses': expenses,
        'assets': assets, 'liabilities': liabilities, 'equity_accts': equity_accts,
        'trial': trial,
        'trial_total_debit': trial_total_debit,
        'trial_total_credit': trial_total_credit,
        'today': _today(),
    }))


def reconciliation(request):
    user, redirect = _require_login(request)
    if redirect:
        return redirect
    account = BANK_ACCOUNTS[0]
    unrec = [t for t in BANK_TRANSACTIONS if not t['reconciled']]
    rec = [t for t in BANK_TRANSACTIONS if t['reconciled']]
    cleared = sum(t['amount'] for t in rec)
    outstanding = sum(t['amount'] for t in unrec)
    book_balance = next(a['balance'] for a in CHART_OF_ACCOUNTS if a['code'] == account['account'])
    return render(request, 'reconciliation.html', _nav_context({
        'user': user,
        'account': account,
        'unreconciled': unrec, 'reconciled': rec,
        'cleared': cleared, 'outstanding': outstanding,
        'book_balance': book_balance,
    }))


def periods(request):
    user, redirect = _require_login(request)
    if redirect:
        return redirect
    return render(request, 'periods.html', _nav_context({
        'user': user, 'rows': FISCAL_PERIODS,
    }))


def entities(request):
    user, redirect = _require_login(request)
    if redirect:
        return redirect
    entity_rows = [
        {'code': 'TW-MAIN', 'name': COMPANY_NAME, 'currency': 'USD', 'country': 'United States'},
    ]
    return render(request, 'entities.html', _nav_context({
        'user': user, 'rows': entity_rows,
    }))


def settings_view(request):
    user, redirect = _require_login(request)
    if redirect:
        return redirect
    return render(request, 'settings.html', _nav_context({
        'user': user,
        'company_name': COMPANY_NAME,
        'currency': DEFAULT_CURRENCY,
        'fiscal_year_start': 'January',
        'next_invoice': 'INV-000019',
        'next_je': 'JE-000143',
    }))


# ---------------------------------------------------------------------------
# API / health
# ---------------------------------------------------------------------------

def health_check(request):
    return JsonResponse({
        'status': 'healthy', 'service': 'accounting-system',
        'company': COMPANY_NAME,
        'demo_accounts': len(DEMO_ACCOUNTS),
        'accounts': len(CHART_OF_ACCOUNTS),
        'journal_entries': len(JOURNAL_ENTRIES),
        'invoices': len(INVOICES),
        'bills': len(BILLS),
    })


def api_overview(request):
    kpis = _balances()
    return JsonResponse({
        'kpis': {k: str(v) for k, v in kpis.items()},
        'invoice_count': len(INVOICES),
        'bill_count': len(BILLS),
        'journal_entry_count': len(JOURNAL_ENTRIES),
    })
