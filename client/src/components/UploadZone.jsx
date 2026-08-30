import { useState, useRef } from 'react';
import { File, Folder, CloudUpload, X, CheckCircle, AlertCircle, ArrowRight } from 'lucide-react';
import api from '../api';

const UploadZone = ({ onUploadSuccess }) => {
  const [mode, setMode] = useState('file'); // 'file' or 'folder'
  const [files, setFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toasts, setToasts] = useState([]);
  
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  const addToast = (message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000); // Increased to 5 seconds
  };

  const handleFileChange = (e) => {
    const newFiles = Array.from(e.target.files);
    processFiles(newFiles);
  };

  const processFiles = (newFiles) => {
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    const allowedTypes = ['pdf', 'docx', 'txt', 'zip', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp'];
    
    const validFiles = [];
    const skippedFiles = [];

    newFiles.forEach(file => {
      const ext = file.name.split('.').pop().toLowerCase();
      const isValidType = allowedTypes.includes(ext);
      const isValidSize = file.size <= MAX_SIZE;
      const isNotEmpty = file.size > 0;

      if (isValidType && isValidSize && isNotEmpty) {
        validFiles.push(file);
      } else {
        let reason = !isValidType ? 'unsupported format' : (!isNotEmpty ? 'file is empty' : 'too large (max 10MB)');
        skippedFiles.push(`${file.name} (${reason})`);
      }
    });

    if (skippedFiles.length > 0) {
      addToast(`Skipped ${skippedFiles.length} files: ${skippedFiles.join(', ')}`, 'error');
    }

    setFiles(prev => [...prev, ...validFiles.map(f => ({
      file: f,
      progress: 0,
      status: 'ready'
    }))]);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    processFiles(Array.from(e.dataTransfer.files));
  };

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const uploadFiles = async () => {
    if (files.length === 0) return;
    setUploading(true);

    try {
      const formData = new FormData();
      files.forEach(f => {
        formData.append('materials', f.file);
        formData.append('paths', f.file.webkitRelativePath || f.file.name);
      });

      const token = localStorage.getItem('material_token');
      
      const response = await api.post('/api/upload', formData, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setFiles(prev => prev.map(f => ({ ...f, progress: percentCompleted })));
        }
      });

      const { message, details } = response.data;
      
      if (details) {
        // There were errors - show detailed message
        addToast(`${message}: ${details}`, 'error');
      } else {
        // Success
        addToast(message || 'Files uploaded successfully!', 'success');
      }
      
      setFiles([]);
      if (onUploadSuccess) onUploadSuccess();
    } catch (error) {
      console.error('Upload error:', error);
      const errorMsg = error.response?.data?.details || error.response?.data?.message || 'Failed to upload files. Please try again.';
      addToast(errorMsg, 'error');
      setFiles(prev => prev.map(f => ({ ...f, progress: 0 })));
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className="upload-container">
      <div className="upload-card">
        <div className="toggle-container">
          <button 
            className={`toggle-btn ${mode === 'file' ? 'active' : ''}`}
            onClick={() => setMode('file')}
          >
            <File size={18} /> Single Files
          </button>
          <button 
            className={`toggle-btn ${mode === 'folder' ? 'active' : ''}`}
            onClick={() => setMode('folder')}
          >
            <Folder size={18} /> Full Folder
          </button>
        </div>

        <div 
          className={`drop-zone ${isDragging ? 'drag-over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          onClick={() => mode === 'file' ? fileInputRef.current.click() : folderInputRef.current.click()}
        >
          <input 
            type="file" 
            ref={fileInputRef} 
            hidden 
            multiple 
            onChange={handleFileChange}
          />
          <input 
            type="file" 
            ref={folderInputRef} 
            hidden 
            webkitdirectory="true" 
            directory="true" 
            multiple 
            onChange={handleFileChange}
          />
          
          <div className="drop-content">
            <div className="icon-circle">
              <CloudUpload size={32} />
            </div>
            <h3>Drag & drop materials here</h3>
            <p>or <span className="browse-btn">browse files</span></p>
            <span className="file-limit">Supports PDF, DOCX, TXT, ZIP, and Images (PNG, JPG, WEBP, GIF, SVG, BMP)</span>
          </div>
        </div>

        {files.length > 0 && (
          <div className="file-list-section">
            <div className="section-header">
              <h4>Selected Files</h4>
              <span>{files.length} items</span>
            </div>
            <div className="file-list">
              {files.map((f, i) => (
                <div key={i} className="file-item">
                  <div className="file-icon">
                    <File size={20} />
                  </div>
                  <div className="file-info">
                    <span className="file-name" style={{ fontSize: '0.9rem', fontWeight: 600 }}>{f.file.name}</span>
                    <div className="progress-bar-container">
                      <div className="progress-bar" style={{ width: `${f.progress}%` }}></div>
                    </div>
                  </div>
                  <button className="remove-btn" onClick={(e) => { e.stopPropagation(); removeFile(i); }}>
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
            <div className="upload-actions">
              <button className="btn-secondary" onClick={() => setFiles([])} disabled={uploading}>Clear</button>
              <button className="btn-primary" onClick={uploadFiles} disabled={uploading}>
                {uploading ? 'Uploading...' : 'Upload Now'} <ArrowRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.type === 'success' ? <CheckCircle size={20} color="#10b981" /> : <AlertCircle size={20} color="#ef4444" />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </section>
  );
};

export default UploadZone;
