FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential curl \
    && rm -rf /var/lib/apt/lists/*
RUN mkdir -p /app/history

COPY archive/legacy/20260605-005529/vendor/mem0/server/requirements.txt /tmp/requirements.txt
RUN pip install --upgrade pip setuptools wheel \
    && pip install -r /tmp/requirements.txt

COPY archive/legacy/20260605-005529/vendor/mem0 /opt/mem0-src
# The server only uses pgvector, Ollama and the local Hugging Face embedder.
# Installing every optional mem0 provider pulls CUDA-enabled PyTorch plus many
# unrelated database clients, making this image several GB and prone to OOM.
RUN pip install --index-url https://download.pytorch.org/whl/cpu "torch==2.7.1+cpu" \
    && pip install -e /opt/mem0-src \
        "ollama>=0.3.0" \
        "sentence-transformers>=5.0.0,<6.0.0" \
        "psycopg[binary]>=3.2.8" \
        "psycopg-pool>=3.2.6,<4.0.0"

COPY archive/legacy/20260605-005529/vendor/mem0/server/ /app/
COPY docker/mem0 /opt/aiyo-mem0

CMD ["sh", "-c", "python /opt/aiyo-mem0/patch_main_for_providers.py && python /opt/aiyo-mem0/ensure_mem0_app_db.py && alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port 8890"]
