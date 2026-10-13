let settingsTelegramVerified = false;

function currentThemeChoice() {
    let t = null;
    try { t = localStorage.getItem('ec_theme'); } catch (e) {}
    return t === 'dark' || t === 'light' ? t : 'system';
}

function syncThemeSegment() {
    const choice = currentThemeChoice();
    document.querySelectorAll('[data-theme-choice]').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-theme-choice') === choice);
    });
}

function chooseTheme(choice) {
    if (window.EcTheme && EcTheme.set) EcTheme.set(choice);
    syncThemeSegment();
}

function toggleUserMenu() {
    document.body.classList.toggle('user-menu-open');
    if (document.body.classList.contains('user-menu-open')) {
        closeDrawer();
    }
}

function closeUserMenu() {
    document.body.classList.remove('user-menu-open');
}

async function readJsonResponse(response) {
    const text = await response.text();
    let data = {};
    if (text) {
        try {
            data = JSON.parse(text);
        } catch {
            data = { error: text };
        }
    }
    if (!response.ok) {
        throw new Error(data.error || 'Ошибка сервера');
    }
    return data;
}

function saveTokensFromResponse(data) {
    if (data.accessToken) {
        accessToken = data.accessToken;
        localStorage.setItem('eject_access_token', accessToken);
    }
    if (data.refreshToken) {
        refreshToken = data.refreshToken;
        localStorage.setItem('eject_refresh_token', refreshToken);
    }
}

function renderTelegramSettings(data) {
    const telegramId = data.telegramId || '';
    const botUsername = data.botUsername || '';
    const botLink = botUsername ? `https://t.me/${botUsername.replace('@', '')}` : '';
    settingsTelegramVerified = !!data.telegramVerified;
    currentTelegramVerified = settingsTelegramVerified;
    document.getElementById('telegramStatus').textContent = settingsTelegramVerified
        ? `Telegram привязан: ${telegramId}`
        : 'Telegram не привязан.';
    document.getElementById('telegramStatus').className = settingsTelegramVerified
        ? 'telegram-status verified'
        : 'telegram-status unverified';
    document.getElementById('unlinkTelegramBtn').style.display = settingsTelegramVerified ? 'inline-flex' : 'none';
    document.getElementById('bindTelegramBtn').style.display = settingsTelegramVerified ? 'none' : 'inline-flex';
    document.getElementById('telegramCodeInput').style.display = settingsTelegramVerified ? 'none' : 'block';
    const help = document.getElementById('telegramBindHelp');
    help.style.display = settingsTelegramVerified ? 'none' : 'block';
    help.innerHTML = botUsername
        ? `Откройте <a href="${botLink}" target="_blank" rel="noopener">${botUsername}</a>, нажмите /start, затем отправьте /code. Бот пришлет код, который действует 10 минут.`
        : 'Telegram бот не настроен администратором.';
}

async function loadSettings() {
    const data = await authFetch('/api/auth/settings').then(readJsonResponse);
    renderTelegramSettings(data);
}

function openSettingsModal() {
    closeUserMenu();
    document.getElementById('settingsModal').style.display = 'block';
    syncThemeSegment();
    loadSettings().catch(e => showNotification('Ошибка загрузки настроек: ' + e.message, 'error'));
}

function closeSettingsModal() {
    document.getElementById('settingsModal').style.display = 'none';
}

async function changeSettingsPassword() {
    const currentPassword = document.getElementById('settingsCurrentPassword').value;
    const newPassword = document.getElementById('settingsNewPassword').value;
    const newPasswordRepeat = document.getElementById('settingsNewPasswordRepeat').value;
    if (!currentPassword || !newPassword || !newPasswordRepeat) {
        showNotification('Заполните все поля пароля', 'error');
        return;
    }
    if (newPassword !== newPasswordRepeat) {
        showNotification('Новые пароли не совпадают', 'error');
        return;
    }
    const body = new URLSearchParams({ currentPassword, newPassword });
    try {
        await authFetch('/api/auth/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body
        }).then(readJsonResponse);
        document.getElementById('settingsCurrentPassword').value = '';
        document.getElementById('settingsNewPassword').value = '';
        document.getElementById('settingsNewPasswordRepeat').value = '';
        showNotification('Пароль изменен', 'success');
    } catch (e) {
        showNotification('Ошибка смены пароля: ' + e.message, 'error');
    }
}

async function bindTelegramByCode() {
    const code = document.getElementById('telegramCodeInput').value.trim();
    if (!/^\d{6}$/.test(code)) {
        showNotification('Введите 6 цифр из Telegram', 'error');
        return;
    }
    const body = new URLSearchParams({ code });
    try {
        const data = await authFetch('/api/auth/telegram/check-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body
        }).then(readJsonResponse);
        saveTokensFromResponse(data);
        renderTelegramSettings(data);
        document.getElementById('telegramCodeInput').value = '';
        showNotification('Telegram привязан', 'success');
    } catch (e) {
        showNotification('Ошибка привязки Telegram: ' + e.message, 'error');
    }
}

async function unlinkTelegram() {
    showConfirm('Отвязать Telegram от аккаунта?', async () => {
        try {
            const data = await authFetch('/api/auth/telegram/unlink', { method: 'POST' }).then(readJsonResponse);
            saveTokensFromResponse(data);
            const settings = await authFetch('/api/auth/settings').then(readJsonResponse);
            renderTelegramSettings(settings);
            showNotification('Telegram отвязан', 'success');
        } catch (e) {
            showNotification('Ошибка отвязки Telegram: ' + e.message, 'error');
        }
    });
}

window.toggleUserMenu = toggleUserMenu;
window.closeUserMenu = closeUserMenu;
window.chooseTheme = chooseTheme;
window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeSettingsModal;
window.changeSettingsPassword = changeSettingsPassword;
window.bindTelegramByCode = bindTelegramByCode;
window.unlinkTelegram = unlinkTelegram;

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeUserMenu();
        closeSettingsModal();
    }
});
