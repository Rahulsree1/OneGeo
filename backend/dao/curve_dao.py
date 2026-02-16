"""
Curve Data Access Object - database operations for curves.
"""
from models import Curve


BATCH_SIZE = 10000  # Larger batches; single commit at end is much faster


class CurveDAO:
    """Handles curve database operations."""

    @staticmethod
    def bulk_insert(curves: list, progress_callback=None) -> None:
        """
        Bulk insert curve records. Uses bulk_insert_mappings and a single commit for speed.
        progress_callback(inserted_count, total_count) is called every batch if provided.
        """
        from models.base import db
        total = len(curves)
        if total == 0:
            return
        # Build dicts for bulk_insert_mappings (faster than ORM objects)
        for i in range(0, total, BATCH_SIZE):
            batch = curves[i : i + BATCH_SIZE]
            mappings = [
                {"well_id": c.well_id, "depth": c.depth, "curve_name": c.curve_name, "value": c.value}
                for c in batch
            ]
            db.session.bulk_insert_mappings(Curve, mappings)
            if progress_callback is not None:
                progress_callback(min(i + len(batch), total), total)
        db.session.commit()

    @staticmethod
    def get_by_well_and_depth_range(
        well_id: int, depth_min: float, depth_max: float, curve_names: list = None
    ) -> list:
        """Fetch curves for a well within depth range, optionally filtered by curve names."""
        q = Curve.query.filter(
            Curve.well_id == well_id,
            Curve.depth >= depth_min,
            Curve.depth <= depth_max,
        )
        if curve_names:
            q = q.filter(Curve.curve_name.in_(curve_names))
        return q.order_by(Curve.depth).all()

    @staticmethod
    def get_curve_names_for_well(well_id: int) -> list:
        """Get distinct curve names for a well."""
        result = Curve.query.filter(Curve.well_id == well_id).with_entities(
            Curve.curve_name
        ).distinct().all()
        return [r[0] for r in result]

    @staticmethod
    def get_depth_range_for_well(well_id: int) -> tuple[float, float] | None:
        """Get (depth_min, depth_max) for a well. Returns None if no curves."""
        from sqlalchemy import func
        row = Curve.query.filter(Curve.well_id == well_id).with_entities(
            func.min(Curve.depth).label("min_d"),
            func.max(Curve.depth).label("max_d"),
        ).first()
        if not row or row.min_d is None:
            return None
        return (float(row.min_d), float(row.max_d))

    @staticmethod
    def delete_by_well_id(well_id: int) -> None:
        """Delete all curves for a well."""
        Curve.query.filter_by(well_id=well_id).delete()
        from models.base import db
        db.session.commit()
