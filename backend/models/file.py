"""
File SQLAlchemy model.
"""
from datetime import datetime
from .base import db


class File(db.Model):
    """File entity - stores LAS file metadata and S3 reference."""
    __tablename__ = "files"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    well_id = db.Column(db.Integer, db.ForeignKey("wells.id"), nullable=False, index=True)
    s3_url = db.Column(db.String(512), nullable=False)
    file_name = db.Column(db.String(255), nullable=False)
    uploaded_at = db.Column(db.DateTime, default=datetime.utcnow)
    # status: active | archived | deleted
    status = db.Column(db.String(32), default="active", nullable=False, index=True)
    is_important = db.Column(db.Boolean, default=False, nullable=False)
    processed = db.Column(db.Boolean, default=False, nullable=False)

    def to_dict(self):
        """Serialize to dictionary."""
        return {
            "id": self.id,
            "well_id": self.well_id,
            "s3_url": self.s3_url,
            "file_name": self.file_name,
            "uploaded_at": self.uploaded_at.isoformat() if self.uploaded_at else None,
            "status": self.status,
            "is_important": self.is_important,
            "processed": self.processed,
        }
