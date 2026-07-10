# MedVision Backend

Express + PostgreSQL backend for the MedVision frontend.

## Endpoints

- `GET /health`
- `GET /ready`
- `POST /analyze_cxr`
- `GET /heatmap/:patientId`
- `GET /patients`
- `GET /patients/:id`
- `POST /feedback`

The CT model and CT preprocessing routes are intentionally not implemented.

## Setup

1. Create PostgreSQL database:

```bash
createdb medvision
```

Or start the included database container:

```bash
docker compose up -d postgres
```

2. Copy environment defaults and adjust credentials:

```bash
cp .env.example .env
```

3. Install dependencies and start:

```bash
npm install
npm run dev
```

The backend runs on `http://localhost:8000` by default. The React frontend reads `REACT_APP_API_BASE_URL`.

The Docker Compose database maps host port `5433` to container port `5432` to avoid clashing with local PostgreSQL installs.

## Security And Performance

- Restricted CORS via `FRONTEND_ORIGIN`
- Upload type and size limits
- In-memory request rate limiting
- PostgreSQL connection pooling
- Parameterized SQL queries
- Security headers
- Generic production errors
- Indexed patient, finding, and feedback tables
