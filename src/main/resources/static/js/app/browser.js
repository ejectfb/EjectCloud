    function nameOfId(id) {
        return id.includes('/') ? id.split('/').pop() : id;
    }

    function sizeVal(file) {
        if (file.size !== undefined && file.size !== null) return Number(file.size) || 0;
        if (file.sizeBytes !== undefined && file.sizeBytes !== null) return Number(file.sizeBytes) || 0;
        return 0;
    }

    function dateVal(file) {
        const t = new Date(file.uploadedAt).getTime();
        return isNaN(t) ? 0 : t;
    }

    function kindOf(name, isFolder) {
        if (window.EcUtil && EcUtil.fileKind) return EcUtil.fileKind(name, isFolder);
        return { kind: isFolder ? 'folder' : 'file', icon: isFolder ? 'folder' : 'file', cls: isFolder ? 'ft-folder' : 'ft-file' };
    }

    function badgeHtml(name, isFolder) {
        const k = kindOf(name, isFolder);
        return `<span class="icon-badge ${k.cls}">${iconHtml(k.icon)}</span>`;
    }

    function relDate(value) {
        if (window.EcUtil && EcUtil.formatDate) {
            try { return { text: EcUtil.formatDate(value, true), full: new Date(value).toLocaleString() }; } catch (e) {}
        }
        const d = new Date(value);
        const s = isNaN(d.getTime()) ? String(value || '-') : d.toLocaleString();
        return { text: s, full: s };
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function emptyStateHtml(inTrashMode) {
        let icon = 'folder-open';
        let title = 'Папка пуста';
        let hint = 'Перетащите файлы сюда или нажмите «Загрузить»';
        if (inTrashMode) {
            icon = 'trash';
            title = 'Корзина пуста';
            hint = 'Удалённые файлы и папки появятся здесь';
        }
        if (searchQuery) {
            icon = 'search';
            title = 'Ничего не найдено';
            hint = `По запросу «${escapeHtml(searchQuery)}» в этой папке пусто`;
        }
        return `
            <div class="empty-state">
                <div class="empty-icon">${iconHtml(icon)}</div>
                <div class="empty-title">${title}</div>
                <div class="empty-hint">${hint}</div>
            </div>
        `;
    }

    function renderSkeleton() {
        const mobile = isMobileLayout();
        if (mobile) return;
        const useTable = viewMode === 'list';
        if (useTable) {
            let rows = '';
            for (let i = 0; i < 7; i++) {
                const w1 = 30 + ((i * 37) % 45);
                const w2 = 20 + ((i * 23) % 30);
                rows += `
                    <tr class="skeleton-row">
                        <td></td>
                        <td><div class="skeleton" style="width:${w1}%"></div></td>
                        <td><div class="skeleton" style="width:${w2}%"></div></td>
                        <td><div class="skeleton" style="width:${w2 + 8}%"></div></td>
                        <td><div class="skeleton" style="width:16px;height:16px;border-radius:50%"></div></td>
                        <td></td>
                    </tr>`;
            }
            $filesTable.innerHTML = rows;
        } else {
            let cards = '';
            for (let i = 0; i < 8; i++) {
                cards += `
                    <div class="grid-card">
                        <div class="skeleton" style="width:52px;height:52px;border-radius:14px"></div>
                        <div class="skeleton" style="width:70%;height:12px"></div>
                        <div class="skeleton" style="width:45%;height:10px"></div>
                    </div>`;
            }
            $filesList.innerHTML = cards;
        }
    }

    function collectItems(path, inTrashMode) {
        const folderSource = inTrashMode ? trashFolders : allFolders;
        const fileSource = inTrashMode ? trashFiles : allFiles;

        let subfolders = folderSource.filter(folder => {
            if (path === '') return !folder.includes('/');
            return folder.startsWith(path + '/') &&
                folder.split('/').length === path.split('/').length + 1;
        });

        let filesInPath = fileSource.filter(file => {
            const filePath = file.id.includes('/') ? file.id.substring(0, file.id.lastIndexOf('/')) : '';
            return filePath === path;
        });

        if (searchQuery) {
            subfolders = subfolders.filter(f => matchesSearch(nameOfId(f)));
            filesInPath = filesInPath.filter(f => matchesSearch(nameOfId(f.id)));
        }

        const dirMul = sortDir === 'asc' ? 1 : -1;
        if (sortBy === 'name') {
            subfolders.sort((a, b) => nameOfId(a).localeCompare(nameOfId(b), 'ru') * dirMul);
            filesInPath.sort((a, b) => nameOfId(a.id).localeCompare(nameOfId(b.id), 'ru') * dirMul);
        } else if (sortBy === 'size') {
            filesInPath.sort((a, b) => (sizeVal(a) - sizeVal(b)) * dirMul);
        } else {
            filesInPath.sort((a, b) => (dateVal(a) - dateVal(b)) * dirMul);
        }

        return { subfolders, filesInPath };
    }

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
                    <div class="file-title" title="Назад"><span class="icon-badge ft-folder">${iconHtml('arrow-left')}</span> ..</div>
                </div>
                <div class="file-actions"></div>
            `;
            back.querySelector('.file-title').onclick = parentNavigate;
            addItem(back);
        }

        folders.forEach(folderPath => {
            const folderName = nameOfId(folderPath);
            const item = document.createElement('div');
            item.className = 'file-item';
            item.dataset.itemKind = 'folder';
            item.dataset.itemId = folderPath;

            const folderChecked = selectedItems.has(itemKey('folder', folderPath));
            if (folderChecked) item.classList.add('selected');
            item.innerHTML = `
                <div class="file-check"></div>
                <div class="file-main">
                    <div class="file-title" title="Открыть папку">${badgeHtml(folderName, true)} ${escapeHtml(folderName)}</div>
                    <div class="file-meta"><span>Папка</span></div>
                </div>
                <div class="file-actions">
                    <button title="Действия">${iconHtml('more-horizontal')}</button>
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
            const fileName = nameOfId(fileId);
            const size = formatFileSize(sizeVal(fileObj));
            const date = relDate(fileObj.uploadedAt);

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
                    <div class="file-title" title="Открыть/скачать">${badgeHtml(fileName, false)} ${escapeHtml(fileName)}</div>
                    <div class="file-meta">
                        <span class="num">${escapeHtml(size)}</span>
                        <span title="${escapeHtml(date.full)}">${escapeHtml(date.text)}</span>
                        ${linkInfo ? `<span class="share-time" title="Открыть QR-код">${iconHtml('share')}${escapeHtml(linkInfo)}</span>` : ''}
                    </div>
                </div>
                <div class="file-actions">
                    <button title="Действия">${iconHtml('more-horizontal')}</button>
                </div>
            `;

            item.querySelector('.file-title').onclick = () => {
                openPreview(fileId);
            };

            const metaLink = item.querySelector('.share-time');
            if (metaLink) {
                metaLink.onclick = (e) => {
                    e.stopPropagation();
                    showQRForFile(fileId);
                };
            }

            item.querySelector('.file-actions button').onclick = (e) => {
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
            empty.className = 'file-item empty-mobile';
            empty.innerHTML = `
                <div class="file-check"></div>
                <div class="file-main">
                    <div class="file-title" style="cursor: default;"><span class="icon-badge ft-file">${iconHtml('info')}</span> ${inTrashMode ? 'Корзина пуста' : (searchQuery ? 'Ничего не найдено' : 'Папка пуста')}</div>
                </div>
                <div class="file-actions"></div>
            `;
            $filesList.appendChild(empty);
        }
    }

    function renderGridCard({ kind, id, name, isFolder, inTrashMode, onOpen, onMore, checked }) {
        const card = document.createElement('div');
        card.className = 'grid-card' + (checked ? ' selected' : '');
        card.dataset.itemKind = kind;
        card.dataset.itemId = id;

        card.innerHTML = `
            <div class="grid-top">
                ${inTrashMode ? '<span></span>' : `<input type="checkbox" class="file-checkbox" ${checked ? 'checked' : ''} />`}
                <button class="icon-btn icon-btn-sm grid-more" title="Действия">${iconHtml('more-horizontal')}</button>
            </div>
            <div class="ft-badge ${kindOf(name, isFolder).cls} grid-thumb">${iconHtml(kindOf(name, isFolder).icon)}</div>
            <div class="grid-name" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
            <div class="grid-meta num"></div>
        `;

        const meta = card.querySelector('.grid-meta');
        if (isFolder) {
            meta.textContent = 'Папка';
        } else {
            const fileObj = allFiles.find(f => f.id === id) || trashFiles.find(f => f.id === id);
            const size = formatFileSize(sizeVal(fileObj || {}));
            const date = fileObj ? relDate(fileObj.uploadedAt).text : '';
            meta.textContent = [size, date].filter(Boolean).join(' · ');
        }

        card.addEventListener('click', (e) => {
            if (e.target.closest('.grid-top')) return;
            onOpen();
        });

        const cb = card.querySelector('.file-checkbox');
        if (cb) {
            cb.addEventListener('click', (e) => e.stopPropagation());
            cb.onchange = () => toggleItemSelection(kind, id, cb);
        }

        card.querySelector('.grid-more').onclick = (e) => {
            e.stopPropagation();
            onMore();
        };

        return card;
    }

    function renderGridView({ path, inTrashMode, subfolders, filesInPath }) {
        if (!$filesList) return;
        $filesList.innerHTML = '';

        const openFolder = (folderPath) => inTrashMode ? selectTrashPath(folderPath) : selectPath(folderPath);

        subfolders.forEach(folderPath => {
            const folderName = nameOfId(folderPath);
            const card = renderGridCard({
                kind: 'folder',
                id: folderPath,
                name: folderName,
                isFolder: true,
                inTrashMode,
                onOpen: () => openFolder(folderPath),
                onMore: () => openItemActions('folder', folderPath),
                checked: selectedItems.has(itemKey('folder', folderPath))
            });
            $filesList.appendChild(card);
        });

        filesInPath.forEach(fileObj => {
            const fileId = fileObj.id;
            const fileName = nameOfId(fileId);
            const card = renderGridCard({
                kind: 'file',
                id: fileId,
                name: fileName,
                isFolder: false,
                inTrashMode,
                onOpen: () => openPreview(fileId),
                onMore: () => openItemActions('file', fileId),
                checked: selectedItems.has(itemKey('file', fileId))
            });
            $filesList.appendChild(card);
        });

        if (subfolders.length === 0 && filesInPath.length === 0) {
            const wrap = document.createElement('div');
            wrap.style.gridColumn = '1 / -1';
            wrap.innerHTML = emptyStateHtml(inTrashMode);
            $filesList.appendChild(wrap);
        }

        updateBulkActionsVisibility();
    }

    function renderDesktopTable({ path, inTrashMode, subfolders, filesInPath }) {
        $filesList && ($filesList.innerHTML = '');
        $filesTable.innerHTML = '';
        updateSortHeaders();

        const parentPath = path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : '';

        if (inTrashMode && path === '' && (subfolders.length > 0 || filesInPath.length > 0)) {
            const bannerRow = $filesTable.insertRow();
            bannerRow.className = 'trash-banner';
            bannerRow.innerHTML = `
                <td></td>
                <td colspan="4">В корзине ${trashFiles.length + trashFolders.length} элементов</td>
                <td><button class="btn btn-danger btn-sm" onclick="clearTrash()">${iconHtml('trash-clear')} Очистить все</button></td>`;
        }

        if (path !== '') {
            const row = $filesTable.insertRow();
            row.insertCell();
            const cell = row.insertCell();
            cell.innerHTML = `<span class="back-link">${iconHtml('arrow-left')} ..</span>`;
            cell.onclick = () => inTrashMode ? selectTrashPath(parentPath) : selectPath(parentPath);
            row.insertCell().textContent = '';
            row.insertCell().textContent = '';
            row.insertCell().textContent = '';
            row.insertCell().textContent = '';
        }

        subfolders.forEach(folder => {
            const row = $filesTable.insertRow();
            row.dataset.itemKind = 'folder';
            row.dataset.itemId = folder;
            const folderName = nameOfId(folder);
            const checkboxCell = row.insertCell();
            if (!inTrashMode) {
                const checked = selectedItems.has(itemKey('folder', folder));
                checkboxCell.innerHTML = `<input type="checkbox" class="file-checkbox" ${checked ? 'checked' : ''} onchange="toggleItemSelection('folder','${folder}', this)">`;
                if (checked) row.classList.add('selected');
            }
            const cell = row.insertCell();
            cell.innerHTML = `<div class="cell-name-wrap">${badgeHtml(folderName, true)}<span class="cell-name">${escapeHtml(folderName)}</span></div>`;
            cell.onclick = () => inTrashMode ? selectTrashPath(folder) : selectPath(folder);
            row.insertCell().textContent = '';
            row.insertCell().textContent = '';
            row.insertCell().textContent = '';

            const actionsCell = row.insertCell();
            if (inTrashMode) {
                actionsCell.innerHTML = `
                    <div class="action-buttons">
                        <button onclick="event.stopPropagation(); restoreFromTrash('${folder}')" class="success" title="Восстановить">${iconHtml('trash-restore')}</button>
                        <button onclick="event.stopPropagation(); deleteFromTrash('${folder}')" class="danger" title="Удалить навсегда">${iconHtml('delete-forever')}</button>
                    </div>`;
            } else {
                actionsCell.innerHTML = `
                    <div class="action-buttons">
                        <button onclick="event.stopPropagation(); downloadFolderArchive('${folder}')" class="primary" title="Скачать папку">${iconHtml('download')}</button>
                        <button onclick="event.stopPropagation(); renameFolder('${folder}')" class="secondary" title="Переименовать">${iconHtml('edit')}</button>
                        <button onclick="event.stopPropagation(); deleteFolder('${folder}')" class="danger" title="Удалить папку">${iconHtml('trash')}</button>
                    </div>`;
            }
        });

        filesInPath.forEach(file => {
            const row = $filesTable.insertRow();
            row.className = 'file-row';
            row.dataset.itemKind = 'file';
            row.dataset.itemId = file.id;
            const fileName = nameOfId(file.id);
            const fileSize = formatFileSize(sizeVal(file));
            const date = relDate(file.uploadedAt);

            const checkboxCell = row.insertCell();
            if (!inTrashMode) {
                const checked = selectedItems.has(itemKey('file', file.id));
                checkboxCell.innerHTML = `<input type="checkbox" class="file-checkbox" ${checked ? 'checked' : ''} onchange="toggleItemSelection('file','${file.id}', this)">`;
                if (checked) row.classList.add('selected');
            }

            const nameCell = row.insertCell();
            nameCell.innerHTML = `<div class="cell-name-wrap">${badgeHtml(fileName, false)}<span class="cell-name" title="${escapeHtml(fileName)}">${escapeHtml(fileName)}</span></div>`;
            nameCell.onclick = () => openPreview(file.id);

            const sizeCell = row.insertCell();
            sizeCell.textContent = fileSize;
            sizeCell.className = 'num';

            const dateCell = row.insertCell();
            dateCell.textContent = date.text;
            dateCell.title = date.full;
            dateCell.className = 'num';

            const shareCell = row.insertCell();
            if (!inTrashMode && file.shared && file.shareExpiresAt) {
                const timeLeft = getTimeUntilExpiry(file.shareExpiresAt);
                shareCell.innerHTML = `
                    <div class="share-cell">
                        <span class="share-time" onclick="showQRForFile('${file.id}')" title="Открыть QR-код">${iconHtml('share')}${timeLeft}</span>
                    </div>`;
            }

            const actionsCell = row.insertCell();
            if (inTrashMode) {
                actionsCell.innerHTML = `
                    <div class="action-buttons">
                        <button onclick="restoreFromTrash('${file.id}')" class="success" title="Восстановить">${iconHtml('trash-restore')}</button>
                        <button onclick="deleteFromTrash('${file.id}')" class="danger" title="Удалить навсегда">${iconHtml('delete-forever')}</button>
                    </div>`;
            } else {
                actionsCell.innerHTML = `
                    <div class="action-buttons">
                        <button onclick="downloadFile('${file.id}')" class="primary" title="Скачать">${iconHtml('download')}</button>
                        ${file.shared && file.shareExpiresAt ? '' : `<button onclick="shareFile('${file.id}')" class="secondary" title="Поделиться">${iconHtml('share')}</button>`}
                        <button onclick="renameFile('${file.id}')" class="secondary" title="Переименовать">${iconHtml('edit')}</button>
                        <button onclick="moveFileDialog('${file.id}')" class="secondary" title="Переместить">${iconHtml('move')}</button>
                        <button onclick="deleteFile('${file.id}')" class="danger" title="Удалить">${iconHtml('trash')}</button>
                    </div>`;
            }
        });

        if (subfolders.length === 0 && filesInPath.length === 0 && path === '') {
            const row = $filesTable.insertRow();
            row.className = 'empty-row';
            row.innerHTML = `<td colspan="6">${emptyStateHtml(inTrashMode)}</td>`;
        }

        updateBulkActionsVisibility();
    }

    let lastMobile = isMobileLayout();
    applyViewMode();
    window.addEventListener('resize', () => {
        const nowMobile = isMobileLayout();
        if (nowMobile === lastMobile) return;
        lastMobile = nowMobile;
        applyViewMode();
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

        function addCrumb(label, onClick, isCurrent) {
            const span = document.createElement('span');
            span.className = 'breadcrumb-item' + (isCurrent ? ' current' : '');
            span.textContent = label;
            if (!isCurrent && onClick) span.onclick = onClick;
            container.appendChild(span);
        }

        function addSep() {
            const sep = document.createElement('span');
            sep.className = 'breadcrumb-sep';
            sep.textContent = '/';
            container.appendChild(sep);
        }

        if (inTrashMode) {
            addCrumb('Корзина', () => selectTrash(), parts.length === 0);
            let acc = '';
            parts.forEach((p, idx) => {
                addSep();
                acc += (idx === 0 ? '' : '/') + p;
                const isLast = idx === parts.length - 1;
                addCrumb(p, () => selectTrashPath(acc), isLast);
            });
        } else {
            addCrumb('Хранилище', () => selectPath(''), parts.length === 0);
            let acc = '';
            parts.forEach((p, idx) => {
                addSep();
                acc += (idx === 0 ? '' : '/') + p;
                const isLast = idx === parts.length - 1;
                addCrumb(p, () => selectPath(acc), isLast);
            });

            if (!searchQuery) {
                const dl = document.createElement('button');
                dl.className = 'btn btn-secondary btn-sm crumb-download';
                dl.innerHTML = `${iconHtml('download')}<span>Скачать</span>`;
                dl.title = 'Скачать текущую папку архивом';
                dl.onclick = (e) => {
                    e.stopPropagation();
                    downloadCurrentFolder();
                };
                container.appendChild(dl);
            }
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

    function showConfirm(message, callback) {
        document.getElementById('confirmMessage').textContent = message;
        confirmCallback = callback;
        document.getElementById('confirmButton').textContent = 'Подтвердить';
        document.getElementById('confirmPermanentButton').classList.add('hidden');
        document.getElementById('confirmPermanentButton').onclick = null;
        document.getElementById('confirmModal').style.display = 'block';
    }

    function showDeleteConfirm(message, deleteCallback, permanentCallback) {
        document.getElementById('confirmMessage').textContent = message;
        confirmCallback = deleteCallback;
        document.getElementById('confirmButton').textContent = 'Удалить';
        const permanentButton = document.getElementById('confirmPermanentButton');
        permanentButton.classList.remove('hidden');
        permanentButton.onclick = function() {
            if (permanentCallback) permanentCallback();
            closeConfirmModal();
        };
        document.getElementById('confirmModal').style.display = 'block';
    }

    window.closeConfirmModal = function() {
        document.getElementById('confirmModal').style.display = 'none';
        confirmCallback = null;
        const permanentButton = document.getElementById('confirmPermanentButton');
        if (permanentButton) {
            permanentButton.classList.add('hidden');
            permanentButton.onclick = null;
        }
    };

    window.confirmAction = function() {
        if (confirmCallback) {
            confirmCallback();
        }
        closeConfirmModal();
    };

    window.confirmPermanentAction = function() {};

    window.moveFileDialog = function(fileId) {
        selectedMoveFile = fileId;
        const fileName = nameOfId(fileId);

        document.getElementById('moveFileName').textContent = `Переместить файл: ${fileName}`;

        const folderTree = document.getElementById('folderTree');
        folderTree.innerHTML = '';

        const rootItem = document.createElement('div');
        rootItem.className = 'folder-item selected';
        rootItem.innerHTML = `${iconHtml('home')} Хранилище`;
        rootItem.onclick = () => selectTargetFolder('', rootItem);
        folderTree.appendChild(rootItem);

        allFolders.forEach(folder => {
            const item = document.createElement('div');
            item.className = 'folder-item';
            const depth = folder.split('/').length - 1;
            item.style.paddingLeft = (10 + depth * 16) + 'px';
            item.innerHTML = `${iconHtml('folder')} ${escapeHtml(nameOfId(folder))}`;
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

    function paintUserChrome(user) {
        $who.textContent = user;
        const userMenuName = document.getElementById('userMenuName');
        if (userMenuName) userMenuName.textContent = user;
        paintAvatar(document.getElementById('whoAvatar'), user);
        paintAvatar(document.getElementById('sideAvatar'), user);
        paintAvatar(document.getElementById('userMenuAvatar'), user);
        const sideName = document.getElementById('sideUserName');
        if (sideName) sideName.textContent = user;
        const sideSub = document.getElementById('sideUserSub');
        if (sideSub) sideSub.textContent = 'Аккаунт';
    }

    function doValidate() {
        if (accessToken) {
            console.log('Validating JWT token');
            authFetch('/api/auth/validate')
                .then(r => r.json())
                .then(j => {
                    if (j.ok) {
                        paintUserChrome(j.user);
                        currentTelegramVerified = !!j.telegramVerified;

                        if (j.isAdmin) {
                            const adminBtn = document.getElementById('adminPanelBtn');
                            if (adminBtn) adminBtn.style.display = 'flex';
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

                paintUserChrome(data.telegramId);
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

        refreshInterval = setInterval(() => {
            tryRefreshToken();
        }, 10 * 60 * 1000);

        $timer.style.display = 'none';
    }

    function getAuthToken() {
        return accessToken;
    }

    function loadFiles() {
        renderSkeleton();
        Promise.all([
            authFetch('/api/files/list').then(checkJson),
            authFetch('/api/files/folders').then(checkJson),
            authFetch('/api/files/trash').then(checkJson),
            authFetch('/api/files/trash/folders').then(checkJson),
            authFetch('/api/files/quota').then(checkJson)
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
        item.style.paddingLeft = (14 + depth * 16) + 'px';

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
        applyViewMode();

        const items = collectItems(path, false);

        if (isMobileLayout()) {
            const parentPath = path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : '';
            renderMobileList({
                parentNavigate: path !== '' ? () => selectPath(parentPath) : null,
                folders: items.subfolders,
                files: items.filesInPath,
                inTrashMode: false
            });
            $filesTable.innerHTML = '';
            updateBulkActionsVisibility();
            return;
        }

        if (viewMode === 'grid') {
            $filesTable.innerHTML = '';
            renderGridView({ path, inTrashMode: false, subfolders: items.subfolders, filesInPath: items.filesInPath });
        } else {
            renderDesktopTable({ path, inTrashMode: false, subfolders: items.subfolders, filesInPath: items.filesInPath });
        }
    }

    function formatFileSize(bytes) {
        if (!bytes || bytes <= 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function updateToolbarButtons() {
        const uploadBtn = document.getElementById('uploadBtn');
        const createFolderBtn = document.getElementById('createFolderBtn');

        if (isInTrash) {
            if (uploadBtn) uploadBtn.style.display = 'none';
            if (createFolderBtn) createFolderBtn.style.display = 'none';
        } else {
            if (uploadBtn) uploadBtn.style.display = 'inline-flex';
            if (createFolderBtn) createFolderBtn.style.display = 'inline-flex';
        }
    }

    function showTrash() {
        renderBreadcrumb(currentPath, true);
        applyViewMode();

        const items = collectItems(currentPath, true);

        if (isMobileLayout()) {
            const parentPath = currentPath.includes('/') ? currentPath.substring(0, currentPath.lastIndexOf('/')) : '';

            if (currentPath === '' && (trashFiles.length > 0 || trashFolders.length > 0)) {
                $filesList.innerHTML = '';
                const header = document.createElement('div');
                header.className = 'file-item';
                const totalCount = trashFiles.length + trashFolders.length;
                header.innerHTML = `
                    <div class="file-check"></div>
                    <div class="file-main">
                        <div class="file-title" style="cursor: default;"><span class="icon-badge ft-file">${iconHtml('trash')}</span> В корзине ${totalCount} элементов</div>
                        <div class="file-meta"><span>Очистка удалит все навсегда</span></div>
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
                folders: items.subfolders,
                files: items.filesInPath,
                inTrashMode: true,
                append: (currentPath === '' && (trashFiles.length > 0 || trashFolders.length > 0))
            });
            $filesTable.innerHTML = '';
            updateBulkActionsVisibility();
            return;
        }

        if (viewMode === 'grid') {
            $filesTable.innerHTML = '';
            renderGridView({ path: currentPath, inTrashMode: true, subfolders: items.subfolders, filesInPath: items.filesInPath });
            return;
        }

        renderDesktopTable({ path: currentPath, inTrashMode: true, subfolders: items.subfolders, filesInPath: items.filesInPath });
    }

    window.clearTrash = function() {
        showConfirm('Очистить корзину? Все файлы будут удалены навсегда!', () => {
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
        const itemName = nameOfId(itemId);
        showConfirm(`Восстановить "${itemName}"?`, () => {
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
