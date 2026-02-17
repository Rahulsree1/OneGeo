"""
AI interpretation controller.
"""
from flask import request
from services.ai_service import AIService
from services.llm_service import interpret_with_llm, chat_with_groq
from utils.response_wrapper import success_response, error_response


class AIController:
    """Handles AI interpretation requests."""

    @staticmethod
    def interpret():
        """POST /api/ai/interpret - run deterministic statistics (summary, anomalies, insights)."""
        data = request.get_json() or {}
        well_id = data.get("well_id")
        curve_names = data.get("curve_names", [])
        depth_min = data.get("depth_min")
        depth_max = data.get("depth_max")

        if not well_id:
            return error_response("well_id is required", 400)
        if not curve_names:
            return error_response("curve_names is required", 400)
        if depth_min is None or depth_max is None:
            return error_response("depth_min and depth_max are required", 400)

        try:
            depth_min = float(depth_min)
            depth_max = float(depth_max)
        except (ValueError, TypeError):
            return error_response("depth_min and depth_max must be numbers", 400)

        try:
            result = AIService.interpret(well_id, curve_names, depth_min, depth_max)
            if result is None:
                return error_response("Well not found", 404)
            return success_response(result)
        except Exception as e:
            return error_response(str(e), 500)

    @staticmethod
    def interpret_llm():
        """POST /api/ai/interpret-llm - run statistics then Groq LLM for natural-language interpretation."""
        data = request.get_json() or {}
        well_id = data.get("well_id")
        well_name = data.get("well_name", "Well")
        curve_names = data.get("curve_names", [])
        depth_min = data.get("depth_min")
        depth_max = data.get("depth_max")

        if not well_id:
            return error_response("well_id is required", 400)
        if not curve_names:
            return error_response("curve_names is required", 400)
        if depth_min is None or depth_max is None:
            return error_response("depth_min and depth_max are required", 400)

        try:
            depth_min = float(depth_min)
            depth_max = float(depth_max)
        except (ValueError, TypeError):
            return error_response("depth_min and depth_max must be numbers", 400)

        try:
            result = interpret_with_llm(well_id, well_name, curve_names, depth_min, depth_max)
            if result is None:
                return error_response("Well not found", 404)
            return success_response(result)
        except ValueError as e:
            return error_response(str(e), 400)
        except Exception as e:
            
            return error_response(str(e), 500)

    @staticmethod
    def chat():
        """POST /api/ai/chat - send a message to the chatbot (Groq LLM)."""
        data = request.get_json() or {}
        message = (data.get("message") or "").strip()
        history = data.get("history") or []
        well_name = data.get("well_name")

        if not message:
            return error_response("message is required", 400)

        try:
            reply = chat_with_groq(message, history=history, well_name=well_name)
            return success_response({"reply": reply})
        except ValueError as e:
            return error_response(str(e), 400)
        except Exception as e:
            return error_response(str(e), 500)
