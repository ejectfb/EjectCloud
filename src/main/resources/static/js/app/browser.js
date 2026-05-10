    function renderMobileList({ parentNavigate, folders, files, inTrashMode, append = false }) {
        if (!$filesList) return;
        if (!append) {
            $filesList.innerHTML = '';
        }

        const beforeCount = $filesList.children.length;

        const addItem = (el) => $filesList.appendChild(el);

        if (parentNavigate) {
            const back = document.createElement('div');
            back.className = 'file-item';
            back.innerHTML = `
                <div class="file-check"></div>
                <div class="file-main">
                    <div class="file-title" title="Назад"><span class="icon-badge">${iconHtml('folder')}</span> ..</div>
                </div>
                <div class="file-actions"></div>
            `;
            back.querySelector('.file-title').onclick = parentNavigate;
            addItem(back);
        }

        folders.forEach(folderPath => {
            const folderName = folderPath.split('/').pop();
            const item = document.createElement('div');
            item.className = 'file-item';
            item.dataset.itemKind = 'folder';
            item.dataset.itemId = folderPath;

            const folderChecked = selectedItems.has(itemKey('folder', folderPath));
            if (folderChecked) item.classList.add('selected');
            item.innerHTML = `
                <div class="file-check"></div>
                <div class="file-main">
                    <div class="file-title" title="Открыть папку"><span class="icon-badge">${iconHtml('folder')}</span> ${escapeHtml(folderName)}</div>
                    <div class="file-meta">Папка</div>
                </div>
                <div class="file-actions">
                    <button class="secondary" title="Действия">⋯</button>
                </div>
            `;

            if (!inTrashMode) {
                const checkWrap = item.querySelector('.file-check');
                checkWrap.innerHTML = `<input type="checkbox" class="file-checkbox" ${folderChecked ? 'checked' : ''} />`;
                const cb = checkWrap.querySelector('input');
                cb.addEventListener('click', (e) => e.stopPropagation());
                cb.onchange = () => toggleItemSelection('folder', folderPath, cb);
            }

            item.querySelector('.file-title').onclick = () => {
                if (inTrashMode) {
                    selectTrashPath(folderPath);
                } else {
                    selectPath(folderPath);
                }
            };

            item.querySelector('button').onclick = (e) => {
                e.stopPropagation();
                openItemActions('folder', folderPath);
            };

            addItem(item);
        });

        files.forEach(fileObj => {
            const fileId = fileObj.id;
            const fileName = fileId.includes('/') ? fileId.split('/').pop() : fileId;
            const size = fileObj.size !== undefined ? formatFileSize(fileObj.size) : ((fileObj.sizeBytes !== undefined && fileObj.sizeBytes !== null) ? formatFileSize(fileObj.sizeBytes) : '-');
            const date = new Date(fileObj.uploadedAt).toLocaleString();

            const linkInfo = (!inTrashMode && fileObj.shared && fileObj.shareExpiresAt) ? getTimeUntilExpiry(fileObj.shareExpiresAt) : '';

            const item = document.createElement('div');
            item.className = 'file-item';
            item.dataset.fileId = fileId;

            item.dataset.itemKind = 'file';
            item.dataset.itemId = fileId;

            const checked = selectedItems.has(itemKey('file', fileId));
            if (checked) item.classList.add('selected');

            item.innerHTML = `
                <div class="file-check">
                    ${inTrashMode ? '' : `<input type="checkbox" class="file-checkbox" ${checked ? 'checked' : ''} />`}
                </div>
                <div class="file-main">
                    <div class="file-title" title="Открыть/скачать"><span class="icon-badge">${iconHtml('file')}</span> ${escapeHtml(fileName)}</div>
                    <div class="file-meta">
                        <span>${escapeHtml(size)}</span>
                        <span>${escapeHtml(date)}</span>
                        ${linkInfo ? `<span class="icon-text" style="cursor:pointer; color:#007acc;" title="Открыть QR-код">${iconHtml('share')}${escapeHtml(linkInfo)}</span>` : ''}
                    </div>
                </div>
                <div class="file-actions">
                    <button class="secondary" title="Действия">⋯</button>
                </div>
            `;

            item.querySelector('.file-title').onclick = () => {
                openPreview(fileId);
            };

            const metaLink = item.querySelector('.file-meta span[title="Открыть QR-код"]');
            if (metaLink) {
                metaLink.onclick = (e) => {
                    e.stopPropagation();
                    showQRForFile(fileId);
                };
            }

            const actionsBtn = item.querySelector('.file-actions button');
            actionsBtn.onclick = (e) => {
                e.stopPropagation();
                openItemActions('file', fileId);
            };

            const cb = item.querySelector('.file-checkbox');
            if (cb) {
                cb.addEventListener('click', (e) => e.stopPropagation());
                cb.onchange = function() {
                    toggleItemSelection('file', fileId, cb);
                };
            }

            addItem(item);
        });

        if ($filesList.children.length === beforeCount) {
            const empty = document.createElement('div');
            empty.className = 'file-item';
            empty.innerHTML = `
                <div class="file-check"></div>
                <div class="file-main">
                    <div class="file-title" style="cursor: default;"><span class="icon-badge">${iconHtml('info')}</span> ${inTrashMode ? 'Корзина пуста' : 'Папка пуста'}</div>
                </div>
                <div class="file-actions"></div>
            `;
            $filesList.appendChild(empty);
        }
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    let lastMobile = isMobileLayout();
    setMobileListMode(lastMobile);
    window.addEventListener('resize', () => {
        const nowMobile = isMobileLayout();
        if (nowMobile === lastMobile) return;
        lastMobile = nowMobile;
        setMobileListMode(nowMobile);
        // rerender current view
        if (isInTrash) showTrash(); else showFilesInPath(currentPath);
    });

    function showLogin() {
        window.location.href = '/login.html';
    }
    
    function showApp() {
        $login.classList.add('hidden');
        $app.classList.remove('hidden');
    }

    function renderBreadcrumb(path, inTrashMode) {
        const parts = path ? path.split('/').filter(Boolean) : [];
        const container = document.createElement('div');
        container.className = 'breadcrumbs';

        function addCrumb(label, onClick) {
            const span = document.createElement('span');
            span.className = 'breadcrumb-item';
            span.textContent = label;
            span.onclick = onClick;
            container.appendChild(span);
        }

        function addSep() {
            const sep = document.createElement('span');
            sep.className = 'breadcrumb-sep';
            sep.textContent = '/';
            container.appendChild(sep);
        }

        if (inTrashMode) {
            addCrumb('Корзина', () => selectTrash());
            let acc = '';
            parts.forEach((p, idx) => {
                addSep();
                acc += (idx === 0 ? '' : '/') + p;
                addCrumb(p, () => selectTrashPath(acc));
            });
        } else {
            addCrumb('Хранилище', () => selectPath(''));
            let acc = '';
            parts.forEach((p, idx) => {
                addSep();
                acc += (idx === 0 ? '' : '/') + p;
                addCrumb(p, () => selectPath(acc));
            });

            // Download current folder (button at end)
            const dl = document.createElement('button');
            dl.className = 'secondary';
            dl.style.marginLeft = '10px';
            dl.textContent = 'Скачать';
            dl.title = 'Скачать текущую папку архивом';
            dl.onclick = (e) => {
                e.stopPropagation();
                downloadCurrentFolder();
            };
            container.appendChild(dl);
        }

        $currentPath.innerHTML = '';
        $currentPath.appendChild(container);
    }

    function ensureExpandedForPath(path, set) {
        if (!path) return;
        const parts = path.split('/').filter(Boolean);
        let acc = '';
        parts.forEach((p, idx) => {
            acc += (idx === 0 ? '' : '/') + p;
            set.add(acc);
        });
    }

    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <span style="flex: 1;">${message}</span>
            <button onclick="this.parentElement.remove()" style="background: none; border: none; color: inherit; font-size: 18px; cursor: pointer; margin-left: 10px; opacity: 0.7;" title="Закрыть">&times;</button>
        `;
        notification.style.display = 'flex';
        notification.style.alignItems = 'center';
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 30000);
    }
    
    function showConfirm(message, callback) {
        document.getElementById('confirmMessage').textContent = message;
        confirmCallback = callback;
        document.getElementById('confirmModal').style.display = 'block';
    }
    
    window.closeConfirmModal = function() {
        document.getElementById('confirmModal').style.display = 'none';
        confirmCallback = null;
    };
    
    window.confirmAction = function() {
        if (confirmCallback) {
            confirmCallback();
        }
        closeConfirmModal();
    };

    window.moveFileDialog = function(fileId) {
        selectedMoveFile = fileId;
        const fileName = fileId.split('/').pop();
        
        document.getElementById('moveFileName').textContent = `Переместить файл: ${fileName}`;
        
        const folderTree = document.getElementById('folderTree');
        folderTree.innerHTML = '';
        
        // Корень
        const rootItem = document.createElement('div');
        rootItem.className = 'folder-item selected';
        rootItem.innerHTML = `${iconHtml('home')} Хранилище`;
        rootItem.onclick = () => selectTargetFolder('', rootItem);
        folderTree.appendChild(rootItem);
        
        // Папки
        allFolders.forEach(folder => {
            const item = document.createElement('div');
            item.className = 'folder-item';
            const depth = folder.split('/').length - 1;
            item.style.paddingLeft = (20 + depth * 15) + 'px';
            item.innerHTML = `${iconHtml('folder')} ${escapeHtml(folder.split('/').pop())}`;
            item.onclick = () => selectTargetFolder(folder, item);
            folderTree.appendChild(item);
        });
        
        selectedTargetFolder = '';
        document.getElementById('moveModal').style.display = 'block';
    };
    
    function selectTargetFolder(folder, element) {
        document.querySelectorAll('.folder-item').forEach(item => {
            item.classList.remove('selected');
        });
        element.classList.add('selected');
        selectedTargetFolder = folder;
    }
    
    window.closeMoveModal = function() {
        document.getElementById('moveModal').style.display = 'none';
        selectedMoveFile = null;
        selectedTargetFolder = '';
    };
    
    window.confirmMove = function() {
        if (selectedMoveFile) {
            moveFile(selectedMoveFile, selectedTargetFolder);
            closeMoveModal();
        }
    };

    function doValidate() {
        if (accessToken) {
            console.log('Validating JWT token');
            fetch(`/api/auth/validate?token=${encodeURIComponent(accessToken)}`)
                .then(r => r.json())
                .then(j => {
                    if (j.ok) {
                        $who.textContent = j.user;
                        
                        // Показываем кнопку админ-панели для админов
                        if (j.isAdmin) {
                            document.getElementById('adminPanelBtn').style.display = 'inline-block';
                            const drawerAdmin = document.getElementById('adminPanelBtnDrawer');
                            if (drawerAdmin) drawerAdmin.style.display = 'block';
                        }
                        
                        showApp();
                        startTokenRefresh();
                        loadFiles();
                    } else {
                        tryRefreshToken();
                    }
                }).catch(e => {
                    console.error('Validation error:', e);
                    window.location.href = '/login.html';
                });
        } else if (oldToken) {
            convertOldToken();
        } else {
            showLogin();
        }
    }
    
    function convertOldToken() {
        console.log('Converting old token to JWT');
        fetch(`/auth/login?token=${encodeURIComponent(oldToken)}`, { method: 'POST' })
            .then(r => {
                if (!r.ok) throw new Error('Invalid token');
                return r.json();
            })
            .then(data => {
                accessToken = data.accessToken;
                refreshToken = data.refreshToken;
                localStorage.setItem('eject_access_token', accessToken);
                localStorage.setItem('eject_refresh_token', refreshToken);
                localStorage.removeItem('eject_token');
                
                $who.textContent = data.telegramId;
                showApp();
                startTokenRefresh();
                loadFiles();
            })
            .catch(e => {
                console.error('Token conversion error:', e);
                window.location.href = '/login.html';
            });
    }
    
    function tryRefreshToken() {
        if (!refreshToken) {
            showLogin();
            return Promise.reject('No refresh token');
        }
        
        return fetch(`/api/auth/refresh?refreshToken=${encodeURIComponent(refreshToken)}`, { method: 'POST' })
            .then(r => {
                if (!r.ok) throw new Error('Refresh failed');
                return r.json();
            })
            .then(data => {
                accessToken = data.accessToken;
                localStorage.setItem('eject_access_token', accessToken);
                return data;
            })
            .catch(e => {
                console.error('Refresh error:', e);
                window.location.href = '/login.html';
                throw e;
            });
    }
    
    function startTokenRefresh() {
        if (refreshInterval) clearInterval(refreshInterval);
        
        // Обновляем токен каждые 10 минут
        refreshInterval = setInterval(() => {
            tryRefreshToken();
        }, 10 * 60 * 1000);
        
        // Скрываем таймер
        $timer.style.display = 'none';
    }

    function getAuthToken() {
        return accessToken;
    }

    function loadFiles() {
        const token = getAuthToken();
        Promise.all([
            fetch(`/api/files/list?token=${encodeURIComponent(token)}`).then(r => r.json()),
            fetch(`/api/files/folders?token=${encodeURIComponent(token)}`).then(r => r.json()),
            fetch(`/api/files/trash?token=${encodeURIComponent(token)}`).then(r => r.json()),
            fetch(`/api/files/trash/folders?token=${encodeURIComponent(token)}`).then(r => r.json()),
            fetch(`/api/files/quota?token=${encodeURIComponent(token)}`).then(r => r.json())
        ])
        .then(([files, folders, trash, trashFoldersData, quota]) => {
            allFiles = files;
            allFolders = folders;
            trashFiles = trash;
            trashFolders = trashFoldersData;
            updateQuotaDisplay(quota);

            if (isInTrash) {
                ensureExpandedForPath(currentPath, expandedTrash);
            } else {
                ensureExpandedForPath(currentPath, expandedStorage);
            }

            buildFileTree();
            if (isInTrash) {
                showTrash();
            } else {
                showFilesInPath(currentPath);
            }
        })
        .catch(e => showNotification('Ошибка загрузки: ' + e.message, 'error'));
    }

    function buildTreeFromPaths(paths) {
        const root = { name: '', path: '', children: new Map() };

        paths.forEach(folderPath => {
            const parts = folderPath.split('/').filter(Boolean);
            let current = root;
            let acc = '';

            parts.forEach((part, idx) => {
                acc += (idx === 0 ? '' : '/') + part;
                if (!current.children.has(part)) {
                    current.children.set(part, { name: part, path: acc, children: new Map() });
                }
                current = current.children.get(part);
            });
        });

        return root;
    }

    function createTreeItem({ label, icon, depth, selected, onClick, canToggle, expanded, onToggle }) {
        const item = document.createElement('div');
        item.className = 'tree-item' + (selected ? ' selected' : '');
        item.style.paddingLeft = (30 + depth * 20) + 'px';

        const row = document.createElement('div');
        row.className = 'tree-item-row';

        const toggle = document.createElement('span');
        toggle.className = 'tree-toggle';
        if (canToggle) {
            toggle.textContent = expanded ? '▾' : '▸';
            toggle.onclick = (e) => {
                e.stopPropagation();
                onToggle && onToggle();
            };
        } else {
            toggle.textContent = '▸';
            toggle.style.visibility = 'hidden';
        }

        const text = document.createElement('span');
        text.className = 'tree-label';
        text.innerHTML = `${icon} ${escapeHtml(label)}`;

        row.appendChild(toggle);
        row.appendChild(text);
        item.appendChild(row);

        item.onclick = onClick;
        return item;
    }

    function renderTreeNodes(rootNode, container, depth, expandedSet, onSelectPath) {
        const nodes = Array.from(rootNode.children.values()).sort((a, b) => a.name.localeCompare(b.name));
        nodes.forEach(node => {
            const isSelected = (!isInTrash && onSelectPath === selectPath && currentPath === node.path) || (isInTrash && onSelectPath === selectTrashPath && currentPath === node.path);
            const hasChildren = node.children.size > 0;
            const isExpanded = expandedSet.has(node.path);

            const item = createTreeItem({
                label: node.name,
            icon: iconHtml('folder'),
                depth,
                selected: isSelected,
                onClick: () => onSelectPath(node.path),
                canToggle: hasChildren,
                expanded: isExpanded,
                onToggle: () => {
                    if (isExpanded) expandedSet.delete(node.path); else expandedSet.add(node.path);
                    buildFileTree();
                }
            });
            item.classList.add('folder');
            container.appendChild(item);

            if (hasChildren && isExpanded) {
                renderTreeNodes(node, container, depth + 1, expandedSet, onSelectPath);
            }
        });
    }

    function buildFileTree() {
        $fileTree.innerHTML = '';

        const storageTree = buildTreeFromPaths(allFolders);
        const trashTree = buildTreeFromPaths(trashFolders);

        // Storage root
        $fileTree.appendChild(createTreeItem({
            label: 'Хранилище',
            icon: iconHtml('home'),
            depth: 0,
            selected: (!isInTrash && currentPath === ''),
            onClick: () => selectPath(''),
            canToggle: false
        }));

        if (!isInTrash) {
            renderTreeNodes(storageTree, $fileTree, 0, expandedStorage, selectPath);
        }

        // Trash root
        $fileTree.appendChild(createTreeItem({
            label: 'Корзина',
            icon: iconHtml('trash'),
            depth: 0,
            selected: (isInTrash && currentPath === ''),
            onClick: () => selectTrash(),
            canToggle: false
        }));

        if (isInTrash) {
            renderTreeNodes(trashTree, $fileTree, 0, expandedTrash, selectTrashPath);
        }
    }

    function selectPath(path) {
        currentPath = path;
        isInTrash = false;
        ensureExpandedForPath(currentPath, expandedStorage);
        clearSelection();
        updateToolbarButtons();
        buildFileTree();
        showFilesInPath(path);

        if (isMobileLayout()) {
            closeDrawer();
        }
    }
    
    function selectTrash() {
        isInTrash = true;
        currentPath = '';
        clearSelection();
        updateToolbarButtons();
        buildFileTree();
        showTrash();

        if (isMobileLayout()) {
            closeDrawer();
        }
    }
    
    function selectTrashPath(path) {
        isInTrash = true;
        currentPath = path;
        ensureExpandedForPath(currentPath, expandedTrash);
        clearSelection();
        updateToolbarButtons();
        buildFileTree();
        showTrash();

        if (isMobileLayout()) {
            closeDrawer();
        }
    }

    function showFilesInPath(path) {
        renderBreadcrumb(path, false);
        
        // Фильтруем файлы для текущей папки
        const filesInPath = allFiles.filter(file => {
            const filePath = file.id.includes('/') ? file.id.substring(0, file.id.lastIndexOf('/')) : '';
            return filePath === path;
        });
        
        // Подпапки в текущей папке
        const subfolders = allFolders.filter(folder => {
            if (path === '') {
                return !folder.includes('/');
            } else {
                return folder.startsWith(path + '/') && 
                       folder.split('/').length === path.split('/').length + 1;
            }
        });

        setMobileListMode(isMobileLayout());
        if (isMobileLayout()) {
            // Mobile list: no table cards, simple list with one actions button on the right
            const parentPath = path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : '';
            renderMobileList({
                parentNavigate: path !== '' ? () => selectPath(parentPath) : null,
                folders: subfolders,
                files: filesInPath,
                inTrashMode: false
            });
            $filesTable.innerHTML = '';
            updateBulkActionsVisibility();
            return;
        }

        $filesList && ($filesList.innerHTML = '');
        $filesTable.innerHTML = '';
        
        // Кнопка "Назад" (если не в корне)
        if (path !== '') {
            const row = $filesTable.insertRow();
            const parentPath = path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : '';
            row.insertCell(); // Пустая ячейка для чекбокса
            const cell = row.insertCell();
            cell.style.cursor = 'pointer';
            cell.style.color = '#007acc';
            cell.innerHTML = `${iconHtml('folder')} ..`;
            cell.onclick = () => selectPath(parentPath);
            row.insertCell().textContent = '-';
            row.insertCell().textContent = '-';
            row.insertCell().textContent = '-';
            row.insertCell().textContent = '-';
        }
        
        // Подпапки
        subfolders.forEach(folder => {
            const row = $filesTable.insertRow();
            row.dataset.itemKind = 'folder';
            row.dataset.itemId = folder;
            const folderName = folder.split('/').pop();
            const checkboxCell = row.insertCell();
            const checked = selectedItems.has(itemKey('folder', folder));
            checkboxCell.innerHTML = `<input type="checkbox" class="file-checkbox" ${checked ? 'checked' : ''} onchange="toggleItemSelection('folder','${folder}', this)">`;
            const cell = row.insertCell();
            cell.style.cursor = 'pointer';
            cell.style.color = '#007acc';
            cell.innerHTML = `${iconHtml('folder')} ${escapeHtml(folderName)}`;
            cell.onclick = () => selectPath(folder);
            row.insertCell().textContent = '-';
            row.insertCell().textContent = '-';
            row.insertCell().textContent = '-';
            
            const actionsCell = row.insertCell();
            actionsCell.innerHTML = `
                <div class="action-buttons">
                    <button onclick="event.stopPropagation(); downloadFolderArchive('${folder}')" class="primary" title="Скачать папку">${iconHtml('download')}</button>
                    <button onclick="event.stopPropagation(); renameFolder('${folder}')" class="secondary" title="Переименовать">${iconHtml('edit')}</button>
                    <button onclick="event.stopPropagation(); deleteFolder('${folder}')" class="danger" title="Удалить папку">${iconHtml('trash')}</button>
                    <button onclick="event.stopPropagation(); permanentDeleteFolder('${folder}')" class="danger" title="Удалить безвозвратно">${iconHtml('delete-forever')}</button>
                </div>
            `;

            if (checked) row.classList.add('selected');
        });
        
        // Файлы
        filesInPath.forEach(file => {
            const row = $filesTable.insertRow();
            row.className = 'file-row';
            row.dataset.itemKind = 'file';
            row.dataset.itemId = file.id;
            const fileName = file.id.includes('/') ? file.id.split('/').pop() : file.id;
            const fileSize = formatFileSize(file.size);
            const fileDate = new Date(file.uploadedAt).toLocaleString();
            
            // Чекбокс
            const checkboxCell = row.insertCell();
            const checked = selectedItems.has(itemKey('file', file.id));
            checkboxCell.innerHTML = `<input type="checkbox" class="file-checkbox" ${checked ? 'checked' : ''} onchange="toggleItemSelection('file','${file.id}', this)">`;
            if (checked) row.classList.add('selected');
            
            // Название файла
            const nameCell = row.insertCell();
            nameCell.innerHTML = `${iconHtml('file')} ${escapeHtml(fileName)}`;
            nameCell.style.cursor = 'pointer';
            nameCell.title = 'Предпросмотр';
            nameCell.onclick = () => openPreview(file.id);
            
            // Размер
            const sizeCell = row.insertCell();
            sizeCell.textContent = fileSize;
            
            // Дата
            const dateCell = row.insertCell();
            dateCell.textContent = fileDate;
            
            // Ссылка
            const shareCell = row.insertCell();
            if (file.shared && file.shareExpiresAt) {
                const timeLeft = getTimeUntilExpiry(file.shareExpiresAt);
                shareCell.innerHTML = `
                    <div class="share-cell">
                        <span class="share-time icon-text" onclick="showQRForFile('${file.id}')" title="Открыть QR-код">${iconHtml('share')}${timeLeft}</span>
                    </div>
                `;
            } else {
                shareCell.textContent = '-';
            }
            
            // Действия
            const actionsCell = row.insertCell();
            actionsCell.innerHTML = `
                <div class="action-buttons">
                    <button onclick="downloadFile('${file.id}')" class="primary" title="Скачать">${iconHtml('download')}</button>
                    <button onclick="openPreview('${file.id}')" class="secondary" title="Предпросмотр">${iconHtml('preview')}</button>
                    ${file.shared && file.shareExpiresAt ? '' : `<button onclick="shareFile('${file.id}')" class="secondary" title="Поделиться">${iconHtml('share')}</button>`}
                    <button onclick="renameFile('${file.id}')" class="secondary" title="Переименовать">${iconHtml('edit')}</button>
                    <button onclick="moveFileDialog('${file.id}')" class="secondary" title="Переместить">${iconHtml('move')}</button>
                    <button onclick="deleteFile('${file.id}')" class="danger" title="Удалить">${iconHtml('trash')}</button>
                    <button onclick="permanentDeleteFile('${file.id}')" class="danger" title="Удалить безвозвратно">${iconHtml('delete-forever')}</button>
                </div>
            `;
        });
        
        updateBulkActionsVisibility();
    }

    function formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function updateToolbarButtons() {
        const uploadBtn = document.getElementById('uploadBtn');
        const createFolderBtn = document.getElementById('createFolderBtn');
        const downloadFolderBtn = document.getElementById('downloadFolderBtn');
        
        if (isInTrash) {
            uploadBtn.style.display = 'none';
            createFolderBtn.style.display = 'none';
            if (downloadFolderBtn) downloadFolderBtn.style.display = 'none';
        } else {
            uploadBtn.style.display = 'inline-block';
            createFolderBtn.style.display = 'inline-block';
            if (downloadFolderBtn) downloadFolderBtn.style.display = 'inline-flex';
        }
    }
