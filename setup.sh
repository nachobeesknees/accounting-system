#!/bin/bash
set -e

echo "🚀 Setting up Accounting System development environment..."

# Create virtual environment
if [ ! -d ".venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv .venv
fi

# Activate virtual environment
echo "✅ Activating virtual environment..."
source .venv/bin/activate

# Install dependencies
echo "📚 Installing dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

# Copy .env if doesn't exist
if [ ! -f ".env" ]; then
    echo "🔐 Creating .env file from template..."
    cp .env.example .env
    echo "⚠️  Remember to fill in .env with your actual values!"
fi

# Start database
echo "🗄️  Starting PostgreSQL and Redis..."
docker compose up -d

# Wait for database
echo "⏳ Waiting for database to be ready..."
sleep 5

# Run migrations
echo "🔄 Running migrations..."
python manage.py migrate

echo ""
echo "✨ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Update .env with your configuration"
echo "2. Create a superuser: python manage.py createsuperuser"
echo "3. Run the server: python manage.py runserver"
echo ""
echo "Or use: make run"
