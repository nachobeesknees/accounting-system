# Generated migration for core app initial models
# DO NOT APPLY YET - Review for correctness and db-level constraints

from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    initial = True

    dependencies = [
    ]

    operations = [
        migrations.CreateModel(
            name='Entity',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('legal_name', models.CharField(help_text='Legal entity name on corporate records', max_length=255)),
                ('dba_name', models.CharField(blank=True, help_text='Doing Business As name, if different from legal_name', max_length=255, null=True)),
                ('tax_id', models.CharField(blank=True, help_text='Encrypted at rest. Format varies by jurisdiction (EIN, RUT, VAT #, etc.)', max_length=255, null=True)),
                ('entity_type', models.CharField(choices=[('opco', 'Operating Company'), ('holdco', 'Holding Company'), ('mgmt_co', 'Management Company'), ('investment', 'Investment Entity'), ('other', 'Other')], default='opco', help_text='Legal structure and consolidation treatment', max_length=20)),
                ('jurisdiction_country', models.CharField(help_text='ISO 3166-1 country code. Determines which localization module applies.', max_length=2)),
                ('jurisdiction_state', models.CharField(blank=True, help_text='US state abbreviation or equivalent for state-level jurisdictions', max_length=2, null=True)),
                ('fiscal_year_end_month', models.SmallIntegerField(help_text='Month (1-12) of fiscal year-end')),
                ('fiscal_year_end_day', models.SmallIntegerField(help_text='Day (1-31) of fiscal year-end')),
                ('functional_currency', models.CharField(help_text='ISO 4217 currency code. Entity\'s reporting currency before consolidation.', max_length=3)),
                ('accounting_basis', models.CharField(choices=[('cash', 'Cash'), ('modified_cash', 'Modified Cash'), ('accrual', 'Accrual')], default='modified_cash', help_text='Basis of accounting per CLAUDE.md: mixed basis allowed across entities', max_length=20)),
                ('basis_features', models.JSONField(blank=True, default=dict, help_text='Accounting basis features: {tracks_deferred_revenue: bool, ...}')),
                ('local_attributes', models.JSONField(blank=True, default=dict, help_text='Validated by active localization module for jurisdiction_country')),
                ('active', models.BooleanField(default=True, help_text='Whether entity is currently active')),
                ('inception_date', models.DateField(help_text='Date entity was formed/acquired')),
                ('dissolution_date', models.DateField(blank=True, help_text='Date entity was dissolved/divested, if applicable', null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('deleted_at', models.DateTimeField(blank=True, help_text='Soft delete timestamp; null = not deleted', null=True)),
                ('created_by', models.ForeignKey(editable=False, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='entities_created', to='core.user')),
                ('updated_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='entities_updated', to='core.user')),
            ],
            options={
                'verbose_name': 'Entity',
                'verbose_name_plural': 'Entities',
                'db_table': 'entities',
                'ordering': ['legal_name'],
            },
        ),
        migrations.CreateModel(
            name='User',
            fields=[
                ('password', models.CharField(max_length=128, verbose_name='password')),
                ('last_login', models.DateTimeField(blank=True, null=True, verbose_name='last login')),
                ('is_staff', models.BooleanField(default=False, help_text='Designates whether the user can log into this admin site.', verbose_name='staff status')),
                ('is_active', models.BooleanField(default=True, help_text='Designates whether this user should be treated as active. Unselect this instead of deleting accounts.', verbose_name='active')),
                ('username', models.CharField(error_messages={'unique': 'A user with that username already exists.'}, help_text='Required. 150 characters or fewer. Letters, digits and @/./+/-/_ only.', max_length=150, unique=True, verbose_name='username')),
                ('first_name', models.CharField(blank=True, max_length=150, verbose_name='first name')),
                ('last_name', models.CharField(blank=True, max_length=150, verbose_name='last name')),
                ('email', models.EmailField(blank=True, max_length=254, verbose_name='email address')),
                ('is_superuser', models.BooleanField(default=False, help_text='Designates that this user has all permissions without explicitly assigning them.', verbose_name='superuser status')),
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('profile_picture_url', models.URLField(blank=True, help_text="User's profile picture (from SSO or uploaded)")),
                ('phone_number', models.CharField(blank=True, help_text='Contact phone number', max_length=20)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('deleted_at', models.DateTimeField(blank=True, help_text='Soft delete timestamp', null=True)),
                ('groups', models.ManyToManyField(blank=True, help_text='The groups this user belongs to. A user will get all permissions granted to each of their groups.', related_name='user_set', related_query_name='user', to='auth.group', verbose_name='groups')),
                ('user_permissions', models.ManyToManyField(blank=True, help_text='Specific permissions for this user.', related_name='user_set', related_query_name='user', to='auth.permission', verbose_name='user permissions')),
            ],
            options={
                'verbose_name': 'User',
                'verbose_name_plural': 'Users',
                'db_table': 'users',
                'ordering': ['last_name', 'first_name'],
            },
        ),
        migrations.CreateModel(
            name='UserEntityPermission',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('role', models.CharField(choices=[('admin', 'Administrator'), ('controller', 'Controller'), ('bookkeeper', 'Bookkeeper'), ('approver', 'Approver'), ('read_only', 'Read-Only')], help_text='Role for this user in this entity', max_length=20)),
                ('effective_from', models.DateField(help_text='Date this permission became effective')),
                ('effective_to', models.DateField(blank=True, help_text='Date permission ended; null = currently active', null=True)),
                ('can_approve_own_entries', models.BooleanField(default=False, help_text='Override: user can approve their own entries (audit-logged)')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('deleted_at', models.DateTimeField(blank=True, null=True)),
                ('created_by', models.ForeignKey(editable=False, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='permission_assignments_created', to='core.user')),
                ('entity', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='user_permissions', to='core.entity')),
                ('updated_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='permission_assignments_updated', to='core.user')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='entity_permissions', to='core.user')),
            ],
            options={
                'verbose_name': 'User Entity Permission',
                'verbose_name_plural': 'User Entity Permissions',
                'db_table': 'user_entity_permissions',
            },
        ),
        migrations.CreateModel(
            name='EntityOwnership',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('ownership_percent', models.DecimalField(decimal_places=6, help_text='Ownership percentage (0-100) with precision for complex structures', max_digits=9)),
                ('effective_from', models.DateField(help_text='Date this ownership relationship became effective')),
                ('effective_to', models.DateField(blank=True, help_text='Date ownership ended; null = currently active', null=True)),
                ('notes', models.TextField(blank=True, help_text='Context for the ownership (acquisition date, restructuring notes, etc.)')),
                ('child_entity', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='parent_ownerships', to='core.entity')),
                ('parent_entity', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='child_ownerships', to='core.entity')),
            ],
            options={
                'verbose_name': 'Entity Ownership',
                'verbose_name_plural': 'Entity Ownerships',
                'db_table': 'entity_ownership',
            },
        ),
        migrations.AddIndex(
            model_name='user',
            index=models.Index(fields=['email'], name='users_email_idx'),
        ),
        migrations.AddIndex(
            model_name='user',
            index=models.Index(fields=['deleted_at'], name='users_deleted_at_idx'),
        ),
        migrations.AddIndex(
            model_name='entityownership',
            index=models.Index(fields=['parent_entity', 'effective_from', 'effective_to'], name='entity_ownership_parent_idx'),
        ),
        migrations.AddIndex(
            model_name='entityownership',
            index=models.Index(fields=['child_entity', 'effective_from', 'effective_to'], name='entity_ownership_child_idx'),
        ),
        migrations.AddIndex(
            model_name='entity',
            index=models.Index(fields=['jurisdiction_country'], name='entities_country_idx'),
        ),
        migrations.AddIndex(
            model_name='entity',
            index=models.Index(fields=['active', 'deleted_at'], name='entities_active_deleted_idx'),
        ),
        migrations.AddConstraint(
            model_name='userentitypermission',
            constraint=models.UniqueConstraint(fields=['user', 'entity', 'effective_from'], name='unique_user_entity_permission_per_period'),
        ),
        migrations.AddIndex(
            model_name='userentitypermission',
            index=models.Index(fields=['user', 'effective_from', 'effective_to'], name='user_entity_permission_user_idx'),
        ),
        migrations.AddIndex(
            model_name='userentitypermission',
            index=models.Index(fields=['entity', 'effective_from', 'effective_to'], name='user_entity_permission_entity_idx'),
        ),
        migrations.AddConstraint(
            model_name='entityownership',
            constraint=models.UniqueConstraint(fields=['parent_entity', 'child_entity', 'effective_from'], name='unique_ownership_per_period'),
        ),
    ]
