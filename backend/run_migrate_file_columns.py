"""
One-off migration: add status, is_important, processed to files table.
Run from backend dir: python run_migrate_file_columns.py
"""
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from sqlalchemy import text
from app import app
from models.base import db


def run():
    with app.app_context():
        with db.engine.connect() as conn:
            for stmt in [
                "ALTER TABLE files ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'active'",
                "ALTER TABLE files ADD COLUMN IF NOT EXISTS is_important BOOLEAN NOT NULL DEFAULT false",
                "ALTER TABLE files ADD COLUMN IF NOT EXISTS processed BOOLEAN NOT NULL DEFAULT true",
            ]:
                try:
                    conn.execute(text(stmt))
                    print("OK:", stmt[:55] + "...")
                except Exception as e:
                    print("Note:", e)
            try:
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_files_status ON files (status)"))
                print("OK: index ix_files_status")
            except Exception as e:
                print("Index note:", e)
            conn.commit()
    print("Migration done.")


if __name__ == "__main__":
    run()
