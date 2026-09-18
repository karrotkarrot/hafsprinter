import fs from 'fs';
import path from 'path';

const DB_FILE = path.join(process.cwd(), 'jobs.json');
const TMP_FILE = path.join(process.cwd(), 'jobs.json.tmp');
const BAK_FILE = path.join(process.cwd(), 'jobs.json.bak');

function initDb() {
  if (!fs.existsSync(DB_FILE)) {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify([], null, 2));
    } catch (error) {
      console.error('Error initializing database file:', error);
    }
  }
}

export function getJobs() {
  initDb();
  try {
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading database file, attempting backup restore:', error);
    if (fs.existsSync(BAK_FILE)) {
      try {
        const bakData = fs.readFileSync(BAK_FILE, 'utf8');
        return JSON.parse(bakData);
      } catch (bakErr) {
        console.error('Error reading backup file:', bakErr);
      }
    }
    return [];
  }
}

export function saveJobs(jobs) {
  initDb();
  try {
    const serialized = JSON.stringify(jobs, null, 2);
    // Write atomically to temporary file first
    fs.writeFileSync(TMP_FILE, serialized, 'utf8');
    // Maintain a backup copy of the last valid database
    if (fs.existsSync(DB_FILE)) {
      try {
        fs.copyFileSync(DB_FILE, BAK_FILE);
      } catch {
        // Backup copy is best-effort
      }
    }
    // Atomic rename to replace DB_FILE
    fs.renameSync(TMP_FILE, DB_FILE);
    return true;
  } catch (error) {
    console.error('Error saving database atomically:', error);
    // Clean up temporary file if left behind
    if (fs.existsSync(TMP_FILE)) {
      try {
        fs.unlinkSync(TMP_FILE);
      } catch {
        // Ignore cleanup error
      }
    }
    return false;
  }
}

export function getJobById(id) {
  const jobs = getJobs();
  return jobs.find(j => j.id === id) || null;
}

export function addJob(filename, filepath) {
  const jobs = getJobs();
  const newJob = {
    id: Math.random().toString(36).substring(2, 11),
    filename,
    filepath,
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  jobs.push(newJob);
  saveJobs(jobs);
  return newJob;
}

export function claimNextPendingJob() {
  const jobs = getJobs();
  const pendingJob = jobs.find(job => job.status === 'pending');
  if (!pendingJob) {
    return null;
  }

  pendingJob.status = 'printing';
  pendingJob.updatedAt = new Date().toISOString();
  saveJobs(jobs);
  return pendingJob;
}

export function updateJobStatus(id, status) {
  const jobs = getJobs();
  const job = jobs.find(j => j.id === id);
  if (!job) {
    return { success: false, reason: 'not_found' };
  }

  // Enforce cancellation lock: a cancelled job cannot transition to other states
  if (job.status === 'cancelled' && status !== 'cancelled') {
    return { success: false, reason: 'cancelled_lock', job };
  }

  job.status = status;
  job.updatedAt = new Date().toISOString();
  saveJobs(jobs);
  return { success: true, job };
}
