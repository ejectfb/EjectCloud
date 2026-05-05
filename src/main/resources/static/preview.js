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

    function getToken() {
        return accessToken;
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

    function replaceToken(url) {
        const u = new URL(url, window.location.origin);
        u.searchParams.set('token', accessToken);
        return u.toString();
    }

    async function fetchWithRefresh(url, options) {
        let r = await fetch(url, options);
        if (r.status !== 401) return r;
        const ok = await tryRefreshToken();
        if (!ok) return r;
        return fetch(replaceToken(url), options);
    }

    function apiUrl(path) {
        const token = getToken();
        const glue = path.includes('?') ? '&' : '?';
        return path + glue + 'token=' + encodeURIComponent(token);
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
        const token = getToken();

        const downloadUrl = '/api/files/download?fileId=' + encodeURIComponent(fileId) + '&token=' + encodeURIComponent(token);
        const shareUrl = '/api/files/share?fileId=' + encodeURIComponent(fileId) + '&token=' + encodeURIComponent(token);

        $actions.appendChild(makeBtn('Скачать', 'primary', () => {
            window.location.href = downloadUrl;
        }));

        $actions.appendChild(makeBtn('Поделиться', 'light', async () => {
            const res = await fetchWithRefresh(shareUrl, { method: 'POST' });
            const j = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast('Ошибка ссылки');
                return;
            }
            const full = window.location.origin + (j.shareUrl || '');
            await copyText(full);
        }));

        $actions.appendChild(makeBtn('Переименовать', 'light', async () => {
            const currentName = (info && info.filename) ? info.filename : (fileId.split('/').pop());
            const newName = prompt('Новое имя файла:', currentName);
            if (!newName) return;

            const body = new URLSearchParams();
            body.append('fileId', fileId);
            body.append('newName', newName);

            const res = await fetchWithRefresh('/api/files/rename?token=' + encodeURIComponent(getToken()), { method: 'POST', body });
            if (!res.ok) {
                toast('Ошибка переименования');
                return;
            }
            window.location.href = returnTo;
        }));

        const delBtn = makeBtn('🗑️', 'danger icon-only', async () => {
            if (!confirm('Переместить в корзину?')) return;
            const delUrl = '/api/files/delete?id=' + encodeURIComponent(fileId) + '&token=' + encodeURIComponent(token);
            const res = await fetchWithRefresh(delUrl, { method: 'DELETE' });
            if (!res.ok) {
                toast('Ошибка удаления');
                return;
            }
            window.location.href = returnTo;
        });
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
        const token = getToken();
        const viewUrl = '/api/files/view?fileId=' + encodeURIComponent(fileId) + '&token=' + encodeURIComponent(token);

        const ct = (info.contentType || '').toLowerCase();
        $preview.innerHTML = '';

        // Basic allow-list for inline preview
        const isImage = ct.startsWith('image/') && !ct.includes('svg');
        const isVideo = ct.startsWith('video/');
        const isTextByType = ct.startsWith('text/') || ct === 'application/json' || ct === 'application/xml';

        if (isImage) {
            const img = document.createElement('img');
            img.src = viewUrl;
            img.alt = info.filename || 'image';
            $preview.appendChild(img);
            return;
        }

        if (isVideo) {
            const v = document.createElement('video');
            v.controls = true;
            v.playsInline = true;
            v.preload = 'metadata';
            v.src = viewUrl;
            $preview.appendChild(v);
            return;
        }

        // Try text preview for small files even if content-type is unknown (.vpn, .conf, etc.)
        if (isTextByType || (info.size !== undefined && info.size !== null && Number(info.size) <= 2 * 1024 * 1024)) {
            const textUrl = '/api/files/text?fileId=' + encodeURIComponent(fileId) + '&token=' + encodeURIComponent(token);
            const r = await fetchWithRefresh(textUrl);
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
