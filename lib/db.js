import fs from 'fs';
import path from 'path';
import { supabase, isSupabaseConfigured } from './supabase';

const DB_FILE = path.join(process.cwd(), 'jobs.json');
const TMP_FILE = path.join(process.cwd(), 'jobs.json.tmp');
const BAK_FILE = path.join(process.cwd(), 'jobs.json.bak');

function initLocalDb() {
  if (!fs.existsSync(DB_FILE)) {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify([], null, 2));
    } catch (error) {
      console.error('Error initializing database file:', error);
    }
  }
}

function formatJob(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    filename: row.filename,
    filepath: row.file_url || row.filepath,
    file_url: row.file_url || row.filepath,
    storage_path: row.storage_path || null,
    status: row.status,
    createdAt: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt,
  };
}

// Local filesystem helpers
function getLocalJobs() {
  initLocalDb();
  try {
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading local database file, attempting backup restore:', error);
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

function saveLocalJobs(jobs) {
  initLocalDb();
  try {
    const serialized = JSON.stringify(jobs, null, 2);
    fs.writeFileSync(TMP_FILE, serialized, 'utf8');
    if (fs.existsSync(DB_FILE)) {
      try {
        fs.copyFileSync(DB_FILE, BAK_FILE);
      } catch {
        // Backup is best-effort
      }
    }
    fs.renameSync(TMP_FILE, DB_FILE);
    return true;
  } catch (error) {
    console.error('Error saving local database atomically:', error);
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

export async function getJobs() {
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []).map(formatJob);
    } catch (err) {
      console.error('Supabase getJobs error, falling back to local:', err);
    }
  }

  return getLocalJobs().map(formatJob);
}

export async function getJobById(id) {
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data ? formatJob(data) : null;
    } catch (err) {
      console.error('Supabase getJobById error, falling back to local:', err);
    }
  }

  const jobs = getLocalJobs();
  const found = jobs.find(j => String(j.id) === String(id));
  return found ? formatJob(found) : null;
}

export async function addJob(filename, filepath, storagePath = null) {
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from('jobs')
        .insert({
          filename,
          file_url: filepath,
          storage_path: storagePath,
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;
      return formatJob(data);
    } catch (err) {
      console.error('Supabase addJob error, falling back to local:', err);
    }
  }

  const jobs = getLocalJobs();
  const newJob = {
    id: Math.random().toString(36).substring(2, 11),
    filename,
    filepath,
    storage_path: storagePath,
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  jobs.push(newJob);
  saveLocalJobs(jobs);
  return formatJob(newJob);
}

export async function claimNextPendingJob() {
  if (isSupabaseConfigured()) {
    try {
      // 1. Try RPC atomic claim if function exists in Supabase
      const { data: rpcData, error: rpcError } = await supabase.rpc('claim_next_job');
      if (!rpcError && rpcData && rpcData.length > 0) {
        return formatJob(rpcData[0]);
      }

      // 2. Fallback: Optimistic claim
      const { data: pending, error: selectErr } = await supabase
        .from('jobs')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (selectErr || !pending) return null;

      const { data: claimed, error: updateErr } = await supabase
        .from('jobs')
        .update({ status: 'printing', updated_at: new Date().toISOString() })
        .eq('id', pending.id)
        .eq('status', 'pending')
        .select()
        .single();

      if (updateErr || !claimed) return null;
      return formatJob(claimed);
    } catch (err) {
      console.error('Supabase claimNextPendingJob error, falling back to local:', err);
    }
  }

  const jobs = getLocalJobs();
  const pendingJob = jobs.find(job => job.status === 'pending');
  if (!pendingJob) {
    return null;
  }

  pendingJob.status = 'printing';
  pendingJob.updatedAt = new Date().toISOString();
  saveLocalJobs(jobs);
  return formatJob(pendingJob);
}

export async function updateJobStatus(id, status) {
  if (isSupabaseConfigured()) {
    try {
      const { data: current, error: fetchErr } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchErr || !current) {
        return { success: false, reason: 'not_found' };
      }

      // Enforce cancellation lock
      if (current.status === 'cancelled' && status !== 'cancelled') {
        return { success: false, reason: 'cancelled_lock', job: formatJob(current) };
      }

      const { data: updated, error: updateErr } = await supabase
        .from('jobs')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (updateErr) throw updateErr;

      // Free up Supabase storage when job completes or is cancelled to stay within free tier
      if (status === 'completed' || status === 'cancelled') {
        if (current.storage_path) {
          try {
            await supabase.storage.from('print-jobs').remove([current.storage_path]);
          } catch (cleanErr) {
            console.error('Failed to prune storage file:', cleanErr);
          }
        }
      }

      return { success: true, job: formatJob(updated) };
    } catch (err) {
      console.error('Supabase updateJobStatus error, falling back to local:', err);
    }
  }

  const jobs = getLocalJobs();
  const job = jobs.find(j => String(j.id) === String(id));
  if (!job) {
    return { success: false, reason: 'not_found' };
  }

  if (job.status === 'cancelled' && status !== 'cancelled') {
    return { success: false, reason: 'cancelled_lock', job: formatJob(job) };
  }

  job.status = status;
  job.updatedAt = new Date().toISOString();
  saveLocalJobs(jobs);
  return { success: true, job: formatJob(job) };
}
