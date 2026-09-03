import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageSquare, Paperclip, Send, UserPlus, Check, X, Search, 
  FileText, Download, UserCheck, AlertCircle, Clock, Loader2,
  FolderLock, Database, FolderOpen, Share2, Users
} from 'lucide-react';
import api from '../api';

const ChatSection = () => {
  const [currentUser, setCurrentUser] = useState('');
  const [friends, setFriends] = useState([]);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [outgoingRequests, setOutgoingRequests] = useState([]);
  const [activeFriend, setActiveFriend] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  
  // Sidebar tab: 'chats', 'friends', 'invites', 'find'
  const [sidebarTab, setSidebarTab] = useState('chats');

  // Active conversations list state
  const [activeChats, setActiveChats] = useState([]);
  const [isLoadingActiveChats, setIsLoadingActiveChats] = useState(false);

  // Search state for finding users
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  // Attachment state (uploading new files)
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  // Vault modal state (sharing already uploaded files)
  const [showVaultModal, setShowVaultModal] = useState(false);
  const [vaultFiles, setVaultFiles] = useState([]);
  const [isLoadingVault, setIsLoadingVault] = useState(false);
  const [vaultSearchQuery, setVaultSearchQuery] = useState('');

  // Status/Loading states
  const [isLoadingFriends, setIsLoadingFriends] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const pollingRef = useRef(null);

  // Extract current username from JWT token
  useEffect(() => {
    const token = localStorage.getItem('material_token');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setCurrentUser(payload.username);
      } catch (e) {
        console.error('Failed to parse token for username', e);
      }
    }
  }, []);

  // Fetch friends list, pending requests and active chats
  const fetchFriendsData = async () => {
    setIsLoadingFriends(true);
    setIsLoadingActiveChats(true);
    try {
      const [friendsRes, requestsRes, activeChatsRes] = await Promise.all([
        api.get('/api/friends').catch(err => {
          console.error('Error fetching friends list:', err);
          return { data: [] };
        }),
        api.get('/api/friends/requests').catch(err => {
          console.error('Error fetching friend requests:', err);
          return { data: { incoming: [], outgoing: [] } };
        }),
        api.get('/api/chat/active-chats').catch(err => {
          console.error('Error fetching active chats:', err);
          return { data: [] };
        })
      ]);
      setFriends(friendsRes.data || []);
      setIncomingRequests(requestsRes.data?.incoming || []);
      setOutgoingRequests(requestsRes.data?.outgoing || []);
      setActiveChats(activeChatsRes.data || []);
    } catch (err) {
      console.error('Error fetching friends data:', err);
      setErrorMsg('Failed to load friends list');
    } finally {
      setIsLoadingFriends(false);
      setIsLoadingActiveChats(false);
    }
  };

  useEffect(() => {
    fetchFriendsData();
  }, []);

  // Load chat messages when activeFriend changes
  const fetchMessages = async (friendUsername) => {
    if (!friendUsername) return;
    try {
      const res = await api.get(`/api/chat/messages/${friendUsername}`);
      setMessages(res.data || []);
    } catch (err) {
      console.error('Error fetching messages:', err);
    }
  };

  useEffect(() => {
    if (activeFriend) {
      fetchMessages(activeFriend);
      
      // Clear previous interval if exists
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }

      // Poll for new messages every 3 seconds
      pollingRef.current = setInterval(() => {
        fetchMessages(activeFriend);
      }, 3000);
    } else {
      setMessages([]);
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [activeFriend]);

  // Scroll to bottom when messages list updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Search users by username
  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setSearchError('');
    setSearchResults([]);

    try {
      const res = await api.get(`/api/friends/search?username=${encodeURIComponent(searchQuery)}`);
      setSearchResults(res.data || []);
      if (res.data?.length === 0) {
        setSearchError('No users found matching that username.');
      }
    } catch (err) {
      console.error('Search error:', err);
      setSearchError('An error occurred during user search.');
    } finally {
      setIsSearching(false);
    }
  };

  // Send friend request
  const sendFriendRequest = async (targetUsername) => {
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await api.post('/api/friends/request', { friend_username: targetUsername });
      setSuccessMsg(`Friend request sent to @${targetUsername}`);
      
      // Update lists dynamically
      fetchFriendsData();
      
      // Remove from search results visual list
      setSearchResults(prev => prev.filter(u => u.username !== targetUsername));
    } catch (err) {
      console.error('Friend request error:', err);
      setErrorMsg(err.response?.data?.message || 'Failed to send friend request');
    }
  };

  // Respond to incoming friend request
  const handleRequestResponse = async (requestId, action) => {
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await api.post('/api/friends/respond', { id: requestId, action });
      setSuccessMsg(`Friend request ${action === 'accept' ? 'accepted' : 'declined'}`);
      fetchFriendsData();
    } catch (err) {
      console.error('Request response error:', err);
      setErrorMsg('Failed to respond to request');
    }
  };

  // Handle message text submission and/or file upload
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!activeFriend) return;
    if (!messageInput.trim() && !selectedFile) return;

    setErrorMsg('');
    let uploadedFileDetails = null;

    try {
      // 1. Handle file attachment upload if present
      if (selectedFile) {
        setIsUploading(true);
        const formData = new FormData();
        formData.append('file', selectedFile);

        const uploadRes = await api.post('/api/chat/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        uploadedFileDetails = uploadRes.data;
        setSelectedFile(null);
      }

      // 2. Send the message payload
      const payload = {
        receiver_username: activeFriend,
        content: messageInput,
        file_url: uploadedFileDetails?.file_url || null,
        file_name: uploadedFileDetails?.file_name || null,
        file_size: uploadedFileDetails?.file_size || null
      };

      const msgRes = await api.post('/api/chat/messages', payload);
      
      // Append the message to list locally immediately for snap response
      setMessages(prev => [...prev, msgRes.data]);
      setMessageInput('');

      // Add activeFriend to activeChats locally if not already present
      setActiveChats(prev => {
        if (prev.includes(activeFriend)) return prev;
        return [...prev, activeFriend];
      });
    } catch (err) {
      console.error('Failed to send message:', err);
      setErrorMsg(err.response?.data?.message || 'Failed to send message');
    } finally {
      setIsUploading(false);
    }
  };

  // Fetch files from workspace/vault
  const openVaultModal = async () => {
    setShowVaultModal(true);
    setIsLoadingVault(true);
    setVaultSearchQuery('');
    try {
      const res = await api.get('/api/files');
      setVaultFiles(res.data || []);
    } catch (err) {
      console.error('Error fetching vault files:', err);
      setErrorMsg('Failed to load vault files');
    } finally {
      setIsLoadingVault(false);
    }
  };

  // Share a file selected from the vault
  const handleShareVaultFile = async (file) => {
    if (!activeFriend) return;
    setErrorMsg('');
    try {
      const payload = {
        receiver_username: activeFriend,
        content: `Shared material: ${file.original_name}`,
        file_url: file.file_url,
        file_name: file.original_name,
        file_size: file.file_size
      };

      const res = await api.post('/api/chat/messages', payload);
      setMessages(prev => [...prev, res.data]);
      setShowVaultModal(false);

      // Add activeFriend to activeChats locally if not already present
      setActiveChats(prev => {
        if (prev.includes(activeFriend)) return prev;
        return [...prev, activeFriend];
      });
    } catch (err) {
      console.error('Error sharing vault file:', err);
      setErrorMsg('Failed to share vault material');
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg('Max attachment size is 10MB.');
      return;
    }
    
    setSelectedFile(file);
    setErrorMsg('');
  };

  const formatBytes = (bytes, decimals = 2) => {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const getDownloadUrl = (url) => {
    if (!url) return '#';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    try {
      const base = api.defaults.baseURL || window.location.origin;
      return new URL(url, base).toString();
    } catch {
      return url;
    }
  };

  // Filter vault files by search query
  const filteredVaultFiles = vaultFiles.filter(file => 
    file.original_name?.toLowerCase().includes(vaultSearchQuery.toLowerCase()) ||
    file.folder?.toLowerCase().includes(vaultSearchQuery.toLowerCase())
  );

  return (
    <div className="chat-container glass-card">
      <div className="chat-layout">
        
        {/* Sidebar */}
        <div className="chat-sidebar">
          
          {/* Sidebar Tabs */}
          <div className="sidebar-tabs-nav">
            <button 
              onClick={() => setSidebarTab('chats')} 
              className={`sidebar-tab-btn ${sidebarTab === 'chats' ? 'active' : ''}`}
            >
              <MessageSquare size={16} />
              <span>Chats</span>
            </button>
            <button 
              onClick={() => setSidebarTab('friends')} 
              className={`sidebar-tab-btn ${sidebarTab === 'friends' ? 'active' : ''}`}
            >
              <Users size={16} />
              <span>Friends</span>
            </button>
            <button 
              onClick={() => setSidebarTab('invites')} 
              className={`sidebar-tab-btn ${sidebarTab === 'invites' ? 'active' : ''}`}
            >
              <UserCheck size={16} />
              <span>Invites</span>
              {incomingRequests.length > 0 && (
                <span className="badge-notification">{incomingRequests.length}</span>
              )}
            </button>
            <button 
              onClick={() => setSidebarTab('find')} 
              className={`sidebar-tab-btn ${sidebarTab === 'find' ? 'active' : ''}`}
            >
              <UserPlus size={16} />
              <span>Find Users</span>
            </button>
          </div>

          <div className="sidebar-tab-content">
            
            {/* View 1: Recent Chats (Conversations with message history) */}
            {sidebarTab === 'chats' && (
              <div className="sidebar-friends-section">
                <h4>Recent Chats</h4>
                {isLoadingActiveChats ? (
                  <div className="friends-loading">
                    <Loader2 className="animate-spin" size={20} />
                  </div>
                ) : activeChats.length === 0 ? (
                  <div className="no-friends-box">
                    <p className="no-friends-text">No active conversations yet.</p>
                    <button 
                      onClick={() => setSidebarTab('friends')}
                      className="btn-link-action"
                    >
                      Start a chat from your Friends list
                    </button>
                  </div>
                ) : (
                  <ul className="friends-list">
                    {activeChats.map((friend) => (
                      <li key={friend}>
                        <button
                          onClick={() => setActiveFriend(friend)}
                          className={`friend-btn ${activeFriend === friend ? 'active' : ''}`}
                        >
                          <div className="friend-avatar">
                            {friend.substring(0, 2).toUpperCase()}
                          </div>
                          <div className="friend-info-pane">
                            <span className="friend-username">@{friend}</span>
                            <span className="friend-status-text" style={{ fontSize: '0.75rem', opacity: 0.7 }}>Click to view chat</span>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* View 1.5: My Friends (All accepted relationships) */}
            {sidebarTab === 'friends' && (
              <div className="sidebar-friends-section">
                <h4>My Friends ({friends.length})</h4>
                {isLoadingFriends ? (
                  <div className="friends-loading">
                    <Loader2 className="animate-spin" size={20} />
                  </div>
                ) : friends.length === 0 ? (
                  <div className="no-friends-box">
                    <p className="no-friends-text">You haven't added any friends yet.</p>
                    <button 
                      onClick={() => setSidebarTab('find')}
                      className="btn-link-action"
                    >
                      Find friends by username
                    </button>
                  </div>
                ) : (
                  <ul className="friends-list">
                    {friends.map((friend) => (
                      <li key={friend}>
                        <button
                          onClick={() => {
                            setActiveFriend(friend);
                            setActiveChats(prev => {
                              if (prev.includes(friend)) return prev;
                              return [...prev, friend];
                            });
                            setSidebarTab('chats');
                          }}
                          className={`friend-btn ${activeFriend === friend ? 'active' : ''}`}
                        >
                          <div className="friend-avatar">
                            {friend.substring(0, 2).toUpperCase()}
                          </div>
                          <div className="friend-info-pane">
                            <span className="friend-username">@{friend}</span>
                            <span className="friend-status-text" style={{ fontSize: '0.75rem', opacity: 0.7 }}>Accepted Friend</span>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* View 2: Pending Invites */}
            {sidebarTab === 'invites' && (
              <div className="sidebar-requests-panel">
                <div className="requests-subpanel">
                  <h4>Incoming Invites ({incomingRequests.length})</h4>
                  {incomingRequests.length === 0 ? (
                    <p className="subpanel-empty-text">No incoming friend requests.</p>
                  ) : (
                    <ul className="friend-requests-list">
                      {incomingRequests.map((req) => (
                        <li key={req.id} className="request-item-card">
                          <span className="request-user">@{req.user_username}</span>
                          <div className="request-actions">
                            <button 
                              onClick={() => handleRequestResponse(req.id, 'accept')} 
                              className="accept-btn"
                              title="Accept Invite"
                            >
                              <Check size={14} />
                            </button>
                            <button 
                              onClick={() => handleRequestResponse(req.id, 'reject')} 
                              className="decline-btn"
                              title="Decline Invite"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="requests-subpanel" style={{ marginTop: '20px' }}>
                  <h4>Sent Requests ({outgoingRequests.length})</h4>
                  {outgoingRequests.length === 0 ? (
                    <p className="subpanel-empty-text">No pending sent requests.</p>
                  ) : (
                    <ul className="friend-requests-list">
                      {outgoingRequests.map((req) => (
                        <li key={req.id} className="request-item-card pending-outgoing">
                          <span className="request-user">@{req.friend_username}</span>
                          <span className="pending-badge">Pending</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {/* View 3: Find Users */}
            {sidebarTab === 'find' && (
              <div className="sidebar-search">
                <h4>Find Users by Username</h4>
                <form onSubmit={handleSearch} className="search-bar-form">
                  <div className="search-bar-wrapper">
                    <input
                      type="text"
                      placeholder="Type username..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="search-input"
                    />
                    <button type="submit" className="search-btn">
                      <Search size={18} />
                    </button>
                  </div>
                </form>

                {isSearching && (
                  <div className="search-status">
                    <Loader2 className="animate-spin text-primary" size={16} /> Searching...
                  </div>
                )}
                {searchError && <div className="search-error">{searchError}</div>}
                {searchResults.length > 0 && (
                  <ul className="search-results-list">
                    {searchResults.map((user) => (
                      <li key={user.username} className="search-result-item">
                        <div>
                          <span className="search-result-name">@{user.username}</span>
                          {user.name && <span className="search-result-fullname">({user.name})</span>}
                        </div>
                        <button
                          onClick={() => sendFriendRequest(user.username)}
                          className="add-friend-btn"
                          title="Send Friend Request"
                        >
                          <UserPlus size={16} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

          </div>
        </div>

        {/* Chat Window */}
        <div className="chat-window">
          {/* Status Message Banners */}
          {errorMsg && (
            <div className="chat-message-error" style={{ margin: '15px 15px 0 15px' }}>
              <AlertCircle size={16} /> {errorMsg}
            </div>
          )}
          {successMsg && (
            <div className="chat-message-success" style={{ margin: '15px 15px 0 15px' }}>
              <Check size={16} /> {successMsg}
            </div>
          )}

          {activeFriend ? (
            <>
              {/* Chat Header */}
              <div className="chat-header">
                <div className="friend-avatar">
                  {activeFriend.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <span className="chat-title">@{activeFriend}</span>
                  <span className="chat-subtitle">Direct Message</span>
                </div>
              </div>

              {/* Message Feed */}
              <div className="message-feed">
                {messages.length === 0 ? (
                  <div className="empty-chat-state">
                    <MessageSquare size={36} />
                    <p>No messages yet. Send a message or share a vault file to start the conversation!</p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isSelf = msg.sender_username === currentUser;
                    const dateObj = new Date(msg.created_at);
                    const formattedTime = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                    return (
                      <div 
                        key={msg.id} 
                        className={`message-bubble-wrapper ${isSelf ? 'self' : 'other'}`}
                      >
                        <div className="message-bubble">
                          {msg.content && <p className="msg-text">{msg.content}</p>}
                          
                          {/* File Attachment Card */}
                          {msg.file_url && (
                            <div className="msg-file-card">
                              <div className="msg-file-icon">
                                <FileText size={24} />
                              </div>
                              <div className="msg-file-details">
                                <span className="msg-file-name" title={msg.file_name}>
                                  {msg.file_name}
                                </span>
                                <span className="msg-file-size">
                                  {formatBytes(msg.file_size)}
                                </span>
                              </div>
                              <a 
                                href={getDownloadUrl(msg.file_url)} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="msg-file-download"
                                title="Download Attachment"
                                download={msg.file_name || true}
                              >
                                <Download size={16} />
                              </a>
                            </div>
                          )}
                          
                          <span className="msg-time">
                            <Clock size={10} /> {formattedTime}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input Area */}
              <form onSubmit={handleSendMessage} className="message-form-container">
                {selectedFile && (
                  <div className="input-file-preview-card">
                    <FileText size={18} className="text-primary" />
                    <span className="preview-filename">{selectedFile.name}</span>
                    <span className="preview-filesize">({formatBytes(selectedFile.size)})</span>
                    <button 
                      type="button" 
                      onClick={() => setSelectedFile(null)} 
                      className="clear-preview-btn"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
                
                <div className="message-input-wrapper">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                    accept=".pdf,.docx,.txt,image/*"
                  />
                  
                  {/* Option A: Upload file from computer */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current.click()}
                    className="attachment-trigger-btn"
                    title="Attach File from Device (PDF, DOCX, Images, TXT)"
                    disabled={isUploading}
                  >
                    <Paperclip size={20} />
                  </button>

                  {/* Option B: Choose existing file from Vault */}
                  <button
                    type="button"
                    onClick={openVaultModal}
                    className="attachment-trigger-btn vault-select-trigger"
                    title="Share File from Vault Workspace"
                    disabled={isUploading}
                  >
                    <Database size={20} />
                  </button>

                  <input
                    type="text"
                    placeholder="Type a message..."
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    className="msg-input"
                    disabled={isUploading}
                  />

                  <button
                    type="submit"
                    className="send-message-btn"
                    disabled={isUploading || (!messageInput.trim() && !selectedFile)}
                  >
                    {isUploading ? (
                      <Loader2 className="animate-spin" size={18} />
                    ) : (
                      <Send size={18} />
                    )}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="empty-chat-window">
              <MessageSquare size={48} className="empty-chat-icon" />
              <h3>Direct Messaging</h3>
              <p>Select a friend from the sidebar to open a conversation and share files safely.</p>
            </div>
          )}
        </div>

      </div>

      {/* Vault Materials Selection Modal */}
      {showVaultModal && (
        <div className="vault-modal-overlay">
          <div className="vault-modal-card glass-card">
            
            {/* Modal Header */}
            <div className="vault-modal-header">
              <div className="title-section">
                <Database className="title-icon" size={20} />
                <h3>Share from Vault</h3>
              </div>
              <button 
                onClick={() => setShowVaultModal(false)}
                className="close-modal-btn"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Search */}
            <div className="vault-modal-search">
              <div className="search-bar-wrapper">
                <input
                  type="text"
                  placeholder="Search vault materials by name or folder..."
                  value={vaultSearchQuery}
                  onChange={(e) => setVaultSearchQuery(e.target.value)}
                  className="search-input"
                />
                <div className="search-btn">
                  <Search size={18} />
                </div>
              </div>
            </div>

            {/* Modal Scroll List */}
            <div className="vault-modal-content">
              {isLoadingVault ? (
                <div className="modal-loading-box">
                  <Loader2 className="animate-spin" size={24} />
                  <p>Loading your materials...</p>
                </div>
              ) : filteredVaultFiles.length === 0 ? (
                <div className="modal-empty-box">
                  <FolderLock size={32} />
                  <p>No materials found matching your search.</p>
                </div>
              ) : (
                <div className="vault-file-grid">
                  {filteredVaultFiles.map((file) => (
                    <div key={file.id} className="vault-file-item-card">
                      <div className="file-card-header">
                        <FileText className="file-type-icon" size={24} />
                        <div className="file-naming">
                          <span className="file-title-text" title={file.original_name}>
                            {file.original_name}
                          </span>
                          <span className="file-size-text">
                            {formatBytes(file.file_size)}
                          </span>
                        </div>
                      </div>

                      <div className="file-card-meta">
                        {file.folder ? (
                          <span className="file-folder-badge">{file.folder}</span>
                        ) : (
                          <span className="file-folder-badge root-folder">Root Vault</span>
                        )}
                        <span className="file-date">
                          {new Date(file.created_at || Date.now()).toLocaleDateString()}
                        </span>
                      </div>

                      <button
                        onClick={() => handleShareVaultFile(file)}
                        className="btn-share-file"
                      >
                        <Share2 size={14} />
                        Share in Chat
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

export default ChatSection;
