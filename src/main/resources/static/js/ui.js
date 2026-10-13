// EjectCloud shared UI helpers: icons, toasts, formatting
(function () {
    const SPRITE = 'icons/sprite.svg';

    function icon(name, cls) {
        return `<svg class="icon ${cls || ''}" aria-hidden="true"><use href="${SPRITE}#i-${name}"></use></svg>`;
    }

    function escapeHtml(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /* ============ Toasts ============ */

    const TOAST_ICONS = { success: 'success', error: 'error', warning: 'warning', info: 'info' };

    function ensureStack() {
        let stack = document.getElementById('toastStack');
        if (!stack) {
            stack = document.createElement('div');
            stack.id = 'toastStack';
            stack.className = 'toast-stack';
            document.body.appendChild(stack);
        }
        return stack;
    }

    function ecToast(message, type, timeoutMs) {
        if (!type || !TOAST_ICONS[type]) type = 'info';
        const stack = ensureStack();

        while (stack.children.length >= 5) {
            stack.firstElementChild.remove();
        }

        const el = document.createElement('div');
        el.className = `toast ${type}`;
        el.setAttribute('role', 'status');
        el.innerHTML = `
            <span class="toast-icon">${icon(TOAST_ICONS[type])}</span>
            <span class="toast-msg"></span>
            <button class="toast-close" title="Закрыть">${icon('x')}</button>
        `;
        el.querySelector('.toast-msg').textContent = message;

        let closed = false;
        const close = () => {
            if (closed) return;
            closed = true;
            el.classList.add('leaving');
            setTimeout(() => el.remove(), 220);
        };

        el.querySelector('.toast-close').addEventListener('click', close);
        stack.appendChild(el);
        setTimeout(close, timeoutMs || 4200);
    }

    /* ============ Formatting ============ */

    function formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
        const v = bytes / Math.pow(k, i);
        return (i === 0 ? String(v) : parseFloat(v.toFixed(2))) + ' ' + sizes[i];
    }

    function pluralRu(n, one, few, many) {
        const abs = Math.abs(n) % 100;
        const d = abs % 10;
        if (abs > 10 && abs < 20) return many;
        if (d > 1 && d < 5) return few;
        if (d === 1) return one;
        return many;
    }

    function formatDate(value, withTime) {
        let d;
        try {
            d = new Date(value);
            if (isNaN(d.getTime())) return String(value || '-');
        } catch (e) {
            return String(value || '-');
        }
        const now = new Date();
        const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
        const dayMs = 86400000;
        const days = Math.round((startOfDay(now) - startOfDay(d)) / dayMs);
        const hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');

        if (days === 0) return withTime ? `Сегодня, ${hm}` : 'Сегодня';
        if (days === 1) return 'Вчера';
        if (days > 1 && days < 7) return `${days} ${pluralRu(days, 'день', 'дня', 'дней')} назад`;
        const p = (n) => String(n).padStart(2, '0');
        const base = `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
        return withTime ? `${base}, ${hm}` : base;
    }

    /* ============ File type detection ============ */

    const EXT_MAP = {
        image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif', 'ico', 'tiff'],
        video: ['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v', 'wmv'],
        audio: ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'opus'],
        pdf: ['pdf'],
        doc: ['doc', 'docx', 'odt', 'txt', 'md', 'rtf', 'tex'],
        sheet: ['xls', 'xlsx', 'csv', 'ods', 'numbers'],
        slide: ['ppt', 'pptx', 'odp', 'key'],
        archive: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'],
        code: ['js', 'ts', 'jsx', 'tsx', 'java', 'py', 'rb', 'go', 'rs', 'c', 'cpp', 'h', 'cs', 'php', 'html', 'css', 'scss', 'json', 'xml', 'yml', 'yaml', 'toml', 'sh', 'ps1', 'sql', 'bat']
    };

    const KIND_ICON = {
        folder: 'folder',
        image: 'image',
        video: 'video',
        audio: 'music',
        pdf: 'file-text',
        doc: 'file-text',
        sheet: 'chart',
        slide: 'presentation',
        archive: 'archive',
        code: 'code',
        file: 'file'
    };

    function extOf(name) {
        const base = String(name || '').split('/').pop();
        const dot = base.lastIndexOf('.');
        if (dot === -1 || dot === 0) return '';
        return base.slice(dot + 1).toLowerCase().slice(0, 10);
    }

    function fileKind(name, isFolder) {
        if (isFolder) return { kind: 'folder', icon: 'folder', cls: 'ft-folder' };
        const ext = extOf(name);
        for (const kind in EXT_MAP) {
            if (EXT_MAP[kind].includes(ext)) {
                return { kind, icon: KIND_ICON[kind], cls: 'ft-' + kind };
            }
        }
        return { kind: 'file', icon: 'file', cls: 'ft-file' };
    }

    window.EcUtil = {
        icon,
        escapeHtml,
        ecToast,
        formatBytes,
        formatDate,
        fileKind,
        extOf,
        pluralRu
    };
})();
