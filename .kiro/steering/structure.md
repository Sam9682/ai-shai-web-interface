---
inclusion: auto
---

# Project Structure

## Repository Layout

```
hypervisia-website/
├── app/                    # Backend application code
├── frontend/               # React frontend application
├── alembic/               # Database migration scripts
├── tests/                 # Backend test suite
├── scripts/               # Utility scripts (backups, etc.)
├── docs/                  # Project documentation
├── conf/                  # Configuration files (nginx, deploy)
├── storage/               # File uploads and storage
├── logs/                  # Application logs
├── ssl/                   # SSL certificates
├── docker-compose.yml     # Container orchestration
├── Dockerfile             # Backend container definition
├── requirements.txt       # Python dependencies
└── .env                   # Environment configuration
```

## Backend Architecture (app/)

The backend follows a modular structure with feature-based organization:

```
app/
├── main.py                # FastAPI application entry point
├── config.py              # Pydantic settings configuration
├── database.py            # SQLAlchemy setup and session management
├── logging_config.py      # Logging configuration
├── scheduler.py           # Background task scheduler
├── startup.py             # Application startup logic
├── error_handlers.py      # Global exception handlers
├── exceptions.py          # Custom exception definitions
│
├── models/                # SQLAlchemy ORM models
│   ├── user.py
│   ├── forum.py
│   ├── event.py
│   ├── document.py
│   ├── payment.py
│   ├── notification.py
│   ├── oracle.py
│   ├── audit.py
│   ├── token_blacklist.py
│   └── user_deletion.py
│
├── auth/                  # Authentication module
│   ├── router.py          # Auth endpoints
│   ├── schemas.py         # Pydantic request/response models
│   ├── dependencies.py    # Auth dependency injection
│   ├── token.py           # JWT token handling
│   ├── password.py        # Password hashing utilities
│   └── rate_limiter.py    # Rate limiting for auth
│
├── users/                 # User management
├── forum/                 # Forum functionality
├── events/                # Event management
├── documents/             # Document repository
├── payments/              # Payment processing
├── notifications/         # Notification system
├── admin/                 # Admin dashboard
├── info/                  # Association information
├── oracle/                # AI assistant module
│
├── services/              # Business logic services
│   ├── email_service.py
│   ├── storage_service.py
│   ├── stripe_service.py
│   ├── paypal_service.py
│   ├── invoice_generator.py
│   ├── notification_service.py
│   ├── event_reminder_service.py
│   ├── membership_reminder_service.py
│   └── user_deletion_service.py
│
└── middleware/            # Custom middleware
    └── rate_limit.py
```

## Module Organization Pattern

Each feature module follows this consistent structure:

```
feature_name/
├── __init__.py
├── router.py              # FastAPI route definitions
├── schemas.py             # Pydantic models for validation
└── dependencies.py        # Dependency injection functions (optional)
```

## Frontend Structure (frontend/)

```
frontend/
├── src/
│   ├── App.tsx            # Main application component
│   ├── main.tsx           # Application entry point
│   ├── components/        # Reusable React components
│   ├── pages/             # Page-level components
│   ├── services/          # API client services
│   ├── hooks/             # Custom React hooks
│   ├── utils/             # Utility functions
│   └── types/             # TypeScript type definitions
├── public/                # Static assets
├── dist/                  # Production build output
├── package.json           # Node dependencies
├── tsconfig.json          # TypeScript configuration
├── vite.config.ts         # Vite build configuration
└── tailwind.config.js     # Tailwind CSS configuration
```

## Key Conventions

- **Models**: SQLAlchemy models in `app/models/` define database schema
- **Routers**: FastAPI routers in `app/{module}/router.py` define API endpoints
- **Schemas**: Pydantic models in `app/{module}/schemas.py` handle validation
- **Services**: Business logic in `app/services/` is reusable across modules
- **Dependencies**: Dependency injection functions provide database sessions, auth, etc.
- **Migrations**: Alembic migrations in `alembic/versions/` track schema changes
- **Tests**: Test files mirror the app structure in `tests/` directory

## Configuration Files

- `.env` - Environment variables (not committed)
- `.env.example` - Template for environment configuration
- `alembic.ini` - Alembic migration configuration
- `pytest.ini` - Pytest test configuration
- `docker-compose.yml` - Multi-container orchestration
- `conf/nginx.conf` - Nginx reverse proxy configuration
