import { useState, useEffect } from 'react';
import {
  Award,
  Briefcase,
  Code,
  ExternalLink,
  FileText,
  GraduationCap,
  Languages,
  Mail,
  Phone,
  RefreshCw,
  Search,
  Sparkles,
  Trophy,
  User,
  Download,
  Printer,
  Calendar,
  MapPin,
  BookOpen,
} from 'lucide-react';
import api from '../api';

const emptyValues = new Set([
  '',
  'not found',
  'n/a',
  'no summary found.',
  'no skills section found.',
  'no specific skills section found.',
  'no experience section found.',
  'no education section found.',
  'no projects section found.',
  'no certifications section found.',
  'no achievements section found.',
  'no languages section found.',
  'no extracurricular section found.',
  'no extra curricular activities section found.',
  'no interests section found.',
]);

const normalizeText = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean).join('\n');
  return typeof value === 'string' ? value.trim() : '';
};

const hasValue = (value) => {
  const normalized = normalizeText(value).toLowerCase();
  return normalized && !emptyValues.has(normalized);
};

const isMailLink = (link) => /(^mailto:|gmail\.com|googlemail\.com|mail\.google\.com)/i.test(link || '');

const formatDate = (dateString) => {
  if (!dateString) return 'Unknown date';
  return new Date(dateString).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
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

const parseExtraction = (file) => {
  const rawBio = (file.extracted?.bio || '').trim();
  let data = {};
  let status = 'ready';
  let error = null;

  if (rawBio.startsWith('{')) {
    try {
      data = JSON.parse(rawBio);
      status = 'success';
    } catch {
      try {
        data = recoverBrokenJson(rawBio);
        status = 'success';
      } catch (recoveryErr) {
        status = 'error';
        error = 'Stored extraction data is not valid JSON.';
      }
    }
  } else if (rawBio.includes('Could not parse')) {
    status = 'error';
    error = rawBio;
  } else if (rawBio && rawBio !== 'Not supported') {
    data = { bio: rawBio };
    status = 'success';
  }

  return {
    id: file.id,
    fileName: file.name,
    uploadedAt: file.uploadedAt,
    status,
    error,
    ...data,
  };
};

const InfoPill = ({ icon: Icon, label, value, emptyValue = 'Not found' }) => {
  const displayValue = hasValue(value) ? value : emptyValue;
  const isLink = hasValue(value) && /^(https?:\/\/|www\.|linkedin\.com|github\.com|portfolio\.)/i.test(value);
  const href = isLink ? (value.startsWith('http') ? value : `https://${value}`) : null;

  return (
    <div className="resume-info-pill">
      <Icon size={15} />
      <span>{label}</span>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer">{displayValue.replace(/^https?:\/\//, '')}</a>
      ) : (
        <strong>{displayValue}</strong>
      )}
    </div>
  );
};

const DetailSection = ({ icon: Icon, title, value, accent }) => {
  if (!hasValue(value)) return null;

  return (
    <article className="resume-detail-section">
      <h4>
        <Icon size={17} color={accent} />
        {title}
      </h4>
      <p>{normalizeText(value)}</p>
    </article>
  );
};

const ExtractedData = () => {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState('');
  const [selectedProfileId, setSelectedProfileId] = useState(null);

  const fetchProfiles = async () => {
    try {
      const token = localStorage.getItem('material_token');
      const response = await api.get('/api/files', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const parsed = response.data.map(parseExtraction);
      setProfiles(parsed);
      
      // Auto-select the first candidate if none is selected
      if (parsed.length > 0 && !selectedProfileId) {
        setSelectedProfileId(parsed[0].id);
      }
    } catch (error) {
      console.error('Error fetching extracted data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  const refreshExistingResumes = async () => {
    setRefreshing(true);
    setRefreshMessage('');

    try {
      const token = localStorage.getItem('material_token');
      const response = await api.post('/api/files/reprocess', {}, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const failures = response.data.failures || [];
      const failureText = failures.length
        ? ` Details: ${failures.map(item => `${item.file}: ${item.reason}`).join(' | ')}`
        : '';
      setRefreshMessage(`${response.data.message || 'Existing resumes refreshed.'}${failureText}`);
      await fetchProfiles();
    } catch (error) {
      const message = error.response?.data?.message || 'Unable to refresh existing resumes.';
      setRefreshMessage(message);
    } finally {
      setRefreshing(false);
    }
  };

  // Export all candidates to CSV
  const exportAllToCSV = () => {
    if (profiles.length === 0) return;
    const headers = [
      'Candidate Name', 'Email', 'Phone', 'LinkedIn', 'GitHub', 'Portfolio Link', 
      'Professional Summary', 'Skills', 'Experience', 'Education', 'Projects', 
      'Certifications', 'Achievements', 'Languages', 'Extracurricular Activities', 'Interests', 'FileName', 'UploadedAt'
    ];
    
    const rows = profiles.map(p => [
      p.name || 'Not found',
      p.email || 'Not found',
      p.phone || 'Not found',
      p.linkedin || 'Not found',
      p.github || 'Not found',
      p.portfolioLink || 'Not found',
      p.bio || 'Not found',
      p.skills || 'Not found',
      p.experience || 'Not found',
      p.education || 'Not found',
      p.projects || 'Not found',
      p.certifications || 'Not found',
      p.achievements || 'Not found',
      p.languages || 'Not found',
      p.extracurricular || 'Not found',
      p.interests || 'Not found',
      p.fileName || 'Not found',
      p.uploadedAt ? new Date(p.uploadedAt).toISOString() : ''
    ]);

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + [headers.join(','), ...rows.map(e => e.map(val => `"${val.replace(/"/g, '""')}"`).join(','))].join('\n');
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `materix_candidate_profiles_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export active candidate to JSON
  const exportActiveToJSON = (profile) => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(profile, null, 2));
    const link = document.createElement("a");
    link.setAttribute("href", dataStr);
    link.setAttribute("download", `candidate_${(profile.name || 'profile').toLowerCase().replace(/\s+/g, '_')}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const activeProfile = profiles.find(p => p.id === selectedProfileId) || profiles[0] || null;

  const getSkillsArray = (skillsText) => {
    if (!skillsText || emptyValues.has(skillsText.toLowerCase())) return [];
    return skillsText
      .split(/[\n,•\-\*]+/)
      .map(s => s.trim())
      .filter(s => s.length > 1);
  };

  const parseTextList = (text) => {
    if (!text || emptyValues.has(text.toLowerCase())) return [];
    return text
      .split('\n')
      .map(s => s.replace(/^[\s\-*•●▪▫◆]+/, '').trim())
      .filter(s => s.length > 3);
  };

  if (loading) {
    return (
      <div className="loading" style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
        Analyzing resumes...
      </div>
    );
  }

  return (
    <section className="extracted-data-container">
      {/* 1. Main Action Header */}
      <div className="section-header intelligence-heading no-print">
        <div>
          <h2>Resume Intelligence Hub</h2>
          <p>ATS structured details of parsed candidates.</p>
        </div>
        <div className="resume-heading-actions">
          <span>{profiles.length} candidate{profiles.length === 1 ? '' : 's'} parsed</span>
          
          <button type="button" className="btn-csv-export" onClick={exportAllToCSV} disabled={profiles.length === 0}>
            <Download size={16} />
            Export All to CSV
          </button>
          
          <button type="button" className="btn-reprocess" onClick={refreshExistingResumes} disabled={refreshing || profiles.length === 0}>
            <RefreshCw size={16} className={refreshing ? 'spin-animation' : ''} />
            {refreshing ? 'Reprocessing...' : 'Reprocess All'}
          </button>
        </div>
      </div>

      {refreshMessage && <div className="resume-refresh-message no-print">{refreshMessage}</div>}

      {/* 2. Empty State */}
      {profiles.length === 0 ? (
        <div className="empty-state resume-empty-state">
          <FileText size={58} />
          <h3>No parsed candidates available</h3>
          <p>Upload PDF, DOCX, or TXT resumes in the Workspace tab to populate the ATS Dashboard.</p>
        </div>
      ) : (
        /* 3. Flattened Content Area */
        <div className="ats-flattened-content">
          
          {/* Candidate Dropdown Selector */}
          <div className="candidate-selector-bar no-print">
            <label htmlFor="candidate-select">Select Candidate Profile:</label>
            <div className="selector-wrapper">
              <select
                id="candidate-select"
                value={selectedProfileId || ''}
                onChange={(e) => setSelectedProfileId(e.target.value)}
              >
                {profiles.map((p) => {
                  const nameText = hasValue(p.name) ? p.name : p.fileName.replace(/\.[^/.]+$/, '');
                  return (
                    <option key={p.id} value={p.id}>
                      {nameText} ({p.fileName})
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          {/* Candidate Structured Profile Workspace */}
          {activeProfile ? (
            <article className="ats-profile-card">
              
              {/* Workspace Header */}
              <header className="ats-profile-header">
                <div className="ats-profile-meta">
                  <div className="ats-profile-avatar">
                    {activeProfile.name ? activeProfile.name.charAt(0).toUpperCase() : '?'}
                  </div>
                  <div>
                    <h3>{hasValue(activeProfile.name) ? activeProfile.name : 'Unnamed Candidate'}</h3>
                    <p className="ats-profile-filename">Source file: {activeProfile.fileName}</p>
                    <span className="ats-profile-date">Parsed on: {formatDate(activeProfile.uploadedAt)}</span>
                  </div>
                </div>
                
                <div className="ats-profile-actions no-print">
                  <button type="button" className="btn-action-json" onClick={() => exportActiveToJSON(activeProfile)}>
                    <Download size={14} />
                    Export JSON
                  </button>
                  <button type="button" className="btn-action-print" onClick={window.print}>
                    <Printer size={14} />
                    Print Resume
                  </button>
                </div>
              </header>

              {/* Print Only Header */}
              <div className="print-only-header">
                <h1>{hasValue(activeProfile.name) ? activeProfile.name : 'Unnamed Candidate'}</h1>
                <p>Structured Resume Profile — Generated by Materix</p>
                <hr style={{ margin: '1rem 0', borderColor: '#cbd5e1' }} />
              </div>

              {/* Contact Grid */}
              <div className="resume-contact-grid">
                <InfoPill icon={Mail} label="Email" value={activeProfile.email} />
                <InfoPill icon={Phone} label="Phone" value={activeProfile.phone} />
                <InfoPill icon={ExternalLink} label="LinkedIn" value={activeProfile.linkedin} emptyValue="-" />
                <InfoPill icon={ExternalLink} label="GitHub" value={activeProfile.github} emptyValue="-" />
                <InfoPill icon={ExternalLink} label="Portfolio Link" value={activeProfile.portfolioLink} emptyValue="-" />
              </div>

              {/* Stacked Details Workspace Content */}
              <div className="ats-stacked-content">
                
                {/* 1. Summary Section */}
                <div className="pane-section">
                  <h4>
                    <Sparkles size={16} color="#4f46e5" />
                    Professional Summary
                  </h4>
                  <p className="summary-text">
                    {hasValue(activeProfile.bio) ? normalizeText(activeProfile.bio) : 'No summary provided.'}
                  </p>
                </div>

                {/* 2. Skills Section */}
                <div className="pane-section">
                  <h4>
                    <Code size={16} color="#0891b2" />
                    Core Competencies & Tools
                  </h4>
                  {getSkillsArray(activeProfile.skills).length > 0 ? (
                    <div className="skills-badge-list">
                      {getSkillsArray(activeProfile.skills).map((skill, idx) => (
                        <span key={idx} className="skill-badge-item">{skill}</span>
                      ))}
                    </div>
                  ) : (
                    <p className="no-data-msg">No skills listed in profile.</p>
                  )}
                </div>

                {/* 3. Experience Timeline Section */}
                <div className="pane-section">
                  <h4>
                    <Briefcase size={16} color="#db2777" />
                    Professional History
                  </h4>
                  {parseTextList(activeProfile.experience).length > 0 ? (
                    <div className="visual-timeline">
                      {parseTextList(activeProfile.experience).map((exp, idx) => (
                        <div key={idx} className="timeline-item">
                          <div className="timeline-marker">
                            <div className="timeline-circle"></div>
                          </div>
                          <div className="timeline-content">
                            <p>{exp}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="no-data-msg">No professional experience listed.</p>
                  )}
                </div>

                {/* 4. Education Timeline Section */}
                <div className="pane-section">
                  <h4>
                    <GraduationCap size={16} color="#059669" />
                    Academic History
                  </h4>
                  {parseTextList(activeProfile.education).length > 0 ? (
                    <div className="visual-timeline">
                      {parseTextList(activeProfile.education).map((edu, idx) => (
                        <div key={idx} className="timeline-item">
                          <div className="timeline-marker">
                            <div className="timeline-circle academy"></div>
                          </div>
                          <div className="timeline-content">
                            <p>{edu}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="no-data-msg">No educational qualifications listed.</p>
                  )}
                </div>

                {/* 5. Projects Section */}
                {hasValue(activeProfile.projects) && (
                  <div className="pane-section">
                    <h4>
                      <BookOpen size={16} color="#d97706" />
                      Parsed Projects Info
                    </h4>
                    <ul className="projects-bullet-list">
                      {parseTextList(activeProfile.projects).map((proj, idx) => (
                        <li key={idx}>{proj}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* 6. Overview Subsections Grid (Certs, Achievements, Languages, Extracurricular, Interests) */}
                <div className="overview-subsections-grid">
                  {hasValue(activeProfile.certifications) && (
                    <div className="pane-section-sub">
                      <h5>Certifications</h5>
                      <ul>
                        {parseTextList(activeProfile.certifications).map((cert, idx) => (
                          <li key={idx}>{cert}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {hasValue(activeProfile.achievements) && (
                    <div className="pane-section-sub">
                      <h5>Achievements</h5>
                      <ul>
                        {parseTextList(activeProfile.achievements).map((ach, idx) => (
                          <li key={idx}>{ach}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {hasValue(activeProfile.languages) && (
                    <div className="pane-section-sub">
                      <h5>Languages</h5>
                      <div className="language-tags">
                        {getSkillsArray(activeProfile.languages).map((lang, idx) => (
                          <span key={idx} className="lang-tag">{lang}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {hasValue(activeProfile.extracurricular) && (
                    <div className="pane-section-sub">
                      <h5>Extracurricular Activities</h5>
                      <ul>
                        {parseTextList(activeProfile.extracurricular).map((act, idx) => (
                          <li key={idx}>{act}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {hasValue(activeProfile.interests) && (
                    <div className="pane-section-sub">
                      <h5>Interests & Hobbies</h5>
                      <div className="interests-tags">
                        {getSkillsArray(activeProfile.interests).map((item, idx) => (
                          <span key={idx} className="interest-tag">{item}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* 7. Hyperlinks Grid */}
                {Array.isArray(activeProfile.links) && activeProfile.links.length > 0 && (
                  <div className="pane-section">
                    <h4>
                      <ExternalLink size={16} color="#4f46e5" />
                      Extracted Hyperlinks
                    </h4>
                    <div className="extracted-links-grid">
                      {activeProfile.links.map((link, idx) => (
                        <a
                          key={idx}
                          href={link.startsWith('http') ? link : `https://${link}`}
                          target="_blank"
                          rel="noreferrer"
                          className="extracted-link-item"
                        >
                          <ExternalLink size={13} />
                          {link.replace(/^https?:\/\//, '')}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* 8. Raw Text Preview Block */}
                <div className="pane-section">
                  <h4>
                    <FileText size={16} color="#64748b" />
                    Document Text Preview
                  </h4>
                  <pre className="raw-text-block">
                    {activeProfile.rawTextPreview || 'No raw text available.'}
                  </pre>
                </div>

              </div>

            </article>
          ) : (
            <div className="ats-workspace-empty no-print">
              <User size={48} />
              <h3>No Candidate Selected</h3>
              <p>Select a candidate from the dropdown selector to see their structured data.</p>
            </div>
          )}
          
        </div>
      )}
    </section>
  );
};

export default ExtractedData;

