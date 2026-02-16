"""
Well Data Access Object - database operations for wells.
"""
from models import Well


class WellDAO:
    """Handles well database operations."""

    @staticmethod
    def create(name: str) -> Well:
        """Insert a new well."""
        well = Well(name=name)
        from models.base import db
        db.session.add(well)
        db.session.commit()
        return well

    @staticmethod
    def get_by_id(well_id: int) -> Well | None:
        """Fetch well by ID."""
        return Well.query.get(well_id)

    @staticmethod
    def get_all() -> list:
        """Fetch all wells, ordered by created_at desc."""
        return Well.query.order_by(Well.created_at.desc()).all()

    @staticmethod
    def get_by_name(name: str) -> Well | None:
        """Fetch well by name."""
        return Well.query.filter_by(name=name).first()

    @staticmethod
    def get_or_create_unprocessed() -> Well:
        """Get or create the placeholder well for upload-only (unprocessed) files."""
        name = "Unprocessed"
        existing = Well.query.filter_by(name=name).first()
        if existing:
            return existing
        well = Well(name=name)
        from models.base import db
        db.session.add(well)
        db.session.commit()
        return well

    @staticmethod
    def delete_by_id(well_id: int) -> bool:
        """Delete a well by ID. Returns True if deleted. Caller should delete curves first."""
        well = Well.query.get(well_id)
        if not well:
            return False
        from models.base import db
        db.session.delete(well)
        db.session.commit()
        return True
