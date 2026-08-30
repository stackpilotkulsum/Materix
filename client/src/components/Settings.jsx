import React, { useState, useEffect } from 'react';
import { Activity, Clock, FileArchive, FileCheck2, HardDrive, Lock, ShieldAlert, ShieldCheck, UploadCloud } from 'lucide-react';
import api from '../api';

const Settings = () => {
  const [stats, setStats] = useState({ totalFiles: 0, totalSize: 0 });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const token = localStorage.getItem('material_token');
        const response = await api.get('/api/files', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const files = response.data;
        const totalSize = files.reduce((acc, file) => acc + file.size, 0);
        setStats({ totalFiles: files.length, totalSize });
      } catch (error) {
        console.error('Error fetching stats:', error);
      }
    };
    fetchStats();
  }, []);

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const uploadRules = [
    { icon: FileCheck2, label: 'Allowed files', value: 'PDF, DOCX, ZIP' },
    { icon: HardDrive, label: 'Max file size', value: '10 MB per file' },
    { icon: Activity, label: 'Upload limit', value: '20 requests/min' },
    { icon: Clock, label: 'Session timeout', value: '1 minute' }
  ];

  const securityModules = [
    {
      icon: ShieldAlert,
      title: 'Deep Binary Inspection',
      text: 'Uploads are checked by file signature, so executables disguised as documents are blocked.'
    },
    {
      icon: Lock,
      title: 'Private Storage Names',
      text: 'Uploaded files are saved with UUID names. Your original filenames stay in protected metadata.'
    },
    {
      icon: FileArchive,
      title: 'ZIP Handling',
      text: 'ZIP files are unpacked and only supported PDF or DOCX files are accepted for storage.'
    }
  ];

  return (
    <section className="settings-container">
      <header className="settings-header">
        <div className="settings-header-icon">
          <ShieldCheck size={28} />
        </div>
        <div>
          <h2>Settings</h2>
          <p>Your account storage and active upload protection rules.</p>
        </div>
      </header>

      <div className="settings-stats">
        <article className="settings-stat">
          <div className="settings-stat-icon">
            <UploadCloud size={26} />
          </div>
          <div>
            <strong>{stats.totalFiles}</strong>
            <span>Your uploaded files</span>
          </div>
        </article>
        <article className="settings-stat">
          <div className="settings-stat-icon">
            <HardDrive size={26} />
          </div>
          <div>
            <strong>{formatSize(stats.totalSize)}</strong>
            <span>Storage used by your account</span>
          </div>
        </article>
      </div>

      <div className="settings-panel">
        <div className="settings-panel-heading">
          <h3>Upload Settings</h3>
          <span>Visible rules for every upload</span>
        </div>
        <div className="upload-settings-grid">
          {uploadRules.map(({ icon: Icon, label, value }) => (
            <article className="upload-setting-card" key={label}>
              <Icon size={22} />
              <span>{label}</span>
              <strong>{value}</strong>
            </article>
          ))}
        </div>
      </div>

      <div className="settings-panel">
        <div className="settings-panel-heading">
          <h3>Security Modules</h3>
          <span>Currently active</span>
        </div>
        <div className="settings-grid">
          {securityModules.map(({ icon: Icon, title, text }) => (
            <article className="settings-card" key={title}>
              <div className="settings-card-title">
                <Icon size={21} />
                <h4>{title}</h4>
                <span>Active</span>
              </div>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Settings;
