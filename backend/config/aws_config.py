"""
AWS S3 configuration.
"""
import os
from dotenv import load_dotenv

load_dotenv()


class AWSConfig:
    """AWS S3 configuration."""
    AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID", "")
    AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY", "")
    AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
    S3_BUCKET_NAME = os.getenv("S3_BUCKET_NAME", "las-well-logs")


aws_config = AWSConfig()
