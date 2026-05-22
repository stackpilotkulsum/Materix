import React from 'react';
import { Archive, FileUp, LogOut, Settings, UploadCloud, Brain } from 'lucide-react';

const Header = ({ currentTab, setCurrentTab, onLogout }) => {
  const tabs = [
    { id: 'upload', label: 'Workspace', icon: UploadCloud },
    { id: 'history', label: 'History', icon: Archive },
    { id: 'extracted', label: 'Intelligence', icon: Brain },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <nav className="navbar">
      <div className="nav-container">
        <div className="logo">
          <span className="logo-mark">
            <FileUp className="logo-icon" size={22} />
          </span>
          <span className="logo-word">Material<span>Mate</span></span>
        </div>
        <ul className="nav-links">
          {tabs.map(({ id, label, icon: Icon }) => (
            <li key={id}>
              <button
                type="button"
                className={`nav-tab ${currentTab === id ? 'active' : ''}`}
                onClick={() => setCurrentTab(id)}
              >
                <Icon size={16} />
                {label}
              </button>
            </li>
          ))}
        </ul>
        <button 
          className="logout-btn" 
          onClick={onLogout}
        >
          <LogOut size={16} />
          Logout
        </button>
      </div>
    </nav>
  );
};

export default Header;
