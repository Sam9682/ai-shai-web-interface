"""Main FastAPI application"""
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.config import settings
from app.logging_config import logger
from app.auth.router import router as auth_router
from app.forum.router import router as forum_router
from app.payments.router import router as payments_router
from app.documents.router import router as documents_router
from app.events.router import router as events_router
from app.admin.router import router as admin_router
from app.notifications.router import router as notifications_router
from app.info.router import router as info_router
from app.users.router import router as users_router
from app.oracle.router import router as oracle_router
from app.scheduler import task_scheduler
from app.error_handlers import register_exception_handlers
from app.middleware.rate_limit import limiter
from app.startup import create_default_admin


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan event handler"""
    # Startup
    logger.info(f"Starting {settings.APP_NAME} v{settings.APP_VERSION}")
    logger.info(f"Debug mode: {settings.DEBUG}")
    
    # Create default admin user if no users exist
    create_default_admin()
    
    # Start background task scheduler
    task_scheduler.start()
    logger.info("Background task scheduler started")
    
    yield
    
    # Shutdown
    task_scheduler.shutdown()
    logger.info("Background task scheduler stopped")
    logger.info(f"Shutting down {settings.APP_NAME}")


# Create FastAPI application
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    debug=settings.DEBUG,
    lifespan=lifespan
)

# Add rate limiting state to app
app.state.limiter = limiter

# Add rate limit exceeded handler
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register exception handlers
register_exception_handlers(app)

# Register routers
app.include_router(auth_router)
app.include_router(forum_router)
app.include_router(payments_router)
app.include_router(documents_router)
app.include_router(events_router)
app.include_router(admin_router)
app.include_router(notifications_router)
app.include_router(info_router)
app.include_router(users_router)
app.include_router(oracle_router)


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION
    }


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": f"Welcome to {settings.APP_NAME} API",
        "version": settings.APP_VERSION,
        "docs": "/docs"
    }
