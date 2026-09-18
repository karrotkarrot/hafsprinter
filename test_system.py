import requests
import sys
import time

SERVER_URL = "http://localhost:3000"

def run_tests():
    print("=== STARTING HAFSPRINTER API VERIFICATION ===")
    
    # 1. Upload Test
    upload_url = f"{SERVER_URL}/api/upload"
    pdf_path = "sample.pdf"
    
    print(f"1. Uploading {pdf_path} to {upload_url}...")
    try:
        with open(pdf_path, 'rb') as f:
            files = {'file': (pdf_path, f, 'application/pdf')}
            r = requests.post(upload_url, files=files)
            
        if r.status_code != 200:
            print(f"FAILED: Upload returned status code {r.status_code}: {r.text}")
            sys.exit(1)
            
        data = r.json()
        if not data.get("success"):
            print(f"FAILED: Upload response was not successful: {data}")
            sys.exit(1)
            
        job_id = data["job"]["id"]
        print(f"SUCCESS: Job created with ID: {job_id}")
        
    except Exception as e:
        print(f"FAILED: Upload error: {e}")
        sys.exit(1)
        
    # 2. List Jobs Test
    list_url = f"{SERVER_URL}/api/jobs"
    print(f"\n2. Fetching job list from {list_url}...")
    try:
        r = requests.get(list_url)
        if r.status_code != 200:
            print(f"FAILED: Get jobs returned status code {r.status_code}")
            sys.exit(1)
            
        jobs = r.json()
        found = any(j["id"] == job_id for j in jobs)
        if not found:
            print(f"FAILED: Uploaded job ID {job_id} not found in list")
            sys.exit(1)
        print("SUCCESS: Job is present in the database queue.")
        
    except Exception as e:
        print(f"FAILED: List jobs error: {e}")
        sys.exit(1)

    # 3. Polling Test
    poll_url = f"{SERVER_URL}/api/jobs/poll"
    print(f"\n3. Polling for next job from {poll_url}...")
    try:
        r = requests.get(poll_url)
        if r.status_code != 200:
            print(f"FAILED: Poll returned status code {r.status_code}")
            sys.exit(1)
            
        poll_data = r.json()
        job = poll_data.get("job")
        if not job or job["id"] != job_id:
            print(f"FAILED: Did not poll the expected job. Got: {job}")
            sys.exit(1)
        print(f"SUCCESS: Polled correct job: {job['filename']} (status: {job['status']})")
        
    except Exception as e:
        print(f"FAILED: Polling error: {e}")
        sys.exit(1)

    # 4. Status Update (printing) Test
    update_url = f"{SERVER_URL}/api/jobs/update"
    print(f"\n4. Updating job status to 'printing' at {update_url}...")
    try:
        r = requests.post(update_url, json={"id": job_id, "status": "printing"})
        if r.status_code != 200:
            print(f"FAILED: Update status returned status code {r.status_code}")
            sys.exit(1)
            
        update_data = r.json()
        if not update_data.get("success") or update_data["job"]["status"] != "printing":
            print(f"FAILED: Status did not update to 'printing'. Got: {update_data}")
            sys.exit(1)
        print("SUCCESS: Job status is now 'printing'.")
        
    except Exception as e:
        print(f"FAILED: Update printing error: {e}")
        sys.exit(1)

    # 5. Status Update (completed) Test
    print(f"\n5. Updating job status to 'completed'...")
    try:
        r = requests.post(update_url, json={"id": job_id, "status": "completed"})
        if r.status_code != 200:
            print(f"FAILED: Update status returned status code {r.status_code}")
            sys.exit(1)
            
        update_data = r.json()
        if not update_data.get("success") or update_data["job"]["status"] != "completed":
            print(f"FAILED: Status did not update to 'completed'. Got: {update_data}")
            sys.exit(1)
        print("SUCCESS: Job status is now 'completed'.")
        
    except Exception as e:
        print(f"FAILED: Update completed error: {e}")
        sys.exit(1)

    print("\n=== ALL API VERIFICATION TESTS PASSED SUCCESSFULLY ===")

if __name__ == "__main__":
    # Give the dev server another second to make sure it's fully up
    time.sleep(1)
    run_tests()
