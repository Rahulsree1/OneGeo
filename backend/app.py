"""
Flask application entry point.
Run with: python app.py (so SocketIO uses eventlet for WebSocket support).
Serves the built frontend from backend when frontend/dist exists.
On Vercel (serverless), eventlet is skipped to avoid "RLock not greened" errors.
"""
import os

# Only use eventlet when not on Vercel; serverless loads modules before our code, so monkey_patch() runs too late
if not os.environ.get("VERCEL"):
    import eventlet
    eventlet.monkey_patch()

from flask import Flask, send_from_directory
from flask_cors import CORS

from config.config import config
from config.db_config import DB_URL
from extensions import socketio
from models import db
from routes import api
from utils.error_handler import register_error_handlers

# Path to frontend build (backend/../frontend/dist)
FRONTEND_DIST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dist")


def create_app():
    """Create and configure Flask app."""
    app = Flask(__name__)
    app.config["SECRET_KEY"] = config.SECRET_KEY
    app.config["SQLALCHEMY_DATABASE_URI"] = DB_URL
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024  # 50 MB

    origins = [
        "http://localhost:3000", "http://127.0.0.1:3000",
        "http://localhost:5173", "http://127.0.0.1:5173",
        "http://localhost:1729", "http://127.0.0.1:1729",
    ]
    CORS(app, origins=origins)

    db.init_app(app)
    socketio.init_app(app)

    with app.app_context():
        db.create_all()

    app.register_blueprint(api)
    register_error_handlers(app)

    # Serve frontend SPA: static files from dist, fallback to index.html
    if os.path.isdir(FRONTEND_DIST):
        _dist_real = os.path.realpath(FRONTEND_DIST)

        @app.route("/", defaults={"path": ""})
        @app.route("/<path:path>")
        def serve_spa(path):
            if path and not path.startswith("api/"):
                # Normalize: no traversal, use forward slashes for send_from_directory
                safe_path = path.replace("\\", "/").strip("/")
                if ".." in safe_path:
                    safe_path = ""
                if safe_path:
                    full = os.path.join(FRONTEND_DIST, safe_path.replace("/", os.path.sep))
                    if os.path.isfile(full):
                        canon = os.path.realpath(full)
                        if canon.lower().startswith(_dist_real.lower()):
                            return send_from_directory(
                                FRONTEND_DIST,
                                safe_path.replace(os.path.sep, "/"),
                            )
            return send_from_directory(FRONTEND_DIST, "index.html")

    return app


app = create_app()

if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=1729, debug=config.DEBUG)
