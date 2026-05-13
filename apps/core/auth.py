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
    requiring them to exist in the database. Automatically creates them on first login.
    """

    def authenticate(self, request, username=None, password=None, **kwargs):
        # Check if this is a demo account
        if username in DEMO_ACCOUNTS:
            demo_config = DEMO_ACCOUNTS[username]

            # Verify password matches
            if password != demo_config['password']:
                return None

            # Try to get or create the user
            try:
                user = User.objects.get(username=username)
            except User.DoesNotExist:
                # Create the user if it doesn't exist
                user = User.objects.create_user(
                    username=username,
                    email=demo_config['email'],
                    password=password,
                    first_name=demo_config['first_name'],
                    last_name=demo_config['last_name'],
                )

            return user

        # Fall back to default authentication
        return super().authenticate(request, username=username, password=password, **kwargs)

    def get_user(self, user_id):
        try:
            return User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return None
