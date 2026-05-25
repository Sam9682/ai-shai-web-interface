---
inclusion: auto
---

# Technology Stack

## Backend

- **Framework**: FastAPI 0.115.6 with Python 3.11+
- **Database**: PostgreSQL 15+ with SQLAlchemy 2.0.36 ORM
- **Migrations**: Alembic 1.14.0
- **Authentication**: JWT tokens (python-jose, PyJWT) with bcrypt password hashing
- **Testing**: pytest 8.3.4 with hypothesis 6.122.4 for property-based testing
- **Background Tasks**: APScheduler 3.10.4
- **Rate Limiting**: SlowAPI 0.1.9
- **Payment Processing**: Stripe 14.3.0, PayPal REST SDK 1.13.1
- **PDF Generation**: ReportLab 4.2.5
- **Cloud Storage**: boto3 1.35.94 (AWS S3 for backups)

## Frontend

- **Framework**: React 19.2.0 with TypeScript 5.9.3
- **Build Tool**: Vite 7.3.1
- **Routing**: React Router DOM 7.13.0
- **Styling**: Tailwind CSS 4.1.18
- **HTTP Client**: Axios 1.13.5

## Infrastructure

- **Containerization**: Docker with docker-compose
- **Web Server**: Nginx (reverse proxy)
- **Database**: PostgreSQL 15 (Alpine container)

## Common Commands

### Backend Development

```bash
# Activate virtual environment
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run development server
uvicorn app.main:app --reload

# Run tests
pytest                              # All tests
pytest --cov=app --cov-report=html  # With coverage
pytest -m property                  # Property-based tests only
pytest -m unit                      # Unit tests only
pytest -m integration               # Integration tests only

# Database migrations
alembic revision --autogenerate -m "Description"  # Create migration
alembic upgrade head                              # Apply migrations
alembic downgrade -1                              # Rollback one migration
```

### Frontend Development

```bash
cd frontend

# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Lint code
npm run lint

# Preview production build
npm run preview
```

### Docker Operations

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Rebuild containers
docker-compose up -d --build

# Access database
docker exec -it ai-hypervisia-postgres-1-5432 psql -U hypervisia_user -d hypervisia_db
```

## API Documentation

- Interactive API docs: `http://localhost:8000/docs` (Swagger UI)
- Alternative docs: `http://localhost:8000/redoc` (ReDoc)
- Health check: `http://localhost:8000/health`
