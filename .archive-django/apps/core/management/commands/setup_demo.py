from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.utils.text import slugify

User = get_user_model()


class Command(BaseCommand):
    help = 'Set up demo accounts for the application'

    def handle(self, *args, **options):
        demo_accounts = [
            {
                'email': 'demo@example.com',
                'username': 'demo',
                'first_name': 'Demo',
                'last_name': 'User',
                'is_staff': True,
                'is_superuser': True,
                'password': 'demo123',
            },
        ]

        for account in demo_accounts:
            email = account['email']
            username = account['username']

            # Check if user already exists
            if User.objects.filter(email=email).exists():
                self.stdout.write(
                    self.style.WARNING(f'Demo user {email} already exists, skipping...')
                )
                continue

            # Create user
            user = User.objects.create_user(
                username=username,
                email=email,
                password=account['password'],
                first_name=account['first_name'],
                last_name=account['last_name'],
                is_staff=account.get('is_staff', False),
                is_superuser=account.get('is_superuser', False),
            )

            self.stdout.write(
                self.style.SUCCESS(
                    f'✓ Created demo user: {email} (password: {account["password"]})'
                )
            )

        self.stdout.write(
            self.style.SUCCESS('\n✓ Demo accounts setup complete!')
        )
