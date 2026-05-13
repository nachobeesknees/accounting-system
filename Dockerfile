FROM python:3.12-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY . .

# Create entrypoint script with error handling
RUN cat > /app/entrypoint.sh << 'EOF'
#!/bin/bash
set -e

PORT=${PORT:-8000}

echo "Starting Django app..."
echo "DEBUG: $DEBUG"
echo "ALLOWED_HOSTS: $ALLOWED_HOSTS"

echo "Running migrations..."
python manage.py migrate --noinput 2>&1 || {
  echo "WARNING: Migration failed, continuing anyway..."
}

echo "Starting gunicorn..."
gunicorn config.wsgi:application --bind 0.0.0.0:$PORT --workers 4 --timeout 120 --access-logfile - --error-logfile -
EOF
RUN chmod +x /app/entrypoint.sh

EXPOSE 8000

CMD ["/app/entrypoint.sh"]
