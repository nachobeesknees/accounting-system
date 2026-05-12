.PHONY: help install migrate run test lint format clean

help:
	@echo "Available commands:"
	@echo "  make install          Install dependencies"
	@echo "  make migrate          Run database migrations"
	@echo "  make run              Start development server"
	@echo "  make test             Run tests"
	@echo "  make lint             Run linting checks (ruff + mypy)"
	@echo "  make format           Format code with ruff"
	@echo "  make clean            Clean up cache files"
	@echo "  make db-up            Start database containers"
	@echo "  make db-down          Stop database containers"
	@echo "  make createsuperuser  Create admin user"

install:
	pip install -r requirements.txt

migrate:
	python manage.py migrate

run:
	python manage.py runserver 0.0.0.0:8000

test:
	pytest

lint:
	ruff check .
	mypy apps/finance --strict

format:
	ruff format .

clean:
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete
	find . -type d -name .pytest_cache -exec rm -rf {} +
	find . -type d -name .mypy_cache -exec rm -rf {} +

db-up:
	docker compose up -d

db-down:
	docker compose down

createsuperuser:
	python manage.py createsuperuser
