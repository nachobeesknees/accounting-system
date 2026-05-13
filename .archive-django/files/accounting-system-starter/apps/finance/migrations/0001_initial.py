# Generated migration for finance app initial models
# DO NOT APPLY YET - Review for correctness and db-level constraints

from django.db import migrations, models
import django.db.models.deletion
import uuid
from decimal import Decimal


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('core', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='Period',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('period_type', models.CharField(choices=[('month', 'Monthly'), ('quarter', 'Quarterly'), ('year', 'Annual'), ('stub', 'Stub Period')], help_text='Month, Quarter, Year, or Stub', max_length=10)),
                ('start_date', models.DateField()),
                ('end_date', models.DateField()),
                ('status', models.CharField(choices=[('open', 'Open'), ('closed', 'Closed'), ('locked', 'Locked')], default='open', help_text='Open (posting allowed), Closed (requires reopen), Locked (permanent)', max_length=10)),
                ('closed_at', models.DateTimeField(blank=True, null=True)),
                ('locked_at', models.DateTimeField(blank=True, null=True)),
                ('closed_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='periods_closed', to='core.user')),
                ('entity', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='periods', to='core.entity')),
                ('locked_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='periods_locked', to='core.user')),
            ],
            options={
                'verbose_name': 'Period',
                'verbose_name_plural': 'Periods',
                'db_table': 'periods',
                'ordering': ['entity', 'start_date'],
            },
        ),
        migrations.CreateModel(
            name='FXRate',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('from_currency', models.CharField(help_text='ISO 4217 source currency', max_length=3)),
                ('to_currency', models.CharField(help_text='ISO 4217 target currency', max_length=3)),
                ('rate', models.DecimalField(decimal_places=8, help_text="How many 'to' per 1 'from'", max_digits=18)),
                ('effective_date', models.DateField(help_text='Date this rate became effective')),
                ('source', models.CharField(choices=[('manual', 'Manual'), ('xe', 'XE.com'), ('oanda', 'OANDA'), ('fed_h10', 'Federal Reserve H.10')], help_text='Source of the rate (manual or API)', max_length=20)),
                ('rate_type', models.CharField(choices=[('spot', 'Spot'), ('average', 'Average'), ('closing', 'Closing')], default='spot', help_text='Spot (transaction-date), Average (period), or Closing (period-end)', max_length=10)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('created_by', models.ForeignKey(editable=False, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='fx_rates_created', to='core.user')),
            ],
            options={
                'verbose_name': 'FX Rate',
                'verbose_name_plural': 'FX Rates',
                'db_table': 'fx_rates',
                'ordering': ['-effective_date', 'from_currency', 'to_currency'],
            },
        ),
        migrations.CreateModel(
            name='Account',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('code', models.CharField(help_text="Account number (e.g., '1010')", max_length=20)),
                ('name', models.CharField(help_text='Account name', max_length=255)),
                ('account_type', models.CharField(choices=[('asset', 'Asset'), ('liability', 'Liability'), ('equity', 'Equity'), ('revenue', 'Revenue'), ('expense', 'Expense')], help_text='Asset, Liability, Equity, Revenue, or Expense', max_length=20)),
                ('account_subtype', models.CharField(blank=True, choices=[('current_asset', 'Current Asset'), ('noncurrent_asset', 'Non-Current Asset'), ('current_liability', 'Current Liability'), ('noncurrent_liability', 'Non-Current Liability'), ('retained_earnings', 'Retained Earnings'), ('operating_revenue', 'Operating Revenue'), ('other_revenue', 'Other Revenue'), ('operating_expense', 'Operating Expense'), ('other_expense', 'Other Expense'), ('tax_expense', 'Tax Expense')], help_text='Refines account classification', max_length=30, null=True)),
                ('normal_balance', models.CharField(choices=[('debit', 'Debit'), ('credit', 'Credit')], help_text='Debit or Credit increases the account', max_length=10)),
                ('is_postable', models.BooleanField(default=True, help_text='Leaf accounts postable; parents typically not')),
                ('is_active', models.BooleanField(default=True, help_text='Inactive accounts cannot be posted to')),
                ('currency_restriction', models.CharField(blank=True, help_text='If set, only this ISO 4217 currency posts; null = any currency', max_length=3, null=True)),
                ('description', models.TextField(blank=True, help_text='Extended account description')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('deleted_at', models.DateTimeField(blank=True, null=True)),
                ('created_by', models.ForeignKey(editable=False, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='accounts_created', to='core.user')),
                ('entity', models.ForeignKey(help_text='Entity this account belongs to', on_delete=django.db.models.deletion.PROTECT, related_name='accounts', to='core.entity')),
                ('parent', models.ForeignKey(blank=True, help_text='Parent account for hierarchy (null = top-level)', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='children', to='finance.account')),
                ('updated_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='accounts_updated', to='core.user')),
            ],
            options={
                'verbose_name': 'Account',
                'verbose_name_plural': 'Accounts',
                'db_table': 'accounts',
                'ordering': ['entity', 'code'],
            },
        ),
        migrations.CreateModel(
            name='JournalEntry',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('entry_number', models.CharField(help_text='Server-generated, sequential per entity', max_length=20)),
                ('entry_date', models.DateField(help_text='Accounting date for the transaction')),
                ('description', models.TextField(help_text='Transaction description')),
                ('reference', models.CharField(blank=True, help_text='External reference (invoice #, check #, etc.)', max_length=255)),
                ('transaction_currency', models.CharField(help_text='ISO 4217 currency the entry is denominated in', max_length=3)),
                ('status', models.CharField(choices=[('draft', 'Draft'), ('posted', 'Posted'), ('reversed', 'Reversed')], default='draft', help_text='Draft (mutable), Posted (immutable), Reversed (cancelled via reversal entry)', max_length=10)),
                ('source', models.CharField(choices=[('manual', 'Manual'), ('ap', 'Accounts Payable'), ('ar', 'Accounts Receivable'), ('bank_recon', 'Bank Reconciliation'), ('system', 'System'), ('import', 'Import'), ('consolidation', 'Consolidation')], default='manual', max_length=20)),
                ('intercompany_pair_id', models.UUIDField(blank=True, help_text='If intercompany, unique ID linking to matching entry in counterparty', null=True)),
                ('posted_at', models.DateTimeField(blank=True, help_text='Timestamp when entry was posted; null if still draft', null=True)),
                ('same_user_override', models.BooleanField(default=False, help_text='If True, created_by == posted_by; override for SoD enforcement')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('deleted_at', models.DateTimeField(blank=True, null=True)),
                ('created_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='journal_entries_created', to='core.user')),
                ('entity', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='journal_entries', to='core.entity')),
                ('period', models.ForeignKey(blank=True, help_text='Derived from entry_date + entity; stored for indexing', null=True, on_delete=django.db.models.deletion.PROTECT, to='finance.period')),
                ('posted_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='journal_entries_posted', to='core.user')),
                ('reverses_entry', models.ForeignKey(blank=True, help_text='If this reverses another entry, reference to the original', null=True, on_delete=django.db.models.deletion.PROTECT, related_name='reversed_by_entries', to='finance.journalentry')),
                ('reversed_by_entry', models.ForeignKey(blank=True, help_text='If reversed by another entry, reference to the reversal', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='reverses', to='finance.journalentry')),
                ('updated_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='journal_entries_updated', to='core.user')),
            ],
            options={
                'verbose_name': 'Journal Entry',
                'verbose_name_plural': 'Journal Entries',
                'db_table': 'journal_entries',
                'ordering': ['-entry_date', '-created_at'],
            },
        ),
        migrations.CreateModel(
            name='JournalLine',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('line_number', models.PositiveIntegerField(help_text='Sequence within entry')),
                ('debit', models.DecimalField(decimal_places=4, default=Decimal('0.0000'), help_text='Debit amount in transaction currency', max_digits=20)),
                ('credit', models.DecimalField(decimal_places=4, default=Decimal('0.0000'), help_text='Credit amount in transaction currency', max_digits=20)),
                ('currency', models.CharField(help_text='ISO 4217 currency of this line (usually = transaction_currency)', max_length=3)),
                ('functional_amount', models.DecimalField(decimal_places=4, default=Decimal('0.0000'), help_text="Translated to entity's functional currency at entry date FX rate (signed)", max_digits=20)),
                ('description', models.TextField(blank=True)),
                ('dimension_values', models.JSONField(blank=True, default=dict, help_text='{department: uuid, class: uuid, location: uuid, project: uuid}')),
                ('account', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='journal_lines', to='finance.account')),
                ('journal_entry', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='lines', to='finance.journalentry')),
            ],
            options={
                'verbose_name': 'Journal Line',
                'verbose_name_plural': 'Journal Lines',
                'db_table': 'journal_lines',
                'ordering': ['journal_entry', 'line_number'],
                'unique_together': {('journal_entry', 'line_number')},
            },
        ),
        migrations.CreateModel(
            name='GeneralLedger',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('debit_transaction', models.DecimalField(decimal_places=4, default=Decimal('0.0000'), help_text='Total debits in transaction currency (if applicable)', max_digits=20)),
                ('credit_transaction', models.DecimalField(decimal_places=4, default=Decimal('0.0000'), help_text='Total credits in transaction currency (if applicable)', max_digits=20)),
                ('debit_functional', models.DecimalField(decimal_places=4, default=Decimal('0.0000'), help_text='Total debits in functional currency', max_digits=20)),
                ('credit_functional', models.DecimalField(decimal_places=4, default=Decimal('0.0000'), help_text='Total credits in functional currency', max_digits=20)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('account', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='general_ledgers', to='finance.account')),
                ('entity', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='general_ledgers', to='core.entity')),
                ('period', models.ForeignKey(blank=True, help_text='Period for which this GL balance applies', null=True, on_delete=django.db.models.deletion.PROTECT, to='finance.period')),
            ],
            options={
                'verbose_name': 'General Ledger',
                'verbose_name_plural': 'General Ledgers',
                'db_table': 'general_ledgers',
            },
        ),
        migrations.CreateModel(
            name='AuditLog',
            fields=[
                ('id', models.BigAutoField(primary_key=True, serialize=False)),
                ('occurred_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('action', models.CharField(choices=[('insert', 'Insert'), ('update', 'Update'), ('delete', 'Delete')], max_length=10)),
                ('table_name', models.CharField(db_index=True, max_length=50)),
                ('record_id', models.UUIDField(db_index=True)),
                ('before_state', models.JSONField(help_text='State before change (null for inserts)', null=True)),
                ('after_state', models.JSONField(help_text='State after change (null for deletes)', null=True)),
                ('reason', models.TextField(blank=True, help_text='Optional explanation for the change (e.g., SoD override)')),
                ('actor', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='audit_log_entries', to='core.user')),
            ],
            options={
                'verbose_name': 'Audit Log Entry',
                'verbose_name_plural': 'Audit Log Entries',
                'db_table': 'audit_log',
                'ordering': ['-occurred_at'],
                'permissions': [('view_audit_log', 'Can view audit log')],
            },
        ),
        migrations.AddIndex(
            model_name='period',
            index=models.Index(fields=['entity', 'status'], name='periods_entity_status_idx'),
        ),
        migrations.AddIndex(
            model_name='period',
            index=models.Index(fields=['entity', 'start_date', 'end_date'], name='periods_entity_dates_idx'),
        ),
        migrations.AddIndex(
            model_name='fxrate',
            index=models.Index(fields=['from_currency', 'to_currency', 'effective_date'], name='fx_rates_curr_date_idx'),
        ),
        migrations.AddIndex(
            model_name='fxrate',
            index=models.Index(fields=['effective_date'], name='fx_rates_effective_date_idx'),
        ),
        migrations.AddIndex(
            model_name='account',
            index=models.Index(fields=['entity', 'is_postable', 'is_active'], name='accounts_entity_postable_idx'),
        ),
        migrations.AddIndex(
            model_name='account',
            index=models.Index(fields=['entity', 'account_type'], name='accounts_entity_type_idx'),
        ),
        migrations.AddIndex(
            model_name='account',
            index=models.Index(fields=['parent'], name='accounts_parent_idx'),
        ),
        migrations.AddIndex(
            model_name='journalentry',
            index=models.Index(fields=['entity', 'entry_date'], name='journal_entries_entity_date_idx'),
        ),
        migrations.AddIndex(
            model_name='journalentry',
            index=models.Index(fields=['entity', 'status'], name='journal_entries_entity_status_idx'),
        ),
        migrations.AddIndex(
            model_name='journalentry',
            index=models.Index(fields=['period', 'status'], name='journal_entries_period_status_idx'),
        ),
        migrations.AddIndex(
            model_name='journalentry',
            index=models.Index(fields=['intercompany_pair_id'], name='journal_entries_intercompany_idx'),
        ),
        migrations.AddIndex(
            model_name='journalline',
            index=models.Index(fields=['journal_entry'], name='journal_lines_entry_idx'),
        ),
        migrations.AddIndex(
            model_name='journalline',
            index=models.Index(fields=['account', 'journal_entry'], name='journal_lines_account_entry_idx'),
        ),
        migrations.AddIndex(
            model_name='generalleger',
            index=models.Index(fields=['entity', 'period'], name='gl_entity_period_idx'),
        ),
        migrations.AddIndex(
            model_name='generalleger',
            index=models.Index(fields=['account', 'period'], name='gl_account_period_idx'),
        ),
        migrations.AddIndex(
            model_name='auditlog',
            index=models.Index(fields=['table_name', 'record_id', 'occurred_at'], name='audit_log_table_record_date_idx'),
        ),
        migrations.AddIndex(
            model_name='auditlog',
            index=models.Index(fields=['actor', 'occurred_at'], name='audit_log_actor_date_idx'),
        ),
        migrations.AddConstraint(
            model_name='period',
            constraint=models.UniqueConstraint(fields=['entity', 'start_date', 'end_date'], name='unique_period_per_entity'),
        ),
        migrations.AddConstraint(
            model_name='fxrate',
            constraint=models.UniqueConstraint(fields=['from_currency', 'to_currency', 'effective_date', 'rate_type'], name='unique_fx_rate'),
        ),
        migrations.AddConstraint(
            model_name='account',
            constraint=models.UniqueConstraint(fields=['entity', 'code'], name='unique_account_code_per_entity'),
        ),
        migrations.AddConstraint(
            model_name='journalentry',
            constraint=models.UniqueConstraint(fields=['entity', 'entry_number'], name='unique_entry_number_per_entity'),
        ),
        migrations.AddConstraint(
            model_name='journalline',
            constraint=models.CheckConstraint(check=models.Q(('debit__gt', Decimal('0'))), models.Q(('credit__gt', Decimal('0'))), _connector='OR'), name='journal_line_must_have_debit_or_credit'),
        ),
        migrations.AddConstraint(
            model_name='generalleger',
            constraint=models.UniqueConstraint(fields=['entity', 'account', 'period'], name='unique_gl_per_entity_account_period'),
        ),
    ]
