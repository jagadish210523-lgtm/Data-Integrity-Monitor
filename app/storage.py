import os
import boto3
from botocore.exceptions import ClientError

TIGRIS_ENDPOINT = os.getenv("TIGRIS_ENDPOINT_URL")
TIGRIS_REGION = os.getenv("TIGRIS_REGION")
TIGRIS_BUCKET = os.getenv("TIGRIS_BUCKET_NAME")

s3_client = boto3.client(
    "s3",
    endpoint_url=TIGRIS_ENDPOINT,
    aws_access_key_id=os.getenv("TIGRIS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("TIGRIS_SECRET_ACCESS_KEY"),
    region_name=TIGRIS_REGION
)


def upload_file(file_content: bytes, object_key: str):
    s3_client.put_object(
        Bucket=TIGRIS_BUCKET,
        Key=object_key,
        Body=file_content
    )


def download_file(object_key: str):
    response = s3_client.get_object(
        Bucket=TIGRIS_BUCKET,
        Key=object_key
    )
    return response["Body"].read()


def delete_file(object_key: str):
    s3_client.delete_object(
        Bucket=TIGRIS_BUCKET,
        Key=object_key
    )
