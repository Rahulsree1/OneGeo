"""
AI interpretation service - statistical analysis, anomaly detection, insights.
"""
import statistics
from collections import defaultdict
from dao.curve_dao import CurveDAO
from dao.well_dao import WellDAO


class AIService:
    """Performs AI-assisted interpretation on well log curves."""

    @staticmethod
    def _is_valid_value(v):
        """Check if value is valid (not None, not NaN)."""
        if v is None:
            return False
        try:
            f = float(v)
            return f == f  # NaN check
        except (ValueError, TypeError):
            return False

    @staticmethod
    def interpret(well_id: int, curve_names: list, depth_min: float, depth_max: float):
        """
        Perform interpretation: statistics, anomaly detection, insights.
        Returns { summary, anomalies, insights }.
        """
        well = WellDAO.get_by_id(well_id)
        if not well:
            return None

        records = CurveDAO.get_by_well_and_depth_range(
            well_id, depth_min, depth_max, curve_names
        )

        # Group by curve
        by_curve = defaultdict(list)
        for r in records:
            if AIService._is_valid_value(r.value):
                by_curve[r.curve_name].append((r.depth, r.value))

        summary_parts = []
        anomalies = []
        insights = []

        for curve_name, points in by_curve.items():
            if not points:
                continue
            values = [v for _, v in points]
            depths = [d for d, v in points if AIService._is_valid_value(v)]
            if not values:
                continue

            mean_val = statistics.mean(values)
            try:
                std_val = statistics.stdev(values)
            except statistics.StatisticsError:
                std_val = 0

            # Simple anomaly: values beyond 2 sigma
            threshold_high = mean_val + 2 * std_val
            threshold_low = mean_val - 2 * std_val
            for d, v in points:
                if v is not None and (v > threshold_high or v < threshold_low):
                    anomalies.append({
                        "depth": d,
                        "curve_name": curve_name,
                        "value": v,
                        "mean": round(mean_val, 4),
                        "deviation": "high" if v > threshold_high else "low",
                    })

            summary_parts.append(
                f"{curve_name}: min={min(values):.2f}, max={max(values):.2f}, mean={mean_val:.2f}, std={std_val:.2f}"
            )
            insights.append({
                "curve": curve_name,
                "statistics": {
                    "min": round(min(values), 4),
                    "max": round(max(values), 4),
                    "mean": round(mean_val, 4),
                    "std": round(std_val, 4),
                    "count": len(values),
                },
                "interpretation": AIService._simple_interpretation(curve_name, mean_val, std_val, values),
            })

        return {
            "summary": "; ".join(summary_parts) if summary_parts else "No data in range.",
            "anomalies": anomalies[:50],  # cap for response size
            "insights": insights,
        }

    @staticmethod
    def _simple_interpretation(curve_name: str, mean: float, std: float, values: list) -> str:
        """Generate simple textual interpretation based on curve type."""
        curve_upper = curve_name.upper()
        if "GR" in curve_upper:
            if mean > 100:
                return "High gamma ray suggests shale-dominated interval."
            elif mean < 50:
                return "Low gamma ray suggests clean sand or limestone."
            return "Moderate gamma ray indicates mixed lithology."
        if "RHOB" in curve_upper or "DEN" in curve_upper:
            if mean < 2.0:
                return "Low density may indicate gas or high porosity."
            elif mean > 2.6:
                return "High density suggests dense minerals or tight formation."
            return "Density within typical reservoir range."
        if "NPHI" in curve_upper or "PHIT" in curve_upper:
            if mean > 0.25:
                return "High porosity reading."
            return "Porosity in typical range."
        return f"Mean {mean:.2f} with std {std:.2f}; {len(values)} data points."
