// Preview page logic
(function () {
    const params = new URLSearchParams(window.location.search);
    const fileId = params.get('fileId');
    const returnTo = params.get('returnTo') || '/';

    let accessToken = localStorage.getItem('eject_access_token');
    const refreshToken = localStorage.getItem('eject_refresh_token');

    const $toast = document.getElementById('toast');
    const $fileTitle = document.getElementById('fileTitle');
    const $fileType = document.getElementById('fileType');
    const $fileSize = document.getElementById('fileSize');
    const $fileUploaded = document.getElementById('fileUploaded');
    const $actions = document.getElementById('actions');
    const $preview = document.getElementById('preview');
    const $qrModal = document.getElementById('qrModal');
    const $qrContainer = document.getElementById('qrCodeContainer');
    const $qrUrl = document.getElementById('qrShareUrl');
    const $qrCopyBtn = document.getElementById('qrCopyBtn');
    const $qrDeleteShareBtn = document.getElementById('qrDeleteShareBtn');
    const $qrCloseBtn = document.getElementById('qrCloseBtn');
    const $qrCloseX = document.getElementById('qrCloseX');

    let currentShareUrl = '';

    function toast(msg) {
        $toast.textContent = msg;
        $toast.style.display = 'block';
        setTimeout(() => { $toast.style.display = 'none'; }, 1800);
    }

    function esc(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function fmtSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
    }

    async function tryRefreshToken() {
        if (!refreshToken) return false;
        try {
            const r = await fetch('/api/auth/refresh?refreshToken=' + encodeURIComponent(refreshToken), { method: 'POST' });
            if (!r.ok) return false;
            const j = await r.json().catch(() => null);
            if (!j || !j.accessToken) return false;
            accessToken = j.accessToken;
            localStorage.setItem('eject_access_token', accessToken);
            return true;
        } catch {
            return false;
        }
    }

    async function fetchWithRefresh(url, options) {
        if (!options) options = {};
        if (!options.headers) options.headers = {};
        options.headers['Authorization'] = 'Bearer ' + accessToken;
        let r = await fetch(url, options);
        if (r.status !== 401) return r;
        const ok = await tryRefreshToken();
        if (!ok) return r;
        options.headers['Authorization'] = 'Bearer ' + accessToken;
        return fetch(url, options);
    }

    function apiUrl(path) {
        return path;
    }

    function makeBtn(label, cls, onClick) {
        const b = document.createElement('button');
        b.className = 'btn ' + cls;
        b.textContent = label;
        b.onclick = onClick;
        return b;
    }

    async function copyText(text) {
        try {
            await navigator.clipboard.writeText(text);
            toast('Скопировано');
        } catch {
            prompt('Скопируйте:', text);
        }
    }

    function showQRModal(shareUrl) {
        currentShareUrl = shareUrl;
        $qrContainer.innerHTML = '';
        $qrUrl.textContent = shareUrl;

        new QRCode($qrContainer, {
            text: shareUrl,
            width: 256,
            height: 256,
            colorDark: '#2c3e50',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.H
        });

        $qrModal.style.display = 'block';
        $qrModal.setAttribute('aria-hidden', 'false');
    }

    function closeQRModal() {
        $qrModal.style.display = 'none';
        $qrModal.setAttribute('aria-hidden', 'true');
        $qrContainer.innerHTML = '';
        currentShareUrl = '';
    }

    async function openShareModal() {
        const res = await fetchWithRefresh(apiUrl('/api/files/share?fileId=' + encodeURIComponent(fileId)), { method: 'POST' });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
            toast('Ошибка ссылки');
            return;
        }
        showQRModal(window.location.origin + (j.shareUrl || ''));
    }

    async function deleteShareLink() {
        if (!confirm('Удалить ссылку на файл?')) return;
        const res = await fetchWithRefresh(apiUrl('/api/files/share?fileId=' + encodeURIComponent(fileId)), { method: 'DELETE' });
        if (!res.ok) {
            toast('Ошибка удаления ссылки');
            return;
        }
        closeQRModal();
        toast('Ссылка удалена');
    }

    async function loadInfo() {
        if (!fileId) {
            $preview.innerHTML = '<div class="hint">Файл не выбран</div>';
            return;
        }
        if (!accessToken) {
            window.location.href = '/login.html';
            return;
        }

        const r = await fetchWithRefresh(apiUrl('/api/files/info?fileId=' + encodeURIComponent(fileId)));
        if (!r.ok) {
            $preview.innerHTML = '<div class="hint">Файл не найден</div>';
            return;
        }
        const info = await r.json();
        return info;
    }

    function renderActions(info) {
        $actions.innerHTML = '';

        $actions.appendChild(makeBtn('Скачать', 'primary', () => {
            const a = document.createElement('a');
            a.style.display = 'none';
            document.body.appendChild(a);
            fetchWithRefresh('/api/files/download?fileId=' + encodeURIComponent(fileId))
                .then(r => { if (!r.ok) throw new Error('Download failed'); return r.blob(); })
                .then(blob => { const url = URL.createObjectURL(blob); a.href = url; a.download = info.filename || fileId; a.click(); URL.revokeObjectURL(url); })
                .catch(e => toast('Ошибка: ' + e.message))
                .finally(() => a.remove());
        }));

        $actions.appendChild(makeBtn('Поделиться', 'light', openShareModal));

        $actions.appendChild(makeBtn('Переименовать', 'light', async () => {
            const currentName = (info && info.filename) ? info.filename : (fileId.split('/').pop());
            const newName = prompt('Новое имя файла:', currentName);
            if (!newName) return;

            const body = new URLSearchParams();
            body.append('fileId', fileId);
            body.append('newName', newName);

            const res = await fetchWithRefresh('/api/files/rename', { method: 'POST', body });
            if (!res.ok) {
                toast('Ошибка переименования');
                return;
            }
            window.location.href = returnTo;
        }));

        const delBtn = makeBtn('', 'danger icon-only', async () => {
            if (!confirm('Переместить в корзину?')) return;
            const res = await fetchWithRefresh('/api/files/delete?id=' + encodeURIComponent(fileId), { method: 'DELETE' });
            if (!res.ok) {
                toast('Ошибка удаления');
                return;
            }
            window.location.href = returnTo;
        });
        delBtn.innerHTML = '<img class="icon" src="icons/trash.svg" alt="" aria-hidden="true">';
        delBtn.title = 'Удалить';
        $actions.appendChild(delBtn);
    }

    function getExtension(name) {
        const base = String(name || '');
        const dot = base.lastIndexOf('.');
        if (dot === -1) return '';
        const ext = base.slice(dot + 1).trim();
        if (!ext) return '';
        return ext.slice(0, 8).toUpperCase();
    }

    async function renderPreview(info) {
        const viewParams = 'fileId=' + encodeURIComponent(fileId);
        const ct = (info.contentType || '').toLowerCase();
        $preview.innerHTML = '';

        const isImage = ct.startsWith('image/') && !ct.includes('svg');
        const isVideo = ct.startsWith('video/');
        const isTextByType = ct.startsWith('text/') || ct === 'application/json' || ct === 'application/xml';

        if (isImage) {
            const img = document.createElement('img');
            img.alt = info.filename || 'image';
            fetchWithRefresh('/api/files/view?' + viewParams)
                .then(r => { if (r.ok) return r.blob(); throw new Error(); })
                .then(blob => { img.src = URL.createObjectURL(blob); })
                .catch(() => { img.alt = 'Failed to load'; });
            $preview.appendChild(img);
            return;
        }

        if (isVideo) {
            const v = document.createElement('video');
            v.controls = true;
            v.playsInline = true;
            v.preload = 'metadata';
            fetchWithRefresh('/api/files/stream-token?fileId=' + encodeURIComponent(fileId), { method: 'POST' })
                .then(r => { if (r.ok) return r.json(); throw new Error('stream-token HTTP ' + r.status); })
                .then(data => {
                    v.src = '/api/files/stream?fileId=' + encodeURIComponent(fileId) + '&token=' + encodeURIComponent(data.token);
                    v.load();
                })
                .catch((e) => {
                    $preview.innerHTML = '<div class="hint">Не удалось открыть видео: ' + esc(e.message || 'ошибка') + '</div>';
                });
            $preview.appendChild(v);
            return;
        }

        if (isTextByType || (info.size !== undefined && info.size !== null && Number(info.size) <= 2 * 1024 * 1024)) {
            const r = await fetchWithRefresh('/api/files/text?' + viewParams);
            if (r.ok) {
                const t = await r.text();

                const controls = document.createElement('div');
                controls.className = 'text-controls';

                const wrapKey = 'ec_preview_wrap_v1';
                const wrapDefault = true;
                const wrapState = localStorage.getItem(wrapKey);
                let wrapOn = wrapState === null ? wrapDefault : (wrapState === '1');

                const toggle = document.createElement('button');
                toggle.className = 'btn light toggle';
                toggle.textContent = wrapOn ? 'Перенос: вкл' : 'Перенос: выкл';
                controls.appendChild(toggle);

                const pre = document.createElement('pre');
                pre.textContent = t;

                if (!wrapOn) {
                    pre.classList.add('no-wrap');
                }

                toggle.onclick = () => {
                    wrapOn = !wrapOn;
                    localStorage.setItem(wrapKey, wrapOn ? '1' : '0');
                    toggle.textContent = wrapOn ? 'Перенос: вкл' : 'Перенос: выкл';
                    pre.classList.toggle('no-wrap', !wrapOn);
                };

                $preview.appendChild(controls);
                $preview.appendChild(pre);
                return;
            }
        }

        const ext = getExtension(info.filename || fileId);
        const badge = document.createElement('div');
        badge.className = 'file-badge';
        badge.innerHTML = `<div class="file-ext">${esc(ext || 'FILE')}</div>`;

        const center = document.createElement('div');
        center.className = 'center';
        center.innerHTML = `
            <div class="filename">${esc(info.filename || fileId)}</div>
            <div class="hint">Формат файла не поддерживает предпросмотр. Нажмите "Скачать".</div>
        `;

        $preview.appendChild(badge);
        $preview.appendChild(center);
    }

    document.getElementById('backBtn').onclick = () => {
        try {
            window.location.href = returnTo;
        } catch {
            history.back();
        }
    };

    $qrCopyBtn.onclick = () => copyText(currentShareUrl);
    $qrDeleteShareBtn.onclick = deleteShareLink;
    $qrCloseBtn.onclick = closeQRModal;
    $qrCloseX.onclick = closeQRModal;
    $qrModal.addEventListener('click', (e) => {
        if (e.target === $qrModal) closeQRModal();
    });

    (async () => {
        const info = await loadInfo();
        if (!info) return;

        $fileTitle.textContent = info.filename || fileId;
        $fileType.textContent = info.contentType || '-';
        $fileSize.textContent = fmtSize(info.size || 0);
        try {
            $fileUploaded.textContent = new Date(info.uploadedAt).toLocaleString();
        } catch {
            $fileUploaded.textContent = String(info.uploadedAt || '-');
        }

        renderActions(info);
        await renderPreview(info);
    })().catch((e) => {
        $preview.innerHTML = '<div class="hint">Error: ' + esc(e.message || e) + '</div>';
    });
})();
