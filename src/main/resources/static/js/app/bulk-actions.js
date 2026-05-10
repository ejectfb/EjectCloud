    // Multi-selection
    window.toggleSelectAll = function() {
        const selectAllCheckbox = document.getElementById('selectAll');
        const checkboxes = document.querySelectorAll('.file-checkbox');

        checkboxes.forEach(cb => {
            const row = cb.closest('tr');
            if (!row) return;
            const kind = row.dataset.itemKind;
            const id = row.dataset.itemId;
            if (!kind || !id) return;
            cb.checked = selectAllCheckbox.checked;
            toggleItemSelection(kind, id, cb);
        });
    };

    function toggleItemSelection(kind, id, checkbox) {
        const row = checkbox.closest('tr') || checkbox.closest('.file-item');
        const key = itemKey(kind, id);

        if (checkbox.checked) {
            selectedItems.add(key);
            if (row) row.classList.add('selected');
        } else {
            selectedItems.delete(key);
            if (row) row.classList.remove('selected');
        }

        updateBulkActionsVisibility();
        updateSelectAllCheckbox();
    }

    window.toggleItemSelection = toggleItemSelection;

    function updateBulkActionsVisibility() {
        const bulkActions = document.getElementById('bulkActions');
        const selectedCount = document.getElementById('selectedCount');

        if (selectedItems.size > 0) {
            bulkActions.style.display = 'flex';
            selectedCount.textContent = String(selectedItems.size);
        } else {
            bulkActions.style.display = 'none';
        }
    }

    function updateSelectAllCheckbox() {
        const selectAllCheckbox = document.getElementById('selectAll');
        if (!selectAllCheckbox) return;
        const checkboxes = document.querySelectorAll('.files-container .file-checkbox');
        const checked = document.querySelectorAll('.files-container .file-checkbox:checked');

        if (checkboxes.length === 0) {
            selectAllCheckbox.indeterminate = false;
            selectAllCheckbox.checked = false;
        } else if (checked.length === checkboxes.length) {
            selectAllCheckbox.indeterminate = false;
            selectAllCheckbox.checked = true;
        } else if (checked.length > 0) {
            selectAllCheckbox.indeterminate = true;
        } else {
            selectAllCheckbox.indeterminate = false;
            selectAllCheckbox.checked = false;
        }
    }

    window.clearSelection = function() {
        selectedItems.clear();
        document.querySelectorAll('.file-checkbox').forEach(cb => {
            cb.checked = false;
        });
        document.querySelectorAll('.file-row, .file-item').forEach(row => {
            row.classList.remove('selected');
        });
        updateBulkActionsVisibility();
        updateSelectAllCheckbox();
    };

    function startArchiveAndDownload(folderPath, fileName, title) {
        const token = getAuthToken();
        const body = new URLSearchParams();
        body.append('token', token);
        body.append('path', folderPath || '');
        if (fileName) body.append('fileName', fileName);

        const taskId = 'archive:' + (folderPath || 'root') + ':' + Date.now();
        window.TaskCenter && window.TaskCenter.upsert && window.TaskCenter.upsert({
            id: taskId,
            title: title || 'Архивация',
            subtitle: fileName || '',
            state: 'queued',
            percent: 0,
            lines: []
        });

        fetch('/api/files/archive', { method: 'POST', body })
            .then(r => r.json().then(j => ({ ok: r.ok, j })))
            .then(({ ok, j }) => {
                if (!ok) throw new Error((j && j.error) ? j.error : 'Ошибка архивации');
                const jobId = j.jobId;
                if (window.TaskCenter && window.TaskCenter.update && taskId) {
                    window.TaskCenter.update(taskId, { state: 'running', lines: ['job ' + jobId] });
                }

                const poll = setInterval(() => {
                    fetch(`/api/files/archive/status?token=${encodeURIComponent(token)}&jobId=${encodeURIComponent(jobId)}`)
                        .then(r2 => r2.json().then(j2 => ({ ok: r2.ok, j2 })))
                        .then(({ ok: ok2, j2 }) => {
                            if (!ok2) throw new Error((j2 && j2.error) ? j2.error : 'Ошибка статуса');
                            if (window.TaskCenter && window.TaskCenter.update && taskId) {
                                window.TaskCenter.update(taskId, {
                                    state: j2.state,
                                    percent: typeof j2.percent === 'number' ? j2.percent : 0,
                                    lines: j2.message ? [j2.message] : []
                                });
                            }

                            if (j2.state === 'done') {
                                clearInterval(poll);
                                const url = `/api/files/archive/download?token=${encodeURIComponent(token)}&jobId=${encodeURIComponent(jobId)}`;

                                if (window.TaskCenter && window.TaskCenter.update && taskId) {
                                    window.TaskCenter.update(taskId, {
                                        state: 'done',
                                        percent: 100,
                                        downloadUrl: url,
                                        meta: { type: 'archive', jobId }
                                    });
                                }

                                // Desktop best-effort auto download (mobile browsers may block)
                                if (!isMobileLayout()) {
                                    try { window.open(url); } catch {}
                                }
                            }
                            if (j2.state === 'error') {
                                clearInterval(poll);
                            }
                        })
                        .catch(err => {
                            clearInterval(poll);
                            if (window.TaskCenter && window.TaskCenter.update && taskId) {
                                window.TaskCenter.update(taskId, { state: 'error', lines: [String(err.message || err)] });
                            }
                        });
                }, 800);
            })
            .catch(err => {
                if (window.TaskCenter && window.TaskCenter.update && taskId) {
                    window.TaskCenter.update(taskId, { state: 'error', lines: [String(err.message || err)] });
                }
                showNotification('Ошибка архивации: ' + (err.message || err), 'error');
            });
    }

    window.downloadCurrentFolder = function() {
        if (isInTrash) return;
        const base = currentPath ? currentPath.split('/').pop() : ($who.textContent || 'user');
        const name = base + '_' + formatTimestamp() + '.zip';
        startArchiveAndDownload(currentPath, name, 'Архив папки');
    };

    window.downloadFolderArchive = function(folderPath) {
        if (isInTrash) return;
        const base = folderPath ? folderPath.split('/').pop() : ($who.textContent || 'user');
        const name = base + '_' + formatTimestamp() + '.zip';
        startArchiveAndDownload(folderPath, name, 'Архив папки');
    };

    window.bulkDownload = function() {
        const files = selectedByKind('file');
        const folders = selectedByKind('folder');
        if (files.length === 0 && folders.length === 0) return;

        // files: start downloads immediately
        files.forEach(fileId => {
            downloadFile(fileId);
            if (window.TaskCenter && window.TaskCenter.upsert) {
                window.TaskCenter.upsert({
                    id: 'download:' + fileId + ':' + Date.now(),
                    title: 'Скачивание',
                    subtitle: fileId.split('/').pop(),
                    state: 'done',
                    percent: 100,
                    lines: ['Запущено']
                });
            }
        });

        // folders: zip per folder
        folders.forEach(folderPath => {
            const folderName = folderPath.split('/').pop();
            const parentName = currentPath ? currentPath.split('/').pop() : ($who.textContent || 'user');
            const zipName = parentName + '_' + folderName + '_' + formatTimestamp() + '.zip';
            startArchiveAndDownload(folderPath, zipName, 'Архив папки');
        });
    };

    window.bulkMove = function() {
        const files = selectedByKind('file');
        const folders = selectedByKind('folder');
        if (files.length === 0) {
            showNotification('Для перемещения выберите файлы', 'warning');
            return;
        }
        if (folders.length > 0) {
            showNotification('Папки не перемещаются группой (будут проигнорированы)', 'warning');
        }

        document.getElementById('moveFileName').textContent = `Переместить ${files.length} файлов:`;

        const folderTree = document.getElementById('folderTree');
        folderTree.innerHTML = '';

        const rootItem = document.createElement('div');
        rootItem.className = 'folder-item selected';
        rootItem.textContent = '🏠 Хранилище';
        rootItem.onclick = () => selectTargetFolder('', rootItem);
        folderTree.appendChild(rootItem);

        allFolders.forEach(folder => {
            const item = document.createElement('div');
            item.className = 'folder-item';
            const depth = folder.split('/').length - 1;
            item.style.paddingLeft = (20 + depth * 15) + 'px';
            item.textContent = '📁 ' + folder.split('/').pop();
            item.onclick = () => selectTargetFolder(folder, item);
            folderTree.appendChild(item);
        });

        selectedTargetFolder = '';
        selectedMoveFile = 'bulk';
        window._bulkMoveFileIds = files;
        document.getElementById('moveModal').style.display = 'block';
    };

    window.bulkDelete = function() {
        const files = selectedByKind('file');
        const folders = selectedByKind('folder');
        const total = files.length + folders.length;
        if (total === 0) return;

        showConfirm(`Переместить ${total} элементов в корзину?`, () => {
            const token = getAuthToken();
            const promises = [];
            files.forEach(fileId => {
                promises.push(fetch(`/api/files/delete?id=${encodeURIComponent(fileId)}&token=${encodeURIComponent(token)}`, { method: 'DELETE' }));
            });
            folders.forEach(folderPath => {
                promises.push(fetch(`/api/files/folder?path=${encodeURIComponent(folderPath)}&token=${encodeURIComponent(token)}`, { method: 'DELETE' }));
            });

            Promise.all(promises.map(p => p.catch(e => ({ error: true, message: e.message }))))
                .then(responses => {
                    const failed = responses.filter(r => !r.ok && r.error !== true);
                    const success = responses.filter(r => r.ok);
                    if (success.length > 0) {
                        showNotification(`${success.length} элементов перемещено в корзину`, 'success');
                    }
                    if (failed.length > 0) {
                        showNotification(`Ошибка удаления ${failed.length} элементов`, 'error');
                    }

                    clearSelection();
                    loadFiles();
                })
                .catch(e => showNotification('Ошибка: ' + e.message, 'error'));
        });
    };

    window.bulkPermanentDelete = function() {
        const files = selectedByKind('file');
        const folders = selectedByKind('folder');
        const total = files.length + folders.length;
        if (total === 0) return;

        showConfirm(`Удалить ${total} элементов БЕЗВОЗВРАТНО? Это действие нельзя отменить!`, () => {
            const token = getAuthToken();
            const promises = [];
            files.forEach(fileId => {
                promises.push(fetch(`/api/files/permanent-delete?id=${encodeURIComponent(fileId)}&token=${encodeURIComponent(token)}`, { method: 'DELETE' }));
            });
            folders.forEach(folderPath => {
                promises.push(fetch(`/api/files/permanent-delete?id=${encodeURIComponent(folderPath)}&token=${encodeURIComponent(token)}`, { method: 'DELETE' }));
            });

            Promise.all(promises.map(p => p.catch(e => ({ error: true, message: e.message }))))
                .then(responses => {
                    const failed = responses.filter(r => !r.ok && r.error !== true);
                    const success = responses.filter(r => r.ok);
                    if (success.length > 0) {
                        showNotification(`${success.length} элементов удалено безвозвратно`, 'success');
                    }
                    if (failed.length > 0) {
                        showNotification(`Ошибка удаления ${failed.length} элементов`, 'error');
                    }

                    clearSelection();
                    loadFiles();
                })
                .catch(e => showNotification('Ошибка: ' + e.message, 'error'));
        });
    };

    // confirmMove support for bulk move (files only)
    const originalConfirmMove = window.confirmMove;
    window.confirmMove = function() {
        if (selectedMoveFile === 'bulk') {
            const files = window._bulkMoveFileIds || selectedByKind('file');
            if (files.length === 0) return;

            const token = getAuthToken();
            const promises = files.map(fileId =>
                fetch(`/api/files/move?fileId=${encodeURIComponent(fileId)}&targetFolder=${encodeURIComponent(selectedTargetFolder)}&token=${encodeURIComponent(token)}`, {
                    method: 'POST'
                })
            );

            Promise.all(promises.map(p => p.then(r => r.json().catch(() => ({}))).catch(() => ({ error: true }))))
                .then(results => {
                    const failed = results.filter(r => r.error);
                    const renamed = results.filter(r => r.renamed);

                    if (failed.length > 0) {
                        showNotification(`Ошибка перемещения ${failed.length} файлов`, 'error');
                    } else if (renamed.length > 0) {
                        showNotification(`${files.length} файлов перемещено, ${renamed.length} переименовано`, 'warning');
                    } else {
                        showNotification(`${files.length} файлов успешно перемещено`, 'success');
                    }
                    clearSelection();
                    loadFiles();
                })
                .catch(e => showNotification('Ошибка: ' + e.message, 'error'));

            closeMoveModal();
        } else {
            originalConfirmMove();
        }
    };
