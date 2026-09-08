"""Application configuration using Pydantic settings"""
from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""
    
    # Database
    DATABASE_URL: str
    
    # Security
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # Email (optional for development)
    SMTP_HOST: str = "localhost"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "noreply@opcp-psmc.com"
    
    # Payment (optional for development)
    STRIPE_API_KEY: str = "sk_test_dummy_key"
    STRIPE_WEBHOOK_SECRET: str = "whsec_dummy_secret"
    PAYPAL_CLIENT_ID: str = "dummy_client_id"
    PAYPAL_CLIENT_SECRET: str = "dummy_client_secret"
    PAYPAL_MODE: str = "sandbox"
    
    # Application
    APP_NAME: str = "AI-SHAI"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    ALLOWED_ORIGINS: str = "https://opcp-psmc.com"
    
    # File Storage
    UPLOAD_DIR: str = "./storage/uploads"
    MAX_UPLOAD_SIZE: int = 10485760  # 10MB
    DOCS_SEED_DIR: str = "./docs"  # repository docs/ folder, baked into the image (resolves to /app/docs in the container)
    
    # Membership
    ANNUAL_MEMBERSHIP_FEE: float = 50.00
    
    # Oracle AI Configuration (optional)
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4"
    SHAI_API_KEY: str = ""
    SHAI_API_URL: str = "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1"  # Use EU endpoint to avoid redirect
    
    model_config = {
        "env_file": ".env",
        "case_sensitive": True,
        "extra": "ignore"  # Ignore extra environment variables not defined in the model
    }
    
    @property
    def cors_origins(self) -> List[str]:
        """Parse ALLOWED_ORIGINS into a list"""
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",")]


# Global settings instance
settings = Settings()
