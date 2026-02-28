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
        setbasicinfo: '/api/v1/nodes/0/sle_basicinfo',
        connected: '/api/v1/nodes/0/sle_conninfo', // 已连接设备查询接口
        scan: '/api/v1/nodes/0/sle_scan', // 扫描信息与已连接设备共用 sle_scan
        connect: '/api/v1/nodes/0/sle_connect',
        sle_announce_id: '/api/v1/nodes/0/sle_announce_id'
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
const sleBasicMock = { name: 'SLE-DEV-01', mac: 'b:b:b:b:80:1', sle_type: 5 };

let sleCurrentType = null;
let slePendingReboot = false;
let sleTcpManualSelect = false;
let sleTcpAvailableChannels = [];

// 已连接设备：从会话缓存恢复（切换页面保留，关闭标签页自动清空）
const loadCachedConnections = () => {
    try {
        const raw = sessionStorage.getItem(sleState.cacheKeys.connected);
        const data = raw ? JSON.parse(raw) : [];
        return Array.isArray(data) ? data : [];
    } catch (err) {
        return [];
    }
};

const saveCachedConnections = () => {
    try {
        sessionStorage.setItem(sleState.cacheKeys.connected, JSON.stringify(sleLocalConnections));
    } catch (err) {
        // 忽略缓存写入错误
    }
};

// 本地维护的“已连接设备”列表（无查询接口，仅在点击连接后添加）
const sleLocalConnections = loadCachedConnections();

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
    sleRefs.basicType = document.getElementById('sle-basic-type');
    sleRefs.basicAddress = document.getElementById('sle-basic-address');
    sleRefs.basicLoading = document.getElementById('sle-basic-loading');

    sleRefs.connectedTable = document.getElementById('sle-connected-table');
    sleRefs.connectedLoading = document.getElementById('sle-connected-loading');

    sleRefs.scanTable = document.getElementById('sle-scan-table');
    sleRefs.scanCard = document.getElementById('sle-scan-card');
    sleRefs.scanButton = document.getElementById('sle-scan-button');
    sleRefs.scanLoading = document.getElementById('sle-scan-loading');

    sleRefs.configForm = document.getElementById('sle-config-form');
    sleRefs.configCard = document.getElementById('sle-config-card');
    sleRefs.configName = document.getElementById('sle-config-name');
    sleRefs.configType = document.getElementById('sle-config-type');
    sleRefs.configSubmit = document.getElementById('sle-config-submit');

    sleRefs.tcpTargetList = document.getElementById('sle-tcp-target-list');    
    sleRefs.tcpTargetPanel = document.getElementById('sle-tcp-target-panel');
    sleRefs.tcpTargetMode = document.getElementById('sle-tcp-target-mode');
    sleRefs.tcpToggleSelect = document.getElementById('sle-tcp-toggle-select');
    sleRefs.tcpSendButton = document.getElementById('sle-tcp-send-button');
    sleRefs.tcpSendLoading = document.getElementById('sle-tcp-send-loading');
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

// 设备类型映射
const mapSleTypeLabel = (type) => {
    const val = Number(type);
    if (val === 5) return 'G节点';
    if (val === 6) return 'T节点';
    if (val === 7) return 'P节点';
    return '--';
};
const mapSleTypeClass = (type) => {
    const val = Number(type);
    if (val === 5) return 'bg-primary/20 text-primary';
    if (val === 6) return 'bg-accent/20 text-accent';
    if (val === 7) return 'bg-secondary/20 text-secondary';
    return 'bg-dark-lightest text-gray-300';
};

const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// 渲染：基础信息（纯展示，不校验）
const renderBasicInfo = (payload = {}) => {
    if (sleRefs.basicName) sleRefs.basicName.textContent = payload.sle_name || '--';
    if (sleRefs.basicType) {
        sleRefs.basicType.textContent = mapSleTypeLabel(payload.sle_type);
        sleRefs.basicType.className = `px-3 py-1 rounded-full text-sm font-medium ${mapSleTypeClass(payload.sle_type)}`;
    }
    if (sleRefs.basicAddress) sleRefs.basicAddress.textContent = payload.mac || '--';

    if (sleRefs.scanCard) {
        const isGNode = Number(payload.sle_type) === 5;
        sleRefs.scanCard.classList.toggle('hidden', !isGNode);
        if (sleRefs.configCard) {
            // 扫描卡片可见时，配置卡片占整行；隐藏时占右侧空位
            sleRefs.configCard.classList.toggle('lg:col-span-2', isGNode);
        }
    }

    if (payload.sle_type !== undefined && payload.sle_type !== null) {
        sleCurrentType = Number(payload.sle_type);
    }
};

// 同步基础信息到配置表单
const fillConfigForm = (payload = {}) => {
    if (sleRefs.configName) sleRefs.configName.value = payload.sle_name || '';
    if (sleRefs.configType && payload.sle_type !== undefined && payload.sle_type !== null) {
        sleRefs.configType.value = String(payload.sle_type);
    }
};

// 渲染：已连接设备表格
const renderConnectedDevices = (list = []) => {
    if (!sleRefs.connectedTable) return;
    if (!Array.isArray(list) || list.length === 0) {
        sleRefs.connectedTable.innerHTML = '<tr><td colspan="2" class="py-4 px-4 text-center text-gray-400">暂无连接设备</td></tr>';
        renderTcpTargetOptions([]);
        return;
    }
    // 将列表转为表格行，支持不同字段命名
    sleRefs.connectedTable.innerHTML = list.map((item) => {
        const connId = item.conn_id ?? '--';
        const addr = item.mac || item.address || item.ip || '--';
        return `<tr class="border-b border-dark">
            <td class="py-3 px-4 text-gray-300">${connId}</td>
            <td class="py-3 px-4 text-gray-300">${addr}</td>
        </tr>`;
    }).join('');
    renderTcpTargetOptions(list);
};

const normalizeTcpChannel = (item) => {
    // 使用已连接设备中的 conn_id 作为可发送目标
    if (!item || typeof item !== 'object') return null;
    const source = item.conn_id;
    const parsed = Number.parseInt(source, 10);
    return Number.isInteger(parsed) ? parsed : null;
};

const updateTcpTargetModeUI = () => {
    // 根据“是否有可用通道 + 是否开启手动模式”同步提示文案与显隐
    const hasChannels = sleTcpAvailableChannels.length > 0;
    const isManual = sleTcpManualSelect && hasChannels;

    if (sleRefs.tcpTargetPanel) {
        sleRefs.tcpTargetPanel.classList.toggle('hidden', !isManual);
    }
    if (sleRefs.tcpTargetMode) {
        sleRefs.tcpTargetMode.textContent = isManual ? '已开启手动选择：仅发送到勾选通道' : '默认发送到所有通道';
    }
    if (sleRefs.tcpToggleSelect) {
        sleRefs.tcpToggleSelect.textContent = isManual ? '取消选择' : '选择通道';
        sleRefs.tcpToggleSelect.toggleAttribute('disabled', !hasChannels);
        sleRefs.tcpToggleSelect.classList.toggle('opacity-60', !hasChannels);
        sleRefs.tcpToggleSelect.classList.toggle('cursor-not-allowed', !hasChannels);
    }
};

const handleTcpToggleSelect = () => {
    // 用户点击“选择通道/取消选择”按钮时切换模式
    if (sleTcpAvailableChannels.length === 0) {
        showNotification('暂无可选目标', '当前没有可用的已连接设备ID', 'warning');
        return;
    }
    sleTcpManualSelect = !sleTcpManualSelect;
    updateTcpTargetModeUI();
};

const renderTcpTargetOptions = (list = []) => {
    // 根据已连接设备渲染可多选的目标通道
    if (!sleRefs.tcpTargetList) return;
    if (!Array.isArray(list) || list.length === 0) {
        sleTcpAvailableChannels = [];
        sleTcpManualSelect = false;
        sleRefs.tcpTargetList.innerHTML = '<p class="text-gray-400 text-sm">暂无已连接设备可选</p>';
        updateTcpTargetModeUI();
        return;
    }

    const validItems = list
        .map((item) => {
            const channel = normalizeTcpChannel(item);
            if (channel === null) return null;
            const mac = item.mac || item.address || item.ip || '--';
            return { channel, mac };
        })
        .filter(Boolean);

    if (validItems.length === 0) {
        sleTcpAvailableChannels = [];
        sleTcpManualSelect = false;
        sleRefs.tcpTargetList.innerHTML = '<p class="text-gray-400 text-sm">暂无已连接设备可选</p>';
        updateTcpTargetModeUI();
        return;
    }

    // 以通道号去重，避免重复渲染同一发送目标
    const uniqueByChannel = new Map();
    validItems.forEach((item) => {
        if (!uniqueByChannel.has(item.channel)) {
            uniqueByChannel.set(item.channel, item);
        }
    });
    const mergedItems = Array.from(uniqueByChannel.values()).sort((a, b) => a.channel - b.channel);
    sleTcpAvailableChannels = mergedItems.map((item) => item.channel);

    sleRefs.tcpTargetList.innerHTML = mergedItems.map((item) => `
        <label class="flex items-center justify-between gap-3 bg-dark-lightest/40 border border-dark-lightest rounded-lg px-3 py-2">
            <span class="text-gray-300 text-sm">通道 ${item.channel}</span>
            <span class="text-gray-400 text-xs font-mono">${escapeHtml(item.mac)}</span>
            <input type="checkbox" class="sle-tcp-target-checkbox w-4 h-4 accent-primary" value="${item.channel}">
        </label>
    `).join('');
    updateTcpTargetModeUI();
};

const getSelectedTcpChannels = () => {
    // 收集已勾选通道并去重，作为 announce_id 下发参数
    const selected = Array.from(document.querySelectorAll('.sle-tcp-target-checkbox:checked'))
        .map((el) => Number.parseInt(el.value, 10))
        .filter((val) => Number.isInteger(val));
    return Array.from(new Set(selected));
};

const setTcpSendLoading = (loading) => {
    // 统一控制发送按钮禁用态与 loading 图标
    if (loading) {
        sleRefs.tcpSendButton?.setAttribute('disabled', 'true');
        sleRefs.tcpSendButton?.classList.add('opacity-70', 'cursor-not-allowed');
        sleRefs.tcpSendLoading?.classList.remove('hidden');
        return;
    }
    sleRefs.tcpSendButton?.removeAttribute('disabled');
    sleRefs.tcpSendButton?.classList.remove('opacity-70', 'cursor-not-allowed');
    sleRefs.tcpSendLoading?.classList.add('hidden');
};

const handleTcpSend = async () => {
    // TCP client 下发流程：读取选择 -> 参数校验 -> POST -> 通知
    if (sleTcpAvailableChannels.length === 0) {
        showNotification('校验失败', '当前没有可发送的已连接设备ID', 'warning');
        return;
    }

    const channels = sleTcpManualSelect ? getSelectedTcpChannels() : [...sleTcpAvailableChannels];

    if (sleTcpManualSelect && channels.length === 0) {
        showNotification('校验失败', '请至少选择一个通道号', 'warning');
        return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SLE_API_CONFIG.timeout);
    setTcpSendLoading(true);

    try {
        const res = await fetch(buildSleUrl('sle_announce_id'), {
            method: 'POST',
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                ...(SLE_API_CONFIG.token ? { Authorization: `Bearer ${SLE_API_CONFIG.token}` } : {})
            },
            body: JSON.stringify({ announce_id: channels })
        });
        if (!res.ok) throw new Error(`发送失败：${res.status}`);

        const data = await res.json();
        const success = data.status === 'success' || data.status === true || data.success === true;
        if (!success) {
            throw new Error(data.message || '发送失败');
        }

        showNotification('发送成功', `已向 ${channels.length} 个通道下发消息`, 'success');
    } catch (err) {
        showNotification('发送失败', err.message || '无法下发 TCP 消息', 'error');
    } finally {
        clearTimeout(timeoutId);
        setTcpSendLoading(false);
    }
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
        const rssi = item.rssi ?? item.signal ?? '--'; // 信号强度
        const mac = item.mac || item.address || item.ip || '--';
        const index = item.index ?? idx;
        return `<tr class="border-b border-dark">
            <td class="py-3 px-4 text-gray-300">${rssi}</td>
            <td class="py-3 px-4 text-gray-300">${mac}</td>
            <td class="py-3 px-4 text-right">
                <button class="sle-connect-btn bg-primary hover:bg-primary/80 text-white px-3 py-1 rounded-lg text-sm" data-index="${index}" data-mac="${mac}" data-name="${mac}" data-rssi="${rssi}">
                    <i class="fa fa-link mr-1"></i>连接
                </button>
            </td>
        </tr>`;
    }).join('');
    bindConnectButtons();
};

// 请求：基础信息
const fetchBasicInfo = async () => {
    sleRefs.basicLoading?.classList.remove('hidden');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SLE_API_CONFIG.timeout);
    try {
        const res = await fetch(buildSleUrl('basicInfo'), {
            method: 'GET',
            signal: controller.signal,
            headers: SLE_API_CONFIG.token ? { Authorization: `Bearer ${SLE_API_CONFIG.token}` } : {}
        });
        if (!res.ok) throw new Error(`获取基本信息失败：${res.status}`);
        const data = await res.json();
        const payload = data.data || data;
        // 校验返回的数据结构：sle_type, name, mac
        if ((data.status && data.status !== 'success') || (!payload.sle_name && !payload.mac)) {
            throw new Error('API 返回错误响应');
        }
        renderBasicInfo(payload);
        fillConfigForm(payload);
        localStorage.setItem(sleState.cacheKeys.basic, JSON.stringify(payload));
    } catch (err) {
        console.error('[SLE] 获取基本信息异常：', err.message);
        showNotification('获取失败', '无法获取基本信息，请检查接口或网络', 'error');
        // 失败时尝试加载缓存
        try {
            const cached = localStorage.getItem(sleState.cacheKeys.basic);
            if (cached) {
                const cachedPayload = JSON.parse(cached);
                renderBasicInfo(cachedPayload);
                fillConfigForm(cachedPayload);
            }
        } catch (e) {
            renderBasicInfo(sleBasicMock);
            fillConfigForm(sleBasicMock);
        }
    } finally {
        clearTimeout(timeoutId);
        sleRefs.basicLoading?.classList.add('hidden');
    }
};

// 请求：已连接设备列表（使用真实 API 接口）
const fetchConnectedDevices = async () => {
    sleRefs.connectedLoading?.classList.remove('hidden');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SLE_API_CONFIG.timeout);
    try {
        const res = await fetch(buildSleUrl('connected'), {
            signal: controller.signal,
            headers: SLE_API_CONFIG.token ? { Authorization: `Bearer ${SLE_API_CONFIG.token}` } : {}
        });
        if (!res.ok) throw new Error(`获取已连接设备失败：${res.status}`);
        const data = await res.json();
        const list = data.data || data.nodes || data.list || [];
        // 校验返回结构，确保是数组
        if (!Array.isArray(list) || (data.status && data.status !== 'success')) {
            throw new Error('API 返回空结果或错误响应');
        }
        renderConnectedDevices(list);
        // 更新本地缓存
        sleLocalConnections.length = 0;
        sleLocalConnections.push(...list);
        saveCachedConnections();
        // 连接列表更新后同步刷新 TCP 目标通道
        renderTcpTargetOptions(list);
    } catch (err) {
        console.error('[SLE] 获取已连接设备异常：', err.message);
        // 失败时使用本地缓存
        renderConnectedDevices(sleLocalConnections);
        // 回退本地缓存时，同步刷新 TCP 目标通道
        renderTcpTargetOptions(sleLocalConnections);
        if (sleLocalConnections.length === 0) {
            showNotification('获取失败', '无法获取已连接设备，请检查接口或网络', 'warning');
        }
    } finally {
        clearTimeout(timeoutId);
        sleRefs.connectedLoading?.classList.add('hidden');
    }
};

// 请求：扫描结果，加载时禁用按钮并显示骨架
const fetchScanResults = async () => {
    sleRefs.scanButton?.setAttribute('disabled', 'true');
    sleRefs.scanLoading?.classList.remove('hidden');
    const controller = new AbortController(); // 控制请求取消
    const timeoutId = setTimeout(() => controller.abort(), SLE_API_CONFIG.timeout); // 请求超时定时器
    try {
        const res = await fetch(buildSleUrl('scan'), {
            signal: controller.signal,
            headers: SLE_API_CONFIG.token ? { Authorization: `Bearer ${SLE_API_CONFIG.token}` } : {}
        });
        if (!res.ok) throw new Error(`扫描失败：${res.status}`);
        const data = await res.json(); // 响应主体
        const list = data.data || data.nodes || data.list || []; // 通用列表字段兼容
        // 校验返回结构，status 非 success 或列表不是数组则视为失败
        if (!Array.isArray(list) || (data.status && data.status !== 'success')) {
            throw new Error('API 返回空结果或错误响应');
        }
        renderScanResults(list);
        showNotification('扫描完成', `已获取 ${list.length} 个设备`, 'success');
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
const handleConnect = async (index, mac, name, buttonEl) => {
    const btn = buttonEl || null;
    const originalHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.setAttribute('disabled', 'true');
        btn.classList.add('opacity-70', 'cursor-not-allowed');
        btn.innerHTML = '<span class="inline-flex items-center"><span class="loader w-4 h-4 border-2 border-white rounded-full mr-2"></span>连接中</span>';
    }
    try {
        // 发送连接指令
        const res = await fetch(buildSleUrl('connect'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(SLE_API_CONFIG.token ? { Authorization: `Bearer ${SLE_API_CONFIG.token}` } : {})
            },
            body: JSON.stringify({ mac })
        });
        if (!res.ok) throw new Error(`连接失败：${res.status}`);
        const data = await res.json(); // 返回状态
        const success = data.status !== false;
        if (!success) throw new Error(data.message || '连接指令执行失败');
        showNotification('连接成功', `已连接到设备 ${name || index}`, 'success');
        // 将当前连接加入本地已连接列表（无查询接口）
        const connId = Number.parseInt(index, 10);
        const rssiValue = name || '--';
        sleLocalConnections.push({
            mac,
            rssi: rssiValue,
            ...(Number.isInteger(connId) ? { conn_id: connId } : {})
        });
        saveCachedConnections();
        renderConnectedDevices(sleLocalConnections);
        // 连接成功后立即更新 TCP 目标通道
        renderTcpTargetOptions(sleLocalConnections);
    } catch (err) {
        showNotification('连接失败', err.message || '无法下发连接指令', 'error');
    } finally {
        if (btn) {
            btn.innerHTML = originalHtml || '<i class="fa fa-link mr-1"></i>连接';
            btn.removeAttribute('disabled');
            btn.classList.remove('opacity-70', 'cursor-not-allowed');
        }
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
            const rssi = btn.getAttribute('data-rssi');
            // 连接后使用 rssi 记录本地表格
            handleConnect(index, mac, rssi || name, btn);
        });
    });
};

// 事件绑定：主题切换、通知关闭、扫描按钮
const bindSleEvents = () => {
    sleRefs.themeToggle?.addEventListener('click', handleThemeToggle);
    sleRefs.notificationClose?.addEventListener('click', hideNotification);
    sleRefs.scanButton?.addEventListener('click', fetchScanResults);
    sleRefs.configSubmit?.addEventListener('click', handleConfigSubmit);
    sleRefs.tcpSendButton?.addEventListener('click', handleTcpSend);
    sleRefs.tcpToggleSelect?.addEventListener('click', handleTcpToggleSelect);
};

// 动作：设置 SLE 设备基本信息
const handleConfigSubmit = async () => {
    if (slePendingReboot) {
        showNotification('设备重启', '设备正在重启中，请稍后刷新页面', 'warning');
        return;
    }
    const name = sleRefs.configName?.value?.trim();
    const typeValue = sleRefs.configType?.value;
    const sleType = typeValue !== undefined && typeValue !== null ? Number(typeValue) : NaN;

    if (!name) {
        showNotification('校验失败', '请输入设备名称', 'warning');
        return;
    }
    if (![5, 6].includes(sleType)) {
        showNotification('校验失败', '请选择有效的设备类型', 'warning');
        return;
    }

    const btn = sleRefs.configSubmit;
    const originalHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.setAttribute('disabled', 'true');
        btn.classList.add('opacity-70', 'cursor-not-allowed');
        btn.innerHTML = '<span class="inline-flex items-center"><span class="loader w-4 h-4 border-2 border-white rounded-full mr-2"></span>保存中</span>';
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SLE_API_CONFIG.timeout);
    try {
        const res = await fetch(buildSleUrl('setbasicinfo'), {
            method: 'POST',
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                ...(SLE_API_CONFIG.token ? { Authorization: `Bearer ${SLE_API_CONFIG.token}` } : {})
            },
            body: JSON.stringify({ sle_type: sleType, sle_name: name })
        });
        if (!res.ok) throw new Error(`保存失败：${res.status}`);
        const data = await res.json();
        if (data.status !== 'success') {
            throw new Error(data.message || '保存失败');
        }
        const typeChanged = sleCurrentType !== null && sleType !== sleCurrentType;
        if (typeChanged) {
            slePendingReboot = true;
            sleCurrentType = sleType;
            showNotification('设备将重启', '设备类型已更改，请稍后刷新页面', 'warning');
            sleRefs.themeToggle?.setAttribute('disabled', 'true');
            sleRefs.scanButton?.setAttribute('disabled', 'true');
            sleRefs.configSubmit?.setAttribute('disabled', 'true');
            sleRefs.configName?.setAttribute('disabled', 'true');
            sleRefs.configType?.setAttribute('disabled', 'true');
            return;
        }
        showNotification('保存成功', '设备基本信息已更新', 'success');
        await fetchBasicInfo();
    } catch (err) {
        showNotification('保存失败', err.message || '无法保存设备基本信息', 'error');
    } finally {
        clearTimeout(timeoutId);
        if (btn) {
            btn.innerHTML = originalHtml || '<i class="fa fa-save mr-2"></i><span>保存配置</span>';
            btn.removeAttribute('disabled');
            btn.classList.remove('opacity-70', 'cursor-not-allowed');
        }
    }
};

// 初始化入口：缓存 DOM、绑定事件、初始化主题与配置、并行拉取数据
const initSlePage = async () => {
    initSleRefs();
    bindSleEvents();
    renderTcpTargetOptions(sleLocalConnections);
    initTheme();
    await loadSleApiConfig();
    await fetchBasicInfo();
    await fetchScanResults();
    await fetchConnectedDevices();
};

// 等待 DOM 完全加载后再执行
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSlePage);
} else {
    initSlePage();
}
