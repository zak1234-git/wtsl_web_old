// 独立的 SLE 管理脚本，不依赖主站 main.js
const sleState = {
    themeKey: 'theme',
    cacheKeys: {
        basic: 'sle-basic-info',
        connected: 'sle-connected-devices'
    }
};

// API 配置：与 SLB 一致，仅在路径前添加 SLE 前缀
let SLE_API_CONFIG = {
    baseUrl: 'http://localhost:8080',
    endpoints: {
        basicInfo: '/api/v1/nodes/0/SLE_basicinfo',
        connected: '/api/v1/nodes/0/SLE_conninfo',
        scan: '/api/v1/nodes/0/SLE_show_bss_info',
        connect: '/api/v1/nodes/0/SLE_connect'
    },
    token: '',
    timeout: 10000
};

// 示例数据：便于演示 UI，接入真实接口后可直接删除
const sleDemoData = {
    basic: { name: 'SLE-DEV-01', address: '00:11:22:33:44:55' },
    connected: [
        { rssi: -52, address: 'AA:BB:CC:DD:EE:01' },
        { rssi: -61, address: 'AA:BB:CC:DD:EE:02' }
    ],
    scan: [
        { index: 1, rssi: -48, address: 'AA:BB:CC:DD:FF:10' },
        { index: 2, rssi: -67, address: 'AA:BB:CC:DD:FF:11' },
        { index: 3, rssi: -74, address: 'AA:BB:CC:DD:FF:12' }
    ]
};

// UI 引用
const sleRefs = {};

const initSleRefs = () => {
    sleRefs.themeToggle = document.getElementById('theme-toggle');
    sleRefs.themeToggleIcon = document.getElementById('theme-toggle-icon');
    sleRefs.notification = document.getElementById('notification');
    sleRefs.notificationTitle = document.getElementById('notification-title');
    sleRefs.notificationMessage = document.getElementById('notification-message');
    sleRefs.notificationIcon = document.getElementById('notification-icon');
    sleRefs.notificationClose = document.getElementById('close-notification');

    sleRefs.basicName = document.getElementById('sle-basic-name');
    sleRefs.basicAddress = document.getElementById('sle-basic-address');
    sleRefs.basicLoading = document.getElementById('sle-basic-loading');

    sleRefs.connectedTable = document.getElementById('sle-connected-table');
    sleRefs.connectedLoading = document.getElementById('sle-connected-loading');

    sleRefs.scanTable = document.getElementById('sle-scan-table');
    sleRefs.scanButton = document.getElementById('sle-scan-button');
    sleRefs.scanLoading = document.getElementById('sle-scan-loading');
};

// 主题 ---------------------------------------------------------------
const applyTheme = (nextTheme) => {
    document.documentElement.setAttribute('data-theme', nextTheme);
    localStorage.setItem(sleState.themeKey, nextTheme);
    const isLight = nextTheme === 'light';
    if (sleRefs.themeToggleIcon) {
        sleRefs.themeToggleIcon.className = isLight ? 'fa fa-sun-o' : 'fa fa-moon-o';
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

// 通知 ---------------------------------------------------------------
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

// API 配置加载 -------------------------------------------------------
const loadSleApiConfig = async () => {
    const candidates = ['config_sle.json', 'config.json.sle', 'config.json'];
    for (const file of candidates) {
        try {
            const res = await fetch(file, { cache: 'no-store' });
            if (!res.ok) continue;
            const data = await res.json();
            const ip = data.serverip || data.ip || 'localhost';
            const port = data.port || data.serverport || '8080';
            const baseUrl = data.baseUrl || `http://${ip}:${port}`;
            SLE_API_CONFIG = {
                ...SLE_API_CONFIG,
                baseUrl,
                token: data.token || ''
            };
            return;
        } catch (err) {
            // 继续尝试下一个
        }
    }
    console.warn('SLE 配置文件缺失，使用占位符地址');
};

const buildSleUrl = (key) => `${SLE_API_CONFIG.baseUrl}${SLE_API_CONFIG.endpoints[key] || ''}`;

// 数据填充 -----------------------------------------------------------
const renderBasicInfo = (payload = {}) => {
    if (sleRefs.basicName) sleRefs.basicName.textContent = payload.name || '--';
    if (sleRefs.basicAddress) sleRefs.basicAddress.textContent = payload.address || payload.ip || '--';
};

const renderConnectedDevices = (list = []) => {
    if (!sleRefs.connectedTable) return;
    if (!Array.isArray(list) || list.length === 0) {
        sleRefs.connectedTable.innerHTML = '<tr><td colspan="2" class="py-4 px-4 text-center text-gray-400">暂无连接设备</td></tr>';
        return;
    }
    sleRefs.connectedTable.innerHTML = list.map((item) => {
        const rssi = item.rssi ?? item.signal ?? '--';
        const addr = item.mac || item.address || item.ip || '--';
        return `<tr class="border-b border-dark">
            <td class="py-3 px-4 text-gray-300">${rssi}</td>
            <td class="py-3 px-4 text-gray-300">${addr}</td>
        </tr>`;
    }).join('');
};

const renderScanResults = (list = []) => {
    if (!sleRefs.scanTable) return;
    if (!Array.isArray(list) || list.length === 0) {
        sleRefs.scanTable.innerHTML = '<tr><td colspan="3" class="py-4 px-4 text-center text-gray-400">尚未扫描到设备</td></tr>';
        return;
    }
    sleRefs.scanTable.innerHTML = list.map((item, idx) => {
        const rssi = item.rssi ?? item.signal ?? '--';
        const addr = item.mac || item.address || item.ip || '--';
        const index = item.index ?? idx;
        return `<tr class="border-b border-dark">
            <td class="py-3 px-4 text-gray-300">${rssi}</td>
            <td class="py-3 px-4 text-gray-300">${addr}</td>
            <td class="py-3 px-4 text-right">
                <button class="sle-connect-btn bg-primary hover:bg-primary/80 text-white px-3 py-1 rounded-lg text-sm" data-index="${index}" data-address="${addr}" data-name="${addr}">
                    <i class="fa fa-link mr-1"></i>连接
                </button>
            </td>
        </tr>`;
    }).join('');
    bindConnectButtons();
};

// 请求逻辑 -----------------------------------------------------------
const fetchBasicInfo = async () => {
    sleRefs.basicLoading?.classList.remove('hidden');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SLE_API_CONFIG.timeout);
    try {
        const res = await fetch(buildSleUrl('basicInfo'), {
            signal: controller.signal,
            headers: SLE_API_CONFIG.token ? { Authorization: `Bearer ${SLE_API_CONFIG.token}` } : {}
        });
        if (!res.ok) throw new Error(`获取基本信息失败：${res.status}`);
        const data = await res.json();
        // 检查数据有效性（如果只有 status 字段说明是错误响应）
        const payload = data.data || data;
        if (!payload.name && !payload.address && data.status === 'Failed') {
            throw new Error('API 返回错误响应');
        }
        renderBasicInfo(payload);
        localStorage.setItem(sleState.cacheKeys.basic, JSON.stringify(payload));
    } catch (err) {
        console.error('[SLE] 获取基本信息异常：', err.message);
        renderBasicInfo(sleDemoData.basic);
        showNotification('示例数据', '无法连接API，当前展示示例数据', 'info');
    } finally {
        clearTimeout(timeoutId);
        sleRefs.basicLoading?.classList.add('hidden');
    }
};

const fetchConnectedDevices = async () => {
    sleRefs.connectedLoading?.classList.remove('hidden');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SLE_API_CONFIG.timeout);
    try {
        const res = await fetch(buildSleUrl('connected'), {
            signal: controller.signal,
            headers: SLE_API_CONFIG.token ? { Authorization: `Bearer ${SLE_API_CONFIG.token}` } : {}
        });
        if (!res.ok) throw new Error(`获取连接设备失败：${res.status}`);
        const data = await res.json();
        const list = data.data || data.devices || data.list || [];
        // 检查列表是否为空或无效，如果为空则当作错误处理
        if (!Array.isArray(list) || (list.length === 0 && data.status === 'Failed')) {
            throw new Error('API 返回空结果或错误响应');
        }
        renderConnectedDevices(list);
        localStorage.setItem(sleState.cacheKeys.connected, JSON.stringify(list));
    } catch (err) {
        console.error('[SLE] 获取连接设备异常：', err.message);
        renderConnectedDevices(sleDemoData.connected);
        showNotification('示例数据', '无法连接API，当前展示示例数据', 'info');
    } finally {
        clearTimeout(timeoutId);
        sleRefs.connectedLoading?.classList.add('hidden');
    }
};

const fetchScanResults = async () => {
    sleRefs.scanButton?.setAttribute('disabled', 'true');
    sleRefs.scanLoading?.classList.remove('hidden');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SLE_API_CONFIG.timeout);
    try {
        const res = await fetch(buildSleUrl('scan'), {
            signal: controller.signal,
            headers: SLE_API_CONFIG.token ? { Authorization: `Bearer ${SLE_API_CONFIG.token}` } : {}
        });
        if (!res.ok) throw new Error(`扫描失败：${res.status}`);
        const data = await res.json();
        const list = data.data || data.nodes || data.list || [];
        renderScanResults(list.length ? list : sleDemoData.scan);
    } catch (err) {
        renderScanResults(sleDemoData.scan);
        showNotification('示例数据', '当前展示扫描示例数据，API接入后移除', 'info');
    } finally {
        clearTimeout(timeoutId);
        sleRefs.scanLoading?.classList.add('hidden');
        sleRefs.scanButton?.removeAttribute('disabled');
    }
};

const handleConnect = async (index, address, name) => {
    try {
        const res = await fetch(buildSleUrl('connect'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(SLE_API_CONFIG.token ? { Authorization: `Bearer ${SLE_API_CONFIG.token}` } : {})
            },
            body: JSON.stringify({ index, address, name })
        });
        if (!res.ok) throw new Error(`连接失败：${res.status}`);
        const data = await res.json();
        const success = data.status !== false;
        if (!success) throw new Error(data.message || '连接指令执行失败');
        showNotification('连接成功', `已连接到设备 ${name || index}`, 'success');
        await fetchConnectedDevices();
    } catch (err) {
        showNotification('连接失败', err.message || '无法下发连接指令', 'error');
    }
};

// 事件绑定 -----------------------------------------------------------
const bindConnectButtons = () => {
    const buttons = document.querySelectorAll('.sle-connect-btn');
    buttons.forEach((btn) => {
        btn.addEventListener('click', () => {
            const index = btn.getAttribute('data-index');
            const address = btn.getAttribute('data-address');
            const name = btn.getAttribute('data-name');
            handleConnect(index, address, name);
        });
    });
};

const bindSleEvents = () => {
    sleRefs.themeToggle?.addEventListener('click', handleThemeToggle);
    sleRefs.notificationClose?.addEventListener('click', hideNotification);
    sleRefs.scanButton?.addEventListener('click', fetchScanResults);
};

// 初始化 -------------------------------------------------------------
const initSlePage = async () => {
    initSleRefs();
    bindSleEvents();
    initTheme();
    await loadSleApiConfig();
    await Promise.all([fetchBasicInfo(), fetchConnectedDevices()]);
    await fetchScanResults();
};

// 等待 DOM 完全加载后再执行
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSlePage);
} else {
    initSlePage();
}
