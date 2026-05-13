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

# Collect static files
RUN python manage.py collectstatic --noinput

# Run migrations and load demo data on startup
RUN echo '#!/bin/bash\nset -e\npython manage.py migrate\nif [ "$LOAD_DEMO_DATA" = "True" ]; then\n  python manage.py load_demo_data\nfi\ngunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 4' > /app/entrypoint.sh && chmod +x /app/entrypoint.sh

EXPOSE 8000

CMD ["/app/entrypoint.sh"]
