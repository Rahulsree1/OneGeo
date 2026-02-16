"""
File upload and storage service.
"""
from io import BytesIO
from dao.well_dao import WellDAO
from dao.file_dao import FileDAO
from dao.curve_dao import CurveDAO
from services.las_parser_service import LASParserService
from utils.s3_utils import upload_to_s3, download_from_s3


class FileService:
    """Handles file upload, S3 storage, parsing, and persistence."""

    @staticmethod
    def upload_only(file_obj, file_name: str):
        """
        Store file in S3 and create file record. Parses LAS header only to get well name
        so the file is assigned to the correct well from the start (one well per upload).
        """
        file_obj.seek(0)
        content = file_obj.read()
        content_str = content.decode("utf-8", errors="replace") if isinstance(content, bytes) else str(content)
        try:
            las = LASParserService.parse_from_file_obj(content_str)
            well_name = LASParserService.get_well_name(las)
        except Exception:
            well_name = "Unknown Well"
        existing = WellDAO.get_by_name(well_name)
        well = existing if existing else WellDAO.create(well_name)
        file_buffer = BytesIO(content if isinstance(content, bytes) else content.encode("utf-8"))
        file_buffer.seek(0)
        s3_url = upload_to_s3(file_buffer, well.id, file_name)
        file_meta = FileDAO.create(
            well_id=well.id,
            s3_url=s3_url,
            file_name=file_name,
            processed=False,
            status="active",
            is_important=False,
        )
        return {
            "well": well.to_dict(),
            "file": file_meta.to_dict(),
        }

    @staticmethod
    def process_upload(file_obj, file_name: str):
        """
        Store file in S3, parse LAS, create well and curves in DB.
        Returns dict with well, file metadata.
        """
        file_obj.seek(0)
        content = file_obj.read()
        # lasio expects str (text); decode bytes to string
        if isinstance(content, bytes):
            content_str = content.decode("utf-8", errors="replace")
        else:
            content_str = str(content)
        # Keep bytes for S3 upload
        file_buffer = BytesIO(content if isinstance(content, bytes) else content.encode("utf-8"))

        # Parse LAS to get well name (lasio requires str content)
        las = LASParserService.parse_from_file_obj(content_str)
        well_name = LASParserService.get_well_name(las)

        # Create or get well
        existing = WellDAO.get_by_name(well_name)
        if existing:
            well = existing
            CurveDAO.delete_by_well_id(well.id)  # replace curves on re-upload
        else:
            well = WellDAO.create(well_name)

        # Upload to S3
        file_buffer.seek(0)
        s3_url = upload_to_s3(file_buffer, well.id, file_name)

        # Store file metadata (processed=True)
        file_meta = FileDAO.create(
            well_id=well.id,
            s3_url=s3_url,
            file_name=file_name,
            processed=True,
        )

        # Extract and store curves (re-parse from string)
        las = LASParserService.parse_from_file_obj(content_str)
        curves = LASParserService.extract_curves(las, well.id)
        if curves:
            CurveDAO.bulk_insert(curves)

        return {
            "well": well.to_dict(),
            "file": file_meta.to_dict(),
            "curves_count": len(curves),
        }

    @staticmethod
    def process_existing_file(file_id: int, emit=None):
        """
        Download file from S3, parse LAS, create/update well and curves, mark file processed.
        If emit(event, data) is provided, progress is pushed to the frontend via WebSocket.
        """
        def log(msg: str, **kwargs):
            print(f"[Process] {msg}")
            if emit:
                emit("process_log", {"file_id": file_id, "message": msg, **kwargs})

        log("Starting processing", step="start")
        file_meta = FileDAO.get_by_id(file_id)
        if not file_meta:
            log("File not found", step="error")
            raise ValueError("File not found")
        if file_meta.processed:
            log("File already processed", step="error")
            raise ValueError("File already processed")
        old_well_id = file_meta.well_id
        log(f"Downloading from S3: {file_meta.s3_url}", step="download")
        content = download_from_s3(file_meta.s3_url)
        content_str = content.decode("utf-8", errors="replace")
        log(f"Parsing LAS ({len(content_str)} chars)", step="parse")
        las = LASParserService.parse_from_file_obj(content_str)
        well_name = LASParserService.get_well_name(las)
        log(f"Well name from LAS: {well_name!r}", step="well")
        existing = WellDAO.get_by_name(well_name)
        if existing:
            well = existing
            log(f"Using existing well id={well.id}, clearing old curves", step="well")
            CurveDAO.delete_by_well_id(well.id)
        else:
            well = WellDAO.create(well_name)
            log(f"Created new well id={well.id} name={well_name!r}", step="well")
        curves = LASParserService.extract_curves(las, well.id)
        log(f"Extracted {len(curves)} curve records", step="curves", total=len(curves))
        if curves:
            last_emitted = [0]  # use list to allow assignment in closure
            emit_interval = max(50000, len(curves) // 20)  # emit at most ~20 times during insert

            def progress_cb(inserted: int, total: int):
                if emit and (inserted == total or inserted - last_emitted[0] >= emit_interval):
                    last_emitted[0] = inserted
                    emit("process_log", {"file_id": file_id, "message": f"Inserting curves {inserted:,}/{total:,}", "step": "insert", "inserted": inserted, "total": total})
            CurveDAO.bulk_insert(curves, progress_callback=progress_cb)
            log("Inserted curves into DB", step="curves_done")
        FileDAO.update_file(file_id, well_id=well.id, processed=True)
        if old_well_id != well.id:
            files_left = FileDAO.get_by_well_id(old_well_id)
            if not files_left:
                old_well = WellDAO.get_by_id(old_well_id)
                if old_well and old_well.name == "Unprocessed":
                    CurveDAO.delete_by_well_id(old_well_id)
                    WellDAO.delete_by_id(old_well_id)
                    log("Removed empty Unprocessed well", step="well")
        log("Done.", step="done", well_id=well.id)
        return {
            "well": well.to_dict(),
            "file": {**file_meta.to_dict(), "well_id": well.id, "processed": True},
            "curves_count": len(curves),
        }
