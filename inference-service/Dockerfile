FROM backend-inference-api:latest

WORKDIR /app

RUN mkdir -p /app/model

COPY . .

EXPOSE 8000

ENTRYPOINT []

CMD ["python", "-m","uvicorn",  "app:app",  "--host",  "0.0.0.0",  "--port",  "8000"]