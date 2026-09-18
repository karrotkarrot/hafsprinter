import os
import time
import tempfile
import requests
import sys
import argparse

# Try importing Windows libraries
IS_WINDOWS = sys.platform.startswith("win")
if IS_WINDOWS:
    try:
        import win32api
        import win32print
    except ImportError:
        print("Warning: win32api/win32print libraries not installed. Please run: pip install pywin32")
        IS_WINDOWS = False

def poll_job(server_url, claim=True):
    """Poll for the next job, optionally claiming it atomically."""
    endpoint = "/api/jobs/poll?claim=true" if claim else "/api/jobs/poll"
    url = f"{server_url.rstrip('/')}{endpoint}"
    response = requests.get(url, timeout=5)
    if response.status_code == 200:
        return response.json().get("job")
    return None

def is_job_cancelled(server_url, job_id):
    """Check if the job was cancelled by user while downloading or preparing."""
    try:
        url = f"{server_url.rstrip('/')}/api/jobs"
        response = requests.get(url, timeout=5)
        if response.status_code == 200:
            for j in response.json():
                if j.get("id") == job_id:
                    return j.get("status") == "cancelled"
    except Exception as e:
        print(f"Warning: Could not verify job status before printing: {e}")
    return False

def update_job_status(server_url, job_id, status):
    """Update job status on the server."""
    url = f"{server_url.rstrip('/')}/api/jobs/update"
    try:
        response = requests.post(url, json={"id": job_id, "status": status}, timeout=5)
        if response.status_code == 200:
            print(f"[{time.strftime('%X')}] Job {job_id} status updated to: {status}")
            return True
        elif response.status_code == 409:
            print(f"[{time.strftime('%X')}] Job {job_id} was already cancelled on server (locked).")
            return False
        else:
            print(f"Error updating job {job_id} (HTTP {response.status_code}): {response.text}")
    except Exception as e:
        print(f"Failed to update status for {job_id}: {e}")
    return False

import subprocess
import shutil

def find_sumatra_pdf():
    """Locate SumatraPDF executable if available."""
    # 1. Check current directory
    local_path = os.path.join(os.getcwd(), "SumatraPDF.exe")
    if os.path.isfile(local_path):
        return local_path

    # 2. Check directory where daemon.py lives
    script_dir = os.path.dirname(os.path.abspath(__file__))
    script_path = os.path.join(script_dir, "SumatraPDF.exe")
    if os.path.isfile(script_path):
        return script_path

    # 3. Check system PATH
    which_path = shutil.which("SumatraPDF.exe") or shutil.which("SumatraPDF")
    if which_path:
        return which_path

    # 4. Check common Windows installation paths
    for p in [
        r"C:\Program Files\SumatraPDF\SumatraPDF.exe",
        r"C:\Program Files (x86)\SumatraPDF\SumatraPDF.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\SumatraPDF\SumatraPDF.exe"),
    ]:
        if os.path.isfile(p):
            return p

    return None

def print_pdf(filepath):
    """Send PDF to physical printer on Windows or simulate on non-Windows."""
    if IS_WINDOWS:
        sumatra_exe = find_sumatra_pdf()
        if sumatra_exe:
            print(f"Printing silently via SumatraPDF ({sumatra_exe})...")
            # -print-to-default prints to Windows default printer without GUI
            # -silent suppresses dialogs and error windows
            subprocess.run([sumatra_exe, "-print-to-default", "-silent", filepath], check=True)
            time.sleep(2)
            print("Document dispatched to printer spooler successfully.")
            return

        print(f"Sending to default printer via Windows Shell API...")
        # ShellExecute with 'print' verb sends the document to default associated PDF handler and printer
        win32api.ShellExecute(0, "print", filepath, None, ".", 0)
        # Give Windows spooler a few seconds to process before cleaning up file
        time.sleep(3)
    else:
        # Fallback simulation for non-Windows local testing
        print("[MOCK PRINTING] Simulating physical print job on non-Windows environment...")
        time.sleep(3)
        print("[MOCK PRINTING] Print job completed successfully.")

def download_file(url, local_path):
    """Download PDF file from web server."""
    response = requests.get(url, stream=True, timeout=30)
    response.raise_for_status()
    with open(local_path, "wb") as f:
        for chunk in response.iter_content(chunk_size=8192):
            f.write(chunk)

def main():
    parser = argparse.ArgumentParser(description="Hafsprinter - Windows Printer Daemon")
    parser.add_argument(
        "--server", 
        default=os.getenv("SERVER_URL", "http://localhost:3000"),
        help="Hafsprinter Web Server URL (default: http://localhost:3000)"
    )
    parser.add_argument(
        "--interval", 
        type=float, 
        default=float(os.getenv("POLL_INTERVAL", "3")),
        help="Polling interval in seconds (default: 3.0)"
    )
    parser.add_argument(
        "--no-claim", 
        action="store_true",
        help="Disable atomic claiming during poll (legacy mode)"
    )
    args = parser.parse_args()

    server_url = args.server
    poll_interval = args.interval
    atomic_claim = not args.no_claim

    print("=" * 60)
    print(" HAFSPRINTER - Windows Printer Daemon ")
    print("=" * 60)
    print(f"Server URL:       {server_url}")
    print(f"Polling Rate:     Every {poll_interval}s")
    print(f"Atomic Claiming:  {'Enabled' if atomic_claim else 'Disabled'}")
    print(f"Operating System: {sys.platform} (Windows Mode: {IS_WINDOWS})")
    print("Daemon is running. Press Ctrl+C to exit.\n")

    current_interval = poll_interval
    connection_failed = False

    while True:
        try:
            job = poll_job(server_url, claim=atomic_claim)
            if connection_failed:
                print(f"[{time.strftime('%X')}] Reconnected to web server.")
                connection_failed = False
                current_interval = poll_interval

            if job:
                job_id = job["id"]
                filename = job.get("filename", "document.pdf")
                raw_path = job.get("file_url") or job.get("filepath") or ""
                if raw_path.startswith("http://") or raw_path.startswith("https://"):
                    file_url = raw_path
                else:
                    file_url = f"{server_url.rstrip('/')}{raw_path}"

                print(f"[{time.strftime('%X')}] Processing job: {filename} (ID: {job_id})")

                # If atomic claim was disabled, claim it manually now
                if not atomic_claim:
                    if not update_job_status(server_url, job_id, "printing"):
                        time.sleep(poll_interval)
                        continue

                # Download PDF to temp file
                temp_pdf_path = None
                try:
                    _, ext = os.path.splitext(filename)
                    if not ext or len(ext) > 5:
                        ext = ".pdf"

                    fd, temp_pdf_path = tempfile.mkstemp(suffix=ext, prefix="print_job_")
                    os.close(fd)

                    print(f"Downloading PDF from {file_url}...")
                    download_file(file_url, temp_pdf_path)

                    # Verify job was not cancelled while downloading
                    if is_job_cancelled(server_url, job_id):
                        print(f"[{time.strftime('%X')}] Job {job_id} was cancelled by user. Skipping print.")
                        continue

                    # Trigger print
                    print_pdf(temp_pdf_path)

                    # Final cancellation check before marking completed
                    if is_job_cancelled(server_url, job_id):
                        print(f"[{time.strftime('%X')}] Job {job_id} was cancelled during print cycle.")
                        continue

                    # Update status to 'completed'
                    update_job_status(server_url, job_id, "completed")

                except Exception as e:
                    print(f"Error processing print job: {e}")
                    update_job_status(server_url, job_id, "failed")
                finally:
                    if temp_pdf_path and os.path.exists(temp_pdf_path):
                        try:
                            os.remove(temp_pdf_path)
                        except Exception as clean_err:
                            print(f"Warning: could not delete temp file {temp_pdf_path}: {clean_err}")

        except requests.exceptions.RequestException as e:
            if not connection_failed:
                print(f"[{time.strftime('%X')}] Connection error to web server: {e}")
                connection_failed = True
            # Exponential backoff up to 30 seconds
            current_interval = min(current_interval * 1.5, 30.0)

        except Exception as e:
            print(f"[{time.strftime('%X')}] Unexpected daemon loop error: {e}")

        time.sleep(current_interval)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nDaemon stopped by user. Exiting.")
        sys.exit(0)
