    function getTimeUntilExpiry(expiresAt) {
        const now = new Date();
        const expiry = new Date(expiresAt);
        const diffMs = expiry - now;
        
        if (diffMs <= 0) {
            return 'истекла';
        }
        
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        
        if (hours > 0) {
            return `${hours}ч ${minutes}м`;
        } else {
            return `${minutes}м`;
        }
    }

    let inputCallback = null;
    
    function showInput(title, message, callback, defaultValue = '') {
        document.getElementById('inputTitle').textContent = title;
        document.getElementById('inputMessage').textContent = message;
        document.getElementById('inputField').value = defaultValue;
        inputCallback = callback;
        document.getElementById('inputModal').style.display = 'block';
        document.getElementById('inputField').focus();
        document.getElementById('inputField').select();
    }
    
    window.closeInputModal = function() {
        document.getElementById('inputModal').style.display = 'none';
        inputCallback = null;
    };
    
    window.confirmInput = function() {
        const value = document.getElementById('inputField').value.trim();
        if (inputCallback && value) {
            inputCallback(value);
        }
        closeInputModal();
    };
    
    // Enter для подтверждения
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && document.getElementById('inputModal').style.display === 'block') {
            confirmInput();
        }
    });

    window.createFolder = function() {
        if (isInTrash) return;
        showInput('Создать папку', 'Введите имя папки:', (folderName) => {
            // Валидация имени папки
            if (/[<>:"/\\|?*]/.test(folderName)) {
                showNotification('Имя папки содержит запрещенные символы', 'error');
                return;
            }

            const folderPath = currentPath ? `${currentPath}/${folderName}` : folderName;
            const token = getAuthToken();
            
            fetch(`/api/files/mkdir?token=${encodeURIComponent(token)}&path=${encodeURIComponent(folderPath)}`, {
                method: 'POST'
            })
            .then(r => {
                if (!r.ok) throw new Error('Ошибка создания папки');
                loadFiles();
            })
            .catch(e => showNotification('Ошибка: ' + e.message, 'error'));
        });
    };
    
    window.deleteFolder = function(folderPath) {
        const folderName = folderPath.split('/').pop();
        showConfirm(`Переместить папку "${folderName}" в корзину?`, () => {
            const token = getAuthToken();
            fetch(`/api/files/folder?path=${encodeURIComponent(folderPath)}&token=${encodeURIComponent(token)}`, {
                method: 'DELETE'
            })
            .then(r => {
                if (!r.ok) return r.text().then(t => { throw new Error(t); });
                loadFiles();
            })
            .catch(e => showNotification('Ошибка: ' + e.message, 'error'));
        });
    };

    window.downloadFile = function(fileId) {
        const token = getAuthToken();
        window.open(`/api/files/download?fileId=${encodeURIComponent(fileId)}&token=${encodeURIComponent(token)}`);
    };

    window.shareFile = function(fileId) {
        const token = getAuthToken();
        fetch(`/api/files/share?fileId=${encodeURIComponent(fileId)}&token=${encodeURIComponent(token)}`, {
            method: 'POST'
        })
        .then(async r => {
            if (!r.ok) {
                const text = await r.text();
                try {
                    const errorData = JSON.parse(text);
                    throw new Error(errorData.error || 'Ошибка сервера');
                } catch {
                    throw new Error(text || 'Ошибка сервера');
                }
            }
            return r.json();
        })
        .then(data => {
            const shareUrl = window.location.origin + data.shareUrl;
            showQRModal(shareUrl, fileId);
            loadFiles();
        })
        .catch(e => showNotification('Ошибка создания ссылки: ' + e.message, 'error'));
    };
    
    window.copyExistingShare = function(fileId) {
        const token = getAuthToken();
        fetch(`/api/files/share?fileId=${encodeURIComponent(fileId)}&token=${encodeURIComponent(token)}`, {
            method: 'POST'
        })
        .then(async r => {
            if (!r.ok) {
                const text = await r.text();
                try {
                    const errorData = JSON.parse(text);
                    throw new Error(errorData.error || 'Ошибка сервера');
                } catch {
                    throw new Error(text || 'Ошибка сервера');
                }
            }
            return r.json();
        })
        .then(data => {
            const shareUrl = window.location.origin + data.shareUrl;
            copyTextOrPrompt(shareUrl, 'Ссылка для скачивания:').then((ok) => {
                if (ok) {
                    showNotification('Ссылка скопирована в буфер обмена', 'success');
                }
            });
        })
        .catch(e => showNotification('Ошибка: ' + e.message, 'error'));
    };
    
    window.deleteShareLink = function(fileId) {
        showConfirm('Удалить ссылку на файл?', () => {
            const token = getAuthToken();
            fetch(`/api/files/share?fileId=${encodeURIComponent(fileId)}&token=${encodeURIComponent(token)}`, {
                method: 'DELETE'
            })
            .then(r => {
                if (!r.ok) throw new Error('Ошибка удаления ссылки');
                loadFiles();
            })
            .catch(e => showNotification('Ошибка: ' + e.message, 'error'));
        });
    };

    let currentQRUrl = '';
    let currentQRFileId = '';
    let qrInstance = null;

    window.showQRModal = function(shareUrl, fileId = '') {
        currentQRUrl = shareUrl;
        currentQRFileId = fileId;
        const $qrModal = document.getElementById('qrModal');
        const $qrContainer = document.getElementById('qrCodeContainer');
        const $qrUrl = document.getElementById('qrShareUrl');
        const $deleteBtn = document.getElementById('qrDeleteShareBtn');

        $qrContainer.innerHTML = '';
        $qrUrl.textContent = shareUrl;
        if ($deleteBtn) $deleteBtn.style.display = fileId ? 'inline-flex' : 'none';

        qrInstance = new QRCode($qrContainer, {
            text: shareUrl,
            width: 256,
            height: 256,
            colorDark: '#2c3e50',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.H
        });

        $qrModal.style.display = 'block';
    };

    window.closeQRModal = function() {
        const $qrModal = document.getElementById('qrModal');
        const $qrContainer = document.getElementById('qrCodeContainer');
        $qrModal.style.display = 'none';
        $qrContainer.innerHTML = '';
        qrInstance = null;
        currentQRUrl = '';
        currentQRFileId = '';
    };

    window.copyQRUrl = function() {
        copyTextOrPrompt(currentQRUrl, 'Ссылка для скачивания:').then((ok) => {
            if (ok) {
                showNotification('Ссылка скопирована в буфер обмена', 'success');
            }
        });
    };

    window.deleteQRShareLink = function() {
        if (!currentQRFileId) return;
        const fileId = currentQRFileId;
        closeQRModal();
        deleteShareLink(fileId);
    };

    window.showQRForFile = function(fileId) {
        const token = getAuthToken();
        fetch(`/api/files/share?fileId=${encodeURIComponent(fileId)}&token=${encodeURIComponent(token)}`, {
            method: 'POST'
        })
        .then(async r => {
            if (!r.ok) {
                const text = await r.text();
                try {
                    const errorData = JSON.parse(text);
                    throw new Error(errorData.error || 'Ошибка сервера');
                } catch {
                    throw new Error(text || 'Ошибка сервера');
                }
            }
            return r.json();
        })
        .then(data => {
            const shareUrl = window.location.origin + data.shareUrl;
            showQRModal(shareUrl, fileId);
            loadFiles();
        })
        .catch(e => showNotification('Ошибка: ' + e.message, 'error'));
    };

    window.closeQRModal();

    window.deleteFile = function(fileId) {
        const fileName = fileId.split('/').pop();
        showConfirm(`Переместить файл "${fileName}" в корзину?`, () => {
            const token = getAuthToken();
            fetch(`/api/files/delete?id=${encodeURIComponent(fileId)}&token=${encodeURIComponent(token)}`, {
                method: 'DELETE'
            })
            .then(r => {
                if (!r.ok) throw new Error('Ошибка удаления');
                loadFiles();
            })
            .catch(e => showNotification('Ошибка: ' + e.message, 'error'));
        });
    };
    
    window.permanentDeleteFile = function(fileId) {
        const fileName = fileId.split('/').pop();
        showConfirm(`Удалить файл "${fileName}" БЕЗВОЗВРАТНО? Это действие нельзя отменить!`, () => {
            const token = getAuthToken();
            fetch(`/api/files/permanent-delete?id=${encodeURIComponent(fileId)}&token=${encodeURIComponent(token)}`, {
                method: 'DELETE'
            })
            .then(r => {
                if (!r.ok) throw new Error('Ошибка удаления');
                showNotification(`Файл "${fileName}" удалён безвозвратно`, 'success');
                loadFiles();
            })
            .catch(e => showNotification('Ошибка: ' + e.message, 'error'));
        });
    };
    
    window.permanentDeleteFolder = function(folderPath) {
        const folderName = folderPath.split('/').pop();
        showConfirm(`Удалить папку "${folderName}" и ВСЕ содержимое БЕЗВОЗВРАТНО? Это действие нельзя отменить!`, () => {
            const token = getAuthToken();
            fetch(`/api/files/permanent-delete?id=${encodeURIComponent(folderPath)}&token=${encodeURIComponent(token)}`, {
                method: 'DELETE'
            })
            .then(r => {
                if (!r.ok) throw new Error('Ошибка удаления');
                showNotification(`Папка "${folderName}" удалена безвозвратно`, 'success');
                loadFiles();
            })
            .catch(e => showNotification('Ошибка: ' + e.message, 'error'));
        });
    };

    function moveFile(fileId, targetFolder) {
        const token = getAuthToken();
        fetch(`/api/files/move?fileId=${encodeURIComponent(fileId)}&targetFolder=${encodeURIComponent(targetFolder)}&token=${encodeURIComponent(token)}`, {
            method: 'POST'
        })
        .then(async r => {
            if (!r.ok) {
                const text = await r.text();
                try {
                    const errorData = JSON.parse(text);
                    throw new Error(errorData.error || 'Ошибка перемещения');
                } catch {
                    throw new Error(text || 'Ошибка перемещения');
                }
            }
            return r.json();
        })
        .then(data => {
            if (data.renamed) {
                showNotification(`Файл перемещен и переименован в "${data.newName}"`, 'warning');
            } else {
                showNotification('Файл успешно перемещен', 'success');
            }
            loadFiles();
        })
        .catch(e => showNotification('Ошибка: ' + e.message, 'error'));
    }

    function logout() {
        if (refreshToken) {
            fetch(`/api/auth/logout?refreshToken=${encodeURIComponent(refreshToken)}`, { method: 'POST' })
                .catch(() => {}); // Игнорируем ошибки
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
    
    window.logout = logout;
    
    window.openAdminPanel = function() {
        window.location.href = '/admin-panel.html';
    };

    function showTrash() {
        renderBreadcrumb(currentPath, true);
        setMobileListMode(isMobileLayout());
        if (isMobileLayout()) {
            // Mobile list for trash
            const itemsInPath = trashFiles.filter(item => {
                const itemPath = item.id.includes('/') ? item.id.substring(0, item.id.lastIndexOf('/')) : '';
                return itemPath === currentPath;
            });
            const subfolders = trashFolders.filter(folder => {
                if (currentPath === '') {
                    return !folder.includes('/');
                } else {
                    return folder.startsWith(currentPath + '/') &&
                           folder.split('/').length === currentPath.split('/').length + 1;
                }
            });
            const parentPath = currentPath.includes('/') ? currentPath.substring(0, currentPath.lastIndexOf('/')) : '';

            // Add "clear trash" action in root
            if (currentPath === '' && (trashFiles.length > 0 || trashFolders.length > 0)) {
                $filesList.innerHTML = '';
                const header = document.createElement('div');
                header.className = 'file-item';
                const totalCount = trashFiles.length + trashFolders.length;
                header.innerHTML = `
                    <div class="file-check"></div>
                    <div class="file-main">
                        <div class="file-title" style="cursor: default;"><span class="icon-badge">🗑️</span> В корзине ${totalCount} элементов</div>
                        <div class="file-meta">Очистка удалит все навсегда</div>
                    </div>
                    <div class="file-actions">
                        <button class="danger" title="Очистить корзину">Очистить</button>
                    </div>
                `;
                header.querySelector('button').onclick = (e) => {
                    e.stopPropagation();
                    clearTrash();
                };
                $filesList.appendChild(header);
            }

            renderMobileList({
                parentNavigate: currentPath !== '' ? () => selectTrashPath(parentPath) : null,
                folders: subfolders,
                files: itemsInPath,
                inTrashMode: true,
                append: (currentPath === '' && (trashFiles.length > 0 || trashFolders.length > 0))
            });
            $filesTable.innerHTML = '';
            updateBulkActionsVisibility();
            return;
        }

        $filesList && ($filesList.innerHTML = '');
        $filesTable.innerHTML = '';
        
        // Фильтруем элементы для текущей папки корзины
        const itemsInPath = trashFiles.filter(item => {
            const itemPath = item.id.includes('/') ? item.id.substring(0, item.id.lastIndexOf('/')) : '';
            return itemPath === currentPath;
        });
        
        // Подпапки в текущей папке корзины
        const subfolders = trashFolders.filter(folder => {
            if (currentPath === '') {
                return !folder.includes('/');
            } else {
                return folder.startsWith(currentPath + '/') && 
                       folder.split('/').length === currentPath.split('/').length + 1;
            }
        });
        
        // Кнопка очистить корзину (только в корне)
        if (currentPath === '' && (itemsInPath.length > 0 || subfolders.length > 0)) {
            const row = $filesTable.insertRow();
            row.style.backgroundColor = '#fff3cd';
            row.innerHTML = `
                <td></td>
                <td colspan="4" style="text-align: center; font-weight: bold;">
                    В корзине ${trashFiles.length} элементов
                </td>
                <td>
                    <button onclick="clearTrash()" class="danger" title="Очистить корзину">🗑️ Очистить все</button>
                </td>
            `;
        }
        
        // Кнопка "Назад" (если не в корне корзины)
        if (currentPath !== '') {
            const row = $filesTable.insertRow();
            const parentPath = currentPath.includes('/') ? currentPath.substring(0, currentPath.lastIndexOf('/')) : '';
            row.insertCell(); // Пустая ячейка для чекбокса
            const cell = row.insertCell();
            cell.style.cursor = 'pointer';
            cell.style.color = '#007acc';
            cell.textContent = '📁 ..';
            cell.onclick = () => selectTrashPath(parentPath);
            row.insertCell().textContent = '-';
            row.insertCell().textContent = '-';
            row.insertCell().textContent = '-';
            row.insertCell().textContent = '-';
        }
        
        // Подпапки
        subfolders.forEach(folder => {
            const row = $filesTable.insertRow();
            const folderName = folder.split('/').pop();
            row.insertCell(); // Пустая ячейка для чекбокса
            const cell = row.insertCell();
            cell.style.cursor = 'pointer';
            cell.style.color = '#007acc';
            cell.textContent = '📁 ' + folderName;
            cell.onclick = () => selectTrashPath(folder);
            row.insertCell().textContent = '-';
            row.insertCell().textContent = '-';
            row.insertCell().textContent = '-';
            
            const actionsCell = row.insertCell();
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'action-buttons';
            
            const restoreBtn = document.createElement('button');
            restoreBtn.innerHTML = '↩️';
            restoreBtn.title = 'Восстановить';
            restoreBtn.className = 'success';
            restoreBtn.onclick = (e) => {
                e.stopPropagation();
                restoreFromTrash(folder);
            };
            
            const deleteBtn = document.createElement('button');
            deleteBtn.innerHTML = '🗑️';
            deleteBtn.title = 'Удалить навсегда';
            deleteBtn.className = 'danger';
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                deleteFromTrash(folder);
            };
            
            actionsDiv.appendChild(restoreBtn);
            actionsDiv.appendChild(deleteBtn);
            actionsCell.appendChild(actionsDiv);
        });
        
        // Файлы
        itemsInPath.forEach(item => {
            const row = $filesTable.insertRow();
            const itemName = item.id.includes('/') ? item.id.split('/').pop() : item.id;

            const itemSize = (item.sizeBytes !== undefined && item.sizeBytes !== null) ? formatFileSize(item.sizeBytes) : '-';
            const itemDate = new Date(item.uploadedAt).toLocaleString();
            
            row.innerHTML = `
                <td></td>
                <td>📄 ${itemName}</td>
                <td>${itemSize}</td>
                <td>${itemDate}</td>
                <td>-</td>
                <td>
                    <div class="action-buttons">
                        <button onclick="restoreFromTrash('${item.id}')" class="success" title="Восстановить">↩️</button>
                        <button onclick="deleteFromTrash('${item.id}')" class="danger" title="Удалить навсегда">🗑️</button>
                    </div>
                </td>
            `;
        });
        
        if (itemsInPath.length === 0 && subfolders.length === 0 && currentPath === '') {
            const row = $filesTable.insertRow();
            row.innerHTML = `
                <td colspan="6" style="text-align: center; color: #666; font-style: italic;">
                    Корзина пуста
                </td>
            `;
        }
    }
    
    window.clearTrash = function() {
        showConfirm('Очистить корзину? Все файлы будут удалены навсегда!', () => {
            const token = getAuthToken();
            fetch(`/api/files/trash/clear?token=${encodeURIComponent(token)}`, {
                method: 'DELETE'
            })
            .then(r => {
                if (!r.ok) throw new Error('Ошибка очистки корзины');
                loadFiles();
            })
            .catch(e => showNotification('Ошибка: ' + e.message, 'error'));
        });
    };
    
    window.deleteFromTrash = function(itemId) {
        showConfirm('Удалить навсегда? Это действие нельзя отменить!', () => {
            const token = getAuthToken();
            fetch(`/api/files/trash/${encodeURIComponent(itemId)}?token=${encodeURIComponent(token)}`, {
                method: 'DELETE'
            })
            .then(r => {
                if (!r.ok) throw new Error('Ошибка удаления');
                loadFiles();
            })
            .catch(e => showNotification('Ошибка: ' + e.message, 'error'));
        });
    };
    
    window.restoreFromTrash = function(itemId) {
        const itemName = itemId.split('/').pop();
        showConfirm(`Восстановить "${itemName}"?`, () => {
            const token = getAuthToken();
            fetch(`/api/files/trash/restore/${encodeURIComponent(itemId)}?token=${encodeURIComponent(token)}`, {
                method: 'POST'
            })
            .then(r => {
                if (!r.ok) throw new Error('Ошибка восстановления');
                loadFiles();
            })
            .catch(e => showNotification('Ошибка: ' + e.message, 'error'));
        });
    };
    
    function validateFileName(name) {
        if (!name || name.trim().length === 0) {
            throw new Error('Имя не может быть пустым');
        }
        
        const trimmed = name.trim();
        if (trimmed.length > 255) {
            throw new Error('Имя слишком длинное (максимум 255 символов)');
        }
        
        if (/[<>:"/\\|?*]/.test(trimmed)) {
            throw new Error('Имя содержит запрещенные символы: < > : " / \\ | ? *');
        }
        
        if (trimmed === '.' || trimmed === '..') {
            throw new Error('Недопустимое имя');
        }
        
        const reserved = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
        const upperName = trimmed.toUpperCase();
        for (const res of reserved) {
            if (upperName === res || upperName.startsWith(res + '.')) {
                throw new Error(`Зарезервированное имя: ${res}`);
            }
        }
        
        return trimmed;
    }
    
    window.renameFile = function(fileId) {
        const fileName = fileId.includes('/') ? fileId.split('/').pop() : fileId;
        showInput('Переименовать файл', `Новое имя для "${fileName}":`, (newName) => {
            try {
                const validName = validateFileName(newName);
                const token = getAuthToken();
                
                fetch(`/api/files/rename?fileId=${encodeURIComponent(fileId)}&newName=${encodeURIComponent(validName)}&token=${encodeURIComponent(token)}`, {
                    method: 'POST'
                })
                .then(async r => {
                    if (!r.ok) {
                        const text = await r.text();
                        try {
                            const errorData = JSON.parse(text);
                            throw new Error(errorData.error || 'Ошибка переименования');
                        } catch {
                            throw new Error(text || 'Ошибка переименования');
                        }
                    }
                    showNotification('Файл успешно переименован', 'success');
                    loadFiles();
                })
                .catch(e => showNotification('Ошибка: ' + e.message, 'error'));
            } catch (e) {
                showNotification(e.message, 'error');
            }
        }, fileName);
    };
    
    window.renameFolder = function(folderPath) {
        const folderName = folderPath.split('/').pop();
        showInput('Переименовать папку', `Новое имя для "${folderName}":`, (newName) => {
            try {
                const validName = validateFileName(newName);
                const token = getAuthToken();
                
                fetch(`/api/files/rename-folder?folderPath=${encodeURIComponent(folderPath)}&newName=${encodeURIComponent(validName)}&token=${encodeURIComponent(token)}`, {
                    method: 'POST'
                })
                .then(async r => {
                    if (!r.ok) {
                        const text = await r.text();
                        try {
                            const errorData = JSON.parse(text);
                            throw new Error(errorData.error || 'Ошибка переименования');
                        } catch {
                            throw new Error(text || 'Ошибка переименования');
                        }
                    }
                    showNotification('Папка успешно переименована', 'success');
                    loadFiles();
                })
                .catch(e => showNotification('Ошибка: ' + e.message, 'error'));
            } catch (e) {
                showNotification(e.message, 'error');
            }
        }, folderName);
    };
    
    function updateQuotaDisplay(quota) {
        const percentage = Math.min(100, quota.percentage);
        const usedGB = (quota.used / 1024 / 1024 / 1024).toFixed(2);
        const totalGB = (quota.quota / 1024 / 1024 / 1024).toFixed(2);
        const remainingGB = (quota.remaining / 1024 / 1024 / 1024).toFixed(2);
        
        $quotaProgress.style.width = percentage + '%';
        if (isMobileLayout()) {
            $quotaText.textContent = `Осталось ${remainingGB} GB`;
        } else {
            $quotaText.textContent = `Осталось: ${remainingGB} GB / ${totalGB} GB`;
        }
        
        // Цвет прогрессбара в зависимости от заполненности
        if (percentage < 70) {
            $quotaProgress.style.backgroundColor = '#28a745';
        } else if (percentage < 90) {
            $quotaProgress.style.backgroundColor = '#ffc107';
        } else {
            $quotaProgress.style.backgroundColor = '#dc3545';
        }
    }
