#!/bin/bash
set -e

echo "Installing dependencies..."
pip install -r requirements.txt

echo "Running migrations..."
python manage.py migrate --noinput

echo "Setting up demo accounts..."
python manage.py setup_demo || echo "Demo accounts already exist or setup failed (continuing anyway)"

echo "Collecting static files..."
python manage.py collectstatic --noinput

echo "Build complete!"
