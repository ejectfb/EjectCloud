let accessToken = null;
let refreshToken = null;
let currentUser = null;

async function login(event) {
    event.preventDefault();
    
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const loginBtn = document.getElementById('loginBtn');
    const errorDiv = document.getElementById('loginError');
    
    loginBtn.disabled = true;
    loginBtn.classList.add('is-loading');
    const label = loginBtn.querySelector('.btn-label');
    if (label) label.textContent = 'Вход…';
    errorDiv.textContent = '';

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`
        });

        const data = await response.json();

        if (response.ok) {
            accessToken = data.accessToken;
            refreshToken = data.refreshToken;

            localStorage.setItem('eject_access_token', accessToken);
            localStorage.setItem('eject_refresh_token', refreshToken);

            // Проверяем статус пользователя
            await checkUserStatus();
        } else {
            errorDiv.textContent = data.error || 'Ошибка входа';
            shakeForm(loginBtn.closest('.login-form'));
        }
    } catch (error) {
        errorDiv.textContent = 'Ошибка соединения';
        shakeForm(loginBtn.closest('.login-form'));
    } finally {
        loginBtn.disabled = false;
        loginBtn.classList.remove('is-loading');
        if (label) label.textContent = 'Войти';
    }
}

function shakeForm(el) {
    if (!el) return;
    el.classList.remove('shake');
    // restart animation
    void el.offsetWidth;
    el.classList.add('shake');
    setTimeout(() => el.classList.remove('shake'), 500);
}

async function checkUserStatus() {
    try {
        const response = await fetch('/api/auth/validate', { headers: { 'Authorization': 'Bearer ' + accessToken } });
        const data = await response.json();
        
        if (data.ok) {
            currentUser = data;

            if (data.mustChangePassword) {
                showChangePasswordForm();
            } else {
                redirectToApp();
            }
        }
    } catch (error) {
        document.getElementById('loginError').textContent = 'Ошибка проверки статуса';
    }
}

function showChangePasswordForm() {
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('changePasswordForm').classList.remove('hidden');
    document.getElementById('currentPassword').value = document.getElementById('password').value;
}

function showProfileForm() {
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('changePasswordForm').classList.add('hidden');
    document.getElementById('profileForm').classList.remove('hidden');
    document.getElementById('profileEmail').value = document.getElementById('email').value;
    document.getElementById('displayName').value = currentUser.user;
}

async function changePassword(event) {
    event.preventDefault();
    
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const errorDiv = document.getElementById('changePasswordError');
    
    errorDiv.textContent = '';
    
    if (newPassword !== confirmPassword) {
        errorDiv.textContent = 'Пароли не совпадают';
        return;
    }
    
    if (newPassword.length < 6) {
        errorDiv.textContent = 'Пароль должен содержать минимум 6 символов';
        return;
    }
    
    try {
        const response = await fetch('/api/auth/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `currentPassword=${encodeURIComponent(currentPassword)}&newPassword=${encodeURIComponent(newPassword)}`,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': 'Bearer ' + accessToken }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            redirectToApp();
        } else {
            errorDiv.textContent = data.error || 'Ошибка смены пароля';
        }
    } catch (error) {
        errorDiv.textContent = 'Ошибка соединения';
    }
}

async function updateProfile(event) {
    event.preventDefault();
    
    const email = document.getElementById('profileEmail').value;
    const displayName = document.getElementById('displayName').value;
    const errorDiv = document.getElementById('profileError');
    
    errorDiv.textContent = '';
    
    try {
        const response = await fetch('/api/auth/update-profile', {
            method: 'POST',
            body: `email=${encodeURIComponent(email)}&displayName=${encodeURIComponent(displayName)}`,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': 'Bearer ' + accessToken }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            redirectToApp();
        } else {
            errorDiv.textContent = data.error || 'Ошибка обновления профиля';
        }
    } catch (error) {
        errorDiv.textContent = 'Ошибка соединения';
    }
}

function redirectToApp() {
    if (currentUser.isAdmin) {
        window.location.href = '/admin-panel.html';
    } else {
        window.location.href = '/';
    }
}

// Проверяем, есть ли уже токены
window.onload = function() {
    accessToken = localStorage.getItem('eject_access_token');
    refreshToken = localStorage.getItem('eject_refresh_token');
    
    if (accessToken) {
        checkUserStatus();
    }
};
