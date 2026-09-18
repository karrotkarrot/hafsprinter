-- ==============================================================================
-- Hafsprinter: Supabase Database Schema & Storage Setup
-- Run this in your Supabase Dashboard SQL Editor
-- ==============================================================================

-- 1. Create the 'jobs' table
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  file_url text not null,
  storage_path text,
  status text not null default 'pending' check (status in ('pending', 'printing', 'completed', 'failed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for fast queue lookups and polling
create index if not exists idx_jobs_status_created on public.jobs(status, created_at asc);

-- 2. Optional: Atomic Claim RPC Function (guarantees zero duplicate prints under concurrency)
create or replace function public.claim_next_job()
returns setof public.jobs as $$
  update public.jobs
  set status = 'printing', updated_at = now()
  where id = (
    select id from public.jobs
    where status = 'pending'
    order by created_at asc
    limit 1
    for update skip locked
  )
  returning *;
$$ language sql;

-- 3. Storage Bucket Setup
-- NOTE: In your Supabase Dashboard, go to 'Storage' -> 'New Bucket':
-- Name: print-jobs
-- Toggle 'Public bucket' to ON (allows the daemon to download PDFs via public URL)
