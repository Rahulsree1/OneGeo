"""
Well business logic service.
"""
from dao.well_dao import WellDAO
from dao.curve_dao import CurveDAO


class WellService:
    """Well-related business logic."""

    @staticmethod
    def list_wells():
        """Get all wells."""
        wells = WellDAO.get_all()
        return [w.to_dict() for w in wells]

    @staticmethod
    def get_well(well_id: int):
        """Get well by ID."""
        well = WellDAO.get_by_id(well_id)
        if not well:
            return None
        return well.to_dict()

    @staticmethod
    def get_curves_for_well(well_id: int):
        """Get distinct curve names for a well."""
        well = WellDAO.get_by_id(well_id)
        if not well:
            return None
        return CurveDAO.get_curve_names_for_well(well_id)

    @staticmethod
    def get_depth_range(well_id: int):
        """Get (depth_min, depth_max) for a well."""
        well = WellDAO.get_by_id(well_id)
        if not well:
            return None
        return CurveDAO.get_depth_range_for_well(well_id)
