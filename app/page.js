'use client';

import { useState, useEffect, useRef } from 'react';

export default function Home() {
  const [jobs, setJobs] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const fileInputRef = useRef(null);

  // Fetch jobs list from API
  const fetchJobs = async () => {
    try {
      const res = await fetch('/api/jobs');
      if (res.ok) {
        const data = await res.json();
        setJobs(data);
      }
    } catch (err) {
      console.error('Error fetching jobs:', err);
    }
  };

  // Poll for queue status updates every 2 seconds
  useEffect(() => {
    let isCancelled = false;

    const poll = async () => {
      try {
        const res = await fetch('/api/jobs');
        if (res.ok && !isCancelled) {
          const data = await res.json();
          setJobs(data);
        }
      } catch (err) {
        console.error('Error polling jobs:', err);
      }
    };

    poll();
    const interval = setInterval(poll, 2000);

    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Display status notifications
  const showMessage = (text, type) => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: '', type: '' }), 5000);
  };

  // Handle PDF file upload
  const handleUpload = async (file) => {
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      showMessage('Please upload PDF files only.', 'error');
      return;
    }

    setUploading(true);
    setUploadProgress(20);

    const formData = new FormData();
    formData.append('file', file);

    try {
      setUploadProgress(50);
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      setUploadProgress(90);
      const data = await res.json();

      if (res.ok) {
        showMessage(`"${file.name}" added to printer queue!`, 'success');
        fetchJobs();
      } else {
        showMessage(data.error || 'Failed to upload file.', 'error');
      }
    } catch (err) {
      console.error('Upload error:', err);
      showMessage('Network error. Failed to upload file.', 'error');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // Cancel a print job with user confirmation
  const handleCancelJob = async (id, filename) => {
    const confirmed = window.confirm(`Are you sure you want to cancel the print job "${filename || id}"?`);
    if (!confirmed) return;

    try {
      const res = await fetch('/api/jobs/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id, status: 'cancelled' }),
      });

      if (res.ok) {
        showMessage('Job cancelled successfully.', 'success');
        fetchJobs();
      } else {
        const data = await res.json();
        showMessage(data.error || 'Failed to cancel job.', 'error');
      }
    } catch (err) {
      console.error('Cancel error:', err);
      showMessage('Network error. Failed to cancel job.', 'error');
    }
  };

  const onDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleUpload(files[0]);
    }
  };

  const onFileChange = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleUpload(files[0]);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="container">
      {/* Header */}
      <header className="header">
        <h1 className="logo-text">Hafsprinter</h1>
        <p className="subtitle">Sleek PDF Upload Portal & Printer Daemon Queue</p>
      </header>

      {/* Main Glassmorphic Card for Upload */}
      <section className="card">
        <div 
          className={`upload-area ${isDragging ? 'dragging' : ''}`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={triggerFileInput}
        >
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={onFileChange} 
            accept=".pdf" 
            className="file-input"
          />
          <div className="upload-icon">📄</div>
          <h3 className="upload-title">
            {uploading ? 'Uploading PDF...' : 'Drag & drop your PDF file here'}
          </h3>
          <p className="upload-sub">or click to browse local files</p>

          {uploading && (
            <div className="progress-bar-container">
              <div className="progress-bar" style={{ width: `${uploadProgress}%` }}></div>
            </div>
          )}
        </div>

        {/* Notifications */}
        {message.text && (
          <div style={{
            marginTop: '1.25rem',
            padding: '1rem',
            borderRadius: '0.5rem',
            fontSize: '0.9rem',
            fontWeight: '500',
            textAlign: 'center',
            backgroundColor: message.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            border: `1px solid ${message.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
            color: message.type === 'success' ? '#34d399' : '#f87171',
            animation: 'pulse-blue 2s infinite'
          }}>
            {message.text}
          </div>
        )}
      </section>

      {/* Queue Card */}
      <section className="card">
        <div className="queue-header">
          <h2 className="queue-title">Print Queue</h2>
          <span className="job-count">
            {jobs.length} {jobs.length === 1 ? 'Job' : 'Jobs'} Total
          </span>
        </div>

        {jobs.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">🖨️</span>
            <p>Queue is currently empty.</p>
            <p style={{ fontSize: '0.8rem', color: '#4b5563' }}>Upload a PDF above to print.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="queue-table">
              <thead>
                <tr>
                  <th>Document Name</th>
                  <th>Submitted At</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id}>
                    <td>
                      <div className="filename-cell">
                        <span className="pdf-icon">PDF</span>
                        <span>{job.filename}</span>
                      </div>
                    </td>
                    <td>
                      {new Date(job.createdAt).toLocaleTimeString([], { 
                        hour: '2-digit', 
                        minute: '2-digit', 
                        second: '2-digit' 
                      })}
                    </td>
                    <td>
                      <span className={`badge ${job.status}`}>
                        <span className="status-dot"></span>
                        {job.status}
                      </span>
                    </td>
                    <td>
                      {(job.status === 'pending' || job.status === 'printing') && (
                        <button 
                          onClick={() => handleCancelJob(job.id, job.filename)}
                          className="cancel-btn"
                        >
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
