"""
AWS S3 utilities for file storage.
"""
import boto3
from botocore.exceptions import ClientError
from config.aws_config import aws_config


def get_s3_client():
    """Get boto3 S3 client."""
    return boto3.client(
        "s3",
        aws_access_key_id=aws_config.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=aws_config.AWS_SECRET_ACCESS_KEY,
        region_name=aws_config.AWS_REGION,
    )


def upload_to_s3(file_obj, well_id: int, file_name: str) -> str:
    """
    Upload file to S3.
    Path: s3://bucket/wells/{well_id}/{file_name}
    Returns S3 URL.
    """
    s3 = get_s3_client()
    key = f"wells/{well_id}/{file_name}"
    s3.upload_fileobj(file_obj, aws_config.S3_BUCKET_NAME, key)
    return f"s3://{aws_config.S3_BUCKET_NAME}/{key}"


def download_from_s3(s3_url: str) -> bytes:
    """Download file content from S3. Returns bytes."""
    s3 = get_s3_client()
    parts = s3_url.replace("s3://", "").split("/", 1)
    bucket = parts[0]
    key = parts[1]
    response = s3.get_object(Bucket=bucket, Key=key)
    return response["Body"].read()


def get_presigned_url(s3_url: str, expiration=3600) -> str:
    """Generate presigned URL for S3 object (if needed for download)."""
    s3 = get_s3_client()
    # s3_url format: s3://bucket/key
    parts = s3_url.replace("s3://", "").split("/", 1)
    bucket = parts[0]
    key = parts[1]
    return s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": bucket, "Key": key},
        ExpiresIn=expiration,
    )


def delete_from_s3(s3_url: str) -> bool:
    """
    Delete object from S3. s3_url format: s3://bucket/key.
    Returns True if deleted (or already absent), False on error.
    """
    if not s3_url or not s3_url.startswith("s3://"):
        return False
    try:
        s3 = get_s3_client()
        parts = s3_url.replace("s3://", "").split("/", 1)
        if len(parts) != 2:
            return False
        bucket, key = parts[0], parts[1]
        s3.delete_object(Bucket=bucket, Key=key)
        return True
    except ClientError:
        return False
