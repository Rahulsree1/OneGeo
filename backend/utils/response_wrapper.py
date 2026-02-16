"""
Standardized API response wrapper.
"""
from flask import jsonify


def success_response(data=None, message="", status_code=200):
    """Return standardized success response."""
    payload = {
        "success": True,
        "message": message,
        "data": data if data is not None else {},
    }
    return jsonify(payload), status_code


def error_response(message="An error occurred", status_code=400, data=None):
    """Return standardized error response."""
    payload = {
        "success": False,
        "message": message,
        "data": data if data is not None else {},
    }
    return jsonify(payload), status_code
