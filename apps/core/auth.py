from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend
from django.contrib.auth.models import AnonymousUser

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


class InMemoryUser:
    """
    A lightweight user object that mimics Django's User model
    for demo purposes without requiring database access.
    Designed to be serializable for session cookies.
    """
    def __init__(self, username, email, first_name, last_name, user_id=None):
        self.username = username
        self.email = email
        self.first_name = first_name
        self.last_name = last_name
        self.id = user_id or hash(username) % 10000  # Use username hash as ID
        self.pk = self.id
        self.is_active = True
        self.is_staff = False
        self.is_superuser = False
        self.backend = 'apps.core.auth.DemoAuthenticationBackend'
        self.is_authenticated = True

    def get_full_name(self):
        return f"{self.first_name} {self.last_name}".strip()

    def __str__(self):
        return self.username

    def __repr__(self):
        return f"<InMemoryUser: {self.username}>"


class DemoAuthenticationBackend(ModelBackend):
    """
    Custom authentication backend that allows demo accounts to log in
    without requiring database access.
    """

    def authenticate(self, request, username=None, password=None, **kwargs):
        # Check if this is a demo account
        if username in DEMO_ACCOUNTS:
            demo_config = DEMO_ACCOUNTS[username]

            # Verify password matches
            if password == demo_config['password']:
                # Create an in-memory user object (no database required)
                user = InMemoryUser(
                    username=username,
                    email=demo_config['email'],
                    first_name=demo_config['first_name'],
                    last_name=demo_config['last_name'],
                )
                return user

        # Fall back to default authentication for non-demo accounts
        try:
            return super().authenticate(request, username=username, password=password, **kwargs)
        except:
            # If database is not available, return None
            return None

    def get_user(self, user_id):
        # For demo users stored in sessions, we return them as-is
        # The session should already contain the user object
        try:
            return User.objects.get(pk=user_id)
        except:
            return None
