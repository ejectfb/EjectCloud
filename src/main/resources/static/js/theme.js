// EjectCloud theme manager (light/dark + system sync)
(function () {
    const KEY = 'ec_theme';

    function systemTheme() {
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    function current() {
        let t = null;
        try { t = localStorage.getItem(KEY); } catch (e) {}
        return t === 'dark' || t === 'light' ? t : systemTheme();
    }

    function apply(theme) {
        document.documentElement.setAttribute('data-theme', theme);
    }

    function init() {
        apply(current());

        // Follow system changes only while user hasn't chosen manually
        if (window.matchMedia) {
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
                let stored = null;
                try { stored = localStorage.getItem(KEY); } catch (err) {}
                if (!stored) apply(e.matches ? 'dark' : 'light');
            });
        }

        // Update icon state on existing toggle buttons
        document.querySelectorAll('[data-theme-toggle]').forEach(bindToggle);
        syncIcons();
    }

    function set(choice) {
        try {
            if (choice === 'system') localStorage.removeItem(KEY);
            else localStorage.setItem(KEY, choice);
        } catch (e) {}
        apply(current());
        syncIcons();
    }

    function bindToggle(btn) {
        if (btn._ecBound) return;
        btn._ecBound = true;
        btn.addEventListener('click', () => set(current() === 'dark' ? 'light' : 'dark'));
    }

    function syncIcons() {
        const dark = current() === 'dark';
        const iconHtml = window.EcUtil && EcUtil.icon ? EcUtil.icon(dark ? 'sun' : 'moon') : '';
        document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
            btn.innerHTML = iconHtml;
            btn.title = dark ? 'Светлая тема' : 'Тёмная тема';
        });
    }

    window.EcTheme = {
        current,
        set: set,
        toggle: function () {
            set(current() === 'dark' ? 'light' : 'dark');
        },
        bindToggle: bindToggle,
        syncIcons: syncIcons
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
