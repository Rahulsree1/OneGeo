"""
Database configuration.
Supports Supabase (use DATABASE_URL) or standard PostgreSQL.
"""
import os
from dotenv import load_dotenv

load_dotenv()


def get_database_url():
    """Build PostgreSQL connection URL. Prefers DATABASE_URL for Supabase."""
    # Supabase: paste connection string from Project Settings > Database
    url = os.getenv("DATABASE_URL") or os.getenv("SUPABASE_DB_URL")
    if url:
        # Ensure postgresql:// scheme (Supabase may give postgres://)
        if url.startswith("postgres://"):
            url = "postgresql://" + url[10:]
        # Supabase requires SSL; add if not present
        if "sslmode" not in url:
            url += "&sslmode=require" if "?" in url else "?sslmode=require"
        return url
    # Fallback: build from components
    db_user = os.getenv("DB_USER", "postgres")
    db_password = os.getenv("DB_PASSWORD", "postgres")
    db_host = os.getenv("DB_HOST", "localhost")
    db_port = os.getenv("DB_PORT", "5432")
    db_name = os.getenv("DB_NAME", "las_well_logs")
    return f"postgresql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"


DB_URL = get_database_url()
