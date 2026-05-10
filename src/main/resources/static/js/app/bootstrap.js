// Проверяем аутентификацию
if (!accessToken && !oldToken) {
    window.location.href = '/login.html';
} else {
    doValidate();
}
