import { NextResponse } from 'next/server';
import { updateJobStatus } from '@/lib/db';

export async function POST(req) {
  try {
    const body = await req.json();
    const { id, status } = body;
    
    if (!id || !status) {
      return NextResponse.json({ error: 'Missing id or status' }, { status: 400 });
    }
    
    const validStatuses = ['pending', 'printing', 'completed', 'failed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid status value' }, { status: 400 });
    }
    
    const result = updateJobStatus(id, status);
    
    if (!result.success) {
      if (result.reason === 'cancelled_lock') {
        return NextResponse.json(
          { error: 'Cannot modify a cancelled job', job: result.job }, 
          { status: 409 }
        );
      }
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
    
    return NextResponse.json({ success: true, job: result.job });
  } catch (error) {
    console.error('Update job status API error:', error);
    return NextResponse.json({ error: 'Failed to update job status' }, { status: 500 });
  }
}
