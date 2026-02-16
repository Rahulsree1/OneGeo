"""
Visualization data preparation service.
"""
from collections import defaultdict
from dao.curve_dao import CurveDAO
from dao.well_dao import WellDAO


class VisualizationService:
    """Prepares curve data for visualization."""

    @staticmethod
    def get_curve_data(well_id: int, curve_names: list, depth_min: float, depth_max: float):
        """
        Fetch curves in depth range and return format:
        { depth: [], GR: [], RHOB: [], ... }
        """
        well = WellDAO.get_by_id(well_id)
        if not well:
            return None

        records = CurveDAO.get_by_well_and_depth_range(
            well_id, depth_min, depth_max, curve_names
        )

        # Build depth-indexed structure
        depth_set = sorted(set(r.depth for r in records))
        series = defaultdict(list)
        depth_map = {d: i for i, d in enumerate(depth_set)}
        for _ in depth_set:
            for cn in curve_names:
                series[cn].append(None)
        for r in records:
            idx = depth_map[r.depth]
            series[r.curve_name][idx] = r.value

        result = {"depth": depth_set}
        for cn in curve_names:
            result[cn] = series.get(cn, [None] * len(depth_set))
        return result
