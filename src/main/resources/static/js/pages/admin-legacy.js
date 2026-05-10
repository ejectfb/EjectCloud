        function loadUsers() {
            fetch('/admin/api/users')
                .then(r => r.json())
                .then(users => {
                    const tbody = document.querySelector('#usersTable tbody');
                    tbody.innerHTML = '';
                    users.forEach(user => {
                        const row = tbody.insertRow();
                        const quotaMB = Math.round(user.quotaBytes / 1024 / 1024);
                        const usedMB = Math.round(user.usedBytes / 1024 / 1024);
                        const freeMB = quotaMB - usedMB;
                        
                        row.innerHTML = `
                            <td>${user.id}</td>
                            <td>${user.username}</td>
                            <td>${user.telegramId || '-'}</td>
                            <td>${quotaMB}</td>
                            <td>${usedMB}</td>
                            <td>${freeMB}</td>
                            <td>
                                <input type="number" id="quota_${user.id}" value="${quotaMB}" style="width:80px" />
                                <button onclick="updateQuota(${user.id})">Изменить квоту</button>
                            </td>
                        `;
                    });
                })
                .catch(e => alert('Ошибка загрузки: ' + e.message));
        }
        
        function createUser() {
            const username = document.getElementById('newUsername').value;
            const quota = document.getElementById('newQuota').value;
            const displayName = document.getElementById('newDisplayName').value;
            
            if (!username || !quota) {
                alert('Заполните обязательные поля');
                return;
            }
            
            const params = new URLSearchParams();
            params.append('username', username);
            params.append('quotaBytes', quota);
            if (displayName) params.append('displayName', displayName);
            
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
                document.getElementById('newUsername').value = '';
                document.getElementById('newDisplayName').value = '';
            })
            .catch(e => alert('Ошибка: ' + e.message));
        }
        
        function updateQuota(userId) {
            const quotaMB = document.getElementById(`quota_${userId}`).value;
            const quotaBytes = quotaMB * 1024 * 1024;
            
            const params = new URLSearchParams();
            params.append('userId', userId);
            params.append('quotaBytes', quotaBytes);
            
            fetch('/admin/api/quota', {
                method: 'POST',
                body: params
            })
            .then(r => {
                if (!r.ok) throw new Error('Ошибка сервера');
                alert('Квота обновлена');
                loadUsers();
            })
            .catch(e => alert('Ошибка: ' + e.message));
        }
        
        function updateSetting(key, value) {
            const params = new URLSearchParams();
            params.append('key', key);
            params.append('value', value);
            
            fetch('/admin/api/settings', {
                method: 'POST',
                body: params
            })
            .then(r => {
                if (!r.ok) throw new Error('Ошибка сервера');
                alert('Настройка сохранена');
            })
            .catch(e => alert('Ошибка: ' + e.message));
        }
        
        // Загрузить пользователей при открытии страницы
        loadUsers();
    
