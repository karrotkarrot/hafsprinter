import { NextResponse } from 'next/server';
import { getJobs, claimNextPendingJob } from '@/lib/db';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const shouldClaim = searchParams.get('claim') === 'true' || searchParams.get('claim') === '1';

    if (shouldClaim) {
      const claimedJob = claimNextPendingJob();
      return NextResponse.json({ job: claimedJob });
    }

    const jobs = getJobs();
    
    // Find the oldest job that is still 'pending'
    const pendingJob = jobs.find(job => job.status === 'pending');
    
    if (!pendingJob) {
      return NextResponse.json({ job: null });
    }
    
    return NextResponse.json({ job: pendingJob });
  } catch (error) {
    console.error('Polling API error:', error);
    return NextResponse.json({ error: 'Failed to poll jobs' }, { status: 500 });
  }
}
