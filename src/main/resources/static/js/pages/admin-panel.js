let currentUser = null;
let accessToken = null;
let refreshToken = null;
let refreshInterval = null;

function getAuthHeaders() {
    return { 'Authorization': 'Bearer ' + (accessToken || '') };
}

function authFetch(url, options = {}) {
    if (!options.headers) options.headers = {};
    Object.assign(options.headers, getAuthHeaders());
    return fetch(url, options);
}

function isMobileLayout() {
    return window.matchMedia && window.matchMedia('(max-width: 900px)').matches;
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

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeDrawer();
    }
});

const $topUsersList = document.getElementById('topUsersList');
const $usersList = document.getElementById('usersList');

let lastTopUsersData = null;
let lastUsersData = null;

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function jsString(str) {
    return String(str == null ? '' : str)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\r?\n/g, ' ');
}

async function readError(response) {
    const text = await response.text();
    try {
        const data = JSON.parse(text);
        return data.error || text || 'Ошибка сервера';
    } catch {
        return text || 'Ошибка сервера';
    }
}

function renderTopUsersMobile(usersList) {
    if (!$topUsersList) return;
    $topUsersList.innerHTML = '';

    const data = (usersList || []).slice().sort((a, b) => b.usedBytes - a.usedBytes).slice(0, 5);
    if (data.length === 0) {
        $topUsersList.innerHTML = '<div class="admin-item"><div class="admin-main"><div class="admin-title">Нет данных</div></div></div>';
        return;
    }

    data.forEach(user => {
        const usedMB = Math.round(user.usedBytes / 1024 / 1024);
        const quotaMB = Math.round(user.quotaBytes / 1024 / 1024);
        const percent = quotaMB > 0 ? ((usedMB / quotaMB) * 100).toFixed(1) : '0.0';

        const item = document.createElement('div');
        item.className = 'admin-item';
        item.innerHTML = `
            <div class="admin-main">
                <div class="admin-title">${escapeHtml(user.username)}</div>
                <div class="admin-meta">
                    <span>${usedMB} MB / ${quotaMB} MB</span>
                    <span>${percent}%</span>
                </div>
            </div>
        `;
        $topUsersList.appendChild(item);
    });
}

function renderUsersMobile(users) {
    if (!$usersList) return;
    $usersList.innerHTML = '';

    if (!users || users.length === 0) {
        $usersList.innerHTML = '<div class="admin-item"><div class="admin-main"><div class="admin-title">Пользователей нет</div></div></div>';
        return;
    }

    users.forEach(user => {
        const quotaMB = Math.round(user.quotaBytes / 1024 / 1024);
        const usedMB = Math.round(user.usedBytes / 1024 / 1024);
        const usagePercent = user.usagePercent || 0;
        const usageColor = usagePercent > 90 ? '#dc3545' : usagePercent > 70 ? '#ffc107' : '#28a745';

        const item = document.createElement('div');
        item.className = 'admin-item';

        const main = document.createElement('div');
        main.className = 'admin-main';
        main.innerHTML = `
                <div class="admin-title">${escapeHtml(user.displayName)} <span style="font-weight:500;color:#6b7280;">@${escapeHtml(user.nickname || user.id)}</span></div>
                <div class="admin-meta">
                <span>${escapeHtml(user.email)}</span>
                <span>${escapeHtml(user.telegramId || '-')}</span>
                <span>${usedMB} MB / ${quotaMB} MB (${usagePercent}%)</span>
            </div>
            <div style="margin-top: 8px; background: #f0f0f0; border-radius: 10px; overflow: hidden; height: 10px;">
                <div style="height: 100%; background: ${usageColor}; width: ${Math.min(100, usagePercent)}%; transition: width 0.3s;"></div>
            </div>
        `;

        const actions = document.createElement('div');
        actions.className = 'admin-actions';

        const editBtn = document.createElement('button');
        editBtn.className = 'primary';
        editBtn.innerHTML = '<img class="icon" src="icons/edit.svg" alt="" aria-hidden="true">';
        editBtn.title = 'Редактировать';
        editBtn.onclick = () => openEditUserModal(user.id, user.nickname || user.id, user.email, user.displayName, user.telegramId, quotaMB);

        const resetBtn = document.createElement('button');
        resetBtn.className = 'secondary';
        resetBtn.innerHTML = '<img class="icon" src="icons/key.svg" alt="" aria-hidden="true">';
        resetBtn.title = 'Сбросить пароль';
        resetBtn.onclick = () => resetPassword(user.id);

        const delBtn = document.createElement('button');
        delBtn.className = 'danger';
        delBtn.innerHTML = '<img class="icon" src="icons/trash.svg" alt="" aria-hidden="true">';
        delBtn.title = 'Удалить';
        delBtn.onclick = () => deleteUser(user.id, user.displayName);

        actions.appendChild(editBtn);
        actions.appendChild(resetBtn);
        actions.appendChild(delBtn);

        item.appendChild(main);
        item.appendChild(actions);
        $usersList.appendChild(item);
    });
}

let resizeTimer = null;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        if (lastTopUsersData) renderTopUsersMobile(lastTopUsersData);
        if (lastUsersData) renderUsersMobile(lastUsersData);
    }, 150);
});

// Проверка токена при загрузке
window.onload = function() {
    const urlParams = new URLSearchParams(window.location.search);
    const oldToken = urlParams.get('token');
    
    accessToken = localStorage.getItem('eject_access_token');
    refreshToken = localStorage.getItem('eject_refresh_token');
    
    if (accessToken) {
        validateToken();
    } else {
        window.location.href = '/login.html';
    }
};

function convertOldToken(oldToken) {
    fetch('/auth/login?token=' + oldToken, { method: 'POST' })
        .then(r => {
            if (!r.ok) throw new Error('Invalid token');
            return r.json();
        })
        .then(data => {
            accessToken = data.accessToken;
            refreshToken = data.refreshToken;
            localStorage.setItem('eject_access_token', accessToken);
            localStorage.setItem('eject_refresh_token', refreshToken);
            
            currentUser = data.telegramId;
            document.getElementById('who').textContent = currentUser;
            document.getElementById('app').classList.remove('hidden');
            
            startTokenRefresh();
            loadDashboard();
            setInterval(loadDashboard, 30000);
        })
        .catch(e => showError());
}

function validateToken() {
    authFetch('/api/auth/validate')
        .then(r => r.json())
        .then(data => {
            if (data.ok) {
                currentUser = data.user;
                document.getElementById('who').textContent = currentUser;
                document.getElementById('app').classList.remove('hidden');
                
                startTokenRefresh();
                loadDashboard();
                setInterval(loadDashboard, 30000);
            } else {
                tryRefreshToken();
            }
        })
        .catch(e => tryRefreshToken());
}

function tryRefreshToken() {
    if (!refreshToken) {
        showError();
        return;
    }
    
    fetch('/api/auth/refresh?refreshToken=' + refreshToken, { method: 'POST' })
        .then(r => {
            if (!r.ok) throw new Error('Refresh failed');
            return r.json();
        })
        .then(data => {
            accessToken = data.accessToken;
            localStorage.setItem('eject_access_token', accessToken);
            validateToken();
        })
        .catch(e => {
            console.error('Refresh error:', e);
            logout();
        });
}

function startTokenRefresh() {
    if (refreshInterval) clearInterval(refreshInterval);
    
    // Обновляем токен каждые 10 минут
    refreshInterval = setInterval(() => {
        tryRefreshToken();
    }, 10 * 60 * 1000);
    
    // Скрываем таймер
    document.getElementById('timer').style.display = 'none';
}

function showError() {
    window.location.href = '/login.html';
}

function logout() {
    if (refreshToken) {
        authFetch('/api/auth/logout?refreshToken=' + refreshToken, { method: 'POST' })
            .catch(() => {});
    }
    
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }
    
    localStorage.removeItem('eject_access_token');
    localStorage.removeItem('eject_refresh_token');
    accessToken = null;
    refreshToken = null;
    window.location.href = '/login.html';
}

function showTab(tabName) {
    document.querySelectorAll('[id^="tab-"]').forEach(tab => {
        tab.classList.add('hidden');
    });
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    document.getElementById('tab-' + tabName).classList.remove('hidden');
    const navItem = document.querySelector(`.nav-item[onclick*="'${tabName}'"]`);
    if (navItem) navItem.classList.add('active');
    const titles = {
        'dashboard': 'Дашборд',
        'users': 'Пользователи', 
        'telegram': 'Telegram Bot'
    };
    document.getElementById('pageTitle').textContent = titles[tabName];

    if (isMobileLayout()) {
        closeDrawer();
    }
    
    // Загрузить данные для вкладки
    if (tabName === 'users') {
        loadUsers();
    } else if (tabName === 'telegram') {
        loadTelegramSettings();
    }
}

function loadDashboard() {
    if (!accessToken) {
        logout();
        return;
    }
    
    authFetch('/admin/api/dashboard')
        .then(r => {
            if (r.status === 401) {
                logout();
                return;
            }
            return r.json();
        })
        .then(data => {
            if (data) {
                updateUserMetrics(data.users);
                updateTopUsers(data.users.list);
            }
        })
        .catch(e => console.error('Ошибка загрузки дашборда:', e));
}

function updateUserMetrics(users) {
    document.getElementById('userCount').textContent = users.count;
    
    const totalQuotaGB = (users.totalQuota / 1024 / 1024 / 1024).toFixed(1);
    const totalUsedGB = (users.totalUsed / 1024 / 1024 / 1024).toFixed(1);
    const quotaPercent = users.totalQuota > 0 ? ((users.totalUsed / users.totalQuota) * 100).toFixed(1) : 0;
    
    document.getElementById('totalQuota').textContent = totalQuotaGB + ' GB';
    document.getElementById('totalUsed').textContent = totalUsedGB + ' GB (' + quotaPercent + '%)';
    const quotaProgressBar = document.getElementById('quotaProgress');
    quotaProgressBar.style.width = quotaPercent + '%';
    
    // Цвет в зависимости от заполненности
    if (quotaPercent < 70) {
        quotaProgressBar.style.backgroundColor = '#28a745';
    } else if (quotaPercent < 90) {
        quotaProgressBar.style.backgroundColor = '#ffc107';
    } else {
        quotaProgressBar.style.backgroundColor = '#dc3545';
    }
}

function updateTopUsers(usersList) {
    const tbody = document.querySelector('#topUsersTable tbody');
    tbody.innerHTML = '';

    lastTopUsersData = usersList;
    renderTopUsersMobile(usersList);
    
    usersList
        .sort((a, b) => b.usedBytes - a.usedBytes)
        .slice(0, 5)
        .forEach(user => {
            const row = tbody.insertRow();
            const usedMB = Math.round(user.usedBytes / 1024 / 1024);
            const quotaMB = Math.round(user.quotaBytes / 1024 / 1024);
            const percent = quotaMB > 0 ? ((usedMB / quotaMB) * 100).toFixed(1) : 0;
            
            row.innerHTML = `
                <td>${user.username}</td>
                <td>${usedMB} MB</td>
                <td>${quotaMB} MB</td>
                <td>${percent}%</td>
            `;
        });
}

function loadUsers() {
    if (!accessToken) {
        logout();
        return;
    }
    
    authFetch('/admin/api/users')
        .then(r => {
            if (r.status === 401) {
                logout();
                return;
            }
            return r.json();
        })
        .then(users => {
            if (!users) return;
            lastUsersData = users;
            renderUsersMobile(users);
            const tbody = document.querySelector('#usersTable tbody');
            tbody.innerHTML = '';
            
            users.forEach(user => {
                const row = tbody.insertRow();
                const quotaMB = Math.round(user.quotaBytes / 1024 / 1024);
                const usedMB = Math.round(user.usedBytes / 1024 / 1024);
                const usagePercent = user.usagePercent || 0;
                
                row.innerHTML = `
                    <td>${escapeHtml(user.displayName)}</td>
                    <td>${escapeHtml(user.nickname || user.id)}</td>
                    <td>${escapeHtml(user.email)}</td>
                    <td>${escapeHtml(user.telegramId || '-')}</td>
                    <td>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <div style="width: 100px; height: 20px; background: #f0f0f0; border-radius: 10px; overflow: hidden;">
                                <div style="height: 100%; background: ${usagePercent > 90 ? '#dc3545' : usagePercent > 70 ? '#ffc107' : '#28a745'}; width: ${Math.min(100, usagePercent)}%; transition: width 0.3s;"></div>
                            </div>
                            <span style="font-size: 12px; white-space: nowrap;">${usedMB} MB / ${quotaMB} MB</span>
                        </div>
                    </td>
                    <td>
                        <div class="action-buttons">
                            <button onclick="openEditUserModal('${jsString(user.id)}', '${jsString(user.nickname || user.id)}', '${jsString(user.email)}', '${jsString(user.displayName)}', '${jsString(user.telegramId || '')}', ${quotaMB})" class="primary"><img class="icon" src="icons/edit.svg" alt="" aria-hidden="true"></button>
                            <button onclick="resetPassword('${jsString(user.id)}')" class="secondary"><img class="icon" src="icons/key.svg" alt="" aria-hidden="true"></button>
                            <button onclick="deleteUser('${jsString(user.id)}', '${jsString(user.displayName)}')" class="danger"><img class="icon" src="icons/trash.svg" alt="" aria-hidden="true"></button>
                        </div>
                    </td>
                `;
            });
        })
        .catch(e => showNotification('Ошибка загрузки пользователей: ' + e.message, 'error'));
}

function createUser() {
    const email = document.getElementById('newEmail').value;
    const nickname = document.getElementById('newNickname').value;
    const displayName = document.getElementById('newDisplayName').value;
    const telegramId = document.getElementById('newTelegramId').value;
    const quotaMB = document.getElementById('newQuota').value;
    
    if (!email || !nickname || !displayName || !quotaMB) {
        showNotification('Заполните все поля', 'error');
        return;
    }
    
    if (!accessToken) {
        logout();
        return;
    }
    
    const params = new URLSearchParams();
    params.append('email', email);
    params.append('nickname', nickname);
    params.append('displayName', displayName);
    params.append('telegramId', telegramId);
    params.append('quotaBytes', quotaMB * 1024 * 1024);
    
    authFetch('/admin/api/users', {
        method: 'POST',
        body: params
    })
    .then(async r => {
        if (!r.ok) throw new Error(await readError(r));
        return r.json();
    })
    .then(() => {
        showNotification('Пользователь создан', 'success');
        loadUsers();
        document.getElementById('newEmail').value = '';
        document.getElementById('newNickname').value = '';
        document.getElementById('newDisplayName').value = '';
        document.getElementById('newTelegramId').value = '';
        document.getElementById('newQuota').value = '1024';
    })
    .catch(e => showNotification('Ошибка: ' + e.message, 'error'));
}

function updateQuota(telegramId) {
    const quotaMB = document.getElementById(`quota_${telegramId}`).value;
    const quotaBytes = quotaMB * 1024 * 1024;
    
    if (!accessToken) {
        logout();
        return;
    }
    
    const params = new URLSearchParams();
    params.append('telegramId', telegramId);
    params.append('quotaBytes', quotaBytes);
    
    authFetch('/admin/api/quota', {
        method: 'POST',
        body: params
    })
    .then(r => {
        if (!r.ok) throw new Error('Ошибка сервера');
        showNotification('Квота обновлена', 'success');
        loadUsers();
        loadDashboard();
    })
    .catch(e => showNotification('Ошибка: ' + e.message, 'error'));
}

let editingUserId = null;

function openEditUserModal(userId, nickname, email, displayName, telegramId, quotaMB) {
    editingUserId = userId;
    document.getElementById('editNickname').value = nickname || userId;
    document.getElementById('editEmail').value = email;
    document.getElementById('editDisplayName').value = displayName;
    document.getElementById('editTelegramId').value = telegramId || '';
    document.getElementById('editQuota').value = quotaMB;
    document.getElementById('editUserModal').style.display = 'block';
}

function closeEditUserModal() {
    document.getElementById('editUserModal').style.display = 'none';
    editingUserId = null;
}

function saveUserEdit() {
    if (!editingUserId) return;
    
    const newEmail = document.getElementById('editEmail').value;
    const newNickname = document.getElementById('editNickname').value;
    const newDisplayName = document.getElementById('editDisplayName').value;
    const newTelegramId = document.getElementById('editTelegramId').value;
    const newQuotaMB = document.getElementById('editQuota').value;
    
    if (!newEmail || !newNickname || !newDisplayName || !newQuotaMB) {
        showNotification('Заполните все поля', 'error');
        return;
    }
    
    if (!accessToken) {
        logout();
        return;
    }
    
    const params = new URLSearchParams();
    params.append('userId', editingUserId);
    params.append('nickname', newNickname);
    params.append('email', newEmail);
    params.append('displayName', newDisplayName);
    params.append('telegramId', newTelegramId);
    params.append('quotaBytes', newQuotaMB * 1024 * 1024);
    
    authFetch('/admin/api/users/edit', {
        method: 'POST',
        body: params
    })
    .then(async r => {
        if (!r.ok) throw new Error(await readError(r));
        showNotification('Пользователь обновлен', 'success');
        closeEditUserModal();
        loadUsers();
        loadDashboard();
    })
    .catch(e => showNotification('Ошибка: ' + e.message, 'error'));
}

function openUserInterface() {
    window.location.href = '/';
}

function resetPassword(userId) {
    if (!confirm('Сбросить пароль? Пароль станет равным emailу.')) {
        return;
    }
    
    if (!accessToken) {
        logout();
        return;
    }
    
    const params = new URLSearchParams();
    params.append('userId', userId);
    
    authFetch('/admin/api/reset-password', {
        method: 'POST',
        body: params
    })
    .then(r => {
        if (!r.ok) throw new Error('Ошибка сервера');
        showNotification('Пароль сброшен', 'success');
    })
    .catch(e => showNotification('Ошибка: ' + e.message, 'error'));
}

function deleteUser(userId, displayName) {
    if (!confirm(`Удалить пользователя ${displayName}? Все файлы будут удалены!`)) {
        return;
    }
    
    if (!accessToken) {
        logout();
        return;
    }
    
    const params = new URLSearchParams();
    params.append('userId', userId);
    
    authFetch('/admin/api/users/delete', {
        method: 'POST',
        body: params
    })
    .then(r => {
        if (!r.ok) throw new Error('Ошибка сервера');
        showNotification('Пользователь удален', 'success');
        loadUsers();
        loadDashboard();
    })
    .catch(e => showNotification('Ошибка: ' + e.message, 'error'));
}

function showNotification(message, type) {
    const existing = document.querySelector('.admin-notification');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.className = 'admin-notification';
    const bg = type === 'success' ? '#d4edda' : type === 'error' ? '#f8d7da' : '#d1ecf1';
    const fg = type === 'success' ? '#155724' : type === 'error' ? '#721c24' : '#0c5460';
    const bd = type === 'success' ? '#c3e6cb' : type === 'error' ? '#f5c6cb' : '#bee5eb';
    el.style.cssText = `position:fixed;top:20px;right:20px;z-index:99999;padding:15px 25px;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,0.15);font-size:14px;max-width:400px;background:${bg};color:${fg};border:1px solid ${bd};`;
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 5000);
}

function showTelegramStatus(message, type) {
    const statusDiv = document.getElementById('telegramStatus');
    statusDiv.classList.remove('hidden');
    if (type === 'success') {
        statusDiv.style.backgroundColor = '#d4edda';
        statusDiv.style.color = '#155724';
        statusDiv.style.border = '1px solid #c3e6cb';
    } else if (type === 'error') {
        statusDiv.style.backgroundColor = '#f8d7da';
        statusDiv.style.color = '#721c24';
        statusDiv.style.border = '1px solid #f5c6cb';
    } else {
        statusDiv.style.backgroundColor = '#d1ecf1';
        statusDiv.style.color = '#0c5460';
        statusDiv.style.border = '1px solid #bee5eb';
    }
    statusDiv.textContent = message;
    setTimeout(() => {
        statusDiv.classList.add('hidden');
    }, 5000);
}

function loadTelegramSettings() {
    if (!accessToken) {
        logout();
        return;
    }
    
    authFetch('/admin/api/telegram/status')
        .then(r => {
            if (r.status === 401) {
                logout();
                return;
            }
            return r.json();
        })
        .then(data => {
            if (data) {
                document.getElementById('telegramStatus').classList.add('hidden');
                if (data.configured) {
                    document.getElementById('telegramBotToken').value = '•••••••••••••••••••••••••••••••';
                    document.getElementById('telegramAdminChatId').value = data.connected ? document.getElementById('telegramAdminChatId').value : '';
                }
                if (data.connected) {
                    showTelegramStatus('Бот подключен и работает' + (data.botUsername ? ': ' + data.botUsername : ''), 'success');
                } else if (data.configured) {
                    showTelegramStatus('Ошибка подключения: ' + (data.connectionError || 'Неизвестная ошибка'), 'error');
                }
            }
        })
        .catch(e => console.error('Ошибка загрузки настроек Telegram:', e));
}

function testTelegramConnection() {
    if (!accessToken) {
        logout();
        return;
    }
    
    const botToken = document.getElementById('telegramBotToken').value;
    const adminChatId = document.getElementById('telegramAdminChatId').value;
    
    if (!botToken || botToken === '•••••••••••••••••••••••••••••••') {
        showTelegramStatus('Введите новый токен бота для тестирования', 'error');
        return;
    }
    
    if (!adminChatId) {
        showTelegramStatus('Введите Chat ID админа', 'error');
        return;
    }
    
    const testBtn = document.getElementById('telegramTestBtn');
    testBtn.disabled = true;
    testBtn.textContent = 'Проверка и сохранение...';
    
    const params = new URLSearchParams();
    params.append('botToken', botToken);
    params.append('adminChatId', adminChatId);
    
    authFetch('/admin/api/telegram/test', {
        method: 'POST',
        body: params
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            showTelegramStatus((data.message || 'Бот подключен и сохранен') + (data.botUsername ? ': ' + data.botUsername : ''), 'success');
        } else {
            showTelegramStatus('Ошибка: ' + (data.error || 'Не удалось подключиться'), 'error');
        }
    })
    .catch(e => {
        showTelegramStatus('Ошибка: ' + e.message, 'error');
    })
    .finally(() => {
        testBtn.disabled = false;
        testBtn.innerHTML = '<img class="icon" src="icons/telegram.svg" alt="" aria-hidden="true">Проверить и сохранить';
    });
}

