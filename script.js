document.addEventListener('DOMContentLoaded', () => {
    const fileModeBtn = document.getElementById('fileModeBtn');
    const folderModeBtn = document.getElementById('folderModeBtn');
    const fileInput = document.getElementById('fileInput');
    const folderInput = document.getElementById('folderInput');
    const dropZone = document.getElementById('dropZone');
    const browseBtn = document.getElementById('browseBtn');
    const fileListSection = document.getElementById('fileListSection');
    const fileList = document.getElementById('fileList');
    const fileCountLabel = document.getElementById('fileCount');
    const uploadIcon = document.getElementById('uploadIcon');
    const clearBtn = document.getElementById('clearBtn');
    const uploadAllBtn = document.getElementById('uploadAllBtn');
    const toastContainer = document.getElementById('toastContainer');

    let currentMode = 'file'; // 'file' or 'folder'
    let selectedFiles = [];

    // --- Mode Switching ---
    fileModeBtn.addEventListener('click', () => {
        currentMode = 'file';
        fileModeBtn.classList.add('active');
        folderModeBtn.classList.remove('active');
        uploadIcon.setAttribute('data-lucide', 'file-up');
        lucide.createIcons();
    });

    folderModeBtn.addEventListener('click', () => {
        currentMode = 'folder';
        folderModeBtn.classList.add('active');
        fileModeBtn.classList.remove('active');
        uploadIcon.setAttribute('data-lucide', 'folder-up');
        lucide.createIcons();
    });

    // --- Selection Logic ---
    browseBtn.addEventListener('click', () => {
        if (currentMode === 'file') {
            fileInput.click();
        } else {
            folderInput.click();
        }
    });

    dropZone.addEventListener('click', (e) => {
        if (e.target !== browseBtn) {
            if (currentMode === 'file') {
                fileInput.click();
            } else {
                folderInput.click();
            }
        }
    });

    fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
    folderInput.addEventListener('change', (e) => handleFiles(e.target.files));

    // --- Drag & Drop ---
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.add('drag-over');
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.remove('drag-over');
        });
    });

    dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFiles(files);
    });

    // --- File Handling ---
    function handleFiles(files) {
        const newFiles = Array.from(files);
        
        // Basic validation (only materials)
        const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
        
        const validFiles = newFiles.filter(file => {
            const ext = file.name.split('.').pop().toLowerCase();
            return allowedTypes.includes(file.type) || ['pdf', 'docx', 'txt'].includes(ext);
        });

        if (validFiles.length < newFiles.length) {
            showToast('Some files were skipped. Only PDF, DOCX, and TXT are supported.', 'error');
        }

        selectedFiles = [...selectedFiles, ...validFiles];
        updateUI();
    }

    function updateUI() {
        if (selectedFiles.length > 0) {
            fileListSection.style.display = 'block';
            fileCountLabel.textContent = `${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''}`;
            renderFileList();
        } else {
            fileListSection.style.display = 'none';
        }
    }

    function renderFileList() {
        fileList.innerHTML = '';
        selectedFiles.forEach((file, index) => {
            const item = document.createElement('div');
            item.className = 'file-item';
            
            const size = (file.size / 1024).toFixed(1);
            const sizeStr = size > 1024 ? (size / 1024).toFixed(1) + ' MB' : size + ' KB';
            
            item.innerHTML = `
                <div class="file-icon">
                    <i data-lucide="file-text"></i>
                </div>
                <div class="file-info">
                    <span class="file-name">${file.name}</span>
                    <div class="file-meta">
                        <span>${sizeStr}</span>
                        <span class="status">Ready to upload</span>
                    </div>
                    <div class="progress-bar-container" style="display: none;">
                        <div class="progress-bar" id="progress-${index}"></div>
                    </div>
                </div>
                <button class="remove-btn" onclick="removeFile(${index})">
                    <i data-lucide="x"></i>
                </button>
            `;
            fileList.appendChild(item);
        });
        lucide.createIcons();
    }

    window.removeFile = (index) => {
        selectedFiles.splice(index, 1);
        updateUI();
    };

    clearBtn.addEventListener('click', () => {
        selectedFiles = [];
        updateUI();
        showToast('All files cleared', 'success');
    });

    // --- Simulated Upload ---
    uploadAllBtn.addEventListener('click', () => {
        if (selectedFiles.length === 0) return;

        uploadAllBtn.disabled = true;
        uploadAllBtn.querySelector('span').textContent = 'Uploading...';
        
        const fileItems = document.querySelectorAll('.file-item');
        
        selectedFiles.forEach((file, index) => {
            const progressBarContainer = fileItems[index].querySelector('.progress-bar-container');
            const progressBar = fileItems[index].querySelector('.progress-bar');
            const statusLabel = fileItems[index].querySelector('.status');
            
            progressBarContainer.style.display = 'block';
            statusLabel.textContent = 'Uploading...';

            let progress = 0;
            const interval = setInterval(() => {
                progress += Math.random() * 30;
                if (progress >= 100) {
                    progress = 100;
                    clearInterval(interval);
                    statusLabel.textContent = 'Completed';
                    statusLabel.style.color = 'var(--primary)';
                    
                    // Check if all are done
                    if (Array.from(document.querySelectorAll('.status')).every(s => s.textContent === 'Completed')) {
                        finishUpload();
                    }
                }
                progressBar.style.width = progress + '%';
            }, 300);
        });
    });

    function finishUpload() {
        showToast(`Successfully uploaded ${selectedFiles.length} materials!`, 'success');
        setTimeout(() => {
            selectedFiles = [];
            updateUI();
            uploadAllBtn.disabled = false;
            uploadAllBtn.querySelector('span').textContent = 'Upload Materials';
        }, 1500);
    }

    // --- Toast System ---
    function showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        const icon = type === 'success' ? 'check-circle' : 'alert-circle';
        
        toast.innerHTML = `
            <i data-lucide="${icon}"></i>
            <span>${message}</span>
        `;
        
        toastContainer.appendChild(toast);
        lucide.createIcons();

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(20px)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
});
