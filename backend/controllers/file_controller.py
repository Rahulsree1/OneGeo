"""
File upload controller.
"""
from flask import request
from extensions import socketio
from services.file_service import FileService
from dao.file_dao import FileDAO
from utils.response_wrapper import success_response, error_response
from utils.s3_utils import get_presigned_url


def _emit_process(event: str, data: dict) -> None:
    """Emit process event to all connected clients (for live logs). Omit 'to' to send to everyone."""
    socketio.emit(event, data)


class FileController:
    """Handles file upload requests."""

    @staticmethod
    def upload():
        """POST /api/files/upload - upload LAS file(s). No processing by default (upload only)."""
        files_list = request.files.getlist("file")
        if not files_list:
            if "file" in request.files and request.files["file"] and request.files["file"].filename:
                files_list = [request.files["file"]]
            else:
                return error_response("No file part in request", 400)
        process = request.args.get("process", "false").lower() == "true"
        results = []
        for file_obj in files_list:
            if not file_obj or not file_obj.filename:
                continue
            filename = file_obj.filename
            if not (filename.lower().endswith(".las") or filename.lower().endswith(".las2")):
                continue
            try:
                if process:
                    result = FileService.process_upload(file_obj, filename)
                else:
                    result = FileService.upload_only(file_obj, filename)
                results.append(result)
            except Exception as e:
                results.append({"error": str(e), "file_name": filename})
        if not results:
            return error_response("No valid LAS files to upload", 400)
        return success_response(
            {"uploads": results, "count": len(results)},
            "File(s) uploaded successfully",
            201,
        )

    @staticmethod
    def list_recent():
        """GET /api/files - list recent files. Query: status=active|archived|deleted, important=0|1."""
        try:
            status = request.args.get("status") or None
            important_only = None
            if request.args.get("important", "").lower() in ("1", "true", "yes"):
                important_only = True
            files = FileDAO.get_recent(status=status, important_only=important_only)
            data = [
                {
                    "id": f.id,
                    "well_id": f.well_id,
                    "well_name": f.well.name if f.well else "Unknown",
                    "file_name": f.file_name,
                    "uploaded_at": f.uploaded_at.isoformat() if f.uploaded_at else None,
                    "status": f.status,
                    "is_important": f.is_important,
                    "processed": f.processed,
                }
                for f in files
            ]
            return success_response(data)
        except Exception as e:
            return error_response(str(e), 500)

    @staticmethod
    def download(file_id):
        """GET /api/files/<id>/download - get presigned download URL for file."""
        try:
            file_meta = FileDAO.get_by_id(file_id)
            if not file_meta:
                return error_response("File not found", 404)
            download_url = get_presigned_url(file_meta.s3_url, expiration=3600)
            return success_response({"download_url": download_url})
        except Exception as e:
            return error_response(str(e), 500)

    @staticmethod
    def update(file_id):
        """PATCH /api/files/<id> - update status and/or is_important."""
        try:
            body = request.get_json(silent=True) or {}
            status = body.get("status")
            is_important = body.get("is_important")
            if status is not None and status not in ("active", "archived", "deleted"):
                return error_response("Invalid status", 400)
            updated = FileDAO.update_file(
                file_id, status=status, is_important=is_important if is_important is not None else None
            )
            if not updated:
                return error_response("File not found", 404)
            return success_response(updated.to_dict())
        except Exception as e:
            return error_response(str(e), 500)

    @staticmethod
    def delete_permanent(file_id):
        """DELETE /api/files/<id> - permanently remove file record."""
        try:
            if FileDAO.delete_permanent(file_id):
                return success_response(None, "File deleted permanently", 200)
            return error_response("File not found", 404)
        except Exception as e:
            return error_response(str(e), 500)

    @staticmethod
    def bulk_update():
        """PATCH /api/files/bulk - update status and/or is_important for multiple files."""
        try:
            body = request.get_json(silent=True) or {}
            file_ids = body.get("file_ids") or []
            status = body.get("status")
            is_important = body.get("is_important")
            if not isinstance(file_ids, list) or not file_ids:
                return error_response("file_ids required (non-empty array)", 400)
            if status is not None and status not in ("active", "archived", "deleted"):
                return error_response("Invalid status", 400)
            count = FileDAO.bulk_update(
                file_ids,
                status=status,
                is_important=is_important if is_important is not None else None,
            )
            return success_response({"updated": count})
        except Exception as e:
            return error_response(str(e), 500)

    @staticmethod
    def process(file_id):
        """POST /api/files/<id>/process - process an existing (unprocessed) file."""
        try:
            print(f"[API] POST /api/files/{file_id}/process requested")
            emit = lambda event, data: _emit_process(event, data)
            result = FileService.process_existing_file(file_id, emit=emit)
            print(f"[API] Process completed for file_id={file_id}")
            return success_response(result, "File processed successfully", 200)
        except ValueError as e:
            print(f"[API] Process error (ValueError) file_id={file_id}: {e}")
            _emit_process("process_log", {"file_id": file_id, "message": str(e), "step": "error"})
            return error_response(str(e), 400)
        except Exception as e:
            print(f"[API] Process error file_id={file_id}: {e}")
            _emit_process("process_log", {"file_id": file_id, "message": str(e), "step": "error"})
            return error_response(str(e), 500)

    @staticmethod
    def bulk_delete_permanent():
        """POST /api/files/bulk-delete - permanently delete multiple files."""
        try:
            body = request.get_json(silent=True) or {}
            file_ids = body.get("file_ids") or []
            if not isinstance(file_ids, list) or not file_ids:
                return error_response("file_ids required (non-empty array)", 400)
            deleted = 0
            for fid in file_ids:
                if FileDAO.delete_permanent(fid):
                    deleted += 1
            return success_response({"deleted": deleted})
        except Exception as e:
            return error_response(str(e), 500)
