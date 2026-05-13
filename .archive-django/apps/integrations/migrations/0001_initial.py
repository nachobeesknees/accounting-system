# Generated migration for bank integration models

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='BankAccount',
            fields=[
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('deleted_at', models.DateTimeField(blank=True, db_index=True, null=True)),
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('entity_id', models.UUIDField()),
                ('account_name', models.CharField(max_length=255)),
                ('institution', models.CharField(choices=[('chase', 'Chase'), ('bofa', 'Bank of America'), ('wellsfargo', 'Wells Fargo'), ('citibank', 'Citibank'), ('amex', 'American Express'), ('ramp', 'Ramp'), ('other', 'Other')], max_length=50)),
                ('account_number', models.CharField(max_length=100)),
                ('functional_currency', models.CharField(max_length=3)),
                ('plaid_access_token', models.CharField(blank=True, help_text='Encrypted Plaid access token for this item', max_length=255, null=True)),
                ('plaid_item_id', models.CharField(blank=True, help_text='Plaid item ID for account monitoring', max_length=255, null=True)),
                ('gl_account_id', models.UUIDField(blank=True, help_text='GL account for bank reconciliation adjustments', null=True)),
                ('last_statement_date', models.DateField(blank=True, null=True)),
                ('last_statement_balance', models.DecimalField(decimal_places=4, default=0, help_text='Balance per last statement', max_digits=20)),
                ('last_reconciliation_date', models.DateField(blank=True, null=True)),
                ('status', models.CharField(choices=[('active', 'Active'), ('inactive', 'Inactive'), ('archived', 'Archived')], default='active', max_length=20)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='%(class)s_created', to=settings.AUTH_USER_MODEL)),
                ('updated_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='%(class)s_updated', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'bank_accounts',
            },
        ),
        migrations.CreateModel(
            name='BankTransaction',
            fields=[
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('deleted_at', models.DateTimeField(blank=True, db_index=True, null=True)),
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('transaction_date', models.DateField()),
                ('posted_date', models.DateField(blank=True, null=True)),
                ('amount', models.DecimalField(decimal_places=4, help_text='Transaction amount in account currency (signed: negative for withdrawals)', max_digits=20)),
                ('description', models.TextField()),
                ('plaid_transaction_id', models.CharField(blank=True, help_text='Unique ID from Plaid for deduplication', max_length=255, null=True, unique=True)),
                ('external_reference', models.CharField(blank=True, help_text='Check number, invoice number, or other reference', max_length=255, null=True)),
                ('merchant_name', models.CharField(blank=True, max_length=255, null=True)),
                ('category', models.CharField(blank=True, max_length=100, null=True)),
                ('matched_journal_entry_id', models.UUIDField(blank=True, null=True)),
                ('matched_journal_line_id', models.UUIDField(blank=True, null=True)),
                ('status', models.CharField(choices=[('unmatched', 'Unmatched'), ('matched', 'Matched'), ('duplicate', 'Duplicate'), ('ignored', 'Ignored')], default='unmatched', max_length=20)),
                ('bank_account', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='transactions', to='integrations.bankaccount')),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='%(class)s_created', to=settings.AUTH_USER_MODEL)),
                ('updated_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='%(class)s_updated', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'bank_transactions',
            },
        ),
        migrations.CreateModel(
            name='BankReconciliation',
            fields=[
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('deleted_at', models.DateTimeField(blank=True, db_index=True, null=True)),
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('as_of_date', models.DateField()),
                ('beginning_balance_per_books', models.DecimalField(decimal_places=4, default=0, help_text='Opening balance (from last recon or inception)', max_digits=20)),
                ('statement_balance', models.DecimalField(decimal_places=4, default=0, help_text='Ending balance per statement', max_digits=20)),
                ('book_balance', models.DecimalField(decimal_places=4, default=0, help_text='Calculated balance per books (transactions through as_of_date)', max_digits=20)),
                ('variance', models.DecimalField(decimal_places=4, default=0, help_text='statement_balance - book_balance', max_digits=20)),
                ('matched_count', models.IntegerField(default=0)),
                ('unmatched_count', models.IntegerField(default=0)),
                ('outstanding_items_count', models.IntegerField(default=0)),
                ('status', models.CharField(choices=[('incomplete', 'Incomplete'), ('in_progress', 'In Progress'), ('complete', 'Complete'), ('approved', 'Approved')], default='incomplete', max_length=20)),
                ('approved_at', models.DateTimeField(blank=True, null=True)),
                ('approved_by', models.UUIDField(blank=True, null=True)),
                ('bank_account', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='reconciliations', to='integrations.bankaccount')),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='%(class)s_created', to=settings.AUTH_USER_MODEL)),
                ('updated_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='%(class)s_updated', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'bank_reconciliations',
            },
        ),
        migrations.CreateModel(
            name='BankReconciliationLine',
            fields=[
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('deleted_at', models.DateTimeField(blank=True, db_index=True, null=True)),
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('line_type', models.CharField(choices=[('matched', 'Matched'), ('outstanding', 'Outstanding'), ('unmatched', 'Unmatched')], max_length=20)),
                ('journal_entry_id', models.UUIDField(blank=True, null=True)),
                ('journal_line_id', models.UUIDField(blank=True, null=True)),
                ('amount', models.DecimalField(decimal_places=4, max_digits=20)),
                ('description', models.TextField()),
                ('transaction_date', models.DateField()),
                ('bank_transaction', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='recon_lines', to='integrations.banktransaction')),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='%(class)s_created', to=settings.AUTH_USER_MODEL)),
                ('reconciliation', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='lines', to='integrations.bankreconciliation')),
                ('updated_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='%(class)s_updated', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'bank_reconciliation_lines',
            },
        ),
        migrations.AddIndex(
            model_name='bankreconciliationline',
            index=models.Index(fields=['reconciliation_id'], name='bank_reconc_reconc_idx'),
        ),
        migrations.AddIndex(
            model_name='bankreconciliationline',
            index=models.Index(fields=['line_type'], name='bank_reconc_line_ty_idx'),
        ),
        migrations.AddIndex(
            model_name='bankreconciliationline',
            index=models.Index(fields=['journal_entry_id'], name='bank_reconc_journal_idx'),
        ),
        migrations.AddIndex(
            model_name='bankreconciliation',
            index=models.Index(fields=['bank_account_id'], name='bank_reconc_bank_ac_idx'),
        ),
        migrations.AddIndex(
            model_name='bankreconciliation',
            index=models.Index(fields=['as_of_date'], name='bank_reconc_as_of__idx'),
        ),
        migrations.AddIndex(
            model_name='bankreconciliation',
            index=models.Index(fields=['status'], name='bank_reconc_status_idx'),
        ),
        migrations.AddConstraint(
            model_name='bankreconciliation',
            constraint=models.UniqueConstraint(fields=['bank_account_id', 'as_of_date'], name='unique_bank_account_period'),
        ),
        migrations.AddIndex(
            model_name='banktransaction',
            index=models.Index(fields=['bank_account_id'], name='bank_transa_bank_ac_idx'),
        ),
        migrations.AddIndex(
            model_name='banktransaction',
            index=models.Index(fields=['transaction_date'], name='bank_transa_transac_idx'),
        ),
        migrations.AddIndex(
            model_name='banktransaction',
            index=models.Index(fields=['status'], name='bank_transa_status_idx'),
        ),
        migrations.AddIndex(
            model_name='banktransaction',
            index=models.Index(fields=['plaid_transaction_id'], name='bank_transa_plaid__idx'),
        ),
        migrations.AddIndex(
            model_name='banktransaction',
            index=models.Index(fields=['matched_journal_entry_id'], name='bank_transa_matched_idx'),
        ),
        migrations.AddIndex(
            model_name='bankaccount',
            index=models.Index(fields=['entity_id'], name='bank_accoun_entity__idx'),
        ),
        migrations.AddIndex(
            model_name='bankaccount',
            index=models.Index(fields=['plaid_item_id'], name='bank_accoun_plaid__idx'),
        ),
        migrations.AddIndex(
            model_name='bankaccount',
            index=models.Index(fields=['institution'], name='bank_accoun_institu_idx'),
        ),
        migrations.AddConstraint(
            model_name='bankaccount',
            constraint=models.UniqueConstraint(fields=['entity_id', 'account_number'], name='unique_entity_account_number'),
        ),
    ]
