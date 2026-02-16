"""
API route definitions using Flask Blueprint.
"""
from flask import Blueprint
from controllers.file_controller import FileController
from controllers.well_controller import WellController
from controllers.visualization_controller import VisualizationController
from controllers.ai_controller import AIController

api = Blueprint("api", __name__, url_prefix="/api")


@api.route("/files/upload", methods=["POST"])
def upload_file():
    return FileController.upload()


@api.route("/files", methods=["GET"])
def list_files():
    return FileController.list_recent()


@api.route("/files/<int:file_id>/download", methods=["GET"])
def download_file(file_id):
    return FileController.download(file_id)


@api.route("/files/<int:file_id>", methods=["PATCH"])
def update_file(file_id):
    return FileController.update(file_id)


@api.route("/files/<int:file_id>", methods=["DELETE"])
def delete_file_permanent(file_id):
    return FileController.delete_permanent(file_id)


@api.route("/files/<int:file_id>/process", methods=["POST"])
def process_file(file_id):
    return FileController.process(file_id)


@api.route("/files/bulk", methods=["PATCH"])
def bulk_update_files():
    return FileController.bulk_update()


@api.route("/files/bulk-delete", methods=["POST"])
def bulk_delete_permanent():
    return FileController.bulk_delete_permanent()


@api.route("/wells", methods=["GET"])
def list_wells():
    return WellController.list_wells()


@api.route("/wells/<int:well_id>", methods=["GET"])
def get_well(well_id):
    return WellController.get_well(well_id)


@api.route("/wells/<int:well_id>/curves", methods=["GET"])
def get_well_curves(well_id):
    return WellController.get_curves(well_id)


@api.route("/wells/<int:well_id>/depth-range", methods=["GET"])
def get_well_depth_range(well_id):
    return WellController.get_depth_range(well_id)


@api.route("/visualization", methods=["POST"])
def visualization():
    return VisualizationController.get_curve_data()


@api.route("/ai/interpret", methods=["POST"])
def ai_interpret():
    return AIController.interpret()


@api.route("/ai/interpret-llm", methods=["POST"])
def ai_interpret_llm():
    return AIController.interpret_llm()
