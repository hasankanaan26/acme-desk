# ============================================================
# Dockerfile — Acme Desk
# ============================================================
# One image, any checkpoint: CHECKPOINT picks the folder.
#   docker build -t acme-desk .
#   docker run --rm -p 8000:8000 --env-file .env -e CHECKPOINT=01-source acme-desk
# ============================================================

FROM python:3.11-slim

WORKDIR /app

# Dependencies first, so code changes do not reinstall them.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV CHECKPOINT=01-source
EXPOSE 8000

# --app-dir makes the checkpoint folder the import root, the same thing
# run_checkpoint.py does on your laptop.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port 8000 --app-dir checkpoints/${CHECKPOINT}"]
