# Hafsprinter 🖨️

A streamlined, self-hosted PDF Cloud & Network Print Queue portal. Hafsprinter allows users to upload PDF documents via a modern web interface and automatically dispatches them to a physical printer connected to a host machine running the background Python daemon.

---

## 🌟 Architecture Overview

```
[ User Browser ]
       |  (1. Drag & Drop PDF upload)
       v
[ Next.js Web Portal ]  <====>  [ jobs.json (Atomic Storage) + public/uploads/ ]
       ^
       |  (2. Atomic Polling & Claiming: GET /api/jobs/poll?claim=true)
       |  (3. Pre-print cancellation check)
       |  (4. Download file to temp storage)
       v
[ daemon.py (Printer Host) ]
       |  (5. Windows Shell Spooler)
       v
[ Physical Printer ]
```

---

## 🚀 Quick Start

### 1. Web Portal Setup

**Prerequisites:** Node.js 18+ (tested on Node.js 20+ with Next.js 16).

```bash
# Install dependencies
npm install

# Run the development server
npm run dev

# Or build and run for production
npm run build
npm run start
```

The web portal will be accessible at: `http://localhost:3000`

### 2. Printer Daemon Setup (Host Machine)

The daemon runs on the machine physically connected (or networked) to your default printer.

**Prerequisites:** Python 3.8+

```bash
# Install Python requirements
pip install -r requirements.txt
```

> **Note for Windows Users:**
> Ensure `pywin32` is installed (`pip install pywin32`) so the daemon can invoke the Windows Print Spooler via `win32api`.

**Running the Daemon:**

```bash
# Run with default settings (server: http://localhost:3000, interval: 3s)
python daemon.py

# Or specify a custom server address and polling rate:
python daemon.py --server http://192.168.1.100:3000 --interval 2.5
```

Available daemon CLI options:
* `--server <URL>`: Address of the Hafsprinter web server (can also be set via `SERVER_URL` env variable).
* `--interval <SECONDS>`: Polling interval in seconds (default: `3.0`, can also be set via `POLL_INTERVAL` env variable).
* `--no-claim`: Run in legacy non-atomic polling mode.

---

## 📡 API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/upload` | Uploads a `.pdf` file (max 50MB, validates `%PDF-` magic bytes, safe Unicode handling). |
| `GET` | `/api/jobs` | Returns the list of all queued jobs in reverse chronological order. |
| `GET` | `/api/jobs/poll` | Polls the oldest pending job. Add `?claim=true` for atomic claiming. |
| `POST` | `/api/jobs/update` | Updates a job's status (`pending`, `printing`, `completed`, `failed`, `cancelled`). Prevents updating cancelled jobs (returns `409 Conflict`). |

---

## 🔒 Reliability & Safety Features

* **Atomic File Writes**: `jobs.json` writes to a temporary file before performing an atomic rename to eliminate database corruption risks.
* **Automatic Backup Recovery**: Keeps a `jobs.json.bak` copy to automatically recover in case of unexpected corruption.
* **Atomic Job Claiming**: Prevents multiple printer daemons from grabbing the same job simultaneously.
* **Cancellation Lock**: Once a job is cancelled, neither the daemon nor any client can revert it to active status.
* **Pre-Print Cancellation Check**: The daemon verifies job status after downloading to ensure no cancelled document is printed.
* **Multilingual Unicode Preservation**: Safely preserves Korean, CJK, and international characters in filenames while filtering unsafe filesystem path characters.
* **Magic Bytes & Size Verification**: Validates `%PDF-` header and limits file uploads to 50MB.
