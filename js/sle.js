// 独立的 SLE 管理脚本，不依赖主站 main.js
const sleState = {
    themeKey: 'theme',
    storageKey: 'sle-device-info',
    currentPage: 'sle-device-display',
    scanInterval: null
};

// API 配置（优先使用 config_sle.json，其次 config.json.sle，如果都缺失则保留 TODO）
let SLE_API_CONFIG = {
    baseUrl: 'http://example.com',
    endpoints: {
        deviceInfo: '/sle/device',
        saveSettings: '/sle/device',
        uploadFirmware: '/sle/firmware',
        upgrade: '/sle/upgrade',
        scan: '/sle/scan'
    },
    token: ''
};

// UI 引用统一收敛，便于后续维护/重构
const sleRefs = {};

const initSleRefs = () => {
    sleRefs.navLinks = document.querySelectorAll('.nav-link');
    sleRefs.sections = document.querySelectorAll('.page-section');
    sleRefs.mobileMenuBtn = document.getElementById('mobile-menu-button');
    sleRefs.mobileMenu = document.getElementById('mobile-menu');
    sleRefs.themeToggle = document.getElementById('theme-toggle');
    sleRefs.themeToggleIcon = document.getElementById('theme-toggle-icon');
    sleRefs.themeToggleMobile = document.getElementById('theme-toggle-mobile');
    sleRefs.themeToggleIconMobile = document.getElementById('theme-toggle-icon-mobile');
    sleRefs.notification = document.getElementById('notification');
    sleRefs.notificationTitle = document.getElementById('notification-title');
    sleRefs.notificationMessage = document.getElementById('notification-message');
    sleRefs.notificationIcon = document.getElementById('notification-icon');
    sleRefs.notificationClose = document.getElementById('close-notification');

    sleRefs.deviceLoading = document.getElementById('sle-device-loading');
    sleRefs.deviceError = document.getElementById('sle-device-error');
    sleRefs.errorMessage = document.getElementById('sle-error-message');
    sleRefs.retryBtn = document.getElementById('sle-retry');
    sleRefs.deviceCard = document.getElementById('sle-device-card');
    sleRefs.deviceDefault = document.getElementById('sle-device-default');

    sleRefs.deviceName = document.getElementById('sle-device-name');
    sleRefs.deviceType = document.getElementById('sle-device-type');
    sleRefs.deviceIp = document.getElementById('sle-device-ip');
    sleRefs.deviceChannel = document.getElementById('sle-device-channel');
    sleRefs.deviceBw = document.getElementById('sle-device-bw');
    sleRefs.deviceServiceBw = document.getElementById('sle-device-service-bw');
    sleRefs.deviceVersion = document.getElementById('sle-device-version');

    sleRefs.settingsForm = document.getElementById('sle-settings-form');
    sleRefs.settingsName = document.getElementById('sle-settings-name');
    sleRefs.settingsIp = document.getElementById('sle-settings-ip');
    sleRefs.settingsChannel = document.getElementById('sle-settings-channel');
    sleRefs.settingsBw = document.getElementById('sle-settings-bw');
    sleRefs.settingsServiceBw = document.getElementById('sle-settings-service-bw');
    sleRefs.settingsLoading = document.getElementById('sle-settings-loading');

    sleRefs.firmwareFile = document.getElementById('sle-firmware-file');
    sleRefs.selectedFile = document.getElementById('sle-selected-file');
    sleRefs.uploadButton = document.getElementById('sle-upload-button');
    sleRefs.uploadLoading = document.getElementById('sle-upload-loading');
    sleRefs.upgradeButton = document.getElementById('sle-upgrade-button');
    sleRefs.upgradeLoading = document.getElementById('sle-upgrade-loading');

    sleRefs.scanButton = document.getElementById('sle-scan-button');
    sleRefs.scanLoading = document.getElementById('sle-scan-loading');
    sleRefs.scanHint = document.getElementById('sle-scan-hint');
    sleRefs.nodesTable = document.getElementById('sle-nodes-table');
};

// 主题 -----------------------------------------------------------------
const applyTheme = (nextTheme) => {
    document.documentElement.setAttribute('data-theme', nextTheme);
    localStorage.setItem(sleState.themeKey, nextTheme);
    const isLight = nextTheme === 'light';
    if (sleRefs.themeToggleIcon) {
        sleRefs.themeToggleIcon.className = isLight ? 'fa fa-sun-o' : 'fa fa-moon-o';
    }
    if (sleRefs.themeToggleIconMobile) {
        sleRefs.themeToggleIconMobile.className = isLight ? 'fa fa-sun-o' : 'fa fa-moon-o';
    }
};

const initTheme = () => {
    const stored = localStorage.getItem(sleState.themeKey);
    const theme = stored || 'dark';
    applyTheme(theme);
};

const handleThemeToggle = () => {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
};

// 通知 -----------------------------------------------------------------
const showNotification = (title, message, type = 'info') => {
    const iconMap = {
        success: '<i class="fa fa-check-circle text-green-400 text-xl"></i>',
        error: '<i class="fa fa-times-circle text-danger text-xl"></i>',
        warning: '<i class="fa fa-exclamation-circle text-warning text-xl"></i>',
        info: '<i class="fa fa-info-circle text-primary text-xl"></i>'
    };
    if (!sleRefs.notification) return;
    sleRefs.notificationTitle.textContent = title;
    sleRefs.notificationMessage.textContent = message;
    sleRefs.notificationIcon.innerHTML = iconMap[type] || iconMap.info;
    sleRefs.notification.classList.remove('translate-x-full');
    setTimeout(() => sleRefs.notification.classList.add('translate-x-full'), 3200);
};

const hideNotification = () => sleRefs.notification?.classList.add('translate-x-full');

// 页面切换 -------------------------------------------------------------
const switchPage = (pageId) => {
    sleRefs.sections?.forEach((section) => {
        if (section.id === pageId) {
            section.classList.remove('hidden');
            section.classList.add('content-auto');
        } else {
            section.classList.add('hidden');
        }
    });
    sleRefs.navLinks?.forEach((link) => {
        if (link.getAttribute('href') === `#${pageId}`) {
            link.classList.add('bg-primary/20', 'text-primary');
        } else {
            link.classList.remove('bg-primary/20', 'text-primary');
        }
    });
    sleState.currentPage = pageId;
};

// API 配置加载 ---------------------------------------------------------
const loadSleApiConfig = async () => {
    const candidates = ['config_sle.json', 'config.json.sle'];
    for (const file of candidates) {
        try {
            const res = await fetch(file, { cache: 'no-store' });
            if (!res.ok) continue;
            const data = await res.json();
            SLE_API_CONFIG = {
                baseUrl: data.baseUrl || SLE_API_CONFIG.baseUrl,
                endpoints: { ...SLE_API_CONFIG.endpoints, ...(data.endpoints || {}) },
                token: data.token || ''
            };
            return;
        } catch (err) {
            // 忽略错误，尝试下一个
        }
    }
    // 未找到配置文件，保持默认占位，提醒开发者
    console.warn('SLE 配置文件缺失，使用占位符地址。');
};

const buildSleUrl = (key) => `${SLE_API_CONFIG.baseUrl}${SLE_API_CONFIG.endpoints[key] || ''}`;

// 数据填充 -------------------------------------------------------------
const populateSleDevice = (payload, isDefault = false) => {
    if (!sleRefs.deviceName) return;
    sleRefs.deviceName.textContent = payload?.name || '--';
    sleRefs.deviceType.textContent = payload?.type || '--';
    sleRefs.deviceIp.textContent = payload?.ip || '--';
    sleRefs.deviceChannel.textContent = payload?.channel ?? '--';
    sleRefs.deviceBw.textContent = payload?.bw ?? '--';
    sleRefs.deviceServiceBw.textContent = payload?.serviceBw ?? '--';
    sleRefs.deviceVersion.textContent = payload?.version || '--';
    sleRefs.deviceDefault.classList.toggle('hidden', !isDefault);
};

// SLE 设备信息获取（支持失败回退到缓存） --------------------------------
const fetchSleDeviceInfo = async () => {
    sleRefs.deviceLoading?.classList.remove('hidden');
    sleRefs.deviceError?.classList.add('hidden');
    sleRefs.deviceCard?.classList.add('opacity-50');
    try {
        const res = await fetch(buildSleUrl('deviceInfo'), {
            headers: SLE_API_CONFIG.token ? { Authorization: `Bearer ${SLE_API_CONFIG.token}` } : {}
        });
        if (!res.ok) throw new Error(`请求失败：${res.status}`);
        const data = await res.json();
        populateSleDevice(data, false);
        localStorage.setItem(sleState.storageKey, JSON.stringify(data));
    } catch (err) {
        const cached = localStorage.getItem(sleState.storageKey);
        if (cached) {
            populateSleDevice(JSON.parse(cached), true);
            showNotification('离线数据', '当前使用本地缓存数据', 'warning');
        } else {
            sleRefs.deviceError?.classList.remove('hidden');
            if (sleRefs.errorMessage) sleRefs.errorMessage.textContent = err.message || '获取设备信息失败';
        }
    } finally {
        sleRefs.deviceLoading?.classList.add('hidden');
        sleRefs.deviceCard?.classList.remove('opacity-50');
    }
};

// 保存设置 -------------------------------------------------------------
const handleSleSaveSettings = async (event) => {
    event.preventDefault();
    sleRefs.settingsLoading?.classList.remove('hidden');
    const payload = {
        name: sleRefs.settingsName?.value.trim(),
        ip: sleRefs.settingsIp?.value.trim(),
        channel: Number(sleRefs.settingsChannel?.value) || 0,
        bw: Number(sleRefs.settingsBw?.value) || 0,
        serviceBw: Number(sleRefs.settingsServiceBw?.value) || 0
    };
    try {
        const res = await fetch(buildSleUrl('saveSettings'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(SLE_API_CONFIG.token ? { Authorization: `Bearer ${SLE_API_CONFIG.token}` } : {})
            },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(`保存失败：${res.status}`);
        showNotification('已保存', '设备设置已提交', 'success');
    } catch (err) {
        showNotification('保存失败', err.message || '提交设备设置失败', 'error');
    } finally {
        sleRefs.settingsLoading?.classList.add('hidden');
    }
};

// 固件上传 -------------------------------------------------------------
const handleSleFileChange = () => {
    const file = sleRefs.firmwareFile?.files?.[0];
    if (sleRefs.selectedFile) sleRefs.selectedFile.textContent = file ? file.name : '未选择文件';
};

const handleSleUpload = async () => {
    const file = sleRefs.firmwareFile?.files?.[0];
    if (!file) {
        showNotification('请选择文件', '请先选择固件文件', 'warning');
        return;
    }
    const formData = new FormData();
    formData.append('file', file);
    sleRefs.uploadLoading?.classList.remove('hidden');
    try {
        const res = await fetch(buildSleUrl('uploadFirmware'), {
            method: 'POST',
            headers: SLE_API_CONFIG.token ? { Authorization: `Bearer ${SLE_API_CONFIG.token}` } : {},
            body: formData
        });
        if (!res.ok) throw new Error(`上传失败：${res.status}`);
        showNotification('上传成功', '固件已上传，准备升级', 'success');
    } catch (err) {
        showNotification('上传失败', err.message || '固件上传失败', 'error');
    } finally {
        sleRefs.uploadLoading?.classList.add('hidden');
    }
};

const handleSleUpgrade = async () => {
    sleRefs.upgradeLoading?.classList.remove('hidden');
    try {
        const res = await fetch(buildSleUrl('upgrade'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(SLE_API_CONFIG.token ? { Authorization: `Bearer ${SLE_API_CONFIG.token}` } : {})
            }
        });
        if (!res.ok) throw new Error(`升级指令失败：${res.status}`);
        showNotification('升级指令已下发', '请等待设备完成升级', 'info');
    } catch (err) {
        showNotification('升级失败', err.message || '升级指令发送失败', 'error');
    } finally {
        sleRefs.upgradeLoading?.classList.add('hidden');
    }
};

// 扫描 ---------------------------------------------------------------
const renderSleNodes = (list) => {
    if (!Array.isArray(list) || list.length === 0) {
        if (sleRefs.nodesTable) sleRefs.nodesTable.innerHTML = '';
        sleRefs.scanHint?.classList.remove('hidden');
        return;
    }
    sleRefs.scanHint?.classList.add('hidden');
    if (!sleRefs.nodesTable) return;
    sleRefs.nodesTable.innerHTML = list.map((node, idx) => {
        return `<tr class="border-b border-dark hover:bg-dark">
            <td class="py-3 px-4 text-gray-300">${node.index ?? idx}</td>
            <td class="py-3 px-4 text-gray-300">${node.name || '--'}</td>
            <td class="py-3 px-4 text-gray-300">${node.channel ?? '--'}</td>
            <td class="py-3 px-4 text-gray-300">${node.rssi ?? '--'}</td>
            <td class="py-3 px-4 text-gray-300">
                <button class="bg-primary/20 hover:bg-primary/30 text-primary px-3 py-1 rounded-lg text-sm">连接</button>
            </td>
        </tr>`;
    }).join('');
};

const handleSleScan = async () => {
    sleRefs.scanLoading?.classList.remove('hidden');
    try {
        const res = await fetch(buildSleUrl('scan'), {
            headers: SLE_API_CONFIG.token ? { Authorization: `Bearer ${SLE_API_CONFIG.token}` } : {}
        });
        if (!res.ok) throw new Error(`扫描失败：${res.status}`);
        const data = await res.json();
        renderSleNodes(data?.nodes || []);
    } catch (err) {
        showNotification('扫描失败', err.message || '无法获取扫描结果', 'error');
    } finally {
        sleRefs.scanLoading?.classList.add('hidden');
    }
};

// 事件绑定 -------------------------------------------------------------
const bindSleEvents = () => {
    sleRefs.navLinks?.forEach((link) => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const target = link.getAttribute('href').replace('#', '');
            switchPage(target);
            sleRefs.mobileMenu?.classList.add('hidden');
        });
    });

    sleRefs.mobileMenuBtn?.addEventListener('click', () => sleRefs.mobileMenu?.classList.toggle('hidden'));

    sleRefs.themeToggle?.addEventListener('click', handleThemeToggle);
    sleRefs.themeToggleMobile?.addEventListener('click', handleThemeToggle);
    sleRefs.notificationClose?.addEventListener('click', hideNotification);

    sleRefs.retryBtn?.addEventListener('click', fetchSleDeviceInfo);
    sleRefs.settingsForm?.addEventListener('submit', handleSleSaveSettings);

    sleRefs.firmwareFile?.addEventListener('change', handleSleFileChange);
    sleRefs.uploadButton?.addEventListener('click', handleSleUpload);
    sleRefs.upgradeButton?.addEventListener('click', handleSleUpgrade);

    sleRefs.scanButton?.addEventListener('click', handleSleScan);
};

// 初始化 ---------------------------------------------------------------
const initSlePage = async () => {
    initSleRefs();
    bindSleEvents();
    initTheme();
    switchPage('sle-device-display');
    await loadSleApiConfig();
    await fetchSleDeviceInfo();
    // 默认开启一次扫描，后续如需轮询可在此设置 setInterval
    await handleSleScan();
};

 initSlePage();
