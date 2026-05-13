from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend

User = get_user_model()

DEMO_ACCOUNTS = {
    'demo_admin': {
        'password': 'demo123',
        'email': 'demo_admin@example.com',
        'first_name': 'Demo',
        'last_name': 'Admin',
    },
    'demo_accountant': {
        'password': 'demo123',
        'email': 'demo_accountant@example.com',
        'first_name': 'Demo',
        'last_name': 'Accountant',
    },
    'demo_cfo': {
        'password': 'demo123',
        'email': 'demo_cfo@example.com',
        'first_name': 'Demo',
        'last_name': 'CFO',
    },
    'demo_controller': {
        'password': 'demo123',
        'email': 'demo_controller@example.com',
        'first_name': 'Demo',
        'last_name': 'Controller',
    },
}


class DemoAuthenticationBackend(ModelBackend):
    """
    Custom authentication backend that allows demo accounts to log in without
    requiring pre-existing database records. Creates users on first authentication.
    """

    def authenticate(self, request, username=None, password=None, **kwargs):
        # Check if this is a demo account
        if username in DEMO_ACCOUNTS:
            demo_config = DEMO_ACCOUNTS[username]

            # Verify password matches
            if password != demo_config['password']:
                return None

            # Try to get or create the user
            user, created = User.objects.get_or_create(
                username=username,
                defaults={
                    'email': demo_config['email'],
                    'first_name': demo_config['first_name'],
                    'last_name': demo_config['last_name'],
                }
            )

            # Set password if user was just created (or update it anyway)
            if password != demo_config['password']:  # Verify again for safety
                return None

            user.set_password(password)
            user.save()

            return user

        # Fall back to default authentication
        return super().authenticate(request, username=username, password=password, **kwargs)

    def get_user(self, user_id):
        try:
            return User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return None
