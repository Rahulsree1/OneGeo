"""
Convenience script to run the Flask app.
Run from project root: python backend/run.py
Or from backend: python run.py
"""
import sys
from pathlib import Path

# Add backend to path when run from project root
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app import app

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=1729, debug=True)
