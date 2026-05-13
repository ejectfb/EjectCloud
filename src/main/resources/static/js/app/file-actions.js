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
            
            authFetch(`/api/files/mkdir?path=${encodeURIComponent(folderPath)}`, {
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
        showDeleteConfirm(`Удалить папку "${folderName}"?`, () => {
            const token = getAuthToken();
            authFetch(`/api/files/folder?path=${encodeURIComponent(folderPath)}`, {
                method: 'DELETE'
            })
            .then(r => {
                if (!r.ok) return r.text().then(t => { throw new Error(t); });
                loadFiles();
            })
            .catch(e => showNotification('Ошибка: ' + e.message, 'error'));
        }, () => {
            permanentDeleteFolderNow(folderPath);
        });
    };

    window.downloadFile = function(fileId) {
        const a = document.createElement('a');
        a.href = `/api/files/download?fileId=${encodeURIComponent(fileId)}`;
        a.style.display = 'none';
        document.body.appendChild(a);
        fetch(a.href, { headers: getAuthHeaders() })
            .then(r => {
                if (!r.ok) throw new Error('Download failed');
                return r.blob();
            })
            .then(blob => {
                const url = URL.createObjectURL(blob);
                a.href = url;
                a.download = fileId.split('/').pop();
                a.click();
                URL.revokeObjectURL(url);
            })
            .catch(e => showNotification('Ошибка скачивания: ' + e.message, 'error'))
            .finally(() => a.remove());
    };

    window.shareFile = function(fileId) {
        const token = getAuthToken();
        authFetch(`/api/files/share?fileId=${encodeURIComponent(fileId)}`, {
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
        authFetch(`/api/files/share?fileId=${encodeURIComponent(fileId)}`, {
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
            authFetch(`/api/files/share?fileId=${encodeURIComponent(fileId)}`, {
                method: 'DELETE'
            })
            .then(r => {
                if (!r.ok) throw new Error('Ошибка удаления ссылки');
                loadFiles();
            })
            .catch(e => showNotification('Ошибка: ' + e.message, 'error'));
        });
    };
    
    window.shareFileToTelegram = function(fileId) {
        closeQRModal();
        const fileObj = allFiles.find(f => f.id === fileId);
        const fileName = fileId.includes('/') ? fileId.split('/').pop() : fileId;
        const fileSize = fileObj && fileObj.size ? fileObj.size : 0;
        const fileSizeMB = fileSize / (1024 * 1024);
        
        if (fileSizeMB > 20) {
            showConfirm(
                `Файл "${fileName}" весит ${fileSizeMB.toFixed(1)} MB (максимум 20 MB для Telegram).\n\n` +
                `Вместо файла будет отправлена ссылка на скачивание, которая будет актуальна 24 часа. Продолжить?`,
                () => {
                    sendTelegramLink(fileId, fileName, fileSize);
                }
            );
        } else {
            showConfirm(`Отправить файл "${fileName}" в Telegram?`, () => {
                sendTelegramFile(fileId, fileName, fileSize);
            });
        }
    };
    
    function sendTelegramFile(fileId, fileName, fileSize) {
        const token = getAuthToken();
        const btn = document.createElement('div');
        btn.style.cssText = 'position:fixed;top:20px;right:20px;z-index:99999;padding:15px 25px;background:#fff;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,0.15);font-size:14px;max-width:350px;';
        btn.innerHTML = '<div style="font-weight:600;margin-bottom:8px;">Отправка в Telegram...</div><div class="progress-bar" style="width:100%;height:8px;background:#ecf0f1;border-radius:4px;overflow:hidden;"><div class="progress-fill" style="height:100%;width:0%;background:#2980b9;transition:width 0.3s;"></div></div><div class="status-text" style="margin-top:6px;color:#666;font-size:12px;"></div>';
        document.body.appendChild(btn);
        const fill = btn.querySelector('.progress-fill');
        const status = btn.querySelector('.status-text');
        
        authFetch(`/api/files/share-telegram?fileId=${encodeURIComponent(fileId)}`, {
            method: 'POST'
        })
        .then(async r => {
            fill.style.width = '70%';
            status.textContent = 'Обработка...';
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
            fill.style.width = '100%';
            status.textContent = 'Готово!';
            showNotification('Файл успешно отправлен в Telegram', 'success');
            setTimeout(() => btn.remove(), 2000);
        })
        .catch(e => {
            fill.style.width = '100%';
            fill.style.background = '#e74c3c';
            status.textContent = 'Ошибка!';
            showNotification('Ошибка отправки: ' + e.message, 'error');
            setTimeout(() => btn.remove(), 3000);
        });
    }
    
    function sendTelegramLink(fileId, fileName, fileSize) {
        const token = getAuthToken();
        const shareUrl = window.location.origin + '/share/' + fileId;
        
        authFetch(`/api/files/share-telegram-link?fileId=${encodeURIComponent(fileId)}&shareUrl=${encodeURIComponent(shareUrl)}`, {
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
            showNotification('Ссылка на файл отправлена в Telegram', 'success');
        })
        .catch(e => {
            showNotification('Ошибка отправки: ' + e.message, 'error');
        });
    }

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
        authFetch(`/api/files/share?fileId=${encodeURIComponent(fileId)}`, {
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
        showDeleteConfirm(`Удалить файл "${fileName}"?`, () => {
            const token = getAuthToken();
            authFetch(`/api/files/delete?id=${encodeURIComponent(fileId)}`, {
                method: 'DELETE'
            })
            .then(r => {
                if (!r.ok) throw new Error('Ошибка удаления');
                loadFiles();
            })
            .catch(e => showNotification('Ошибка: ' + e.message, 'error'));
        }, () => {
            permanentDeleteFileNow(fileId);
        });
    };

    function permanentDeleteFileNow(fileId) {
        const fileName = fileId.split('/').pop();
        const token = getAuthToken();
        authFetch(`/api/files/permanent-delete?id=${encodeURIComponent(fileId)}`, {
            method: 'DELETE'
        })
        .then(r => {
            if (!r.ok) throw new Error('Ошибка удаления');
            showNotification(`Файл "${fileName}" удалён безвозвратно`, 'success');
            loadFiles();
        })
        .catch(e => showNotification('Ошибка: ' + e.message, 'error'));
    }
    
    window.permanentDeleteFile = function(fileId) {
        const fileName = fileId.split('/').pop();
        showConfirm(`Удалить файл "${fileName}" БЕЗВОЗВРАТНО? Это действие нельзя отменить!`, () => {
            permanentDeleteFileNow(fileId);
        });
    };

    function permanentDeleteFolderNow(folderPath) {
        const folderName = folderPath.split('/').pop();
        const token = getAuthToken();
        authFetch(`/api/files/permanent-delete?id=${encodeURIComponent(folderPath)}`, {
            method: 'DELETE'
        })
        .then(r => {
            if (!r.ok) throw new Error('Ошибка удаления');
            showNotification(`Папка "${folderName}" удалена безвозвратно`, 'success');
            loadFiles();
        })
        .catch(e => showNotification('Ошибка: ' + e.message, 'error'));
    }
    
    window.permanentDeleteFolder = function(folderPath) {
        const folderName = folderPath.split('/').pop();
        showConfirm(`Удалить папку "${folderName}" и ВСЕ содержимое БЕЗВОЗВРАТНО? Это действие нельзя отменить!`, () => {
            permanentDeleteFolderNow(folderPath);
        });
    };

    function moveFile(fileId, targetFolder) {
        const token = getAuthToken();
        authFetch(`/api/files/move?fileId=${encodeURIComponent(fileId)}&targetFolder=${encodeURIComponent(targetFolder)}`, {
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
            authFetch(`/api/auth/logout?refreshToken=${encodeURIComponent(refreshToken)}`, { method: 'POST' })
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
                        <div class="file-title" style="cursor: default;"><span class="icon-badge">${iconHtml('trash')}</span> В корзине ${totalCount} элементов</div>
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
                    <button onclick="clearTrash()" class="danger" title="Очистить корзину">${iconHtml('trash-clear')} Очистить все</button>
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
            cell.innerHTML = `${iconHtml('folder')} ..`;
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
            cell.innerHTML = `${iconHtml('folder')} ${escapeHtml(folderName)}`;
            cell.onclick = () => selectTrashPath(folder);
            row.insertCell().textContent = '-';
            row.insertCell().textContent = '-';
            row.insertCell().textContent = '-';
            
            const actionsCell = row.insertCell();
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'action-buttons';
            
            const restoreBtn = document.createElement('button');
            restoreBtn.innerHTML = iconHtml('trash-restore');
            restoreBtn.title = 'Восстановить';
            restoreBtn.className = 'success';
            restoreBtn.onclick = (e) => {
                e.stopPropagation();
                restoreFromTrash(folder);
            };
            
            const deleteBtn = document.createElement('button');
            deleteBtn.innerHTML = iconHtml('trash');
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
                <td>${iconHtml('file')} ${escapeHtml(itemName)}</td>
                <td>${itemSize}</td>
                <td>${itemDate}</td>
                <td>-</td>
                <td>
                    <div class="action-buttons">
                        <button onclick="restoreFromTrash('${item.id}')" class="success" title="Восстановить">${iconHtml('trash-restore')}</button>
                        <button onclick="deleteFromTrash('${item.id}')" class="danger" title="Удалить навсегда">${iconHtml('trash')}</button>
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
            authFetch('/api/files/trash/clear', {
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
            authFetch(`/api/files/trash/${encodeURIComponent(itemId)}`, {
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
            authFetch(`/api/files/trash/restore/${encodeURIComponent(itemId)}`, {
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
                
                authFetch(`/api/files/rename?fileId=${encodeURIComponent(fileId)}&newName=${encodeURIComponent(validName)}`, {
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
                
                authFetch(`/api/files/rename-folder?folderPath=${encodeURIComponent(folderPath)}&newName=${encodeURIComponent(validName)}`, {
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
        const usedGB = (quota.used / 1024 / 1024 / 1024).toFixed(1);
        const totalGB = (quota.quota / 1024 / 1024 / 1024).toFixed(1);
        const remainingGB = (quota.remaining / 1024 / 1024 / 1024).toFixed(1);
        
        $quotaProgress.style.width = percentage + '%';
        $quotaText.textContent = isMobileLayout() ? `${usedGB}/${totalGB} GB` : `${usedGB} из ${totalGB} GB`;
        $quotaText.title = `Использовано ${usedGB} GB, свободно ${remainingGB} GB, всего ${totalGB} GB`;
        
        // Цвет прогрессбара в зависимости от заполненности
        if (percentage < 70) {
            $quotaProgress.style.backgroundColor = '#28a745';
        } else if (percentage < 90) {
            $quotaProgress.style.backgroundColor = '#ffc107';
        } else {
            $quotaProgress.style.backgroundColor = '#dc3545';
        }
    }
