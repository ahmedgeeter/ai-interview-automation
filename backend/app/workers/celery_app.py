import os
from celery import Celery

REDIS_URL = os.getenv("CELERY_BROKER_URL", "redis://redis:6379/0")

celery_app = Celery(
    "autohire_worker",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["app.workers.assessor"]
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)
