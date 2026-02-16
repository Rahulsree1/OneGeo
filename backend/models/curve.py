"""
Curve SQLAlchemy model.
"""
from .base import db


class Curve(db.Model):
    """Curve entity - stores curve data points (depth, curve_name, value)."""
    __tablename__ = "curves"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    well_id = db.Column(db.Integer, db.ForeignKey("wells.id"), nullable=False, index=True)
    depth = db.Column(db.Float, nullable=False, index=True)
    curve_name = db.Column(db.String(100), nullable=False, index=True)
    value = db.Column(db.Float, nullable=True)

    def to_dict(self):
        """Serialize to dictionary."""
        return {
            "id": self.id,
            "well_id": self.well_id,
            "depth": self.depth,
            "curve_name": self.curve_name,
            "value": self.value,
        }
