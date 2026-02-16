"""
Global error handler for Flask application.
"""
import traceback
from flask import jsonify
from .response_wrapper import error_response


def register_error_handlers(app):
    """Register global error handlers."""
    
    @app.errorhandler(400)
    def bad_request(e):
        return error_response(str(e) or "Bad request", 400)

    @app.errorhandler(404)
    def not_found(e):
        return error_response("Resource not found", 404)

    @app.errorhandler(500)
    def internal_error(e):
        # Log traceback in debug mode
        if app.debug:
            traceback.print_exc()
        return error_response("Internal server error", 500)

    @app.errorhandler(Exception)
    def handle_exception(e):
        if app.debug:
            traceback.print_exc()
        return error_response(str(e) if str(e) else "An unexpected error occurred", 500)
