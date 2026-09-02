FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN addgroup --system django && adduser --system --ingroup django django

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY --chown=django:django . .

RUN mkdir -p /data /backups && chown -R django:django /data /backups \
    && chmod +x /app/docker/backend-entrypoint.sh

RUN DJANGO_SECRET_KEY=build-only-secret \
    KUBERNETES_TOKEN_ENCRYPTION_KEY= \
    python manage.py collectstatic --noinput

USER django

EXPOSE 8000

ENTRYPOINT ["/app/docker/backend-entrypoint.sh"]
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "1", "--timeout", "60", "--access-logfile", "-"]
