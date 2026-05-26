import { useState, useEffect } from 'react';
import { FileText, Download, Calendar, HardDrive, Search, Trash2, X, Folder as FolderIcon, Image as ImageIcon } from 'lucide-react';
import * as XLSX from 'xlsx';
import api from '../api';

const FileHistory = ({ refreshTrigger }) => {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedCard, setExpandedCard] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchFiles = async () => {
    try {
      const token = localStorage.getItem('material_token');
      const response = await api.get('/api/files', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      setFiles(response.data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching files:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadFiles = async () => {
      await fetchFiles();
    };
    loadFiles();
  }, [refreshTrigger]);

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    
    try {
      const token = localStorage.getItem('material_token');
      await api.delete(`/api/files/${id}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      fetchFiles(); // Refresh list
    } catch (error) {
      if (error.response && error.response.status === 404) {
        fetchFiles();
      } else {
        console.error('Error deleting file:', error);
        alert('Failed to delete file.');
      }
    }
  };

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) return <div className="loading">Loading history...</div>;

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredFiles = normalizedSearch
    ? files.filter((file) => {
        const searchableText = [
          file.name,
          file.folder,
          file.fullPath,
          file.extracted?.email,
          file.extracted?.phone,
          file.extracted?.bio
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return searchableText.includes(normalizedSearch);
      })
    : files;

  const singleFiles = filteredFiles.filter(f => !f.folder);
  const folderGroups = filteredFiles.reduce((acc, file) => {
    if (file.folder) {
      if (!acc[file.folder]) acc[file.folder] = [];
      acc[file.folder].push(file);
    }
    return acc;
  }, {});

  const getFileIcon = (filename, url) => {
    if (!filename) return <FileText size={24} />;
    const ext = filename.split('.').pop().toLowerCase();
    const imageExts = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp'];
    if (imageExts.includes(ext)) {
      if (url) {
        return (
          <img 
            src={url} 
            alt={filename} 
            style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px' }} 
            onError={(e) => {
              e.target.onerror = null;
              e.target.style.display = 'none';
            }}
          />
        );
      }
      return <ImageIcon size={24} color="#10b981" />;
    }
    switch (ext) {
      case 'pdf': return <FileText size={24} color="#ef4444" />;
      case 'docx': return <FileText size={24} color="#3b82f6" />;
      case 'txt': return <FileText size={24} color="#64748b" />;
      default: return <FileText size={24} />;
    }
  };

  const exportToExcel = () => {
    if (filteredFiles.length === 0) {
      alert("No data to export!");
      return;
    }

    const exportData = filteredFiles.map(file => {
      let details = {};
      try {
        if (file.extracted?.bio && file.extracted.bio.startsWith('{')) {
          details = JSON.parse(file.extracted.bio);
        } else {
          details = { bio: file.extracted?.bio || '' };
        }
      } catch (e) {
        details = { bio: file.extracted?.bio || '' };
      }

      return {
        "File Name": file.name,
        "Folder": file.folder || "Single Files",
        "Upload Date": formatDate(file.uploadedAt),
        "Size": formatSize(file.size),
        "Name": details.name || "N/A",
        "Email": details.email || file.extracted?.email || "N/A",
        "Phone": details.phone || file.extracted?.phone || "N/A",
        "LinkedIn": details.linkedin || "N/A",
        "GitHub": details.github || "N/A",
        "Portfolio": details.portfolioLink || "N/A",
        "Summary": details.bio || "",
        "Skills": details.skills !== "No specific skills section found." ? details.skills : "",
        "Experience": details.experience !== "No experience section found." ? details.experience : "",
        "Education": details.education !== "No education section found." ? details.education : "",
        "Projects": details.projects !== "No projects section found." ? details.projects : "",
        "Certifications": details.certifications !== "No certifications section found." ? details.certifications : "",
        "Achievements": details.achievements !== "No achievements section found." ? details.achievements : "",
        "Languages": details.languages !== "No languages section found." ? details.languages : "",
        "Extracurricular": details.extracurricular !== "No extra curricular activities section found." ? details.extracurricular : "",
        "Interests": details.interests !== "No interests section found." ? details.interests : "",
        "Raw Text Preview": details.rawTextPreview || ""
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Resumes");

    // Auto-size columns to make them more readable
    const colWidths = [
      { wch: 30 }, // File Name
      { wch: 15 }, // Folder
      { wch: 15 }, // Upload Date
      { wch: 10 }, // Size
      { wch: 20 }, // Name
      { wch: 25 }, // Email
      { wch: 15 }, // Phone
      { wch: 20 }, // LinkedIn
      { wch: 20 }, // GitHub
      { wch: 20 }, // Portfolio
      { wch: 40 }, // Summary
      { wch: 30 }, // Skills
      { wch: 40 }, // Experience
      { wch: 40 }, // Education
      { wch: 40 }, // Projects
      { wch: 30 }, // Certifications
      { wch: 30 }, // Achievements
      { wch: 20 }, // Languages
      { wch: 30 }, // Extracurricular
      { wch: 30 }, // Interests
      { wch: 50 }  // Raw Text Preview
    ];
    worksheet["!cols"] = colWidths;

    XLSX.writeFile(workbook, "materix-extracted-resumes.xlsx");
  };

  const toggleCard = (index) => {
    if (expandedCard === index) {
      setExpandedCard(null);
    } else {
      setExpandedCard(index);
    }
  };

  const renderFileCard = (file, cardKey) => {
    const isExpanded = expandedCard === cardKey;
    const encryptedName = file.url ? file.url.split('/').pop() : 'Unknown';
    const ext = file.name.split('.').pop().toLowerCase();
    const isImage = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp'].includes(ext);

    const getDownloadUrl = (url) => {
      if (!url) return url;
      try {
        const base = api.defaults.baseURL || window.location.origin;
        return new URL(url, base).toString();
      } catch {
        return url;
      }
    };

    return (
      <div key={cardKey} className="history-card" style={{ paddingBottom: isExpanded ? '1.5rem' : '1.5rem' }}>
        <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1rem', cursor: 'pointer' }} onClick={() => toggleCard(cardKey)}>
          <div className="icon-box" style={{ background: '#f8fafc', padding: isImage ? 0 : '10px', overflow: 'hidden', display: 'grid', placeItems: 'center', width: '44px', height: '44px', flexShrink: 0 }}>
            {getFileIcon(file.name, file.url)}
          </div>
          <div className="file-title" style={{ overflow: 'hidden', flex: 1 }}>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={file.fullPath || file.name}>
              {file.name}
            </h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{formatSize(file.size)}</span>
              <span style={{ fontSize: '0.7rem', color: '#10b981', background: '#d1fae5', padding: '2px 6px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '2px', fontWeight: 600 }}>
                ✓ Scanned
              </span>
              {file.extracted && file.extracted.bio !== 'Not supported' && (
                <span style={{ fontSize: '0.7rem', color: '#8b5cf6', background: '#ede9fe', padding: '2px 6px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '2px', fontWeight: 600 }}>
                  ✨ Parsed
                </span>
              )}
            </div>
          </div>
        </div>

        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: '#f8fafc', padding: '6px 10px', borderRadius: '4px', border: '1px dashed #cbd5e1', marginBottom: '1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`Encrypted as: ${encryptedName}`}>
          <span style={{ fontWeight: 600 }}>Encrypted as:</span> {encryptedName}
        </div>

        {isExpanded && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1rem' }}>
            {isImage && file.url && (
              <div className="image-preview-container" style={{ width: '100%', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(22, 32, 31, 0.08)', background: '#1e293b', padding: '8px', display: 'flex', justifyContent: 'center' }}>
                <img 
                  src={file.url} 
                  alt={file.name} 
                  style={{ maxWidth: '100%', maxHeight: '360px', objectFit: 'contain', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }} 
                />
              </div>
            )}
            {file.extracted && (
              <div className="bio-section" style={{ background: '#f8fafc', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid #e2e8f0' }}>
                <h5 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.5rem' }}>
                  {isImage ? 'Material Artifact Details' : 'Applicant Profile'}
                </h5>
                
                {(() => {
                  let details = { bio: file.extracted.bio };
                  try {
                    if (file.extracted.bio && file.extracted.bio.startsWith('{')) {
                      details = JSON.parse(file.extracted.bio);
                    }
                  } catch (e) {}

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}><span style={{ fontWeight: 600, color: 'var(--text-main)' }}>Email:</span> {details.email || file.extracted.email || 'N/A'}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}><span style={{ fontWeight: 600, color: 'var(--text-main)' }}>Phone:</span> {details.phone || file.extracted.phone || 'N/A'}</div>
                      </div>
                      
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>Summary:</span><br />
                        {details.bio || 'No summary extracted.'}
                      </div>

                      {!isImage && details.skills && details.skills !== 'No specific skills section found.' && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>Skills:</span><br />
                          {details.skills}
                        </div>
                      )}

                      {!isImage && details.experience && details.experience !== 'No experience section found.' && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>Experience:</span><br />
                          {details.experience}
                        </div>
                      )}

                      {!isImage && details.education && details.education !== 'No education section found.' && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>Education:</span><br />
                          {details.education}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        <div className="card-footer" style={{ borderTop: '1px solid #f1f5f9', paddingTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
          <div className="date" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-muted)', flex: 1 }}>
            <Calendar size={14} />
            {formatDate(file.uploadedAt)}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
              onClick={(e) => handleDelete(file.id, e)}
              style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: 'none', padding: '6px 10px', borderRadius: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', fontWeight: 600 }}
              title="Delete permanently"
            >
              <Trash2 size={16} /> Delete
            </button>
            <a href={getDownloadUrl(file.url)} download={file.name} target="_blank" rel="noopener noreferrer" className="download-btn" title="Download file">
              <Download size={16} /> Download
            </a>
          </div>
        </div>
      </div>
    )
  };

  return (
    <section className="history-container" style={{ width: '100%', maxWidth: '1000px', margin: '0 auto', padding: '2rem' }}>
      <div className="section-header" style={{ marginBottom: '2.5rem', borderBottom: '2px solid #f1f5f9', paddingBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--text-main)' }}>History & Archives</h2>
          <span style={{ color: 'var(--text-muted)' }}>{files.length} total files stored securely.</span>
        </div>
        <button 
          onClick={exportToExcel}
          style={{ background: '#10b981', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', fontWeight: 600 }}
        >
          <Download size={18} /> Export to Excel
        </button>
      </div>

      {files.length === 0 ? (
        <div className="empty-state" style={{ textAlign: 'center', padding: '4rem', background: '#f8fafc', borderRadius: 'var(--radius-lg)', border: '2px dashed #cbd5e1' }}>
          <HardDrive size={56} style={{ color: '#94a3b8', marginBottom: '1.5rem' }} />
          <h3 style={{ fontSize: '1.2rem', color: 'var(--text-main)', marginBottom: '0.5rem' }}>No uploads found</h3>
          <p style={{ color: 'var(--text-muted)' }}>Your uploaded materials and folders will appear here.</p>
        </div>
      ) : (
        <div className="history-sections">
          <div className="history-search" style={{ position: 'relative', marginBottom: '2rem' }}>
            <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search files, folders, email, phone, or summary"
              style={{ width: '100%', minHeight: '48px', padding: '12px 44px', borderRadius: 'var(--radius-md)', border: '1px solid #e2e8f0', background: '#ffffff', color: 'var(--text-main)', fontSize: '0.95rem', outline: 'none' }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', width: '32px', height: '32px', border: 'none', borderRadius: '50%', background: '#f1f5f9', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            )}
          </div>

          {filteredFiles.length === 0 && (
            <div className="empty-state" style={{ textAlign: 'center', padding: '3rem', background: '#f8fafc', borderRadius: 'var(--radius-lg)', border: '2px dashed #cbd5e1', marginBottom: '2rem' }}>
              <Search size={48} style={{ color: '#94a3b8', marginBottom: '1rem' }} />
              <h3 style={{ fontSize: '1.1rem', color: 'var(--text-main)', marginBottom: '0.5rem' }}>No matching files</h3>
              <p style={{ color: 'var(--text-muted)' }}>Try searching by file name, folder, email, phone, or extracted summary.</p>
            </div>
          )}

          {singleFiles.length > 0 && (
            <div className="single-files-section" style={{ marginBottom: '3rem' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileText size={20} color="var(--primary)" /> Single Files
              </h3>
              <div className="history-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
                {singleFiles.map((file) => renderFileCard(file, file.id || file.url || file.name))}
              </div>
            </div>
          )}

          {Object.entries(folderGroups).map(([folderName, folderFiles]) => (
            <div key={folderName} className="folder-section" style={{ marginBottom: '3rem', padding: '2rem', background: '#f8fafc', borderRadius: 'var(--radius-lg)', border: '1px solid #e2e8f0' }}>
              <div className="folder-header" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '2rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '1rem' }}>
                <div style={{ background: '#e0e7ff', padding: '12px', borderRadius: '12px' }}>
                  <FolderIcon size={24} color="var(--primary)" />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>{folderName}</h3>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Folder containing {folderFiles.length} item(s)</span>
                </div>
              </div>
              <div className="history-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
                {folderFiles.map((file) => renderFileCard(file, file.id || file.url || `${folderName}-${file.name}`))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export default FileHistory;
