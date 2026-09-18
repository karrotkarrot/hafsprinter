import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { addJob } from '@/lib/db';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    // Enforce 50MB file size limit
    const MAX_FILE_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File exceeds the maximum allowed size of 50MB' }, 
        { status: 413 }
      );
    }

    if (file.size === 0) {
      return NextResponse.json({ error: 'Uploaded file is empty' }, { status: 400 });
    }

    // Ensure it's a PDF file by extension
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Only PDF files are allowed' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Verify PDF magic bytes (%PDF-)
    if (buffer.length < 5 || buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
      return NextResponse.json(
        { error: 'Invalid file contents. The file does not have a valid PDF header.' }, 
        { status: 400 }
      );
    }

    // Extract base name and sanitize without stripping Unicode characters
    const originalBase = path.basename(file.name).trim();
    const safeBase = originalBase
      .replace(/[/\\?%*:|"<>]/g, '_')
      .replace(/\.{2,}/g, '_')
      .trim();

    // Generate unique filename components
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 7);
    const filename = `${timestamp}_${randomSuffix}_${safeBase || 'document.pdf'}`;

    let fileUrl = `/uploads/${filename}`;
    let storagePath = null;

    if (isSupabaseConfigured()) {
      storagePath = filename;
      const { error: uploadErr } = await supabase.storage
        .from('print-jobs')
        .upload(storagePath, buffer, {
          contentType: 'application/pdf',
          upsert: false,
        });

      if (uploadErr) {
        console.error('Supabase storage upload error:', uploadErr);
        throw uploadErr;
      }

      const { data: publicUrlData } = supabase.storage
        .from('print-jobs')
        .getPublicUrl(storagePath);

      fileUrl = publicUrlData.publicUrl;
    } else {
      // Local filesystem mode
      const uploadDir = path.join(process.cwd(), 'public', 'uploads');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      const filepath = path.join(uploadDir, filename);
      fs.writeFileSync(filepath, buffer);
    }

    // Save to queue database using original filename for clean display
    const job = await addJob(originalBase, fileUrl, storagePath);

    return NextResponse.json({ success: true, job });
  } catch (error) {
    console.error('Upload API error:', error);
    return NextResponse.json({ error: 'Failed to process file upload' }, { status: 500 });
  }
}
