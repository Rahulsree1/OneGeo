"""
Well SQLAlchemy model.
"""
from datetime import datetime
from .base import db


class Well(db.Model):
    """Well entity - represents a wellbore."""
    __tablename__ = "wells"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String(255), nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    curves = db.relationship("Curve", backref="well", lazy="dynamic", cascade="all, delete-orphan")
    files = db.relationship("File", backref="well", lazy="dynamic", cascade="all, delete-orphan")

    def to_dict(self):
        """Serialize to dictionary."""
        return {
            "id": self.id,
            "name": self.name,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
