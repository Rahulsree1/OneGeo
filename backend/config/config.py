"""
Application configuration module.
Loads environment variables and provides centralized config.
"""
import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from backend/ or project root
base = Path(__file__).resolve().parent.parent
load_dotenv(base / ".env")
load_dotenv(base.parent / ".env")


class Config:
    """Base configuration."""
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key-change-in-production")
    DEBUG = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    ENV = os.getenv("FLASK_ENV", "development")
    GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")


# Config instance for app
config = Config()
