"""
LAS file parsing service using lasio.
"""
import lasio
from io import BytesIO
from models import Curve


class LASParserService:
    """Parse LAS files and extract curve data."""

    @staticmethod
    def parse_from_file_obj(file_ref) -> lasio.LASFile:
        """Parse LAS from file-like object or string content."""
        return lasio.read(file_ref)

    @staticmethod
    def get_well_name(las: lasio.LASFile) -> str:
        """Extract well name from LAS metadata or use filename."""
        try:
            wname = las.well.get("WELL")
            if wname and wname.value:
                return str(wname.value).strip()
        except Exception:
            pass
        return "Unknown Well"

    @staticmethod
    def extract_curves(las: lasio.LASFile, well_id: int) -> list:
        """
        Extract curve data from LAS and return list of Curve model instances.
        Skips depth curve as it's used as index.
        """
        curves = []
        if not las.curves:
            return curves

        # Get depth curve (usually first)
        depth_curve = las.curves[0]
        depth_name = depth_curve.mnemonic if hasattr(depth_curve, "mnemonic") else "DEPT"

        for i, curve in enumerate(las.curves):
            if i == 0:
                continue  # skip depth, we use it as index
            curve_name = curve.mnemonic if hasattr(curve, "mnemonic") else f"curve_{i}"
            depth_data = las[depth_name]
            value_data = las[curve_name]

            if depth_data is None or value_data is None:
                continue

            for d, v in zip(depth_data, value_data):
                try:
                    depth_val = float(d)
                    if depth_val != depth_val:  # NaN check
                        continue
                    value_val = None
                    if v is not None and str(v) not in ("nan", "1e+30", "1e+31"):
                        try:
                            value_val = float(v)
                        except (ValueError, TypeError):
                            pass
                    # Store all depth points (including nulls) for alignment
                    curves.append(
                        Curve(
                            well_id=well_id,
                            depth=depth_val,
                            curve_name=str(curve_name).strip(),
                            value=value_val,
                        )
                    )
                except (ValueError, TypeError):
                    continue
        return curves

    @staticmethod
    def get_curve_names(las: lasio.LASFile) -> list:
        """Get list of curve names (excluding depth curve)."""
        names = []
        depth_name = las.curves[0].mnemonic if las.curves else "DEPT"
        for i, curve in enumerate(las.curves):
            if i == 0:
                continue
            names.append(curve.mnemonic if hasattr(curve, "mnemonic") else f"curve_{i}")
        return names
