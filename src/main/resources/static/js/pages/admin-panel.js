let currentUser = null;
let accessToken = null;
let refreshToken = null;
let refreshInterval = null;

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
let lastHistoryData = { cpu: null, memory: null, storage: null };

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
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
            <div class="admin-title">${escapeHtml(user.displayName)}</div>
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
        editBtn.textContent = '✏️';
        editBtn.title = 'Редактировать';
        editBtn.onclick = () => openEditUserModal(user.id, user.email, user.displayName, user.telegramId, quotaMB);

        const resetBtn = document.createElement('button');
        resetBtn.className = 'secondary';
        resetBtn.textContent = '🔑';
        resetBtn.title = 'Сбросить пароль';
        resetBtn.onclick = () => resetPassword(user.id);

        const delBtn = document.createElement('button');
        delBtn.className = 'danger';
        delBtn.textContent = '🗑️';
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

        if (lastHistoryData.cpu) drawChart(lastHistoryData.cpu, 'cpu');
        if (lastHistoryData.memory) drawChart(lastHistoryData.memory, 'memory');
        if (lastHistoryData.storage) drawChart(lastHistoryData.storage, 'storage');
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
            localStorage.setItem('admin_access_token', accessToken);
            localStorage.setItem('admin_refresh_token', refreshToken);
            
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
    fetch('/api/auth/validate?token=' + accessToken)
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
        fetch('/api/auth/logout?refreshToken=' + refreshToken, { method: 'POST' })
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
    // Скрыть все вкладки
    document.querySelectorAll('[id^="tab-"]').forEach(tab => {
        tab.classList.add('hidden');
    });
    
    // Убрать активный класс с навигации
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Показать выбранную вкладку
    document.getElementById('tab-' + tabName).classList.remove('hidden');
    
    // Активировать навигацию
    event.target.classList.add('active');
    
    // Обновить заголовок
    const titles = {
        'dashboard': 'Дашборд',
        'users': 'Пользователи', 
        'monitoring': 'Мониторинг'
    };
    document.getElementById('pageTitle').textContent = titles[tabName];

    if (isMobileLayout()) {
        closeDrawer();
    }
    
    // Загрузить данные для вкладки
    if (tabName === 'users') {
        loadUsers();
    } else if (tabName === 'monitoring') {
        loadHistory('1h', 'cpu');
        loadHistory('1h', 'memory');
        loadHistory('1h', 'storage');
    }
}

function loadDashboard() {
    if (!accessToken) {
        logout();
        return;
    }
    
    fetch('/admin/api/dashboard?token=' + accessToken)
        .then(r => {
            if (r.status === 401) {
                logout();
                return;
            }
            return r.json();
        })
        .then(data => {
            if (data) {
                updateSystemMetrics(data.system);
                updateUserMetrics(data.users);
                updateTopUsers(data.users.list);
            }
        })
        .catch(e => console.error('Ошибка загрузки дашборда:', e));
}

function updateSystemMetrics(system) {
    const totalGB = (system.totalDiskSpace / 1024 / 1024 / 1024).toFixed(1);
    const freeGB = (system.freeDiskSpace / 1024 / 1024 / 1024).toFixed(1);
    const usedGB = (totalGB - freeGB).toFixed(1);
    const diskPercent = ((usedGB / totalGB) * 100).toFixed(1);
    
    document.getElementById('totalDisk').textContent = totalGB + ' GB';
    document.getElementById('freeDisk').textContent = freeGB + ' GB';
    document.getElementById('usedDisk').textContent = usedGB + ' GB (' + diskPercent + '%)';
    const diskProgressBar = document.getElementById('diskProgress');
    diskProgressBar.style.width = diskPercent + '%';
    
    // Цвет в зависимости от заполненности
    if (diskPercent < 70) {
        diskProgressBar.style.backgroundColor = '#28a745';
    } else if (diskPercent < 90) {
        diskProgressBar.style.backgroundColor = '#ffc107';
    } else {
        diskProgressBar.style.backgroundColor = '#dc3545';
    }
    
    document.getElementById('cpuUsage').textContent = system.cpuUsage.toFixed(1) + '%';
    
    const memoryPercent = ((system.memoryUsed / system.memoryTotal) * 100).toFixed(1);
    const memoryMB = (system.memoryUsed / 1024 / 1024).toFixed(0);
    document.getElementById('memoryUsage').textContent = memoryMB + ' MB (' + memoryPercent + '%)';
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
    
    fetch('/admin/api/users?token=' + accessToken)
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
                    <td>${user.displayName}</td>
                    <td>${user.email}</td>
                    <td>${user.telegramId || '-'}</td>
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
                            <button onclick="openEditUserModal('${user.id}', '${user.email}', '${user.displayName}', '${user.telegramId}', ${quotaMB})" class="primary">✏️</button>
                            <button onclick="resetPassword('${user.id}')" class="secondary">🔑</button>
                            <button onclick="deleteUser('${user.id}', '${user.displayName}')" class="danger">🗑️</button>
                        </div>
                    </td>
                `;
            });
        })
        .catch(e => alert('Ошибка загрузки пользователей: ' + e.message));
}

function createUser() {
    const email = document.getElementById('newEmail').value;
    const displayName = document.getElementById('newDisplayName').value;
    const telegramId = document.getElementById('newTelegramId').value;
    const quotaMB = document.getElementById('newQuota').value;
    
    if (!email || !displayName || !telegramId || !quotaMB) {
        alert('Заполните все поля');
        return;
    }
    
    if (!accessToken) {
        logout();
        return;
    }
    
    const params = new URLSearchParams();
    params.append('token', accessToken);
    params.append('email', email);
    params.append('displayName', displayName);
    params.append('telegramId', telegramId);
    params.append('quotaBytes', quotaMB * 1024 * 1024);
    
    fetch('/admin/api/users', {
        method: 'POST',
        body: params
    })
    .then(r => {
        if (!r.ok) return r.text().then(t => { throw new Error(t); });
        return r.json();
    })
    .then(() => {
        alert('Пользователь создан');
        loadUsers();
        document.getElementById('newEmail').value = '';
        document.getElementById('newDisplayName').value = '';
        document.getElementById('newTelegramId').value = '';
        document.getElementById('newQuota').value = '1024';
    })
    .catch(e => alert('Ошибка: ' + e.message));
}

function updateQuota(telegramId) {
    const quotaMB = document.getElementById(`quota_${telegramId}`).value;
    const quotaBytes = quotaMB * 1024 * 1024;
    
    if (!accessToken) {
        logout();
        return;
    }
    
    const params = new URLSearchParams();
    params.append('token', accessToken);
    params.append('telegramId', telegramId);
    params.append('quotaBytes', quotaBytes);
    
    fetch('/admin/api/quota', {
        method: 'POST',
        body: params
    })
    .then(r => {
        if (!r.ok) throw new Error('Ошибка сервера');
        alert('Квота обновлена');
        loadUsers();
        loadDashboard(); // Обновляем дашборд
    })
    .catch(e => alert('Ошибка: ' + e.message));
}

function loadHistory(period = '1h', type = 'cpu') {
    if (!accessToken) {
        logout();
        return;
    }
    
    fetch('/admin/api/system/history?token=' + accessToken + '&period=' + period)
        .then(r => {
            if (r.status === 401) {
                logout();
                return;
            }
            return r.json();
        })
        .then(data => {
            if (data) {
                lastHistoryData[type] = data.entries;
                drawChart(data.entries, type);
            }
        })
        .catch(e => console.error('Ошибка загрузки истории:', e));
}

function drawChart(entries, type) {
    const canvasId = type + 'Chart';
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const cssHeight = 260;
    const cssWidth = Math.max(320, (canvas.parentElement && canvas.parentElement.clientWidth) ? canvas.parentElement.clientWidth : 600);
    const dpr = window.devicePixelRatio || 1;

    canvas.style.width = cssWidth + 'px';
    canvas.style.height = cssHeight + 'px';
    canvas.width = Math.floor(cssWidth * dpr);
    canvas.height = Math.floor(cssHeight * dpr);

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    
    if (!entries || entries.length === 0) {
        ctx.fillStyle = '#666';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Нет данных', cssWidth / 2, cssHeight / 2);
        return;
    }

    const padding = Math.min(50, Math.max(36, Math.floor(cssWidth * 0.12)));
    const bottomPadding = 30;
    const chartWidth = cssWidth - 2 * padding;
    const chartHeight = cssHeight - padding - bottomPadding;
    
    // Оси
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, padding + chartHeight);
    ctx.lineTo(padding + chartWidth, padding + chartHeight);
    ctx.stroke();
    
    // Получаем максимальные значения
    let maxValue = 100;
    let unit = '%';
    let values = [];
    
    entries.forEach(entry => {
        if (type === 'cpu') {
            values.push(entry.cpuUsage);
        } else if (type === 'memory') {
            values.push(entry.memoryUsed / 1024 / 1024 / 1024); // в GB
        } else if (type === 'storage') {
            values.push(((entry.totalDiskSpace - entry.freeDiskSpace) / entry.totalDiskSpace) * 100);
        }
    });
    
    if (type === 'memory') {
        maxValue = Math.ceil(Math.max(...values));
        unit = 'GB';
    } else {
        maxValue = Math.max(100, Math.ceil(Math.max(...values)));
    }
    
    // Шкала Y
    ctx.fillStyle = '#666';
    ctx.font = '10px Arial';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) {
        const y = padding + (chartHeight / 5) * i;
        const value = maxValue - (i * maxValue / 5);
        ctx.fillText(value.toFixed(type === 'memory' ? 1 : 0) + unit, padding - 5, y + 3);
        
        ctx.strokeStyle = '#f0f0f0';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(padding + chartWidth, y);
        ctx.stroke();
    }
    
    // Шкала X (время)
    const period = document.getElementById(type + 'Period').value;
    const timeLabels = getTimeLabels(entries, period);
    ctx.fillStyle = '#666';
    ctx.font = '9px Arial';
    ctx.textAlign = 'center';
    
    const labelCount = Math.min(6, timeLabels.length);
    for (let i = 0; i < labelCount; i++) {
        const denom = (labelCount - 1) || 1;
        const x = padding + (i / denom) * chartWidth;
        const labelIndex = Math.floor((i / denom) * (timeLabels.length - 1));
        ctx.fillText(timeLabels[labelIndex], x, padding + chartHeight + 15);
    }
    
    // График
    if (entries.length > 1) {
        ctx.strokeStyle = type === 'cpu' ? '#e74c3c' : type === 'memory' ? '#3498db' : '#27ae60';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        values.forEach((value, index) => {
            const x = padding + (index / (values.length - 1)) * chartWidth;
            const y = padding + chartHeight - (value / maxValue) * chartHeight;
            
            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        
        ctx.stroke();
    }
}

function getTimeLabels(entries, period) {
    return entries.map(entry => {
        const date = new Date(entry.timestamp);
        if (['5m', '30m', '1h'].includes(period)) {
            return date.toLocaleTimeString('ru', {hour: '2-digit', minute: '2-digit'});
        } else if (['3h', '6h', '12h', '24h'].includes(period)) {
            return date.toLocaleTimeString('ru', {hour: '2-digit', minute: '2-digit'});
        } else {
            return date.toLocaleDateString('ru', {day: '2-digit', month: '2-digit'});
        }
    });
}

let editingUserId = null;

function openEditUserModal(userId, email, displayName, telegramId, quotaMB) {
    editingUserId = userId;
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
    const newDisplayName = document.getElementById('editDisplayName').value;
    const newTelegramId = document.getElementById('editTelegramId').value;
    const newQuotaMB = document.getElementById('editQuota').value;
    
    if (!newEmail || !newDisplayName || !newTelegramId || !newQuotaMB) {
        alert('Заполните все поля');
        return;
    }
    
    if (!accessToken) {
        logout();
        return;
    }
    
    const params = new URLSearchParams();
    params.append('token', accessToken);
    params.append('userId', editingUserId);
    params.append('email', newEmail);
    params.append('displayName', newDisplayName);
    params.append('telegramId', newTelegramId);
    params.append('quotaBytes', newQuotaMB * 1024 * 1024);
    
    fetch('/admin/api/users/edit', {
        method: 'POST',
        body: params
    })
    .then(r => {
        if (!r.ok) throw new Error('Ошибка сервера');
        alert('Пользователь обновлен');
        closeEditUserModal();
        loadUsers();
        loadDashboard();
    })
    .catch(e => alert('Ошибка: ' + e.message));
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
    params.append('token', accessToken);
    params.append('userId', userId);
    
    fetch('/admin/api/reset-password', {
        method: 'POST',
        body: params
    })
    .then(r => {
        if (!r.ok) throw new Error('Ошибка сервера');
        alert('Пароль сброшен');
    })
    .catch(e => alert('Ошибка: ' + e.message));
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
    params.append('token', accessToken);
    params.append('userId', userId);
    
    fetch('/admin/api/users/delete', {
        method: 'POST',
        body: params
    })
    .then(r => {
        if (!r.ok) throw new Error('Ошибка сервера');
        alert('Пользователь удален');
        loadUsers();
        loadDashboard();
    })
    .catch(e => alert('Ошибка: ' + e.message));
}
