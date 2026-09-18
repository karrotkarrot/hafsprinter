import requests
import sys
import time

SERVER_URL = "http://localhost:3000"

def test_cancel():
    print("=== STARTING CANCELLATION LOGIC TESTS ===")
    
    # 1. Upload sample PDF
    upload_url = f"{SERVER_URL}/api/upload"
    pdf_path = "sample.pdf"
    
    print("Uploading test job...")
    with open(pdf_path, 'rb') as f:
        files = {'file': (pdf_path, f, 'application/pdf')}
        r = requests.post(upload_url, files=files)
    
    if r.status_code != 200:
        print("FAILED: Upload failed")
        sys.exit(1)
        
    job = r.json()["job"]
    job_id = job["id"]
    print(f"Uploaded job {job_id}. Current status: {job['status']}")
    
    # 2. Cancel the job
    update_url = f"{SERVER_URL}/api/jobs/update"
    
    print(f"Cancelling job {job_id}...")
    r = requests.post(update_url, json={"id": job_id, "status": "cancelled"})
    if r.status_code != 200:
        print(f"FAILED: Cancel request failed with {r.status_code}: {r.text}")
        sys.exit(1)
        
    updated_job = r.json()["job"]
    if updated_job["status"] != "cancelled":
        print(f"FAILED: Status is not 'cancelled'. Got: {updated_job['status']}")
        sys.exit(1)
    print("SUCCESS: Job status is 'cancelled'.")
    
    # 3. Test cancellation lock (Try updating to 'printing' - should fail)
    print("Attempting to hijack cancelled job to 'printing' (should be blocked by server)...")
    r = requests.post(update_url, json={"id": job_id, "status": "printing"})
    if r.status_code == 200:
        print(f"FAILED: Server allowed transitioning cancelled job to printing. Job: {r.json()}")
        sys.exit(1)
        
    print(f"SUCCESS: Server correctly rejected update. Response status code: {r.status_code} (body: {r.json().get('error')})")
    print("\n=== CANCELLATION TESTS PASSED SUCCESSFULLY ===")

if __name__ == "__main__":
    test_cancel()
