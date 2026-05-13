    window.uploadFiles = function() {
        if (isInTrash) return;
        $fileInput.click();
    };

    $fileInput.addEventListener('change', async function() {
        const files = this.files;
        if (files.length === 0) return;

        // Получаем текущую квоту
        const token = getAuthToken();
        let quotaInfo;
        try {
            const response = await authFetch('/api/files/quota');
            quotaInfo = await response.json();
        } catch (e) {
            showNotification('Ошибка получения информации о квоте', 'error');
            this.value = '';
            return;
        }

        // Проверяем размеры файлов
        const filesToUpload = [];
        const rejectedFiles = [];
        let totalSize = 0;
        
        Array.from(files).forEach(file => {
            totalSize += file.size;
            if (quotaInfo.remaining >= totalSize) {
                filesToUpload.push(file);
            } else {
                rejectedFiles.push(file);
            }
        });
        
        // Показываем предупреждения о отклоненных файлах
        if (rejectedFiles.length > 0) {
            const rejectedNames = rejectedFiles.map(f => f.name).join(', ');
            showNotification(`Файлы не загружены (недостаточно места): ${rejectedNames}`, 'warning');
        }
        
        // Добавляем только подходящие файлы в очередь
        if (filesToUpload.length > 0) {
            filesToUpload.forEach(file => {
                uploadQueue.push({ file, path: currentPath });
                uploadTotalBytes += file.size;
            });

            showUploadProgress();
            
            // Запускаем обработку очереди если не загружаем
            if (!isUploading) {
                processUploadQueue();
            }
        }
        
        this.value = ''; // Очищаем input
    });

    let _dragCounter = 0;
    let _fileAreaRef = null;
    let _overlayRef = null;

    function _showDropzone() {
        if (_dragCounter > 0) return;
        _dragCounter = 1;
        if (_fileAreaRef) _fileAreaRef.classList.add('drag-over');
        if (_overlayRef) _overlayRef.classList.add('active');
    }

    function _hideDropzone() {
        _dragCounter = 0;
        if (_fileAreaRef) _fileAreaRef.classList.remove('drag-over');
        if (_overlayRef) _overlayRef.classList.remove('active');
    }

    function _processDroppedFiles(files) {
        if (files.length === 0) return;

        authFetch('/api/files/quota')
            .then(r => r.json())
            .then(quotaInfo => {
                const filesToUpload = [];
                const rejectedFiles = [];
                let totalSize = 0;

                Array.from(files).forEach(file => {
                    totalSize += file.size;
                    if (quotaInfo.remaining >= totalSize) {
                        filesToUpload.push(file);
                    } else {
                        rejectedFiles.push(file);
                    }
                });

                if (rejectedFiles.length > 0) {
                    const rejectedNames = rejectedFiles.map(f => f.name).join(', ');
                    showNotification(`Файлы не загружены (недостаточно места): ${rejectedNames}`, 'warning');
                }

                if (filesToUpload.length > 0) {
                    filesToUpload.forEach(file => {
                        uploadQueue.push({ file, path: currentPath });
                        uploadTotalBytes += file.size;
                    });

                    showUploadProgress();

                    if (!isUploading) {
                        processUploadQueue();
                    }
                }
            })
            .catch(err => showNotification('Ошибка проверки квоты: ' + err.message, 'error'));
    }

    document.addEventListener('dragenter', function(e) {
        if (isInTrash) return;
        const hasFiles = Array.from(e.dataTransfer.types).includes('Files');
        if (!hasFiles) return;
        e.preventDefault();
        _showDropzone();
    }, false);

    document.addEventListener('dragover', function(e) {
        if (isInTrash) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    }, false);

    document.addEventListener('dragleave', function(e) {
        if (isInTrash) return;
        if (e.relatedTarget !== null && document.contains(e.relatedTarget)) return;
        e.preventDefault();
        _hideDropzone();
    }, false);

    document.addEventListener('drop', function(e) {
        if (isInTrash) return;
        const hasFiles = Array.from(e.dataTransfer.types).includes('Files');
        if (!hasFiles) return;
        e.preventDefault();
        _hideDropzone();
        _processDroppedFiles(e.dataTransfer.files);
    }, false);

    _fileAreaRef = $fileArea;
    _overlayRef = $dropzoneOverlay;
    
    function processUploadQueue() {
        if (uploadQueue.length === 0) {
            isUploading = false;
            window.currentUploadFile = null;
            currentUploadFile = null;
            currentUploadLoaded = 0;
            currentUploadTotal = 0;
            setTimeout(() => {
                hideUploadProgress();
                loadFiles();
            }, 2000);
            return;
        }
        
        isUploading = true;
        const { file, path } = uploadQueue.shift();
        window.currentUploadFile = file.name;
        currentUploadFile = file.name;
        currentUploadLoaded = 0;
        currentUploadTotal = file.size;
        
        if (!window.uploadedFiles) window.uploadedFiles = [];
        updateUploadProgressDisplay();
        
        // Обновляем токен перед каждой загрузкой
        tryRefreshToken().then(() => {
            const fd = new FormData();
            fd.append('file', file);
            if (path) fd.append('path', path);

            // Получаем таймаут из конфига
            authFetch('/api/files/config/upload-timeout')
                .then(r => r.json())
                .then(config => {
                    startUpload(config.timeout, fd);
                })
                .catch(() => {
                    startUpload(10800000, fd); // fallback 3 часа
                });
        }).catch(() => {
            // Ошибка обновления токена
            showNotification(`Ошибка аутентификации при загрузке ${file.name}`, 'error');
            processUploadQueue();
        });
            
        function startUpload(timeout, fd) {
            const xhr = new XMLHttpRequest();
            const authToken = getAuthToken();
            let startTime = Date.now();
            let lastLoaded = 0;
            let lastTime = startTime;
            let tokenRefreshInterval;
            
            // Обновляем токен каждые 5 минут во время загрузки
            tokenRefreshInterval = setInterval(() => {
                tryRefreshToken();
            }, 5 * 60 * 1000);
            
            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const now = Date.now();
                    const timeDiff = (now - lastTime) / 1000;
                    const loadedDiff = e.loaded - lastLoaded;
                    
                    let speed = 0;
                    if (timeDiff > 0.5) {
                        speed = loadedDiff / timeDiff;
                        lastTime = now;
                        lastLoaded = e.loaded;
                    }
                    
                    const percentComplete = (e.loaded / e.total) * 100;
                    updateUploadProgress(percentComplete, e.loaded, e.total, speed);
                }
            });
            
            xhr.onload = function() {
                clearInterval(tokenRefreshInterval);
                if (xhr.status === 200) {
                    try {
                        const response = JSON.parse(xhr.responseText);
                        if (response.renamed) {
                            showNotification(`Файл "${response.originalName}" переименован в "${response.newName}"`, 'warning');
                        }
                    } catch (e) {
                        // Игнорируем ошибки парсинга
                    }
                    window.uploadedFiles.push(file.name);
                    uploadDoneBytes += file.size;
                    currentUploadLoaded = 0;
                    currentUploadTotal = 0;
                    currentUploadFile = null;
                    updateUploadProgressDisplay();
                    processUploadQueue();
                } else {
                    showNotification(`Ошибка загрузки ${file.name}: ${xhr.responseText}`, 'error');
                    uploadDoneBytes += file.size;
                    currentUploadLoaded = 0;
                    currentUploadTotal = 0;
                    currentUploadFile = null;
                    updateUploadProgressDisplay();
                    processUploadQueue();
                }
            };
            
            xhr.onerror = function() {
                clearInterval(tokenRefreshInterval);
                showNotification(`Ошибка загрузки ${file.name}: Соединение прервано`, 'error');
                uploadDoneBytes += file.size;
                currentUploadLoaded = 0;
                currentUploadTotal = 0;
                currentUploadFile = null;
                updateUploadProgressDisplay();
                processUploadQueue();
            };
            
            xhr.ontimeout = function() {
                clearInterval(tokenRefreshInterval);
                showNotification(`Ошибка загрузки ${file.name}: Превышено время ожидания`, 'error');
                uploadDoneBytes += file.size;
                currentUploadLoaded = 0;
                currentUploadTotal = 0;
                currentUploadFile = null;
                updateUploadProgressDisplay();
                processUploadQueue();
            };
            
            xhr.timeout = timeout;
            xhr.open('POST', '/api/files/upload');
            xhr.setRequestHeader('Authorization', 'Bearer ' + authToken);
            xhr.send(fd);
        }
    }
    
    function showUploadProgress() {
        // keep legacy div unused; new UI lives in TaskCenter
        updateUploadProgressDisplay();
    }

    function updateUploadProgressDisplay() {
        if (!window.TaskCenter || !window.TaskCenter.upsert) return;

        const total = Math.max(1, uploadTotalBytes);
        const done = uploadDoneBytes + currentUploadLoaded;
        const pct = Math.min(100, Math.max(0, Math.round((done / total) * 100)));

        const lines = [];
        const uploaded = (window.uploadedFiles || []);
        uploaded.slice(-6).forEach(name => lines.push('✓ ' + name));

        if (currentUploadFile) {
            lines.push('↥ ' + currentUploadFile);
            if (uploadSpeedLine) lines.push(uploadSpeedLine);
            if (uploadSizeLine) lines.push(uploadSizeLine);
        }

        uploadQueue.slice(0, 6).forEach(item => lines.push('⏳ ' + item.file.name));

        window.TaskCenter.upsert({
            id: 'upload',
            title: 'Загрузка на сервер',
            subtitle: (uploaded.length + (currentUploadFile ? 1 : 0) + uploadQueue.length) + ' задач',
            state: isUploading ? 'running' : (uploadQueue.length > 0 ? 'queued' : (uploaded.length > 0 ? 'done' : 'queued')),
            percent: pct,
            lines
        });
    }

    function updateUploadProgress(percent, loaded, total, speed) {
        currentUploadLoaded = loaded || 0;
        currentUploadTotal = total || currentUploadTotal;

        uploadSizeLine = `${formatFileSize(currentUploadLoaded)} / ${formatFileSize(currentUploadTotal || 0)}`;
        uploadSpeedLine = '';
        if (speed && speed > 0 && total) {
            let speedStr = '';
            if (speed > 1024 * 1024) {
                speedStr = (speed / 1024 / 1024).toFixed(1) + ' MB/s';
            } else if (speed > 1024) {
                speedStr = (speed / 1024).toFixed(1) + ' KB/s';
            } else {
                speedStr = speed.toFixed(0) + ' B/s';
            }

            const remaining = total - loaded;
            const timeLeft = remaining / speed;
            let timeStr = '';
            if (timeLeft > 3600) {
                const hours = Math.floor(timeLeft / 3600);
                const minutes = Math.floor((timeLeft % 3600) / 60);
                timeStr = ` (осталось ${hours} ч. ${minutes} мин.)`;
            } else if (timeLeft > 60) {
                const minutes = Math.floor(timeLeft / 60);
                const seconds = Math.floor(timeLeft % 60);
                timeStr = ` (осталось ${minutes} м. ${seconds} сек.)`;
            } else if (timeLeft > 0) {
                timeStr = ` (осталось ${Math.ceil(timeLeft)} сек.)`;
            }
            uploadSpeedLine = speedStr + timeStr;
        }

        updateUploadProgressDisplay();
    }

    function hideUploadProgress() {
        // Mark upload task as done and reset counters
        uploadDoneBytes = uploadTotalBytes;
        currentUploadLoaded = 0;
        currentUploadTotal = 0;
        currentUploadFile = null;
        uploadSpeedLine = '';
        uploadSizeLine = '';
        updateUploadProgressDisplay();

        // Reset totals after a short delay, keep task visible
        setTimeout(() => {
            uploadTotalBytes = 0;
            uploadDoneBytes = 0;
            window.uploadedFiles = [];
            window.currentUploadFile = null;
            if (window.TaskCenter && window.TaskCenter.update) {
                window.TaskCenter.update('upload', { state: 'done', percent: 100 });
            }
        }, 2000);
    }
