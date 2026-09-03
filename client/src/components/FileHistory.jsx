import { useState, useEffect } from 'react';
import { FileText, Download, Calendar, HardDrive, Search, Trash2, X, Folder as FolderIcon, Image as ImageIcon, Eye } from 'lucide-react';
import api, { getDownloadUrl } from '../api';

const FileHistory = ({ refreshTrigger }) => {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedCard, setExpandedCard] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sheetPreviewOpen, setSheetPreviewOpen] = useState(false);

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

  const recoverBrokenJson = (jsonStr) => {
    const fields = [
      'name', 'email', 'phone', 'linkedin', 'github', 'portfolioLink',
      'bio', 'skills', 'experience', 'education', 'projects',
      'certifications', 'achievements', 'languages', 'extracurricular', 'interests',
      'rawTextPreview'
    ];
    
    const extracted = {};
    
    fields.forEach(field => {
      const regex = new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*?)(?:"|$)`);
      const match = jsonStr.match(regex);
      if (match) {
        try {
          const cleanVal = match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
          extracted[field] = cleanVal;
        } catch (e) {
          extracted[field] = match[1];
        }
      }
    });

    ['links', 'projectLinks', 'emails', 'phones'].forEach(field => {
      const arrayRegex = new RegExp(`"${field}"\\s*:\\s*\\[([\\s\\S]*?)\\]`);
      const arrayMatch = jsonStr.match(arrayRegex);
      if (arrayMatch) {
        const items = [...arrayMatch[1].matchAll(/"([^"]*)"/g)].map(m => m[1]);
        extracted[field] = items;
      }
    });
    
    return extracted;
  };

  const getExtractionDetails = (file) => {
    try {
      if (file.extracted?.bio && file.extracted.bio.startsWith('{')) {
        try {
          return JSON.parse(file.extracted.bio);
        } catch (parseErr) {
          console.warn('JSON parsing failed, attempting recovery:', parseErr.message);
          return recoverBrokenJson(file.extracted.bio);
        }
      }
    } catch (e) {
      console.error('Unable to parse extraction details:', e);
    }

    return {
      bio: file.extracted?.bio || '',
      email: file.extracted?.email,
      phone: file.extracted?.phone,
    };
  };

  const isRealLink = (link) => (
    /^(https?:\/\/|www\.)/i.test(link) ||
    /(?:linkedin|github)\.com/i.test(link) ||
    /\.(com|io|app|dev|net|org|co|in|me|ai|xyz|site|tech|cloud|jobs|work|page)(\/|$)/i.test(link)
  );

  const joinLinks = (links) => Array.isArray(links)
    ? links
        .map(link => typeof link === 'string' ? link.trim() : '')
        .filter(link => link && isRealLink(link))
        .join('\n')
    : '';

  const cleanLink = (link) => {
    if (!link || link === 'Not found' || link === 'N/A' || link.trim() === '-' || link.trim() === '') return '-';
    return link;
  };

  const buildExportData = () => {
    const data = filteredFiles.map(file => {
      const details = getExtractionDetails(file);

      return {
        "File Name": file.name,
        "Folder": file.folder || "Single Files",
        "Upload Date": formatDate(file.uploadedAt),
        "Size": formatSize(file.size),
        "File Link": getDownloadUrl(file.url) || "-",
        "Name": details.name || "N/A",
        "Email": details.email || file.extracted?.email || "N/A",
        "Phone": details.phone || file.extracted?.phone || "N/A",
        "LinkedIn": cleanLink(details.linkedin),
        "GitHub": cleanLink(details.github),
        "Portfolio": cleanLink(details.portfolioLink),
        "Project Links": joinLinks(details.projectLinks) || "-",
        "All Links": joinLinks(details.links) || "-",
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

    // Remove columns that are completely empty or N/A across ALL rows to reduce messiness
    if (data.length > 0) {
      const keys = Object.keys(data[0]);
      const emptyKeys = keys.filter(key => {
        return data.every(row => {
          const val = row[key];
          return val === "" || val === "-" || val === "N/A" || !val;
        });
      });

      if (emptyKeys.length > 0) {
        data.forEach(row => {
          emptyKeys.forEach(key => delete row[key]);
        });
      }
    }

    return data;
  };

  const downloadPreviewSheet = () => {
    const tableElement = document.querySelector('.history-container table');
    if (!tableElement) {
      alert("No preview sheet available to download.");
      return;
    }

    // Clone the table to avoid modifying the active DOM
    const clonedTable = tableElement.cloneNode(true);

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Materix - Preview Sheet</title>
        <meta charset="utf-8">
        <style>
          body {
            font-family: Inter, system-ui, -apple-system, sans-serif;
            background: #f6f7f2;
            color: #16201f;
            margin: 24px;
          }
          h2 {
            color: #0f766e;
            margin: 0 0 4px;
          }
          p {
            color: #61706b;
            font-size: 0.9rem;
            margin: 0 0 20px;
          }
          table {
            border-collapse: collapse;
            width: 100%;
            font-size: 0.82rem;
            background: #ffffff;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.05);
            overflow: hidden;
          }
          th, td {
            border: 1px solid rgba(22, 32, 31, 0.08);
            padding: 12px;
            text-align: left;
            vertical-align: top;
          }
          th {
            background: #f8fafc;
            color: #16201f;
            font-weight: 700;
          }
          tr:nth-child(even) {
            background: #fcfdfe;
          }
          a {
            display: inline-flex;
            padding: 4px 8px;
            border-radius: 4px;
            background: #3b82f6;
            color: #ffffff !important;
            text-decoration: none;
            font-weight: 600;
            font-size: 0.75rem;
            align-items: center;
            gap: 2px;
          }
          a:hover {
            opacity: 0.9;
          }
          button {
            display: inline-flex;
            padding: 4px 8px;
            border-radius: 4px;
            background: rgba(239, 68, 68, 0.1);
            color: #ef4444;
            border: none;
            font-weight: 600;
            font-size: 0.75rem;
            align-items: center;
            gap: 2px;
            cursor: pointer;
          }
          .btn-print {
            background: #10b981 !important; 
            color: white !important; 
            padding: 10px 18px; 
            font-size: 0.95rem; 
            font-weight: 600;
            border-radius: 8px;
            border: none;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);
            transition: all 0.2s ease;
          }
          .btn-print:hover {
            background: #059669 !important;
            transform: translateY(-1px);
          }
          @media print {
            body {
              margin: 0;
              background: #ffffff;
            }
            table {
              box-shadow: none;
            }
            .no-print {
              display: none !important;
            }
          }
        </style>
      </head>
      <body>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; border-bottom: 2px solid #e2e8f0; padding-bottom: 16px;" class="no-print">
          <div>
            <h2>Materix - Preview Sheet</h2>
            <p>Downloaded offline preview sheet. Click View to open documents directly, or click print to save as PDF.</p>
          </div>
          <button class="btn-print" onclick="window.print()">
            Print / Save as PDF
          </button>
        </div>
        <div style="overflow-x: auto;">
          ${clonedTable.outerHTML}
        </div>
      </body>
      </html>
    `;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'materix-preview-sheet.html';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
                  const details = getExtractionDetails(file);

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

  const sheetPreviewData = buildExportData();
  const previewColumns = sheetPreviewData.length ? Object.keys(sheetPreviewData[0]) : [];

  return (
    <section className="history-container" style={{ width: '100%', maxWidth: '1000px', margin: '0 auto', padding: '2rem' }}>
      <div className="section-header" style={{ marginBottom: '2.5rem', borderBottom: '2px solid #f1f5f9', paddingBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--text-main)' }}>History & Archives</h2>
          <span style={{ color: 'var(--text-muted)' }}>{files.length} total files stored securely.</span>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button
            onClick={() => setSheetPreviewOpen(true)}
            disabled={filteredFiles.length === 0}
            style={{ background: '#ffffff', color: 'var(--text-main)', border: '1px solid #dbe4ef', padding: '8px 16px', borderRadius: '8px', cursor: filteredFiles.length ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', fontWeight: 600 }}
          >
            <Eye size={18} /> Preview Sheet
          </button>
        </div>
      </div>

      {sheetPreviewOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.5)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div style={{ width: 'min(1180px, 96vw)', maxHeight: '86vh', background: '#ffffff', borderRadius: '12px', boxShadow: '0 24px 70px rgba(15, 23, 42, 0.22)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-main)' }}>Sheet Preview</h3>
                <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>{sheetPreviewData.length} row(s), filtered by the current search.</p>
              </div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexShrink: 0 }}>
                <button 
                  onClick={downloadPreviewSheet}
                  style={{ background: '#10b981', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', fontWeight: 600, whiteSpace: 'nowrap' }}
                >
                  <Download size={18} /> Download Preview Sheet
                </button>
                <button type="button" onClick={() => setSheetPreviewOpen(false)} style={{ width: '36px', height: '36px', borderRadius: '50%', border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', display: 'grid', placeItems: 'center' }} title="Close preview">
                  <X size={18} />
                </button>
              </div>
            </div>
            <div style={{ overflow: 'auto', padding: '16px', flex: 1, minHeight: 0 }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '1900px', fontSize: '0.82rem' }}>
                <thead>
                  <tr>
                    <th style={{ position: 'sticky', top: 0, left: 0, zIndex: 10, background: '#f8fafc', border: '1px solid #dbe4ef', padding: '10px', textAlign: 'center', color: 'var(--text-main)', minWidth: '120px' }}>Actions</th>
                    {previewColumns.map(column => (
                      <th key={column} style={{ position: 'sticky', top: 0, background: '#f8fafc', border: '1px solid #dbe4ef', padding: '10px', textAlign: 'left', color: 'var(--text-main)' }}>{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sheetPreviewData.map((row, rowIndex) => {
                    const file = filteredFiles[rowIndex];
                    return (
                      <tr key={`${row["File Name"]}-${rowIndex}`}>
                        <td style={{ position: 'sticky', left: 0, background: '#ffffff', border: '1px solid #e2e8f0', padding: '10px', textAlign: 'center', verticalAlign: 'top', zIndex: 5 }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                            <a 
                              href={getDownloadUrl(file?.url)} 
                              download={file?.name} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              style={{ display: 'inline-flex', padding: '4px 8px', borderRadius: '4px', background: '#3b82f6', color: '#ffffff', textDecoration: 'none', fontWeight: 600, fontSize: '0.75rem', alignItems: 'center', gap: '2px' }}
                              title="View/Download file"
                            >
                              <Eye size={12} /> View
                            </a>
                            <button 
                              onClick={(e) => handleDelete(file?.id, e)}
                              style={{ display: 'inline-flex', padding: '4px 8px', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.75rem', alignItems: 'center', gap: '2px' }}
                              title="Delete permanently"
                            >
                              <Trash2 size={12} /> Del
                            </button>
                          </div>
                        </td>
                        {previewColumns.map(column => (
                          <td key={column} style={{ border: '1px solid #e2e8f0', padding: '10px', color: 'var(--text-muted)', whiteSpace: column.includes('Links') || ['Summary', 'Skills', 'Experience', 'Education', 'Projects', 'Certifications', 'Achievements', 'Raw Text Preview'].includes(column) ? 'pre-line' : 'normal', verticalAlign: 'top', minWidth: ['Summary', 'Skills', 'Experience', 'Education', 'Projects', 'Raw Text Preview'].includes(column) ? '260px' : '140px', maxWidth: ['Summary', 'Skills', 'Experience', 'Education', 'Projects', 'Raw Text Preview'].includes(column) ? '360px' : '240px', wordBreak: 'break-word' }}>
                            {row[column] || ''}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

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
