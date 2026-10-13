    const params = new URLSearchParams(window.location.search);
    let oldToken = params.get('token');
    let accessToken = localStorage.getItem('eject_access_token');
    let refreshToken = localStorage.getItem('eject_refresh_token');

    const $login = document.getElementById('login');
    const $app = document.getElementById('app');
    const $who = document.getElementById('who');
    const $timer = document.getElementById('timer');
    const $fileTree = document.getElementById('fileTree');
    const $filesTable = document.getElementById('filesTable').querySelector('tbody');
    const $currentPath = document.getElementById('currentPath');
    const $fileInput = document.getElementById('fileInput');
    const $filesList = document.getElementById('filesList');
    const $filesContainer = document.querySelector('.files-container');
    const $fileArea = document.getElementById('fileArea');
    const $dropzoneOverlay = document.getElementById('dropzoneOverlay');

    const $drawerBackdrop = document.getElementById('drawerBackdrop');
    const $menuBtn = document.getElementById('menuBtn');

    let currentPath = '';
    let allFiles = [];
    let allFolders = [];
    let trashFiles = [];
    let trashFolders = [];
    let isInTrash = false;
    let selectedMoveFile = null;
    let selectedTargetFolder = '';
    let confirmCallback = null;
    let refreshInterval = null;
    let uploadQueue = [];
    let isUploading = false;
    let selectedItems = new Set();
    let currentTelegramVerified = false;

    let uploadTotalBytes = 0;
    let uploadDoneBytes = 0;
    let currentUploadFile = null;
    let currentUploadLoaded = 0;
    let currentUploadTotal = 0;
    let uploadSpeedLine = '';
    let uploadSizeLine = '';

    function getAuthHeaders() {
        return { 'Authorization': 'Bearer ' + (accessToken || '') };
    }

    function debugAuth() {
        console.log('accessToken present:', !!accessToken);
        console.log('accessToken length:', accessToken ? accessToken.length : 0);
        if (accessToken) console.log('accessToken preview:', accessToken.slice(0, 20) + '...');
    }

    function authFetch(url, options = {}) {
        return fetch(url, {
            method: options.method || 'GET',
            headers: { 'Authorization': 'Bearer ' + (accessToken || ''), ...(options.headers || {}) },
            body: options.body,
            signal: options.signal
        });
    }

    async function checkJson(response) {
        const text = await response.text();
        if (!text) {
            if (!response.ok) throw new Error('HTTP ' + response.status + ' ' + response.statusText);
            return null;
        }
        try {
            return JSON.parse(text);
        } catch (e) {
            throw new Error('HTTP ' + response.status + ': ' + text.slice(0, 200));
        }
    }

    function itemKey(kind, id) {
        return kind + ':' + id;
    }

    function iconHtml(name, className = '') {
        if (window.EcUtil && EcUtil.icon) return EcUtil.icon(name, className);
        return `<span class="icon icon-fallback" data-icon="${name}"></span>`;
    }

    /* ---- View / sort / search state ---- */

    let viewMode = 'list'; // list | grid
    let sortBy = 'date';   // name | size | date
    let sortDir = 'desc';  // asc | desc
    let searchQuery = '';

    function loadViewPrefs() {
        try {
            const p = JSON.parse(localStorage.getItem('ec_view') || '{}');
            if (p.viewMode === 'grid' || p.viewMode === 'list') viewMode = p.viewMode;
            if (p.sortBy === 'name' || p.sortBy === 'size' || p.sortBy === 'date') sortBy = p.sortBy;
            if (p.sortDir === 'asc' || p.sortDir === 'desc') sortDir = p.sortDir;
        } catch (e) { /* ignore */ }
    }

    function saveViewPrefs() {
        try {
            localStorage.setItem('ec_view', JSON.stringify({ viewMode, sortBy, sortDir }));
        } catch (e) { /* ignore */ }
    }

    loadViewPrefs();

    function applyViewMode() {
        const mobile = isMobileLayout();
        if (document.body) document.body.classList.toggle('view-grid', !mobile && viewMode === 'grid');
        const useTable = !mobile && viewMode === 'list';
        if ($filesContainer) $filesContainer.style.display = useTable ? 'block' : 'none';
        if ($filesList) $filesList.classList.toggle('hidden', useTable);
        const lb = document.getElementById('viewListBtn');
        const gb = document.getElementById('viewGridBtn');
        if (lb) lb.classList.toggle('active', viewMode === 'list');
        if (gb) gb.classList.toggle('active', viewMode === 'grid');
    }

    window.setViewMode = function (mode) {
        if (viewMode === mode) return;
        viewMode = mode;
        saveViewPrefs();
        applyViewMode();
        if (isInTrash) showTrash(); else showFilesInPath(currentPath);
    };

    window.sortFiles = function (key) {
        if (sortBy === key) {
            sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        } else {
            sortBy = key;
            sortDir = key === 'name' ? 'asc' : 'desc';
        }
        saveViewPrefs();
        updateSortHeaders();
        if (isInTrash) showTrash(); else showFilesInPath(currentPath);
    };

    function updateSortHeaders() {
        document.querySelectorAll('#filesTable thead th.sortable').forEach(th => {
            const k = th.dataset.sort;
            th.classList.toggle('sort-active', k === sortBy);
            th.classList.toggle('sort-desc', k === sortBy && sortDir === 'desc');
        });
    }

    function matchesSearch(name) {
        if (!searchQuery) return true;
        return String(name || '').toLowerCase().includes(searchQuery);
    }

    const $searchInput = document.getElementById('searchInput');
    if ($searchInput) {
        $searchInput.addEventListener('input', () => {
            searchQuery = $searchInput.value.trim().toLowerCase();
            if (isInTrash) showTrash(); else showFilesInPath(currentPath);
        });
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K' || e.key === 'л')) {
                e.preventDefault();
                $searchInput.focus();
                $searchInput.select();
            } else if (e.key === 'Escape' && document.activeElement === $searchInput) {
                $searchInput.value = '';
                searchQuery = '';
                if (isInTrash) showTrash(); else showFilesInPath(currentPath);
            }
        });
    }

    /* ---- Avatars ---- */

    const AVATAR_COLORS = ['#e08a0e', '#2563eb', '#16a34a', '#8b5cf6', '#ec4899', '#0ea5e9', '#dc2f2f', '#0d9488'];

    function initialsOf(name) {
        const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
        if (parts.length === 0) return '?';
        if (parts.length > 1) return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
        return parts[0].slice(0, 2).toUpperCase();
    }

    function paintAvatar(el, name) {
        if (!el) return;
        el.textContent = initialsOf(name);
        const seed = String(name || '').charCodeAt(0) || 0;
        el.style.background = AVATAR_COLORS[seed % AVATAR_COLORS.length];
    }

    /* ---- Notifications (delegated to shared toast stack) ---- */

    function showNotification(message, type = 'info') {
        if (window.EcUtil && EcUtil.ecToast) {
            EcUtil.ecToast(String(message), type, type === 'error' ? 6500 : 4200);
            return;
        }
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notification.style.display = 'flex';
        notification.style.alignItems = 'center';
        document.body.appendChild(notification);
        setTimeout(() => { if (notification.parentElement) notification.remove(); }, 30000);
    }

    function parseItemKey(key) {
        const idx = key.indexOf(':');
        if (idx === -1) return { kind: 'file', id: key };
        return { kind: key.slice(0, idx), id: key.slice(idx + 1) };
    }

    function selectedByKind(kind) {
        return Array.from(selectedItems)
            .map(parseItemKey)
            .filter(x => x.kind === kind)
            .map(x => x.id);
    }

    function formatTimestamp() {
        const d = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + '_' +
            pad(d.getHours()) + '-' + pad(d.getMinutes()) + '-' + pad(d.getSeconds());
    }

    const expandedStorage = new Set();
    const expandedTrash = new Set();
    
    const $quotaProgress = document.getElementById('quotaProgress');
    const $quotaText = document.getElementById('quotaText');

    function isMobileLayout() {
        return window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
    }

    function setMobileListMode(enabled) {
        if (!$filesContainer || !$filesList) return;
        if (enabled) {
            $filesContainer.style.display = 'none';
            $filesList.classList.remove('hidden');
        } else {
            $filesContainer.style.display = 'block';
            $filesList.classList.add('hidden');
        }
    }

    function openDrawer() {
        document.body.classList.add('drawer-open');
    }

    function closeDrawer() {
        document.body.classList.remove('drawer-open');
    }

    function toggleDrawer() {
        if (document.body.classList.contains('drawer-open')) {
            closeDrawer();
        } else {
            openDrawer();
        }
    }

    window.openDrawer = openDrawer;
    window.closeDrawer = closeDrawer;
    window.toggleDrawer = toggleDrawer;

    // TaskCenter close hook: allow per-task cleanup
    window.addEventListener('taskcenter:close', (e) => {
        const task = e && e.detail && e.detail.task;
        if (!task) return;
        if (task.meta && task.meta.type === 'archive' && task.meta.jobId) {
            const token = getAuthToken();
            authFetch(`/api/files/archive?jobId=${encodeURIComponent(task.meta.jobId)}`, {
                method: 'DELETE'
            }).catch(() => {});
        }
    });

    if ($drawerBackdrop) {
        $drawerBackdrop.addEventListener('click', closeDrawer);
    }
    // menuBtn and drawerBackdrop also have inline onclick handlers in HTML.
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeDrawer();
        }
    });

    async function copyTextOrPrompt(text, promptTitle) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (e) {
            prompt(promptTitle || 'Скопируйте:', text);
            return false;
        }
    }

    // Actions modal (mobile-friendly)
    const $actionsModal = document.getElementById('actionsModal');
    const $actionsTitle = document.getElementById('actionsTitle');
    const $actionsBody = document.getElementById('actionsBody');

    function closeActionsModal() {
        if ($actionsModal) $actionsModal.style.display = 'none';
        if ($actionsBody) $actionsBody.innerHTML = '';
    }
    window.closeActionsModal = closeActionsModal;

    if ($actionsModal) {
        $actionsModal.addEventListener('click', (e) => {
            if (e.target === $actionsModal) closeActionsModal();
        });
    }

    function addActionButton(text, className, onClick) {
        const btn = document.createElement('button');
        btn.className = className;
        btn.textContent = text;
        btn.onclick = () => {
            try { onClick(); } finally { closeActionsModal(); }
        };
        $actionsBody.appendChild(btn);
    }

    window.openItemActions = function(kind, id) {
        if (!$actionsModal || !$actionsTitle || !$actionsBody) return;
        $actionsBody.innerHTML = '';

        const inTrashNow = isInTrash;
        let title = 'Действия';

        if (kind === 'file') {
            const fileName = id.includes('/') ? id.split('/').pop() : id;
            title = fileName;
        } else if (kind === 'folder') {
            const folderName = id.includes('/') ? id.split('/').pop() : id;
            title = folderName;
        }
        if (inTrashNow) title += ' (Корзина)';
        $actionsTitle.textContent = title;

        if (inTrashNow) {
            addActionButton('Восстановить', 'success', () => restoreFromTrash(id));
            addActionButton('Удалить навсегда', 'danger', () => deleteFromTrash(id));
        } else if (kind === 'folder') {
            addActionButton('Скачать папку', 'primary', () => downloadFolderArchive(id));
            addActionButton('Переименовать', 'secondary', () => renameFolder(id));
            addActionButton('Удалить папку', 'danger', () => deleteFolder(id));
        } else {
            // file
            addActionButton('Скачать', 'primary', () => downloadFile(id));
            addActionButton('Поделиться', 'secondary', () => shareFile(id));
            addActionButton('Отправить в Telegram', 'success', () => shareFileToTelegram(id));

            const fileObj = allFiles.find(f => f.id === id);
            if (fileObj && fileObj.shared && fileObj.shareExpiresAt) {
                addActionButton('Удалить ссылку', 'secondary', () => deleteShareLink(id));
            }

            addActionButton('Переименовать', 'secondary', () => renameFile(id));
            addActionButton('Переместить', 'secondary', () => moveFileDialog(id));
            addActionButton('Удалить', 'danger', () => deleteFile(id));
        }

        $actionsModal.style.display = 'block';
    };

    function openPreview(fileId) {
        const returnTo = window.location.pathname + window.location.search;
        window.location.href = `/preview.html?fileId=${encodeURIComponent(fileId)}&returnTo=${encodeURIComponent(returnTo)}`;
    }

    window.openPreview = openPreview;

