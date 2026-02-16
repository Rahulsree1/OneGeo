"""
Well controller.
"""
from services.well_service import WellService
from utils.response_wrapper import success_response, error_response


class WellController:
    """Handles well-related requests."""

    @staticmethod
    def list_wells():
        """GET /api/wells - list all wells."""
        try:
            wells = WellService.list_wells()
            return success_response(wells)
        except Exception as e:
            return error_response(str(e), 500)

    @staticmethod
    def get_well(well_id: int):
        """GET /api/wells/{id} - get well by ID."""
        well = WellService.get_well(well_id)
        if not well:
            return error_response("Well not found", 404)
        return success_response(well)

    @staticmethod
    def get_curves(well_id: int):
        """GET /api/wells/{id}/curves - get curve names for well."""
        curves = WellService.get_curves_for_well(well_id)
        if curves is None:
            return error_response("Well not found", 404)
        return success_response({"curve_names": curves})

    @staticmethod
    def get_depth_range(well_id: int):
        """GET /api/wells/{id}/depth-range - get min/max depth for well."""
        r = WellService.get_depth_range(well_id)
        if r is None:
            return error_response("Well not found or no curves", 404)
        return success_response({"depth_min": r[0], "depth_max": r[1]})
