import { NextResponse } from 'next/server';
import { getJobs } from '@/lib/db';

export async function GET() {
  try {
    const jobs = getJobs();
    // Sort jobs descending by date to show the newest at the top
    const sortedJobs = [...jobs].reverse();
    return NextResponse.json(sortedJobs);
  } catch (error) {
    console.error('Error fetching jobs:', error);
    return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 });
  }
}
