"""
File Data Access Object - database operations for file metadata.
"""
from models import File
from dao.curve_dao import CurveDAO
from dao.well_dao import WellDAO
from utils.s3_utils import delete_from_s3


class FileDAO:
    """Handles file metadata database operations."""

    @staticmethod
    def create(
        well_id: int,
        s3_url: str,
        file_name: str,
        *,
        status: str = "active",
        is_important: bool = False,
        processed: bool = True,
    ) -> File:
        """Insert file metadata."""
        f = File(
            well_id=well_id,
            s3_url=s3_url,
            file_name=file_name,
            status=status,
            is_important=is_important,
            processed=processed,
        )
        from models.base import db
        db.session.add(f)
        db.session.commit()
        return f

    @staticmethod
    def get_by_id(file_id: int) -> File | None:
        """Fetch file by ID."""
        return File.query.get(file_id)

    @staticmethod
    def get_by_well_id(well_id: int) -> list:
        """Fetch all files for a well."""
        return File.query.filter_by(well_id=well_id).order_by(File.uploaded_at.desc()).all()

    @staticmethod
    def get_recent(
        limit: int = 50,
        status: str | None = None,
        important_only: bool | None = None,
    ) -> list:
        """Fetch recent files. status=None means All (active + archived, exclude deleted)."""
        q = File.query.order_by(File.uploaded_at.desc())
        if status:
            q = q.filter_by(status=status)
        else:
            q = q.filter(File.status.in_(["active", "archived"]))
        if important_only is True:
            q = q.filter_by(is_important=True)
        return q.limit(limit).all()

    @staticmethod
    def update_file(
        file_id: int,
        *,
        status: str | None = None,
        is_important: bool | None = None,
        well_id: int | None = None,
        processed: bool | None = None,
    ) -> File | None:
        """Update file fields. Returns updated file or None."""
        f = File.query.get(file_id)
        if not f:
            return None
        if status is not None:
            f.status = status
        if is_important is not None:
            f.is_important = is_important
        if well_id is not None:
            f.well_id = well_id
        if processed is not None:
            f.processed = processed
        from models.base import db
        db.session.commit()
        return f

    @staticmethod
    def delete_permanent(file_id: int) -> bool:
        """
        Permanently delete file: remove from S3, then DB record.
        If the well has no files left after this delete, delete its curves and the well.
        """
        from models.base import db

        f = File.query.get(file_id)
        if not f:
            return False
        s3_url = f.s3_url
        well_id = f.well_id

        delete_from_s3(s3_url)
        db.session.delete(f)
        db.session.commit()

        remaining = File.query.filter_by(well_id=well_id).count()
        if remaining == 0:
            CurveDAO.delete_by_well_id(well_id)
            WellDAO.delete_by_id(well_id)
        return True

    @staticmethod
    def bulk_update(
        file_ids: list[int],
        *,
        status: str | None = None,
        is_important: bool | None = None,
    ) -> int:
        """Update multiple files. Returns number of files updated."""
        if not file_ids or (status is None and is_important is None):
            return 0
        files = File.query.filter(File.id.in_(file_ids)).all()
        for f in files:
            if status is not None:
                f.status = status
            if is_important is not None:
                f.is_important = is_important
        from models.base import db
        db.session.commit()
        return len(files)
