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
      status = 'error';
      error = 'Stored extraction data is not valid JSON.';
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
  const [searchQuery, setSearchQuery] = useState('');

  const fetchProfiles = async () => {
    try {
      const token = localStorage.getItem('material_token');
      const response = await api.get('/api/files', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setProfiles(response.data.map(parseExtraction));
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

  const filteredProfiles = profiles.filter((profile) => {
    const searchText = [
      profile.fileName,
      profile.name,
      profile.email,
      profile.phone,
      profile.skills,
      profile.experience,
      profile.education,
      profile.projects,
      profile.certifications,
      profile.achievements,
      profile.languages,
      profile.extracurricular,
      profile.linkedin,
      profile.github,
      profile.portfolioLink,
      profile.projectLinks?.join(' '),
      profile.links?.join(' '),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return searchText.includes(searchQuery.trim().toLowerCase());
  });

  if (loading) {
    return (
      <div className="loading" style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
        Analyzing resumes...
      </div>
    );
  }

  return (
    <section className="extracted-data-container">
      <div className="section-header intelligence-heading">
        <div>
          <h2>Resume Intelligence</h2>
          <p>Organized resume details extracted from your uploaded files.</p>
        </div>
        <div className="resume-heading-actions">
          <span>{profiles.length} resume{profiles.length === 1 ? '' : 's'} scanned</span>
          <button type="button" onClick={refreshExistingResumes} disabled={refreshing || profiles.length === 0}>
            <RefreshCw size={16} />
            {refreshing ? 'Refreshing...' : 'Refresh Existing'}
          </button>
        </div>
      </div>

      {refreshMessage && <div className="resume-refresh-message">{refreshMessage}</div>}

      <div className="resume-search-bar">
        <Search size={20} />
        <input
          type="search"
          placeholder="Search name, email, skills, education, projects, or experience"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
      </div>

      {filteredProfiles.length === 0 ? (
        <div className="empty-state resume-empty-state">
          <FileText size={58} />
          <h3>No resume details available</h3>
          <p>Upload PDF, DOCX, or TXT resumes in the Workspace tab to see organized extraction here.</p>
        </div>
      ) : (
        <div className="profiles-grid resume-profiles-grid">
          {filteredProfiles.map((profile) => {
            const displayName = hasValue(profile.name)
              ? profile.name
              : profile.fileName?.replace(/\.[^/.]+$/, '') || 'Unnamed candidate';
            const sectionCount = [
              profile.bio,
              profile.skills,
              profile.experience,
              profile.education,
              profile.projects,
              profile.certifications,
              profile.achievements,
              profile.languages,
              profile.extracurricular,
            ].filter(hasValue).length;
            const projectLinks = Array.isArray(profile.projectLinks)
              ? profile.projectLinks.filter((link) => !isMailLink(link))
              : Array.isArray(profile.links)
                ? profile.links.filter((link) => !/linkedin\.com|github\.com/i.test(link) && !isMailLink(link))
                : [];

            return (
              <article key={profile.id} className="profile-card resume-profile-card">
                <header className="resume-card-header">
                  <div className="resume-avatar">
                    <User size={28} />
                  </div>
                  <div>
                    <h3>{displayName}</h3>
                    <p>{profile.fileName}</p>
                    <span>{formatDate(profile.uploadedAt)} - {sectionCount} sections extracted</span>
                  </div>
                </header>

                {profile.status === 'error' ? (
                  <div className="resume-error-box">
                    <strong>Extraction failed</strong>
                    <p>{profile.error || 'The document could not be parsed.'}</p>
                  </div>
                ) : (
                  <>
                    <div className="resume-contact-grid">
                      <InfoPill icon={Mail} label="Email" value={profile.email} />
                      <InfoPill icon={Phone} label="Phone" value={profile.phone} />
                      <InfoPill icon={ExternalLink} label="LinkedIn" value={profile.linkedin} />
                      <InfoPill icon={ExternalLink} label="GitHub" value={profile.github} />
                      <InfoPill icon={ExternalLink} label="Portfolio Link" value={profile.portfolioLink} emptyValue="-" />
                    </div>

                    {projectLinks.length > 0 && (
                      <div className="resume-links-block">
                        <h4>
                          <ExternalLink size={16} />
                          Project Links
                        </h4>
                        <div className="resume-links">
                        {projectLinks.slice(0, 6).map((link) => (
                          <a
                            key={link}
                            href={link.startsWith('http') ? link : `https://${link}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <ExternalLink size={14} />
                            {link.replace(/^https?:\/\//, '')}
                          </a>
                        ))}
                        </div>
                      </div>
                    )}

                    <div className="resume-detail-stack">
                      <DetailSection icon={Sparkles} title="Professional Summary" value={profile.bio} accent="#4f46e5" />
                      <DetailSection icon={Code} title="Skills & Tools" value={profile.skills} accent="#0891b2" />
                      <DetailSection icon={Briefcase} title="Work Experience" value={profile.experience} accent="#db2777" />
                      <DetailSection icon={GraduationCap} title="Education" value={profile.education} accent="#059669" />
                      <DetailSection icon={FileText} title="Projects" value={profile.projects} accent="#d97706" />
                      <DetailSection icon={Sparkles} title="Extra Curricular Activities" value={profile.extracurricular} accent="#0f766e" />
                      <DetailSection icon={Award} title="Certifications" value={profile.certifications} accent="#7c3aed" />
                      <DetailSection icon={Trophy} title="Achievements" value={profile.achievements} accent="#b45309" />
                      <DetailSection icon={Languages} title="Languages" value={profile.languages} accent="#2563eb" />
                    </div>
                  </>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default ExtractedData;
