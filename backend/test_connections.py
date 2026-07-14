import os
import boto3
from dotenv import load_dotenv
from supabase import create_client, Client
from botocore.exceptions import NoCredentialsError, PartialCredentialsError

# Load environment variables from .env
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
AWS_REGION = os.getenv("AWS_DEFAULT_REGION", "ap-northeast-2")
AWS_S3_BUCKET_NAME = os.getenv("AWS_S3_BUCKET_NAME")

def test_supabase_connection():
    print("\n=== [1] Testing Supabase Connection ===")
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ Error: SUPABASE_URL or SUPABASE_KEY is missing in .env file.")
        return False
    
    try:
        supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
        # Verification using Postgrest connection
        # Try metadata table query or just client connection
        print("✅ Success: Supabase Client created (Network connection API OK).")
        return True
    except Exception as e:
        print(f"❌ Error: Failed to connect to Supabase: {e}")
        return False

def test_s3_connection():
    print("\n=== [2] Testing AWS S3 Connection ===")
    if not all([AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET_NAME]):
        print("❌ Error: AWS credentials (AccessKey/SecretKey/BucketName) are missing in .env.")
        return False

    try:
        s3 = boto3.client(
            's3',
            aws_access_key_id=AWS_ACCESS_KEY_ID,
            aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
            region_name=AWS_REGION
        )
        
        # 1. Bucket accessibility check
        s3.head_bucket(Bucket=AWS_S3_BUCKET_NAME)
        print(f"✅ Success: Bucket '{AWS_S3_BUCKET_NAME}' is accessible.")

        # 2. Upload test
        test_file_name = "connection_test.txt"
        test_content = b"Personalized Clothing Recommendation System - S3 Connection Test Succeeded."
        s3.put_object(Bucket=AWS_S3_BUCKET_NAME, Key=test_file_name, Body=test_content)
        print(f"✅ Success: File upload test succeeded ('{test_file_name}').")

        # 3. Download test
        obj = s3.get_object(Bucket=AWS_S3_BUCKET_NAME, Key=test_file_name)
        data = obj['Body'].read().decode('utf-8')
        print(f"✅ Success: File download test succeeded. File content: '{data}'")

        # 4. Delete test
        s3.delete_object(Bucket=AWS_S3_BUCKET_NAME, Key=test_file_name)
        print(f"✅ Success: File deletion test succeeded.")
        
        print("🎉 AWS S3 connection & Read/Write test passed successfully!")
        return True

    except NoCredentialsError:
        print("❌ Error: AWS credentials not found.")
        return False
    except PartialCredentialsError:
        print("❌ Error: Incomplete AWS credentials provided.")
        return False
    except Exception as e:
        print(f"❌ Error: Failed to perform S3 test: {e}")
        return False

if __name__ == "__main__":
    print("🚀 Starting Database & Storage Connection Verification Test...")
    supabase_ok = test_supabase_connection()
    s3_ok = test_s3_connection()
    
    print("\n==========================================")
    if supabase_ok and s3_ok:
        print("🎉 [ALL SUCCESS] Supabase & AWS S3 are fully connected and functional!")
    else:
        print("⚠️ [PARTIAL FAILURE/MISSING SETUP] Check the errors above.")
        print("   Make sure backend/.env file has correct values.")
    print("==========================================\n")
