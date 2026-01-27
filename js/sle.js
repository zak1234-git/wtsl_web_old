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
        basicInfo: '/api/v1/nodes/0/sle_basicinfo',
        connected: '/api/v1/nodes/0/sle_scan',
        scan: '/api/v1/nodes/0/sle_show_bss',
        connect: '/api/v1/nodes/0/sle_connect'
    },
    token: '',
    timeout: 10000
};

/* 示例数据：如需演示可解开注释
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
*/

// 基本信息临时占位数据（接口未就绪时使用）
const sleBasicMock = { name: 'SLE-DEV-01', mac: 'b:b:b:b:80:1' };

// UI 引用（集中获取，避免重复查询 DOM）
const sleRefs = {};

// 初始化 DOM 引用：一次性缓存常用节点
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

// 主题：同步 data-theme 与图标
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

// 通知：统一的提示入口
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

// API 配置加载：依次尝试配置文件，未命中则使用占位 baseUrl
const loadSleApiConfig = async () => {
    const candidates = ['config.json'];
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

// 渲染：基础信息（纯展示，不校验）
const renderBasicInfo = (payload = {}) => {
    if (sleRefs.basicName) sleRefs.basicName.textContent = payload.name || '--';
    if (sleRefs.basicAddress) sleRefs.basicAddress.textContent = payload.mac || payload.address || payload.ip || '--';
};

// 渲染：已连接设备表格
const renderConnectedDevices = (list = []) => {
    if (!sleRefs.connectedTable) return;
    if (!Array.isArray(list) || list.length === 0) {
        sleRefs.connectedTable.innerHTML = '<tr><td colspan="2" class="py-4 px-4 text-center text-gray-400">暂无连接设备</td></tr>';
        return;
    }
    // 将列表转为表格行，支持不同字段命名
    sleRefs.connectedTable.innerHTML = list.map((item) => {
        const rssi = item.rssi ?? item.signal ?? '--';
        const addr = item.mac || item.address || item.ip || '--';
        return `<tr class="border-b border-dark">
            <td class="py-3 px-4 text-gray-300">${rssi}</td>
            <td class="py-3 px-4 text-gray-300">${addr}</td>
        </tr>`;
    }).join('');
};

// 渲染：扫描结果表格，附带连接按钮绑定
const renderScanResults = (list = []) => {
    if (!sleRefs.scanTable) return;
    if (!Array.isArray(list) || list.length === 0) {
        sleRefs.scanTable.innerHTML = '<tr><td colspan="3" class="py-4 px-4 text-center text-gray-400">尚未扫描到设备</td></tr>';
        return;
    }
    // 构造扫描结果行并为每行预置连接按钮数据属性
    sleRefs.scanTable.innerHTML = list.map((item, idx) => {
        const rssi = item.rssi ?? item.signal ?? '--';
        const mac = item.mac || item.address || item.ip || '--';
        const index = item.index ?? idx;
        return `<tr class="border-b border-dark">
            <td class="py-3 px-4 text-gray-300">${rssi}</td>
            <td class="py-3 px-4 text-gray-300">${mac}</td>
            <td class="py-3 px-4 text-right">
                <button class="sle-connect-btn bg-primary hover:bg-primary/80 text-white px-3 py-1 rounded-lg text-sm" data-index="${index}" data-mac="${mac}" data-name="${mac}">
                    <i class="fa fa-link mr-1"></i>连接
                </button>
            </td>
        </tr>`;
    }).join('');
    bindConnectButtons();
};

// 请求：基础信息（接口未就绪，走占位数据；保留真实请求模板便于恢复）
const fetchBasicInfo = async () => {
    sleRefs.basicLoading?.classList.remove('hidden');
    try {
        // TODO: 接口准备好后，恢复下方注释的真实请求逻辑
        /*
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), SLE_API_CONFIG.timeout);
        try {
            const res = await fetch(buildSleUrl('basicInfo'), {
                signal: controller.signal,
                headers: SLE_API_CONFIG.token ? { Authorization: `Bearer ${SLE_API_CONFIG.token}` } : {}
            });
            if (!res.ok) throw new Error(`获取基本信息失败：${res.status}`);
            const data = await res.json();
            const payload = data.data || data;
            if ((data.status && data.status !== 'success') || (!payload.name && !payload.mac)) {
                throw new Error('API 返回错误响应');
            }
            renderBasicInfo(payload);
            localStorage.setItem(sleState.cacheKeys.basic, JSON.stringify(payload));
            return;
        } catch (err) {
            console.error('[SLE] 获取基本信息异常：', err.message);
        } finally {
            clearTimeout(timeoutId);
        }
        */

        // 当前接口未就绪，使用占位数据
        renderBasicInfo(sleBasicMock);
        localStorage.setItem(sleState.cacheKeys.basic, JSON.stringify(sleBasicMock));
        showNotification('示例数据', '基本信息接口未就绪，展示占位数据', 'info');
    } finally {
        sleRefs.basicLoading?.classList.add('hidden');
    }
};

// 请求：已连接设备列表，失败时清空并提示
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
        if (!Array.isArray(list) || (data.status && data.status !== 'success')) {
            throw new Error('API 返回空结果或错误响应');
        }
        renderConnectedDevices(list);
        localStorage.setItem(sleState.cacheKeys.connected, JSON.stringify(list));
    } catch (err) {
        console.error('[SLE] 获取连接设备异常：', err.message);
        renderConnectedDevices([]);
        showNotification('获取失败', '无法获取连接设备列表，请检查接口或网络', 'error');
    } finally {
        clearTimeout(timeoutId);
        sleRefs.connectedLoading?.classList.add('hidden');
    }
};

// 请求：扫描结果，加载时禁用按钮并显示骨架
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
        // 校验返回结构，status 非 success 或列表不是数组则视为失败
        if (!Array.isArray(list) || (data.status && data.status !== 'success')) {
            throw new Error('API 返回空结果或错误响应');
        }
        renderScanResults(list);
    } catch (err) {
        renderScanResults([]);
        showNotification('扫描失败', '无法获取扫描结果，请检查接口或网络', 'error');
    } finally {
        clearTimeout(timeoutId);
        sleRefs.scanLoading?.classList.add('hidden');
        sleRefs.scanButton?.removeAttribute('disabled');
    }
};

// 动作：下发连接指令，成功后刷新已连接列表
const handleConnect = async (index, mac, name) => {
    try {
        const res = await fetch(buildSleUrl('connect'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(SLE_API_CONFIG.token ? { Authorization: `Bearer ${SLE_API_CONFIG.token}` } : {})
            },
            body: JSON.stringify({ mac })
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

// 事件绑定：为扫描结果按钮绑定连接事件
const bindConnectButtons = () => {
    const buttons = document.querySelectorAll('.sle-connect-btn');
    buttons.forEach((btn) => {
        btn.addEventListener('click', () => {
            const index = btn.getAttribute('data-index');
            const mac = btn.getAttribute('data-mac');
            const name = btn.getAttribute('data-name');
            handleConnect(index, mac, name);
        });
    });
};

// 事件绑定：主题切换、通知关闭、扫描按钮
const bindSleEvents = () => {
    sleRefs.themeToggle?.addEventListener('click', handleThemeToggle);
    sleRefs.notificationClose?.addEventListener('click', hideNotification);
    sleRefs.scanButton?.addEventListener('click', fetchScanResults);
};

// 初始化入口：缓存 DOM、绑定事件、初始化主题与配置、并行拉取数据
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
