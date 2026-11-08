# syntax=docker/dockerfile:1
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export PIP_CERT=/run/secrets/proxy_ca; fi; \
    pip install --no-cache-dir -r requirements.txt
COPY hcm hcm
RUN useradd --uid 10001 --create-home app
USER 10001
EXPOSE 8000
CMD ["sh","-c","exec uvicorn hcm.${SERVICE}:app --host 0.0.0.0 --port 8000 --no-access-log"]
