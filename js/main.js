// 全局变量定义
let connectedDevices = [];
let currentDevice = {};
let usingDefaultData = true; // 默认使用默认数据
let rssiChartInstance = null;
let lastUpdateTime = null;
let bssPollingInterval = null;

let scanResults = []; // 存储扫描结果
let activeScanFilter = 'all'; // 默认显示所有扫描结果

let refreshTimer = null;
let isAutoRefreshEnabled = false; // 默认关闭

let autoJoinRequestInProgress = false;

let API_SERVER = {};
let API_CONFIG = {};
let ADV_API_CONFIG = {}; // 高级信息相关接口独立配置，避免污染通用配置

// 统一的登录态 token 存储键
const AUTH_TOKEN_KEY = 'auth_token';

// 优先读取当前会话 token，回退到配置中的 token
function getAuthToken() {
    return sessionStorage.getItem(AUTH_TOKEN_KEY) || API_CONFIG.token || '';
}

// 按需注入 Authorization 头，避免污染已有 headers
function buildAuthHeaders(baseHeaders) {
    const headers = Object.assign({}, baseHeaders || {});
    const token = getAuthToken();
    if (token && !headers.Authorization) {
        headers.Authorization = `Bearer ${token}`;
    }
    return headers;
}

// 场景测试配置（用于说明与接口映射）
const SCENARIO_TESTS = {
    throughput: {
        name: '吞吐量峰值测试',
        description: '评估链路峰值吞吐能力与短时稳定性，适用于性能基准对比。',
        apiKey: 'throughputTestUrl'
    },
    shortrange: {
        name: '近距测试',
        description: '在近距离环境下验证连接稳定性与速率表现，适用于实验室调试。',
        apiKey: 'shortRangeTestUrl'
    },
    remoterange: {
        name: '远距测试',
        description: '在远距离场景评估覆盖能力与链路稳定性，适用于外场验证。',
        apiKey: 'remoteRangeTestUrl'
    },
    lowpower: {
        name: '低功耗测试',
        description: '验证低功耗模式下的连接表现与耗能策略，适用于功耗评估。',
        apiKey: 'lowPowerTestUrl'
    },
    lowlatency: {
        name: '低时延测试',
        description: '验证低时延场景下的传输稳定性和时延性能，适用于实时业务评估。',
        apiKey: 'lowlatencyTestUrl'
    }
};

// 当前选中的场景测试
let selectedScenarioId = null;

// 构造高级信息接口地址，使用与基础接口相同的IP/端口
function setAdvApiConfig(ip, port, token = '', timeout = 10000) {
    ADV_API_CONFIG = {
        getAdvInfoUrl: `http://${ip}:${port}/api/v1/nodes/0/advinfo`,
        setAdvInfoUrl: `http://${ip}:${port}/api/v1/nodes/0/advinfo`,
        throughputTestUrl: `http://${ip}:${port}/api/v1/nodes/0/throughput_test`,
        shortRangeTestUrl: `http://${ip}:${port}/api/v1/nodes/0/shortrange_test`,
        remoteRangeTestUrl: `http://${ip}:${port}/api/v1/nodes/0/remoterange_test`,
        lowPowerTestUrl: `http://${ip}:${port}/api/v1/nodes/0/lowpow_test`,
        lowlatencyTestUrl: `http://${ip}:${port}/api/v1/nodes/0/lowlatency_test`,
        token: token || '',
        timeout: timeout || 10000
    };
}

const THEME_STORAGE_KEY = 'theme';

/**
 * 安全绑定事件：避免旧环境或空节点导致 addEventListener 调用报错。
 */
function addEventListenerIf(element, eventName, handler) {
    if (element) {
        element.addEventListener(eventName, handler);
    }
}

/**
 * 兼容超时请求封装：
 * - 有 AbortController 时，使用 signal + timeout 主动中断。
 * - 无 AbortController 时，使用 Promise.race 做超时兜底。
 */
function fetchWithTimeoutCompat(url, options, timeoutMs) {
    const finalOptions = options || {};
    if (finalOptions.headers) {
        finalOptions.headers = buildAuthHeaders(finalOptions.headers);
    } else {
        finalOptions.headers = buildAuthHeaders();
    }
    const resolvedTimeout = timeoutMs || API_CONFIG.timeout || 10000;
    const hasAbortController = typeof AbortController !== 'undefined';

    if (hasAbortController) {
        const controller = new AbortController();
        finalOptions.signal = controller.signal;
        const timer = setTimeout(() => controller.abort(), resolvedTimeout);
        return fetch(url, finalOptions).then((response) => {
            clearTimeout(timer);
            return response;
        }, (error) => {
            clearTimeout(timer);
            throw error;
        });
    }

    let timer = null;
    return Promise.race([
        fetch(url, finalOptions),
        new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('请求超时')), resolvedTimeout);
        })
    ]).then((response) => {
        if (timer) {
            clearTimeout(timer);
        }
        return response;
    }, (error) => {
        if (timer) {
            clearTimeout(timer);
        }
        throw error;
    });
}

// 读取首选主题（localStorage优先，其次媒体查询）
function getInitialTheme() {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') {
        return stored;
    }
    return 'dark';
}

// 应用主题并同步图标状态
function applyTheme(theme) {
    const safeTheme = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', safeTheme);

    const desktopIcon = document.getElementById('theme-toggle-icon');
    const mobileIcon = document.getElementById('theme-toggle-icon-mobile');

    if (desktopIcon) {
        desktopIcon.classList.toggle('fa-moon-o', safeTheme === 'dark');
        desktopIcon.classList.toggle('fa-sun-o', safeTheme === 'light');
    }
    if (mobileIcon) {
        mobileIcon.classList.toggle('fa-moon-o', safeTheme === 'dark');
        mobileIcon.classList.toggle('fa-sun-o', safeTheme === 'light');
    }
}

// 初始化主题切换按钮
function initThemeControls() {
    const initialTheme = getInitialTheme();
    applyTheme(initialTheme);

    const desktopToggle = document.getElementById('theme-toggle');
    const mobileToggle = document.getElementById('theme-toggle-mobile');

    const handleToggle = () => {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
        const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
        applyTheme(nextTheme);
        localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    };

    addEventListenerIf(desktopToggle, 'click', handleToggle);
    addEventListenerIf(mobileToggle, 'click', handleToggle);

    // 当用户未主动选择时，监听系统主题变更
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleMediaChange = (event) => {
        const stored = localStorage.getItem(THEME_STORAGE_KEY);
        if (stored === 'light' || stored === 'dark') return;
        applyTheme(event.matches ? 'dark' : 'light');
    };
    if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', handleMediaChange);
    } else if (mediaQuery.addListener) {
        mediaQuery.addListener(handleMediaChange);
    }
}

// 信道与带宽限制映射规则
const CHANNEL_BANDWIDTH_RULES = {
    // 信道数组：[可用的带宽选项]
    '625,709,2125,2209,2645,2729': [20, 40],    // 只能选择20M和40M
    '791,2291,2813': [20],                      // 只能选择20M
    'default': [20, 40, 80]                     // 其他信道：20M，40M，80M
};

const BANDWIDTH_CHANNEL_RULES = {
    // 带宽： [支持的信道数组]
    20: [41, 125, 209, 291, 375, 459, 541, 625, 709, 791, 1375, 1459, 1541, 1625, 1709, 1791, 1875,
    1959, 2041, 2125, 2209, 2291, 2479, 2563, 2645, 2729, 2813],
    40: [41, 125, 209, 291, 375, 459, 541, 625, 709, 1375, 1459, 1541, 1625, 1709, 1791, 1875,
    1959, 2041, 2125, 2209, 2479, 2563, 2645, 2729],
    80: [41, 125, 209, 291, 375, 459, 541, 1375, 1459, 1541, 1625, 1709, 1791, 1875,
    1959, 2041, 2479, 2563]
};

// 符号类型取值规则（根据提纲中 cp_type 与 s_cfg_idx 的限制）
const SYMBOL_TYPE_RULES = {
    0: { 0: [2, 3, 4, 5], 1: [2, 3, 4, 5], 2: [1, 2, 3, 4, 5] },
    1: { 0: [2, 3, 4, 5], 1: [2, 3, 4, 5], 2: [1, 2, 3, 4, 5] },
    2: { 0: [2, 3, 4],    1: [2, 3, 4],    2: [1, 2, 3, 4]    },
    3: { 0: [2, 3],       1: [2, 3],       2: [1, 2, 3]       }
};

const CP_TYPE_LABELS = {
    0: '0 常规循环前缀 (5Ts)',
    1: '1 扩展循环前缀 (14Ts)',
    2: '2 24Ts 循环前缀',
    3: '3 42Ts 循环前缀'
};

const SYSMSG_PERIOD_LABELS = {
    0: '0 = 64 超帧',
    1: '1 = 128 超帧',
    2: '2 = 256 超帧',
    3: '3 = 512 超帧'
};

const RANGE_OPT_LABELS = {
    0: '关闭',
    1: '开启'
};

const ACS_ENABLE_LABELS = {
    0: '关闭',
    1: '开启'
};

// API服务器配置 - 提取IP和端口为独立变量，方便修改
//const API_SERVER = {
//    ip: '',  // API服务器IP地址
//    port: '8080'      // API服务器端口号
//};
//
//// API配置 - 新增固件升级相关API
//const API_CONFIG = {
//    getDevBasicinfoUrl: `http://${API_SERVER.ip}:${API_SERVER.port}/api/v1/getDevBasicinfo`,
//    getDevConninfoUrl: `http://${API_SERVER.ip}:${API_SERVER.port}/api/v1/getDevConninfo`,
//    setNodeUrl: `http://${API_SERVER.ip}:${API_SERVER.port}/api/v1/setnode`,
//    scanGNodesUrl: `http://${API_SERVER.ip}:${API_SERVER.port}/api/v1/scangnodes`,
//    connectGNodeUrl: `http://${API_SERVER.ip}:${API_SERVER.port}/api/v1/connectgnode`,
//    // 新增升级相关API
//    getFirmwareInfoUrl: `http://${API_SERVER.ip}:${API_SERVER.port}/api/v1/getFirmwareInfo`,
//    upgradeFirmwareUrl: `http://${API_SERVER.ip}:${API_SERVER.port}/api/v1/upgradeFirmware`,
//    getUpgradeHistoryUrl: `http://${API_SERVER.ip}:${API_SERVER.port}/api/v1/getUpgradeHistory`,
//    uploadFirmwareUrl: `http://${API_SERVER.ip}:${API_SERVER.port}/api/v1/uploadFirmware`, // 上传API端点
//    timeout: 10000 // 10秒超时
//};

// DOM加载完成后初始化
document.addEventListener('DOMContentLoaded', async () => {
        // 获取DOM元素
        window.elements = {
                // 导航和页面元素
                mobileMenuButton: document.getElementById('mobile-menu-button'),
                mobileMenu: document.getElementById('mobile-menu'),
                navLinks: document.querySelectorAll('.nav-link'),
                pageSections: document.querySelectorAll('.page-section'),
                manualScan: document.getElementById('manual-scan'),

                // 设备设置元素
                deviceSettingsForm: document.getElementById('settings-device-form'),
                physicalBandwidthSelect: document.getElementById('settings-physical-bandwidth'),
                serviceBandwidthSelect: document.getElementById('settings-service-bandwidth'),
                bandwidthWarning: document.getElementById('bandwidth-warning'),
                channelSelect: document.getElementById('settings-channel'),
                deviceTypeSelect: document.getElementById('settings-device-type'),
                settingsBasicSubmit: document.getElementById('settings-basic-submit'),
                basicSubmitLoading: document.getElementById('basic-submit-loading'),
                settingsAdvancedSubmit: document.getElementById('settings-advanced-submit'),
                advancedSubmitLoading: document.getElementById('advanced-submit-loading'),

                // 通知元素
                notification: document.getElementById('notification'),
                closeNotification: document.getElementById('close-notification'),

                // 设备信息元素
                connectedDevicesTable: document.getElementById('connected-devices-table'),
                rssiChart: document.getElementById('rssi-chart'),
                deviceLoading: document.getElementById('device-loading'),
                deviceErrorHint: document.getElementById('device-error-hint'),
                errorHintMessage: document.getElementById('error-hint-message'),
                retryLoad: document.getElementById('retry-load'),
                deviceInfoCard: document.getElementById('device-info-card'),
                connectedDevicesCard: document.getElementById('connected-devices-card'),
                deviceInfoDefaultIndicator: document.getElementById('device-info-default-indicator'),
                connectedDevicesDefaultIndicator: document.getElementById('connected-devices-default-indicator'),

                // 图表相关元素
                chartLoading: document.getElementById('chart-loading'),
                lastUpdateTimeEl: document.getElementById('last-update-time'),
                refreshChartBtn: document.getElementById('refresh-chart'),
                timeRangeBtns: document.querySelectorAll('.time-range-btn'),

                // 节点扫描相关元素
                scanGnodesButton: document.getElementById('scan-gnodes-button'),
                scanLoading: document.getElementById('scan-loading'),
                scanResultHint: document.getElementById('scan-result-hint'),
                gNodesTable: document.getElementById('g-nodes-table'),
                backToSettingsButton: document.getElementById('back-to-settings-button'),

                // 升级管理相关元素
                currentVersionEl: document.getElementById('current-version'),
                latestVersionEl: document.getElementById('latest-version'),
                releaseNotesEl: document.getElementById('release-notes'),
                upgradeButton: document.getElementById('upgrade-button'),
                upgradeLoading: document.getElementById('upgrade-loading'),
                firmwareFileInput: document.getElementById('firmware-file'),
                uploadButton: document.getElementById('upload-button'),
                uploadLoading: document.getElementById('upload-loading'),
                upgradeHistoryTable: document.getElementById('upgrade-history-table'),
                checkUpdateButton: document.getElementById('check-update-button'),
                checkUpdateLoading: document.getElementById('check-update-loading'),
                selectedFileName: document.getElementById('selected-file-name'),
                uploadProgressContainer: document.getElementById('upload-progress-container'),
                uploadProgressBar: document.getElementById('upload-progress-bar'),

                // 自动入网相关元素
                autoJoinNetwork: document.getElementById('auto-join-network'),
                autoJoinLoading: document.getElementById('auto-join-loading'),
                autoJoinGroup: document.getElementById('auto-join-group'),

                // 场景配置元素（卡片选择 + 说明区）
                scenarioCards: document.querySelectorAll('.scenario-card'),
                scenarioTitle: document.getElementById('scenario-title'),
                scenarioDesc: document.getElementById('scenario-desc'),
                scenarioStartBtn: document.getElementById('scenario-start-btn'),
                scenarioStartHint: document.getElementById('scenario-start-hint'),
                scenarioSelectedBadge: document.getElementById('scenario-selected-badge'),
                scenarioNetworkDot: document.getElementById('scenario-network-dot'),
                scenarioNetworkText: document.getElementById('scenario-network-text'),
                scenarioDeviceType: document.getElementById('scenario-device-type'),

                // 高级参数表单元素
                cellIdInput: document.getElementById('settings-cell-id'),
                cpTypeSelect: document.getElementById('settings-cp-type'),
                symbolTypeSelect: document.getElementById('settings-symbol-type'),
                sysmsgPeriodSelect: document.getElementById('settings-sysmsg-period'),
                sCfgIdxSelect: document.getElementById('settings-s-cfg-idx'),
                powInput: document.getElementById('settings-pow'),
                rangeOptSelect: document.getElementById('settings-range-opt'),
                acsenableSelect: document.getElementById('settings-acs-enable'),
                symbolTypeHint: document.getElementById('symbol-type-hint'),

                // 高级信息展示元素
                deviceCellId: document.getElementById('device-cell-id'),
                deviceCpType: document.getElementById('device-cp-type'),
                deviceSymbolType: document.getElementById('device-symbol-type'),
                deviceSysmsgPeriod: document.getElementById('device-sysmsg-period'),
                deviceSCfgIdx: document.getElementById('device-s-cfg-idx'),
                deviceRangeOpt: document.getElementById('device-range-opt'),
                deviceacsenable: document.getElementById('device-acs-enable'),
                deviceChipTemperature: document.getElementById('device-chip-temperature')
        };

            initThemeControls();

        const apiConfig = await initApiConfig();
        // 这里可以调用 API（例如使用 apiConfig.getDevBasicinfoUrl 发送请求）
        console.log('可使用的接口地址:', apiConfig.getDevBasicInfoUrl);

        // 然后尝试从网络获取
        init();

        // 初始状态禁用升级按钮
        disableUpgradeButton(true);

        // 初始化自动入网勾选框默认状态
        const autoJoinNetworkEl = document.getElementById('auto-join-network');
        if (autoJoinNetworkEl) {
                autoJoinNetworkEl.checked = false;
        }


        const autoRefreshToggle = document.getElementById('auto-refresh-toggle');

        // 从localStorage读取保存的状态，默认为false
        const savedAutoRefreshState = localStorage.getItem('autoRefreshEnabled');
        if (savedAutoRefreshState !== null) {
                isAutoRefreshEnabled = savedAutoRefreshState === 'true';
                autoRefreshToggle.checked = isAutoRefreshEnabled;

                // 如果之前是启用状态，恢复自动刷新
                if (isAutoRefreshEnabled) {
                        startAutoRefresh();
                }
        }

        // 为自动刷新开关添加事件监听
        autoRefreshToggle.addEventListener('change', (e) => {
                isAutoRefreshEnabled = e.target.checked;
                // 保存状态到localStorage
                localStorage.setItem('autoRefreshEnabled', isAutoRefreshEnabled);

                if (isAutoRefreshEnabled) {
                        startAutoRefresh();
                } else {
                        stopAutoRefresh();
                }
        });

        // updateAutoJoinVisibility();

});

// 停止 BSS 轮询
function stopBssPolling() {
    if (bssPollingInterval) {
        clearInterval(bssPollingInterval);
        bssPollingInterval = null;
    }
}

// 启动 bss 轮询
async function fetchAndRenderBssInfo() {
    try {
        const response = await fetch(API_CONFIG.showBssInfoGNodesUrl, {
            method: 'GET',
            headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
        });

        if (!response.ok) {
            console.warn('show_bss_info 请求失败:', response.status);
            return;
        }

        const result = await response.json();
        scanResults = result.data;
        filterScanResults();
        if (result.success && Array.isArray(result.data)) {
            console.info('show_bss_info 返回数据: ', result);
        } else {
            console.warn('show_bss_info 返回数据异常: ', result);
        }
    } catch (error) {
        console.error('获取 BSS 信息失败：', error);
    }
}

function startBssPolling() {
    stopBssPolling();
    setTimeout(() => {
        fetchAndRenderBssInfo(); // 立即加载一次
    }, 5000);
    bssPollingInterval = setInterval(fetchAndRenderBssInfo, 2000); //每2秒
}

/**
 * 根据设备类型更新自动入网复选框的可见性
 */
function updateAutoJoinVisibility() {
    const autoJoinGroup = document.getElementById('auto-join-group');
    const type2El = document.getElementById('current-device-type');
    const dev2Type = type2El.value;
    const deviceType = currentDevice.sub_role || (currentDevice.type === 0 ? 'GNode' : 'TNode');

    console.log('保存的设备类型:', deviceType, ' currentDeviceType:', dev2Type, ' currentType:', currentDevice.type);

    if (deviceType === 'GNode') {
        autoJoinGroup.style.display = 'none';
    } else {
        autoJoinGroup.style.display = 'block';
    }

}


// 初始化函数：读取配置并生成 API 地址
async function initApiConfig() {
  try {
    // 1. 读取 config.json
    const response = await fetch('config.json');
    if (!response.ok) throw new Error(`配置请求失败: ${response.status}`);
    const config = await response.json();

    // 2. 初始化 API_SERVER（从配置中读取）
    API_SERVER = {
        ip: config.serverip || 'localhost', // 默认为 localhost
        port: config.port || '8080'   // 默认为 8080
    };
 
    // 3. 动态生成 API_CONFIG（使用最新的 ip 和 port）
        const sessionToken = sessionStorage.getItem(AUTH_TOKEN_KEY) || '';
        API_CONFIG = {
      getDevBasicInfoUrl: `http://${API_SERVER.ip}:${API_SERVER.port}/api/v1/nodes/0/basicinfo`,
      getDevConnInfoUrl: `http://${API_SERVER.ip}:${API_SERVER.port}/api/v1/nodes/0/conninfo`,
          setNodeUrl: `http://${API_SERVER.ip}:${API_SERVER.port}/api/v1/nodes/0/basicinfo`,
          scanGNodesUrl: `http://${API_SERVER.ip}:${API_SERVER.port}/api/v1/nodes/0/scan`,
          showBssInfoGNodesUrl: `http://${API_SERVER.ip}:${API_SERVER.port}/api/v1/nodes/0/show_bss_info`,
      connectGNodeUrl: `http://${API_SERVER.ip}:${API_SERVER.port}/api/v1/nodes/0/connect`,
          getFirmwareInfoUrl: `http://${API_SERVER.ip}:${API_SERVER.port}/api/v1/getFirmwareInfo`,
      upgradeFirmwareUrl: `http://${API_SERVER.ip}:${API_SERVER.port}/api/v1/nodes/0/firmware/upgrade`,
      getUpgradeHistoryUrl: `http://${API_SERVER.ip}:${API_SERVER.port}/api/v1/getUpgradeHistory`,
      uploadFirmwareUrl: `http://${API_SERVER.ip}:${API_SERVER.port}/api/v1/nodes/0/firmware/upload`, // 上传API端点
      autoJoinNetworkUrl: `http://${API_SERVER.ip}:${API_SERVER.port}/api/v1/nodes/0/autoJoinNetwork`,
      timeSyncUrl: `http://${API_SERVER.ip}:${API_SERVER.port}/api/v1/nodes/0/timesync`,
            timeout: 10000,
            token: sessionToken || config.token || config.authToken || ''
    };

    // 维护独立的高级信息接口配置（可携带独立token）
    setAdvApiConfig(API_SERVER.ip, API_SERVER.port, API_CONFIG.token, API_CONFIG.timeout);

    console.log('API config :', API_CONFIG);
    return API_CONFIG; // 返回初始化后的配置，供其他逻辑使用

  } catch (error) {
    console.error('API 配置初始化失败:', error);
    // 失败时使用默认配置兜底
    API_CONFIG = {
      getDevBasicinfoUrl: 'http://localhost:8080/api/v1/nodes/0/basicinfo',
      getDevConninfoUrl: 'http://localhost:8080/api/v1/nodes/0/conninfo',
          setNodeUrl: 'http://localhost:8080/api/v1/nodes/0/basicinfo',
          scanGNodesUrl: 'http://localhost:8080/api/v1/nodes/0/scan',
      connectGNodeUrl: 'http://localhost:8080/api/v1/nodes/0/connect',
          getFirmwareInfoUrl: 'http://localhost:8080/api/v1/getFirmwareInfo',
      upgradeFirmwareUrl: 'http://localhost:8080/api/v1/nodes/0/firmware/upgrade',
      getUpgradeHistoryUrl: 'http://localhost:8080/api/v1/getUpgradeHistory',
      uploadFirmwareUrl: 'http://localhost:8080/api/v1/nodes/0/firmware/upload', // 上传API端点
      autojoinNetworkUrl: 'http://localhost:8080/api/v1/nodes/0/autojoinNetwork',
      timeSyncUrl: 'http://localhost:8080/api/v1/nodes/0/timesync',
            timeout: 10000,
            token: sessionStorage.getItem(AUTH_TOKEN_KEY) || ''
    };
                setAdvApiConfig('localhost', '8080', API_CONFIG.token, API_CONFIG.timeout);
    return API_CONFIG;
  }
}

// 禁用/启用升级按钮
function disableUpgradeButton(disable) {
    if (elements.upgradeButton) {
        elements.upgradeButton.disabled = disable;
        if (disable) {
            elements.upgradeButton.classList.add('opacity-50', 'cursor-not-allowed');
            elements.upgradeButton.title = '请先成功上传固件后再升级';
        } else {
            elements.upgradeButton.classList.remove('opacity-50', 'cursor-not-allowed');
            elements.upgradeButton.title = '';
        }
    }
}

// 页面可见性变化处理
function handleVisibilityChange() {
    if (document.hidden) {
        // 页面不可见时停止刷新
        console.log('页面不可见，暂停自动刷新');
        stopAutoRefresh();
    } else {
        // 页面可见时检查是否需要重新启动刷新
        const deviceDisplaySection = document.getElementById('device-display');
        if (deviceDisplaySection && !deviceDisplaySection.classList.contains('hidden') && isAutoRefreshEnabled) {
            console.log('页面可见，重新启动自动刷新');
            startAutoRefresh();
        }
    }
}

// 更新刷新状态指示器
function updateRefreshStatusIndicator(isEnabled) {
    const statusIndicator = document.getElementById('refresh-status');
    if (statusIndicator) {
        if (isEnabled) {
            statusIndicator.classList.remove('off');
            statusIndicator.innerHTML = '<i class="fa fa-refresh animate-spin"></i>开启';
            statusIndicator.title = '自动刷新已开启，每5秒刷新一次';
        } else {
            statusIndicator.classList.add('off');
            statusIndicator.innerHTML = '<i class="fa fa-pause"></i>关闭';
            statusIndicator.title = '自动刷新已关闭';
        }
    }
}

// 初始化自动刷新开关
function initAutoRefreshToggle() {
    const toggle = document.getElementById('auto-refresh-toggle');

    if (toggle) {
        // 默认关闭状态
        toggle.checked = false;
        isAutoRefreshEnabled = false;

        // 添加切换事件监听
        toggle.addEventListener('change', function() {
            isAutoRefreshEnabled = this.checked;

            if (isAutoRefreshEnabled) {
                console.log('自动刷新已开启');
                startAutoRefresh();
                showNotification('自动刷新', '已开启自动刷新功能', false);
            } else {
                console.log('自动刷新已关闭');
                stopAutoRefresh();
                showNotification('自动刷新', '已关闭自动刷新功能', false);
            }
        });
    }
}

// 初始化函数
function init() {
    initChannelSelect();
    setupEventListeners();
    updateSymbolTypeOptions();
    fetchDeviceInfo(); // 页面加载时请求设备信息

    // 初始化自动刷新开关状态
    initAutoRefreshToggle();

    updateManualScanButtonState();
    syncFooterWithCurrentPage();
}

// 格式化本地时间为 "YYYY-MM-DD HH:mm:ss"
function formatLocalTimeForSync(date = new Date()) {
    const pad = (num) => String(num).padStart(2, '0');
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// 时间同步：使用本地时间同步
async function syncTimeWithServer() {
    if (!API_CONFIG || !API_CONFIG.timeSyncUrl) return;

    try {
        var syncHeaders = buildAuthHeaders({
            'Content-Type': 'application/json'
        });
        const res = await fetchWithTimeoutCompat(API_CONFIG.timeSyncUrl, {
            method: 'POST',
            headers: syncHeaders,
            body: JSON.stringify({ time: formatLocalTimeForSync() })
        }, API_CONFIG.timeout);
        if (!res.ok) throw new Error(`时间同步失败: ${res.status}`);
        const result = await res.json();
        if (result && result.status && result.status !== 'success') {
            throw new Error(result.message || '时间同步失败');
        }
    } catch (err) {
        console.warn('[TimeSync] 时间同步失败:', err.message || err);
    }
}

/**
 * 根据当前可见页面同步页脚样式
 */
function syncFooterWithCurrentPage() {
    const visibleSection = Array.from(elements.pageSections || []).find(section => !section.classList.contains('hidden'));
    const pageId = visibleSection ? visibleSection.id : 'device-display';
    updateFooterMode(pageId);
}

/**
 * 更新页脚模式（设备设置页固定高度）
 */
function updateFooterMode(pageId) {
    const footer = document.getElementById('site-footer');
    document.body.dataset.page = pageId;
    if (footer) {
        footer.classList.toggle('py-6', pageId !== 'scenario-test');
    }
}

// 设置事件监听器
function setupEventListeners() {
    // 移动端菜单切换
    addEventListenerIf(elements.mobileMenuButton, 'click', () => {
        if (elements.mobileMenu) {
            elements.mobileMenu.classList.toggle('hidden');
        }
    });

    // 导航链接点击
    (elements.navLinks || []).forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('href').substring(1);
            switchPage(targetId);
        });
    });

    // 关闭通知
    addEventListenerIf(elements.closeNotification, 'click', () => {
        if (elements.notification) {
            elements.notification.classList.add('translate-x-full');
        }
    });

    // 手动扫描
    addEventListenerIf(elements.manualScan, 'click', handleManualScan);

    // 保存设置（基础/高级）
    addEventListenerIf(elements.settingsBasicSubmit, 'click', handleSaveBasicSettings);
    addEventListenerIf(elements.settingsAdvancedSubmit, 'click', handleSaveAdvancedSettings);
    addEventListenerIf(elements.deviceSettingsForm, 'submit', (e) => e.preventDefault());

    // 重试加载
    addEventListenerIf(elements.retryLoad, 'click', fetchDeviceInfo);
    
    // 节点扫描相关事件
    addEventListenerIf(elements.scanGnodesButton, 'click', scanGNodes);
    addEventListenerIf(elements.backToSettingsButton, 'click', () => {
        switchPage('device-settings');
    });
    
    // 升级管理相关事件
    addEventListenerIf(elements.checkUpdateButton, 'click', checkForUpdates);
    addEventListenerIf(elements.upgradeButton, 'click', confirmUpgrade);
    addEventListenerIf(elements.uploadButton, 'click', uploadFirmware);
    
    // 监听文件选择
    addEventListenerIf(elements.firmwareFileInput, 'change', function(e) {
        if (elements.selectedFileName && e.target.files.length > 0) {
            elements.selectedFileName.textContent = e.target.files[0].name;
            elements.selectedFileName.classList.remove('text-gray-500');
            elements.selectedFileName.classList.add('text-primary');
        }
    });
    
    // 新增设备类型变更监听器，确保设置表单与设备信息同步
    addEventListenerIf(elements.deviceTypeSelect, 'change', function() {
        // 当设置中的设备类型变更时，临时更新currentDevice并刷新显示
        const newType = this.value;
        console.log('保存的设备类型:', this.value);
        currentDevice.type = newType === 'GNode' ? 0 : 1;
        updateDeviceDisplay();
        updateManualScanButtonState();
    });

    // 信道变更监听 - 根据信道更新带宽选项
    addEventListenerIf(elements.channelSelect, 'change', () => {
        updateBandwidthOptionsByChannel();
    });

    // 物理带宽变更监听 - 根据带宽更新信道选项
    addEventListenerIf(elements.physicalBandwidthSelect, 'change', () => {
        updateChannelOptionsByBandwidth();
        updateServiceBandwidthOptions();
        validateBandwidthSettings();
    });

    // 业务带宽变更监听
    addEventListenerIf(elements.serviceBandwidthSelect, 'change', validateBandwidthSettings);

    // 高级参数联动
    addEventListenerIf(elements.cpTypeSelect, 'change', () => updateSymbolTypeOptions());
    addEventListenerIf(elements.sCfgIdxSelect, 'change', () => updateSymbolTypeOptions());

    // 场景配置：卡片选择与开始测试
    initScenarioSelection();

    document.addEventListener('visibilitychange', handleVisibilityChange);

    const autoJoinNetworkEl = document.getElementById('auto-join-network');
    if (autoJoinNetworkEl) {
        autoJoinNetworkEl.addEventListener('change', handleAutoJoinChange);
    }
}

/**
 * 初始化场景配置卡片交互逻辑
 */
function initScenarioSelection() {
    const cards = elements.scenarioCards;
    if (!cards || cards.length === 0) return;

    cards.forEach(card => {
        card.addEventListener('click', () => {
            const scenarioId = card.dataset.scenario || null;
            setScenarioSelection(scenarioId);
        });
    });

    addEventListenerIf(elements.scenarioStartBtn, 'click', () => {
        if (!selectedScenarioId) return;
        const config = SCENARIO_TESTS[selectedScenarioId];
        if (!config) return;

        const apiUrl = ADV_API_CONFIG[config.apiKey];
        postScenarioTest(apiUrl, config.name, elements.scenarioStartBtn);
    });

    // 初始化默认状态
    setScenarioSelection(null);
    updateScenarioDeviceStatus();
}

/**
 * 设置当前选中的场景测试
 */
function setScenarioSelection(scenarioId) {
    selectedScenarioId = scenarioId && SCENARIO_TESTS[scenarioId] ? scenarioId : null;

    (elements.scenarioCards || []).forEach(card => {
        const isActive = selectedScenarioId && card.dataset.scenario === selectedScenarioId;
        card.classList.toggle('scenario-card--selected', isActive);
        card.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    updateScenarioInfo();
}

/**
 * 更新右侧说明区信息
 */
function updateScenarioInfo() {
    const info = selectedScenarioId ? SCENARIO_TESTS[selectedScenarioId] : null;

    if (!elements.scenarioTitle || !elements.scenarioDesc || !elements.scenarioStartBtn) return;

    if (!info) {
        elements.scenarioTitle.textContent = '';
        elements.scenarioTitle.classList.add('hidden');
        elements.scenarioDesc.textContent = '请选择左侧测试类型，系统将加载对应说明并准备测试环境。';
        elements.scenarioStartBtn.disabled = true;
        elements.scenarioStartBtn.classList.add('btn-disabled');
        if (elements.scenarioSelectedBadge) {
            elements.scenarioSelectedBadge.textContent = '未选择';
        }
        if (elements.scenarioStartHint) {
            elements.scenarioStartHint.textContent = '';
            elements.scenarioStartHint.classList.add('hidden');
        }
        return;
    }

    elements.scenarioTitle.textContent = info.name;
    elements.scenarioTitle.classList.remove('hidden');
    elements.scenarioDesc.textContent = info.description;
    elements.scenarioStartBtn.disabled = false;
    elements.scenarioStartBtn.classList.remove('btn-disabled');

    if (elements.scenarioSelectedBadge) {
        elements.scenarioSelectedBadge.textContent = '已选择';
    }
    if (elements.scenarioStartHint) {
        elements.scenarioStartHint.textContent = '';
        elements.scenarioStartHint.classList.add('hidden');
    }
}

/**
 * 判断是否已组网（基于 currentDevice 内的连接信息）
 */
function getNetworkStatusFromCurrentDevice() {
    const listFields = [
        currentDevice.connected_devices,
        currentDevice.conn_list,
        currentDevice.connected_list,
        currentDevice.peer_list,
        currentDevice.bss_list
    ];

    const countFields = [
        currentDevice.connected_num,
        currentDevice.conn_num,
        currentDevice.peer_num,
        currentDevice.bss_num,
        currentDevice.sta_num
    ];

    const flagFields = [
        currentDevice.connected,
        currentDevice.linked,
        currentDevice.link_status,
        currentDevice.network_ok,
        currentDevice.connected_flag,
        currentDevice.conn_state
    ];

    const hasList = listFields.some(list => Array.isArray(list) && list.length > 0);
    const hasCount = countFields.some(count => typeof count === 'number' && count > 0);
    const hasFlag = flagFields.some(flag => flag === 1 || flag === true);

    if (hasList || hasCount || hasFlag) return true;

    // 兜底：若当前设备中无明确信息，则参考已连接列表
    return Array.isArray(connectedDevices) && connectedDevices.length > 0;
}

/**
 * 更新场景配置区设备状态显示
 */
function updateScenarioDeviceStatus() {
    const dot = elements.scenarioNetworkDot;
    const text = elements.scenarioNetworkText;
    const typeEl = elements.scenarioDeviceType;

    if (dot && text) {
        const isConnected = getNetworkStatusFromCurrentDevice();
        dot.classList.toggle('bg-success', isConnected);
        dot.classList.toggle('bg-danger', !isConnected);
        text.textContent = isConnected ? '已组网' : '未组网';
    }

    if (typeEl) {
        const rawType = currentDevice.slb_role || currentDevice.sub_role || currentDevice.type;
        let displayType = '未知';

        if (typeof rawType === 'string') {
            const lower = rawType.toLowerCase();
            if (lower.includes('g')) displayType = 'G';
            else if (lower.includes('t')) displayType = 'T';
            else displayType = rawType.toUpperCase();
        } else if (rawType === 0) {
            displayType = 'G';
        } else if (rawType === 1) {
            displayType = 'T';
        }

        typeEl.textContent = displayType;
    }
}

// 根据带宽更新信道选项
function updateChannelOptionsByBandwidth() {
    const physicalBandwidthSelect = elements.physicalBandwidthSelect;
    const channelSelect = elements.channelSelect;
    const bandwidthChannelHint = document.getElementById('bandwidth-channel-hint');

    if (!physicalBandwidthSelect || !channelSelect) {
        return;
    } 

    const selectedBandwidth = parseInt(physicalBandwidthSelect.value) || 20;

    // 获取适用的信道规则
    let availableChannels = [];

    // 根据选择的带宽获取支持的信道
    if (BANDWIDTH_CHANNEL_RULES[selectedBandwidth]) {
        availableChannels = BANDWIDTH_CHANNEL_RULES[selectedBandwidth];
    } else {
        // 如果带宽值不在规则中， 默认使用20M的信道
        availableChannels = BANDWIDTH_CHANNEL_RULES[20];
    }
    
    // 根据当前选中的信道
    const currentSelected = parseInt(channelSelect.value) || availableChannels[0];

    // 清空现有选项
    channelSelect.innerHTML = '';

    // 添加新的信道选项
    availableChannels.forEach(channel => {
        const option = document.createElement('option');
        option.value = channel;
        option.textContent = channel;
        if (channel === currentSelected) {
            option.selected = true;
        }
        channelSelect.appendChild(option);
    });

    // 如果当前选中的信道不在新选项中， 选择第一个选项
    if (!availableChannels.includes(currentSelected)) {
        channelSelect.value = availableChannels[0];
    }

    // 显示或隐藏限制提示
    if (bandwidthChannelHint) {
        if (selectedBandwidth === 40) {
            bandwidthChannelHint.textContent = '当前带宽40M下, 信道791、2291、2813不可用';
            bandwidthChannelHint.classList.remove('hidden');
        } else if (selectedBandwidth === 80) {
            bandwidthChannelHint.textContent = '当前带宽80M下, 只显示支持的信道';
            bandwidthChannelHint.classList.remove('hidden');
        } else {
            bandwidthChannelHint.classList.add('hidden');
        }
    }

    //重新根据信道更新带宽选项（确保一致性）
    updateBandwidthOptionsByChannel();
}

// 根据信道更新带宽选项
function updateBandwidthOptionsByChannel() {
    const channelSelect = elements.channelSelect;
    const physicalBandwidthSelect = elements.physicalBandwidthSelect;
    const bandwidthRestrictionHint = document.getElementById('bandwidth-restriction-hint');

    if (!channelSelect || !physicalBandwidthSelect) {
        return;
    }

    const selectedChannel = parseInt(channelSelect.value);
    
    // 获取适用的带宽规则
    let availableBandwidths = [];
    let showHint = false;

    // 检查是否有特定的信道规则
    for (const [channelsStr, bandwidths] of Object.entries(CHANNEL_BANDWIDTH_RULES)) {
        if (channelsStr === 'default') continue;

        const channels = channelsStr.split(',').map(ch => parseInt(ch));
        if (channels.includes(selectedChannel)) {
            availableBandwidths = bandwidths;
            showHint = true;
            break;
        }
    }

    // 如果没有找到特定规则, 使用默认规则
    if (availableBandwidths.length === 0) {
        availableBandwidths = CHANNEL_BANDWIDTH_RULES.default;
        showHint = false;
    }

    // 保存当前选中的值
    const currentSelected = parseInt(physicalBandwidthSelect.value) || availableBandwidths[0];

    // 检查当前选中的带宽是否在可用带宽中
    let finalSelected = currentSelected;
    if (!availableBandwidths.includes(currentSelected)) {
        // 如果不在， 选择可用带宽中的最大值
        finalSelected = Math.max.apply(null, availableBandwidths);
        showHint = true; // 显示提示， 因为带宽被自动调整了
    }

    // 清空现有选项
    physicalBandwidthSelect.innerHTML = '';

    // 添加新的带宽选项
    availableBandwidths.forEach(bandwidth => {
        const option = document.createElement('option');
        option.value = bandwidth;
        option.textContent = `${bandwidth} M`;
        if (bandwidth === finalSelected) {
            option.selected = true;
        }
        physicalBandwidthSelect.appendChild(option);
    });

    // 显示或隐藏限制提示
    if (bandwidthRestrictionHint) {
        if (showHint) {
            bandwidthRestrictionHint.textContent = `当前信道${selectedChannel}限制带宽为${availableBandwidths.join('M、')}M`;
            bandwidthRestrictionHint.classList.remove('hidden');
        } else {
            bandwidthRestrictionHint.classList.add('hidden');
        }
    }

    // 更新业务带宽选项
    updateServiceBandwidthOptions();

    // 重新验证带宽设置
    validateBandwidthSettings();
}

// 根据物理带宽更新业务带宽选项
function updateServiceBandwidthOptions() {
    const physicalBandwidthSelect = elements.physicalBandwidthSelect;
    const serviceBandwidthSelect = elements.serviceBandwidthSelect;

    if (!physicalBandwidthSelect || !serviceBandwidthSelect) {
        return;
    }

    const maxPhysicalBandwidth = parseInt(physicalBandwidthSelect.value) || 20;

    // 保存当前选中的值
    const currentSelected = parseInt(serviceBandwidthSelect.value) || Math.min(80, maxPhysicalBandwidth);

    // 清空现有选项
    serviceBandwidthSelect.innerHTML = '';

    // 固定的业务带宽选项： 20M， 40M, 80M
    const availableServiceBandwidths = [20, 40, 80];

    // 添加不超过物理带宽的业务带宽选项
    availableServiceBandwidths.forEach(bandwidth => {
        if (bandwidth <= maxPhysicalBandwidth) {
            const option = document.createElement('option');
            option.value = bandwidth;
            option.textContent = `${bandwidth} M`;
            if (bandwidth === currentSelected) {
                option.selected = true;
            }
            serviceBandwidthSelect.appendChild(option);
        }
    });
    
    // 如果当前选中的值不在新选项中，选择最大可用值
    const availableOptions = Array.from(serviceBandwidthSelect.options).map(opt => parseInt(opt.value));
    if (!availableOptions.includes(currentSelected)) {
        if (availableOptions.length > 0) {
            // 选择最大的可用值
            const maxAvailable = Math.max.apply(null, availableOptions);
            serviceBandwidthSelect.value = maxAvailable;
        }
    }

    // 重新验证带宽设置
    validateBandwidthSettings();
}

async function handleAutoJoinChange(event) {
    const autoJoinNetworkEl = document.getElementById('auto-join-network');
    const autoJoinLoadingEl = document.getElementById('auto-join-loading');

    if (!autoJoinNetworkEl || !autoJoinLoadingEl || autoJoinRequestInProgress) return;

    const autoJoinFlag = autoJoinNetworkEl.checked ? 1 : 0;

    console.log('自动入网状态改变,发送请求', { aj_flag: autoJoinFlag });
    // 设置请求进行中标志
    autoJoinRequestInProgress = true;

    // 显示加载状态
    autoJoinNetworkEl.disabled = true;
    autoJoinLoadingEl.classList.remove('hidden');

    try {
        // 准备发送的数据 - 只包含flag
        const postData = {
            aj_flag: autoJoinFlag
        };

        console.log('发送自动入网请求到：', API_CONFIG.autoJoinNetworkUrl);
        console.log('请求数据：', postData);

        // 创建超时控制器
        // 发送API请求到专用端点
        const response = await fetchWithTimeoutCompat(API_CONFIG.autoJoinNetworkUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(postData)
        }, API_CONFIG.timeout);

        if (!response.ok) {
            throw new Error(`HTTP错误: ${response.status} ${response.statusText}`);
        }

        // 解析响应（不关心具体内容， 只检查HTTP状态）
        const result = await response.json(); 
        console.log('自动入网请求响应：', result);

        // 更新当前设备信息中的自动入网状态
        currentDevice.auto_join = autoJoinFlag === 1;
        currentDevice.aj_flag = autoJoinFlag;

        // 显示成功通知
        showNotification('自动入网', `自动入网${autoJoinFlag === 1 ? '开启' : '关闭'}`, false);

    } catch (error) {
        console.error('自动入网请求失败：', error);

        // 根据错误类型显示不同信息
        let errorMessage = '自动入网设置失败';
        if (error.name === 'AbortError') {
            errorMessage = `请求超时 (${API_CONFIG.timeout/1000}秒)`;
        } else if (error.message.includes('Failed to fetch')) {
            errorMessage = '网络连接失败， 请检查API服务是否可用';
        } else {
            errorMessage = `自动入网设置失败： ${error.message}`;
        }

        // 恢复勾选框状态
        autoJoinNetworkEl.checked = !autoJoinNetworkEl.checked;

        // 显示错误通知
        showNotification('自动入网', errorMessage, true);
    } finally {
        autoJoinNetworkEl.disabled = false;
        autoJoinLoadingEl.classList.add('hidden');
        autoJoinRequestInProgress = false;
    }
}

// 检查更新
async function checkForUpdates() {
    if (!elements.checkUpdateButton || !elements.checkUpdateLoading) return;
    
    // 显示加载状态
    elements.checkUpdateButton.disabled = true;
    elements.checkUpdateLoading.classList.remove('hidden');
    
    try {
        const response = await fetchWithRetry(API_CONFIG.getFirmwareInfoUrl, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            timeout: API_CONFIG.timeout
        });
        
        if (!response.ok) {
            throw new Error(`HTTP错误: ${response.status} ${response.statusText}`);
        }
        
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.message || '获取固件信息失败');
        }
        
        const firmwareVersions = result.data;
        //updateVersionInfo();
        
        // 显示通知
        if (firmwareVersions.current !== firmwareVersions.latest) {
            showNotification('检查更新', `发现新版本 ${firmwareVersions.latest}`, false);
        } else {
            showNotification('检查更新', '当前已是最新版本', false);
        }
        
    } catch (error) {
        console.error('检查更新失败:', error);
        showNotification('检查更新失败', error.message, true);
    } finally {
        // 恢复状态
        elements.checkUpdateButton.disabled = false;
        elements.checkUpdateLoading.classList.add('hidden');
    }
}

// 确认升级
function confirmUpgrade() {
    if (confirm(`确定要升级吗？\n升级过程中设备将暂时无法使用，请勿断电。`)) {
        performUpgrade();
    }
}

// 执行升级
async function performUpgrade() {
    if (!elements.upgradeButton || !elements.upgradeLoading) return;
    
    // 显示加载状态
    elements.upgradeButton.disabled = true;
    elements.uploadButton.disabled = true;
    elements.upgradeLoading.classList.remove('hidden');
    
    try {
        showNotification('升级中', `正在升级...`, false, 0);
        
        // 创建超时控制器
        // 发送真实POST请求到升级API
        const response = await fetchWithTimeoutCompat(API_CONFIG.upgradeFirmwareUrl, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                // 可添加认证头
                // 'Authorization': `Bearer ${getAuthToken()}`
            },
            body: JSON.stringify({
                deviceId: currentDevice.mac || 'unknown'
            })
        }, API_CONFIG.timeout * 3);
        
        // 检查HTTP响应状态
        if (!response.ok) {
            throw new Error(`HTTP错误: ${response.status} ${response.statusText}`);
        }
        
        // 解析响应
        const result = await response.json();
        
        // 验证业务逻辑成功
        if (!result.status) {
            throw new Error(result.message || '升级失败，服务器返回错误');
        }
        
        // 更新UI
        updateDeviceDisplay();
        
        // 显示成功通知
        showNotification('升级成功', `设备已成功升级版本\n设备将重启以应用更新`, false);
        
    } catch (error) {
        console.error('升级失败:', error);
        
        // 记录失败历史
        upgradeHistory.unshift({
            version: firmwareVersions.latest,
            date: new Date().toISOString().split('T')[0],
            status: "失败"
        });
        initUpgradeHistoryTable();
        
        // 详细错误提示
        let errorMsg = `升级过程中发生错误: ${error.message}`;
        if (error.name === 'AbortError') {
            errorMsg = `升级超时（${API_CONFIG.timeout*3/1000}秒），请检查设备连接`;
        } else if (error.message.includes('Failed to fetch')) {
            errorMsg = '网络连接失败，请检查API服务是否可用';
        }
        
        showNotification('升级失败', errorMsg, true);
    } finally {
        // 恢复状态
        elements.upgradeButton.disabled = false;
        elements.uploadButton.disabled = false;
        elements.upgradeLoading.classList.add('hidden');
    }
}

// 上传固件 - 改为真实POST请求实现
async function uploadFirmware() {
    const fileInput = elements.firmwareFileInput;
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        showNotification('上传失败', '请先选择固件文件', true);
        return;
    }
    
    if (!elements.uploadButton || !elements.uploadLoading) return;
    
    // 获取选中的文件
    const firmwareFile = fileInput.files[0];
    
    // 文件验证
    const allowedTypes = ['application/octet-stream', 'application/zip', 'application/x-zip-compressed'];
    const maxSizeMB = 30; // 30MB
    
    if (!allowedTypes.includes(firmwareFile.type) && !firmwareFile.name.endsWith('.bin')) {
        showNotification('文件类型错误', '请上传正确的固件文件（.bin或压缩文件）', true);
        return;
    }
    
    if (firmwareFile.size > maxSizeMB * 1024 * 1024) {
        showNotification('文件过大', `固件文件不能超过${maxSizeMB}MB`, true);
        return;
    }
    
    // 显示加载状态和进度条
    elements.uploadButton.disabled = true;
    elements.upgradeButton.disabled = true;
    elements.uploadLoading.classList.remove('hidden');
    
    // 显示上传进度条
    if (elements.uploadProgressContainer && elements.uploadProgressBar) {
        elements.uploadProgressContainer.classList.remove('hidden');
        elements.uploadProgressBar.style.width = '0%';
    }
    
    try {
        // 显示上传中通知
        showNotification('上传中', `正在上传 ${firmwareFile.name}...`, false, 0);
        
        // 创建FormData对象，用于文件上传
        const formData = new FormData();
        formData.append('firmware', firmwareFile);
        // 可以添加其他需要的参数
        formData.append('deviceId', currentDevice.mac || 'unknown');
        
        // 发送真实POST请求
        const response = await fetch(API_CONFIG.uploadFirmwareUrl, {
            method: 'POST',
            headers: buildAuthHeaders(),
            body: formData, // 使用FormData而非JSON，适合文件上传
            // 注意： 上传文件时不要设置Content-Type为application/json，
            //浏览器会自动设置为 multipart/form-data 并添加边界
            timeout: API_CONFIG.timeout * 2, // 文件上传超时时间延长一倍
            //添加进度监听
            onUploadProgress: (progressEvent) => {
                if (progressEvent.lengthComputable && progressBar) {
                    const percentCompleted = Math.round(
                        (progressEvent.loaded * 100) / progressEvent.total
                    );
                    progressBar.style.width = `${percentCompleted}%`;
                }
            }
        });
        
        // 解析响应数据
        const result = await response.json();
        
        // 验证响应
        if (!response.ok) {
            throw new Error(result.message || `上传失败: ${response.status} ${response.statusText}`);
        }
        
        if (!result.status) {
            throw new Error(result.message || '服务器拒绝了上传请求');
        }
        
        // 从响应中获取新版本信息
        const newVersion = (result.data && result.data.version) || 
                          extractVersionFromFileName(firmwareFile.name) || 
                          '自定义版本';
        
        
        // 延迟后隐藏进度条
        setTimeout(() => {
        }, 1000);
        
        // 显示成功通知
        showNotification('上传成功', `固件 ${firmwareFile.name} 已上传成功，可以开始升级了`, false);
        disableUpgradeButton(false);
        // 清空文件选择
        fileInput.value = '';
        if (elements.selectedFileName) {
            elements.selectedFileName.textContent = '未选择文件';
            elements.selectedFileName.classList.remove('text-primary');
            elements.selectedFileName.classList.add('text-gray-5');
        }

        //隐藏文件信息
        if (elements.fileInfoContainer) {
            elements.fileInfoContainer.classList.add('hidden');
        }
        
    } catch (error) {
        console.error('固件上传失败:', error);
        
        // 隐藏进度条
        if (progressContainer) elements.uploadProgressContainer.classList.add('hidden');
        
        // 更详细的错误提示
        let errorMsg = `上传过程中发生错误: ${error.message}`;
        if (error.name === 'AbortError') {
            errorMsg = `上传超时（${API_CONFIG.timeout*2/1000}秒），请检查网络或文件大小`;
        } else if (error.message.includes('Failed to fetch')) {
            errorMsg = '网络连接失败，请检查API服务是否可用';
        }
        
        showNotification('上传失败', errorMsg, true);
    } finally {
        // 恢复状态
        elements.uploadButton.disabled = false;
        elements.upgradeButton.disabled = false;
        elements.uploadLoading.classList.add('hidden');

    }
}

// 辅助函数：从文件名提取版本号
function extractVersionFromFileName(fileName) {
    const versionMatch = fileName.match(/v\d+\.\d+\.\d+/);
    return versionMatch ? versionMatch[0] : null;
}

// 带重试的fetch函数
async function fetchWithRetry(url, options, retries = 2, delay = 1000) {
    try {
        const response = await fetchWithTimeoutCompat(url, options, options.timeout || API_CONFIG.timeout);
        return response;
    } catch (error) {
        if (retries > 0 && !(error instanceof TypeError) && error.name !== 'AbortError') {
            // 等待一段时间后重试
            await new Promise(resolve => setTimeout(resolve, delay));
            return fetchWithRetry(url, options, retries - 1, delay * 2); // 指数退避
        }
        throw error;
    }
}
// 加载设备信息 - 增强网络错误处理
function initChannelSelect() {
    const channelSelect = elements.channelSelect;
    if (!channelSelect) return;

    channelSelect.innerHTML = '';

    // 根据当前带宽确定可用信道
    const currentBandwidth = parseInt(elements.physicalBandwidthSelect ? elements.physicalBandwidthSelect.value : '', 10) || 20;
    let availableChannels = BANDWIDTH_CHANNEL_RULES[currentBandwidth] || BANDWIDTH_CHANNEL_RULES[20];

    availableChannels.forEach(channel => {
        const option = document.createElement('option');
        option.value = channel;
        option.textContent = channel;
        if (currentDevice.channel && channel.toString() === currentDevice.channel.toString()) {
            option.selected = true;
        }
        channelSelect.appendChild(option);
    });

    // 如果没有选中任何选项，选择第一个
    if (!currentDevice.channel && channelSelect.options.length > 0) {
        channelSelect.value = channelSelect.options[0].value;
    }

    // 初始化后根据当前信道更新带宽选项
    setTimeout(() => {
        updateBandwidthOptionsByChannel();
    }, 1);
}

function updateLastRefreshTime() {
    const now = new Date();
    const timeString = now.toLocaleDateString('zh-CN', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    // 如果有时间显示元素， 更新它
    if (elements.lastUpdateTimeEl) {
        elements.lastUpdateTimeEl.textContent = `最后更新: ${timeString}`;
    } else {
        // 如果没有时间显示元素， 在设备信息卡片中添加一个  
        const deviceInfoCard = document.getElementById('device-info-card');  
        if (deviceInfoCard && !document.getElementById('auto-refresh-time')) {
            const timeElement = document.createElement('div');
            timeElement.id = 'auto-refresh-time';
            timeElement.className = 'text-xs text-gray-500 mt-2 text-right';
            timeElement.textContent = `自动刷新: ${timeString}`;
            deviceInfoCard.appendChild(timeElement);
        } else if (document.getElementById('auto-refresh-time')) {
            document.getElementById('auto-refresh-time').textContent = `自动刷新: ${timeString}`;
        } 
    }
}

// 手动扫描
async function handleManualScan() {
    const typeEl = document.getElementById('settings-device-type');
    const deviceType = typeEl.value;  
    console.log('保存的设备类型:', deviceType);

    // 根据设备类型跳转到不同页面
    if (deviceType === 'tnode') {
        // 终端节点 - 跳转到节点扫描页面，添加延迟确保UI更新完成
        setTimeout(() => {
            console.log('跳转到节点扫描页面'); // 调试日志
            switchPage('node-scan');
        }, 5);
        showNotification('设置已保存', '请扫描并连接到G节点', false);
    } else {
        // 主网关 - 跳转到设备信息页面
        setTimeout(() => {
            showNotification('切换页面刷新缓存中', `请稍等...`, false);
            switchPage('device-display');
        }, 30);
        
        showNotification('操作成功', '设置已保存并应用', false);
    }
}

async function fetchDeviceInfo() {
    await syncTimeWithServer();
    // 显示加载状态
    if (elements.deviceLoading) elements.deviceLoading.classList.remove('hidden');
    if (elements.deviceErrorHint) elements.deviceErrorHint.classList.add('hidden');
    if (elements.deviceInfoCard) elements.deviceInfoCard.classList.add('hidden');
    if (elements.connectedDevicesCard) elements.connectedDevicesCard.classList.add('hidden');
    if (elements.signalTrendCard) elements.signalTrendCard.classList.add('hidden');

    try {
        // 同时请求两个API，添加超时控制
        const [basicInfoResponse, connInfoResponse] = await Promise.all([
            fetch(API_CONFIG.getDevBasicInfoUrl, { 
                method: 'GET',
                headers: buildAuthHeaders({
                    'Content-Type': 'application/json'
                })
            }).then(function (response) {
                return response;
            }),
            fetch(API_CONFIG.getDevConnInfoUrl, { 
                method: 'GET',
                headers: buildAuthHeaders({
                    'Content-Type': 'application/json'
                })
            }).then(function (response) {
                return response;
            })
        ]);

        // 检查响应状态
        if (!basicInfoResponse.ok) {
            throw new Error(`HTTP错误: ${basicInfoResponse.status}`);
        }
        if (!connInfoResponse.ok) {
            throw new Error(`HTTP错误: ${connInfoResponse.status}`);
        }

        // 解析响应数据
        const basicInfo = await basicInfoResponse.json();
        const connInfo = await connInfoResponse.json();

        // 验证数据有效性
        if (!basicInfo || !basicInfo.data) {
            throw new Error('基础信息返回为空');
        }
        if (basicInfo.status && basicInfo.status !== true && basicInfo.status !== 'success') {
            throw new Error(basicInfo.message || '基础信息返回异常');
        }
        if (!connInfo || !connInfo.data) {
            throw new Error('连接信息返回为空');
        }
        if (connInfo.status && connInfo.status !== true && connInfo.status !== 'success') {
            throw new Error(connInfo.message || '连接信息返回异常');
        }

        // 合并设备信息
        // Edge42 兼容：避免对象展开语法，使用 Object.assign 合并对象。
        currentDevice = Object.assign({}, basicInfo.data || {});
        // 从basicinfo中读取flag值，并转换为布尔值
        currentDevice.auto_join = basicInfo.data && basicInfo.data.aj_flag === 1;
        connectedDevices = connInfo.data || [];
        
        // 为每个设备添加历史信号数据
        connectedDevices.forEach(device => {
            // 获取当前时间范围
            const activeTimeBtn = document.querySelector('.time-range-btn.bg-primary');
            const timeRangeText = activeTimeBtn ? activeTimeBtn.textContent : '6小时';
            const hours = parseInt(timeRangeText);
            // 这里可以添加处理逻辑
        });
        
        usingDefaultData = false;

        // 追加获取高级信息，使用独立接口（静默 + 跳过UI刷新，避免重复绘制）
        await fetchAdvancedInfo(true, true);

        // 隐藏默认数据指示器
        if (elements.deviceInfoDefaultIndicator) elements.deviceInfoDefaultIndicator.classList.add('hidden');
        if (elements.connectedDevicesDefaultIndicator) elements.connectedDevicesDefaultIndicator.classList.add('hidden');

        // 隐藏加载状态，显示内容
        if (elements.deviceLoading) elements.deviceLoading.classList.add('hidden');
        if (elements.deviceInfoCard) elements.deviceInfoCard.classList.remove('hidden');
        if (elements.connectedDevicesCard) elements.connectedDevicesCard.classList.remove('hidden');
        if (elements.signalTrendCard) elements.signalTrendCard.classList.remove('hidden');

        // 更新UI显示，确保设备类型同步
        updateDeviceDisplay();
        initConnectedDevicesTable();
        initChannelSelect();
        populateSettingsForm();

        // 更新自动入网勾选框状态
        updateAutoJoinCheckbox();
       
		//数据更新后更新显示
		updateAutoJoinVisibility(); 
        // 显示成功通知
        showNotification('操作成功', '设备信息已更新', false);
        updateLastRefreshTime();
        
    } catch (error) {
        console.error('获取设备信息失败:', error);
        
        // 清除超时
        // 显示错误提示
        if (elements.deviceLoading) elements.deviceLoading.classList.add('hidden');
        if (elements.deviceErrorHint) elements.deviceErrorHint.classList.remove('hidden');
        
        // 根据错误类型显示不同信息
        let errorMessage = '无法获取设备信息，已使用默认数据';
        if (error.name === 'AbortError') {
            errorMessage = `请求超时（${API_CONFIG.timeout/1000}秒），已使用默认数据`;
        } else if (error.message.includes('Failed to fetch')) {
            errorMessage = '网络连接失败，已使用默认数据';
        }
        
        elements.errorHintMessage.textContent = errorMessage;
        
        // 显示内容
        if (elements.deviceInfoCard) elements.deviceInfoCard.classList.remove('hidden');
        if (elements.connectedDevicesCard) elements.connectedDevicesCard.classList.remove('hidden');
        if (elements.signalTrendCard) elements.signalTrendCard.classList.remove('hidden');
        
        // 显示错误通知
        showNotification('加载失败', errorMessage, true);
        updateLastRefreshTime();
    }
}

// 获取高级信息（cp_type / symbol_type / sysmsg_period / s_cfg_idx / range_opt / acs_enable等）
async function fetchAdvancedInfo(silent = false, skipUiUpdate = false) {
    // 检查高级接口配置是否已初始化
    if (!ADV_API_CONFIG.getAdvInfoUrl) {
        if (!silent) showNotification('高级信息获取失败', '高级接口未初始化', true);
        return;
    }

    // 设置请求超时时间
    const timeoutMs = ADV_API_CONFIG.timeout || API_CONFIG.timeout || 10000;

    // 设置请求头，包含必要的认证信息
    const headers = buildAuthHeaders({ 'Content-Type': 'application/json' });

    try {
        // 发送GET请求以获取高级信息
        const response = await fetchWithTimeoutCompat(ADV_API_CONFIG.getAdvInfoUrl, {
            method: 'GET',
            headers
        }, timeoutMs);

        // 检查HTTP响应状态
        if (!response.ok) {
            throw new Error(`HTTP错误: ${response.status}`);
        }

        // 解析响应数据
        const result = await response.json();
        if (!result || !result.data) {
            if (!silent) {
                throw new Error('未获取到高级信息数据');
            }
            return;
        }
        if (result.status && result.status !== true && result.status !== 'success') {
            throw new Error(result.message || '高级信息返回异常');
        }

        // 提取高级信息数据
        const advData = result.data;

        // 更新当前设备信息
        // Edge42 兼容：避免对象展开语法，使用 Object.assign 更新对象。
        currentDevice = Object.assign({}, currentDevice || {}, {
            cell_id: advData.cell_id,
            cp_type: advData.cp_type,
            symbol_type: advData.symbol_type,
            sysmsg_period: advData.sysmsg_period,
            s_cfg_idx: advData.s_cfg_idx,
            range_opt: advData.range_opt,
            acs_enable: advData.acs_enable,
            tx_power: advData.real_power.exp_pow,
            chip_temperature: advData.chip_temperature
        });

        // 如果未跳过UI更新，则更新设备显示和设置表单
        if (!skipUiUpdate) {
            updateDeviceDisplay();
            populateSettingsForm();
        }

        // 如果不是静默模式，显示成功通知
        if (!silent) {
            showNotification('高级信息', '高级参数已更新', false);
        }
    } catch (error) {
        // 清除超时计时器
        console.error('获取高级信息失败:', error);
        if (!silent) {
            showNotification('高级信息获取失败', error.message, true);
        }
    }
}

function updateAutoJoinCheckbox() {
    const autoJoinNetworkEl = document.getElementById('auto-join-network');
    if (autoJoinNetworkEl) {
        // 优先使用auto_join,如果没有则使用 aj_flag 字段
        let autoJoinStatus = false;

        if (currentDevice.auto_join !== undefined) {
            autoJoinStatus = currentDevice.auto_join;
        } else if (currentDevice.aj_flag !== undefined) {
            autoJoinStatus = currentDevice.aj_flag === 1;
        }

        autoJoinNetworkEl.checked = autoJoinStatus === true;
        console.log('更新自动入网勾选框状态：', autoJoinNetworkEl.checked);
    }
}

// 更新设备显示 - 增强默认值处理，确保设备类型正确显示
function updateDeviceDisplay() {
    // 确保设备对象存在
    if (!currentDevice) currentDevice = Object.assign({}, defaultDeviceInfo);

    const deviceNameEl = document.getElementById('device-name');
    const deviceTypeEl = document.getElementById('current-device-type');
    const deviceIpEl = document.getElementById('device-ip');
    const deviceChannelEl = document.getElementById('device-channel');
    const devicePhysicalBandwidthEl = document.getElementById('device-physical-bandwidth');
    const deviceServiceBandwidthEl = document.getElementById('device-service-bandwidth');
    const deviceServeripEl = document.getElementById('device-server-ipconfig');
    const deviceServerportEl = document.getElementById('device-server-portconfig');
    const deviceVersionEl = document.getElementById('device-version');
    
    // 设备名称使用essid的值，确保有默认值
    if (deviceNameEl) {
        deviceNameEl.textContent = currentDevice.essid || currentDevice.name || '未知设备';
    }
    
    // 设备类型显示，确保与设置中的类型同步
    if (deviceTypeEl) {
        const deviceType = currentDevice.slb_role || currentDevice.sub_role || (currentDevice.type === 0 ? 'gnode' : 'tnode');
        deviceTypeEl.innerHTML = deviceType === 'gnode' ? 'G节点 (主节点)' : 'T节点 (终端节点)';
        deviceTypeEl.className = `px-3 py-1 rounded-full text-sm font-medium ${
            deviceType === 'gnode' ? 'bg-primary/20 text-primary' : 
            deviceType === 'tnode' ? 'bg-accent/20 text-accent' : 'bg-secondary/20 text-secondary'
        }`;
    }
    
    // 所有字段都添加默认值保障
    if (deviceIpEl) deviceIpEl.textContent = currentDevice.ipaddr || currentDevice.ip || '未知IP';
    if (deviceChannelEl) deviceChannelEl.textContent = currentDevice.channel || '未知信道';
    if (devicePhysicalBandwidthEl) {
        devicePhysicalBandwidthEl.textContent = currentDevice.bw 
        ? `${currentDevice.bw} M` 
        : '未知带宽';
    }
    if (deviceServiceBandwidthEl) {
        deviceServiceBandwidthEl.textContent = currentDevice.tfc_bw 
        ? `${currentDevice.tfc_bw} M` 
        : '未知带宽';
    }

    if (deviceServeripEl) {
        deviceServeripEl.textContent = currentDevice.net_manage_ip;
    }
    if (deviceServerportEl) {
        deviceServerportEl.textContent = currentDevice.log_port;
    }
    if (deviceVersionEl) {
        deviceVersionEl.textContent = currentDevice.version || '未知版本';
    }

    // 高级参数显示
    const deviceCellIdEl = elements.deviceCellId;
    const deviceCpTypeEl = elements.deviceCpType;
    const deviceSymbolTypeEl = elements.deviceSymbolType;
    const deviceSysmsgPeriodEl = elements.deviceSysmsgPeriod;
    const deviceSCfgIdxEl = elements.deviceSCfgIdx;
    const deviceRangeOptEl = elements.deviceRangeOpt;
    const deviceacsenableEl = elements.deviceacsenable;
    const deviceChipTemperatureEl = elements.deviceChipTemperature;

    if (deviceCellIdEl) {
        const cellId = currentDevice.cell_id;
        deviceCellIdEl.textContent = cellId !== undefined ? cellId : '未知';
    }
    if (deviceCpTypeEl) {
        const cpType = currentDevice.cp_type;
        deviceCpTypeEl.textContent = cpType !== undefined ? (CP_TYPE_LABELS[cpType] || cpType) : '未知';
    }
    if (deviceSymbolTypeEl) {
        const symbolType = currentDevice.symbol_type;
        deviceSymbolTypeEl.textContent = symbolType !== undefined ? symbolType : '未知';
    }
    if (deviceSysmsgPeriodEl) {
        const period = currentDevice.sysmsg_period;
        deviceSysmsgPeriodEl.textContent = period !== undefined ? (SYSMSG_PERIOD_LABELS[period] || period) : '未知';
    }
    if (deviceSCfgIdxEl) {
        const sIdx = currentDevice.s_cfg_idx;
        deviceSCfgIdxEl.textContent = sIdx !== undefined ? sIdx : '未知';
    }
    if (deviceRangeOptEl) {
        const rangeOpt = currentDevice.range_opt;
        deviceRangeOptEl.textContent = rangeOpt !== undefined ? (RANGE_OPT_LABELS[rangeOpt] || rangeOpt) : '未知';
    }
    if (deviceacsenableEl) {
        const acsenable = currentDevice.acs_enable;
        deviceacsenableEl.textContent = acsenable !== undefined ? (ACS_ENABLE_LABELS[acsenable] || acsenable) : '未知';
    }
    if (deviceChipTemperatureEl) {
        const chipTemperature = currentDevice.chip_temperature;
        deviceChipTemperatureEl.textContent = chipTemperature !== undefined ? chipTemperature : '未知';
    }

    // 自动避让开关仅对 G 节点显示
    if (deviceacsenableEl) {
        const deviceType = currentDevice.slb_role || currentDevice.sub_role || (currentDevice.type === 0 ? 'gnode' : 'tnode');
        const acsContainer = deviceacsenableEl.closest('.bg-dark');
        if (acsContainer) {
            acsContainer.classList.toggle('hidden', deviceType === 'tnode');
        }
    }

    // 同步场景配置区的设备状态显示
    updateScenarioDeviceStatus();

    updateManualScanButtonState();
}

// 根据设备类型更新手动扫描按钮状态
function updateManualScanButtonState() {
    const manualScanButton = elements.manualScan;
    if (!manualScanButton) return;

    const deviceType = currentDevice.slb_role || currentDevice.sub_role || (currentDevice.type === 0 ? 'gnode' : 'tnode');
    if (deviceType === 'tnode') {
        manualScanButton.classList.remove('hidden', 'opacity-50', 'cursor-not-allowed');
        manualScanButton.disabled = false;
        manualScanButton.title = '扫描并连接到G节点';
    } else {
        manualScanButton.classList.add('opacity-50', 'cursor-not-allowed');
        manualScanButton.disabled = true;
        manualScanButton.title = 'G节点无需扫描连接';

        manualScanButton.classList.add('hidden');
    }
}

// 填充设置表单数据 - 确保设备类型从currentDevice正确获取
function populateSettingsForm() {
    const typeEl = document.getElementById('settings-device-type');
    const nameEl = document.getElementById('settings-name');
    const ipEl = document.getElementById('settings-ip');
    const channelEl = document.getElementById('settings-channel');
    const physicalBandwidthEl = document.getElementById('settings-physical-bandwidth');
    const serviceBandwidthEl = document.getElementById('settings-service-bandwidth');
    const serveripEl = document.getElementById('setting-server-ip');
    const serverportEl = document.getElementById('setting-server-port');
    const versionEl = document.getElementById('settings-version');
    const cellIdEl = elements.cellIdInput;
    const cpTypeEl = elements.cpTypeSelect;
    const sCfgIdxEl = elements.sCfgIdxSelect;
    const symbolTypeEl = elements.symbolTypeSelect;
    const sysmsgPeriodEl = elements.sysmsgPeriodSelect;
    const powEl = elements.powInput;
    const rangeOptEl = elements.rangeOptSelect;
    const acsenableEl = elements.acsenableSelect;
    
    // 使用当前设备数据或默认值，确保属性名一致
    if (typeEl) {
        // 确保设备类型正确设置，默认为gnode
        typeEl.value = currentDevice.slb_role || currentDevice.sub_role || (currentDevice.type === 0 ? 'gnode' : 'tnode');
    }
    if (nameEl) nameEl.value = currentDevice.essid || currentDevice.name;
    if (ipEl) ipEl.value = currentDevice.ipaddr || currentDevice.ip;
    if (channelEl) channelEl.value = currentDevice.channel;
    if (physicalBandwidthEl) physicalBandwidthEl.value = currentDevice.bw;
    if (serviceBandwidthEl) serviceBandwidthEl.value = currentDevice.tfc_bw;
    if (serveripEl) serveripEl.value = currentDevice.net_manage_ip;
    if (serverportEl) serverportEl.value = currentDevice.log_port;
    if (versionEl) versionEl.value = currentDevice.version;
    if (cellIdEl && currentDevice.cell_id !== undefined) cellIdEl.value = currentDevice.cell_id;
    if (cpTypeEl && currentDevice.cp_type !== undefined) cpTypeEl.value = currentDevice.cp_type;
    if (sCfgIdxEl && currentDevice.s_cfg_idx !== undefined) sCfgIdxEl.value = currentDevice.s_cfg_idx;
    if (sysmsgPeriodEl && currentDevice.sysmsg_period !== undefined) sysmsgPeriodEl.value = currentDevice.sysmsg_period;
    if (powEl) {
        if (currentDevice.tx_power !== undefined) {
            powEl.value = currentDevice.tx_power;
        }
    }
    if (rangeOptEl && currentDevice.range_opt !== undefined) rangeOptEl.value = currentDevice.range_opt;
    if (acsenableEl && currentDevice.acs_enable !== undefined) acsenableEl.value = currentDevice.acs_enable;

    // 设备设置页：T节点隐藏整个高级参数区域（含保存按钮）
    const isTNode = (currentDevice.slb_role || currentDevice.sub_role || (currentDevice.type === 0 ? 'gnode' : 'tnode')) === 'tnode';
    const advancedSection = document.querySelector('#device-settings .border-t.border-dark-lightest.pt-4');
    const advancedSubmitEl = document.getElementById('settings-advanced-submit');
    const advancedAction = advancedSubmitEl ? advancedSubmitEl.closest('div.flex.justify-end.mt-6') : null;
    if (advancedSection) advancedSection.classList.toggle('hidden', isTNode);
    if (advancedAction) advancedAction.classList.toggle('hidden', isTNode);

    // 设备设置：自动避让开关仅对 G 节点显示
    if (acsenableEl) {
        const deviceType = currentDevice.slb_role || currentDevice.sub_role || (currentDevice.type === 0 ? 'gnode' : 'tnode');
        const acsSettingContainer = acsenableEl.closest('div');
        if (acsSettingContainer) {
            acsSettingContainer.classList.toggle('hidden', deviceType === 'tnode');
        }
    }

    updateManualScanButtonState();
    
    // 注意： 带宽值现在由updateBandwidthOptionsByChannel函数处理
    // 延迟设置带宽值， 确保选项已更新
    setTimeout(() => {
        // 先设置物理带宽
        if (physicalBandwidthEl && currentDevice.bw) {
            physicalBandwidthEl.value = currentDevice.bw;
        }

        // 根据带宽更新信道选项
        updateChannelOptionsByBandwidth();
        
        // 设置信道(注意: updateChannelOptionsByBandwidth会根据带宽过滤信道)
        if (channelEl && currentDevice.channel) {
            // 检查当前信道是否在当前带宽下可用
            const currentBandwidth = parseInt(physicalBandwidthEl ? physicalBandwidthEl.value : '', 10) || 20;
            const availableChannels = BANDWIDTH_CHANNEL_RULES[currentBandwidth] || BANDWIDTH_CHANNEL_RULES[20];
            if (availableChannels.includes(parseInt(currentDevice.channel))) {
                channelEl.value = currentDevice.channel;
            } else if (availableChannels.length > 0) {
                // 如果不在可用信道中， 选择第一个可用信道
                channelEl.value = availableChannels[0];
            }
        }
        
        // 根据信道更新物理带宽选项
        updateBandwidthOptionsByChannel();

        // 设置业务带宽
        if (serviceBandwidthEl && currentDevice.tfc_bw) {
            serviceBandwidthEl.value = currentDevice.tfc_bw;
        }

        // 更新符号类型选项并赋值
        updateSymbolTypeOptions(currentDevice.symbol_type);

        // 重新验证带宽设置
        validateBandwidthSettings();
    }, 0);
}

// 初始化连接设备表格
function initConnectedDevicesTable() {
    if (!elements.connectedDevicesTable) return;
    
    elements.connectedDevicesTable.innerHTML = '';
    
    // 确保有设备列表数据
    const devicesToShow = connectedDevices.length > 0 ? connectedDevices : null;
    
    if (devicesToShow === null || devicesToShow.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td colspan="6" class="py-6 px-4 text-center text-gray-500">
                <i class="fa fa-info-circle mr-2"></i>
                没有连接的设备
            </td>
        `;
        elements.connectedDevicesTable.appendChild(row);
        return;
    }
    
    devicesToShow.forEach(device => {
        const row = document.createElement('tr');
        row.className = 'border-b border-dark-lighter hover:bg-dark-lighter/50 transition-colors';
        
        // 信号强度样式
        let rssiClass;
        if (device.rssi > -70) {
            rssiClass = 'text-green-400'; // 强信号
        } else if (device.rssi > -80) {
            rssiClass = 'text-yellow-400'; // 中等信号
        } else {
            rssiClass = 'text-red-400'; // 弱信号
        }
        
        row.innerHTML = `
            <td class="py-3 px-4">${device.name || '未知设备'}</td>
            <td class="py-3 px-4">
                <span class="px-2 py-1 rounded-full text-xs font-medium ${device.type === 0 ? 'bg-primary/20 text-primary' : 'bg-secondary/20 text-secondary'}">
                    ${device.type === 0 ? 'G节点' : device.type === 1 ? 'T节点' : '未知'}
                </span>
            </td>
			<td class="py-3 px-4 font-mono text-sm">${device.ip || 'N/A'}</td>
            <td class="py-3 px-4 font-mono text-sm">${device.mac || 'N/A'}</td>
            <td class="py-3 px-4">
                <span class="${rssiClass} font-medium">${device.rssi || 'N/A'} dBm</span>
            </td>
            <td class="py-3 px-4">${device.version || 'N/A'}</td>
            <td class="py-3 px-4">${device.tfc_bw || 'N/A'}</td>
        `;
        
        elements.connectedDevicesTable.appendChild(row);
    });
}

// 验证带宽设置
function validateBandwidthSettings() {
    const physical = parseInt(elements.physicalBandwidthSelect ? elements.physicalBandwidthSelect.value : '0', 10);
    const service = parseInt(elements.serviceBandwidthSelect ? elements.serviceBandwidthSelect.value : '0', 10);
    const bandwidthWarning = document.getElementById('bandwidth-warning');
    
    if (!bandwidthWarning) {
        return true;
    }
    
    if (service > physical) {
        bandwidthWarning.classList.remove('hidden');
        return false;
    }
    // 验证业务带宽是否是有效值（20， 40， 80）
    const validServiceBandwidths = [20, 40, 80];
    if (!validServiceBandwidths.includes(service)) {
        bandwidthWarning.textContent = '业务带宽必须是20M、40M或80M';
        bandwidthWarning.classList.remove('hidden');
        return false;
    }

    bandwidthWarning.classList.add('hidden');
    return true;
}

// 根据信道与cp配置刷新符号类型选项
function updateSymbolTypeOptions(preferredValue) {
    const cpTypeEl = elements.cpTypeSelect;
    const sCfgIdxEl = elements.sCfgIdxSelect;
    const symbolTypeEl = elements.symbolTypeSelect;
    const hintEl = elements.symbolTypeHint;

    if (!cpTypeEl || !sCfgIdxEl || !symbolTypeEl) return;

    const cpType = parseInt(cpTypeEl.value) || 0;
    const sCfgIdx = parseInt(sCfgIdxEl.value) || 0;
    const cpRule = SYMBOL_TYPE_RULES[cpType] || {};
    const allowed = cpRule[sCfgIdx] || [];
    const currentValue = preferredValue !== undefined ? preferredValue : parseInt(symbolTypeEl.value);

    symbolTypeEl.innerHTML = '';

    if (allowed.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = '暂无可选值';
        symbolTypeEl.appendChild(option);
        symbolTypeEl.disabled = true;
    } else {
        allowed.forEach(val => {
            const option = document.createElement('option');
            option.value = val;
            option.textContent = val;
            symbolTypeEl.appendChild(option);
        });
        symbolTypeEl.disabled = false;

        if (!allowed.includes(currentValue)) {
            symbolTypeEl.value = allowed[0];
        } else {
            symbolTypeEl.value = currentValue;
        }
    }

    if (hintEl) {
        hintEl.textContent = `根据 cp_type=${cpType} 与 s_cfg_idx=${sCfgIdx} 可选: ${allowed.join('、') || '无'}`;
    }
}

// 启动自动刷新
function startAutoRefresh() {
    // 检查开关状态
    if (!isAutoRefreshEnabled) {
        console.log('自动刷新开关未开启，不启动自动刷新');
        return;
    }

    // 检查是否在device-display页面
    const deviceDisplaySection = document.getElementById('device-display');
    if (!deviceDisplaySection || deviceDisplaySection.classList.contains('hidden')) {
        console.log('不在device-display页面，不启动自动刷新');
        return;
    }

    // 清除可能存在的旧定时器
    if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
    }

    console.log('启动设备信息自动刷新，每5秒刷新一次');

    // 立即执行一次刷新
    fetchDeviceInfo();

    // 每5秒刷新一次
    refreshTimer = setInterval(() => {
        // 再次检查开关状态和页面状态
        if (!isAutoRefreshEnabled) {
            console.log('自动刷新已关闭，停止刷新');
            stopAutoRefresh();
            return;
        }
        
        const currentDeviceDisplay = document.getElementById('device-display');
        if (currentDeviceDisplay && !currentDeviceDisplay.classList.contains('hidden')) {
            console.log('执行定时设备信息刷新');
            fetchDeviceInfo();
        } else {
            console.log('已离开device-display页面，停止自动刷新');
            stopAutoRefresh();
        }
    }, 5000);
}

// 停止自动刷新
function stopAutoRefresh() {
    if (refreshTimer) {
        console.log('停止设备信息自动刷新');
        clearInterval(refreshTimer);
        refreshTimer = null;
    }
}  

window.addEventListener('beforeunload', function() {
    stopAutoRefresh();
});

// 页面切换
function switchPage(pageId) {
    updateFooterMode(pageId);

    // 确保节点扫描页面元素存在
    const nodeScanSection = document.getElementById('node-scan');
    if (nodeScanSection) {
        // 移除hidden类以确保页面可以显示
        nodeScanSection.classList.remove('hidden');
    }
    
    // 切换页面显示
    (elements.pageSections || []).forEach(section => section.classList.add('hidden'));
    const targetSection = document.getElementById(pageId);
    if (targetSection) {
        targetSection.classList.remove('hidden');
    }
    
    // 关闭移动菜单
    if (elements.mobileMenu) {
        elements.mobileMenu.classList.add('hidden');
    }

    // 停止之前的自动刷新
    stopAutoRefresh();
    
    if (pageId === 'device-display' && isAutoRefreshEnabled) {
        // 延迟启动，确保页面切换完成
        setTimeout(() => {
            startAutoRefresh();
        }, 500);
    } else if (pageId === 'device-display') {
        // 立即执行一次刷新
        setTimeout(() => {
            fetchDeviceInfo();
        }, 500);
    }

    // 如果切换到扫描页面，自动执行扫描
    if (pageId === 'node-scan') {
        scanGNodes();
        startBssPolling();
    } else {
        stopBssPolling();
    }
}

// 保存基础参数
async function handleSaveBasicSettings() {
    // 验证带宽设置
    if (!validateBandwidthSettings()) {
        showNotification('操作失败', '业务带宽不能大于物理带宽', true);
        return;
    }
    
    // 获取表单数据
    const typeEl = document.getElementById('settings-device-type');
    const nameEl = document.getElementById('settings-name');
    const ipEl = document.getElementById('settings-ip');
    const channelEl = document.getElementById('settings-channel');
    const physicalBandwidthEl = document.getElementById('settings-physical-bandwidth');
    const serviceBandwidthEl = document.getElementById('settings-service-bandwidth');
    const serveripEl = document.getElementById('setting-server-ip');
    const serverportEl = document.getElementById('setting-server-port');
    
    // 验证所有必填字段
    if (!nameEl.value || !ipEl.value) {
        showNotification('操作失败', '请填写必填字段', true);
        return;
    }
    
    // 获取设备类型 - 确保正确获取T节点类型
    const deviceType = typeEl.value;
    
    console.log('保存的设备类型:', deviceType); // 调试日志

    // 验证信道与带宽的一致性
    const selectedChannel = parseInt(channelEl.value);
    const selectedBandwidth = parseInt(physicalBandwidthEl.value);

    // 检查信道是否支持当前带宽
    const channelSupportedBandwidths = getChannelSupportedBandwidths(selectedChannel);
    if (!channelSupportedBandwidths.includes(selectedBandwidth)) {
        showNotification('操作失败', `信道${selectedChannel}不支持${selectedBandwidth}M带宽`, true);
        return;
    }

    // 验证业务带宽是否为有效值
    const serviceBandwidth = parseInt(serviceBandwidthEl.value);
    const validServiceBandwidths = [20, 40, 80];
    if (!validServiceBandwidths.includes(serviceBandwidth)) {
        showNotification('操作失败', '业务带宽必须是20M、40M或80M', true);
        return;
    }
    
    // 显示加载状态
    if (elements.settingsBasicSubmit && elements.basicSubmitLoading) {
        elements.settingsBasicSubmit.disabled = true;
        elements.basicSubmitLoading.classList.remove('hidden');
    }
    try {
        // 准备发送的数据 - 使用与设备显示一致的属性名
        const postData = {
            type: deviceType === 'tnode' ? 1 : 0,  // 与设备类型属性名一致
            name: nameEl.value,   // 与设备名称属性名一致
            ip: ipEl.value,    // 与IP地址属性名一致
            channel: parseInt(channelEl.value),
            bw: parseInt(physicalBandwidthEl.value),
            tfc_bw: parseInt(serviceBandwidthEl.value),  // 与业务带宽属性名一致
            net_manage_ip: serveripEl.value,
            log_port: parseInt(serverportEl.value)
        };
        
        console.log('提交设置数据:', postData);
        
        // 发送设置到API
        const response = await fetch(API_CONFIG.setNodeUrl, {
            method: 'POST',
            headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(postData),
            timeout: API_CONFIG.timeout
        });
        
        if (!response.ok) {
            throw new Error(`保存失败: ${response.status} ${response.statusText}`);
        }
        
        // 更新当前设备信息 - 关键：确保设备类型正确更新
        currentDevice = Object.assign({}, currentDevice || {}, {
            type: deviceType === 'tnode' ? 1 : 0,  // 同步设备类型到currentDevice
            essid: nameEl.value,
            ip: ipEl.value,
            channel: parseInt(channelEl.value),
            bw: parseInt(physicalBandwidthEl.value),
            tfc_bw: parseInt(serviceBandwidthEl.value),
            net_manage_ip: serveripEl.value,
            log_port: parseInt(serverportEl.value)
        });
        
        // 强制更新UI显示，确保设备类型同步显示
        updateDeviceDisplay();
        populateSettingsForm();
        
        // 确保节点扫描页面元素存在
	/*
        const nodeScanSection = document.getElementById('node-scan');
        if (!nodeScanSection) {
            throw new Error('节点扫描页面不存在');
        }
        */
        // 根据设备类型跳转到不同页面
	/*
        if (deviceType === 'tnode') {
            // 终端节点 - 跳转到节点扫描页面，添加延迟确保UI更新完成
            setTimeout(() => {
                console.log('跳转到节点扫描页面'); // 调试日志
                switchPage('node-scan');
            }, 500);
            showNotification('设置已保存', '请扫描并连接到G节点', false);
        } else {
	*/	
            // 主网关 - 跳转到设备信息页面（需求：暂时取消跳转，仅保留提示）
            // setTimeout(() => {
            //     showNotification('保存配置中', `请稍等...`, false);
            //     switchPage('device-display');
            // }, 3000);
            showNotification('操作成功', '设置已保存并应用', false);
        //}
        
    } catch (error) {
        console.error('保存设置失败:', error);
        showNotification('操作失败', `保存设置时发生错误: ${error.message}`, true);
    } finally {
        // 隐藏加载状态
        if (elements.settingsBasicSubmit && elements.basicSubmitLoading) {
            elements.settingsBasicSubmit.disabled = false;
            elements.basicSubmitLoading.classList.add('hidden');
        }
    }
}

// 获取信道支持的带宽
function getChannelSupportedBandwidths(channel) {
    // 检查是否有特定的信道规则
    for (const [channelsStr, bandwidths] of Object.entries(CHANNEL_BANDWIDTH_RULES)) {
        if (channelsStr === 'default') continue;

        const channels = channelsStr.split(',').map(ch => parseInt(ch));
        if (channels.includes(channel)) {
            return bandwidths;
        }
    }

    // 默认规则
    return CHANNEL_BANDWIDTH_RULES.default;
}

// 保存高级参数
async function handleSaveAdvancedSettings() {
    // 获取高级参数表单中的各个元素
    const cellIdEl = elements.cellIdInput;
    const cpTypeEl = elements.cpTypeSelect; 
    const sCfgIdxEl = elements.sCfgIdxSelect; 
    const symbolTypeEl = elements.symbolTypeSelect; 
    const sysmsgPeriodEl = elements.sysmsgPeriodSelect; 
    const powEl = elements.powInput; 
    const rangeOptEl = elements.rangeOptSelect; 
    const acsenableEl = elements.acsenableSelect;

    // 检查是否所有控件都已正确加载
    if (!cellIdEl || !cpTypeEl || !sCfgIdxEl || !symbolTypeEl || !sysmsgPeriodEl || !rangeOptEl || !acsenableEl) {
        showNotification('操作失败', '高级参数控件未正确加载', true);
        return;
    }

    // 确保符号类型选项与当前选择的循环前缀和配置索引同步
    updateSymbolTypeOptions();

    // 获取表单中的值
    const cellId = parseInt(cellIdEl.value);
    const cpType = parseInt(cpTypeEl.value); 
    const sCfgIdx = parseInt(sCfgIdxEl.value); 
    const symbolType = parseInt(symbolTypeEl.value); 
    const sysmsgPeriod = parseInt(sysmsgPeriodEl.value); 
    const rangeOpt = parseInt(rangeOptEl.value); 
    const acsenable = parseInt(acsenableEl.value);
    const powValueRaw = (powEl && powEl.value != null) ? powEl.value : ''; 
    const powValue = powValueRaw === '' ? null : parseInt(powValueRaw); 

    // 验证表单数据是否完整
    if (Number.isNaN(cellId) || Number.isNaN(cpType) || Number.isNaN(sCfgIdx) || Number.isNaN(symbolType) || Number.isNaN(sysmsgPeriod) || Number.isNaN(rangeOpt) || Number.isNaN(acsenable)) {
        showNotification('操作失败', '请完整选择高级参数', true);
        return;
    }

    if (cellId < 1 || cellId > 20) {
        showNotification('操作失败', 'cell_id 范围需为 1-20', true);
        return;
    }

    // 验证功率值是否在合理范围内
    if (powValue !== null) {
        if (Number.isNaN(powValue) || powValue < -310 || powValue > 250) {
            showNotification('操作失败', '功率范围需在 -310 到 250', true);
            return;
        }
    }

    // 显示加载状态
    if (elements.settingsAdvancedSubmit && elements.advancedSubmitLoading) {
        elements.settingsAdvancedSubmit.disabled = true;
        elements.advancedSubmitLoading.classList.remove('hidden');
    }

    try {
        // 准备发送的数据
        const postData = {
            cell_id: cellId,
            cp_type: cpType,
            s_cfg_idx: sCfgIdx,
            symbol_type: symbolType,
            sysmsg_period: sysmsgPeriod,
            range_opt: rangeOpt,
            acs_enable: acsenable
        };

        // 如果功率值不为空，则添加到数据中
        if (powValue !== null) {
            postData.tx_power = powValue;
        }

        // 设置请求头
        const headers = buildAuthHeaders({ 'Content-Type': 'application/json' });

        // 发送POST请求保存高级参数
        const response = await fetch(ADV_API_CONFIG.setAdvInfoUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(postData),
            timeout: ADV_API_CONFIG.timeout || API_CONFIG.timeout
        });

        // 检查响应状态
        if (!response.ok) {
            throw new Error(`保存失败: ${response.status} ${response.statusText}`);
        }

        // 解析响应数据
        const result = await response.json();
        if (result.status && result.status !== true && result.status !== 'success') {
            throw new Error(result.message || '高级参数保存失败');
        }

        // 更新当前设备信息
        currentDevice = Object.assign({}, currentDevice || {}, {
            cell_id: cellId,
            cp_type: cpType,
            s_cfg_idx: sCfgIdx,
            symbol_type: symbolType,
            sysmsg_period: sysmsgPeriod,
            range_opt: rangeOpt,
            acs_enable: acsenable,
            tx_power: powValue === null ? currentDevice.tx_power : powValue
        });

        // 更新设备显示和表单
        updateDeviceDisplay();
        populateSettingsForm();
        showNotification('操作成功', '高级参数已保存', false);
    } catch (error) {
        // 捕获并处理错误
        console.error('保存高级参数失败:', error);
        showNotification('操作失败', `保存高级参数时发生错误: ${error.message}`, true);
    } finally {
        // 恢复按钮状态
        if (elements.settingsAdvancedSubmit && elements.advancedSubmitLoading) {
            elements.settingsAdvancedSubmit.disabled = false;
            elements.advancedSubmitLoading.classList.add('hidden');
        }
    }
}

// 场景测试：真实POST请求，带开发者确认提示
async function postScenarioTest(apiUrl, label, buttonEl) {
    if (!apiUrl) {
        showNotification('场景测试', `${label} API未配置`, true);
        return;
    }

    const btn = buttonEl || null;
    const prevLabel = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa fa-spinner fa-spin mr-2"></i>测试中...';
    }

    console.info(`[场景测试] 发送POST请求: ${label} -> ${apiUrl}`);

    try {
        const response = await fetchWithTimeoutCompat(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
        }, ADV_API_CONFIG.timeout || 10000);

        if (!response.ok) {
            throw new Error(`HTTP错误: ${response.status} ${response.statusText}`);
        }

        let result = null;
        try {
            result = await response.json();
        } catch (err) {
            result = null;
        }

        if (result && result.status !== undefined) {
            const statusValue = String(result.status).toLowerCase();
            const ok = statusValue === 'true' || statusValue === 'success';
            if (!ok) {
                throw new Error(result.message || `后端返回失败状态: ${result.status}`);
            }
        }

        console.info(`[场景测试] 请求成功: ${label}`, result || '无返回体');
        showNotification('场景测试', `${label} 请求成功`, false);
    } catch (error) {
        const errMsg = error.name === 'AbortError'
            ? `请求超时（${(ADV_API_CONFIG.timeout || 10000) / 1000}秒）`
            : `请求失败：${error.message}`;
        console.error(`[场景测试] 请求失败: ${label}`, error);
        showNotification('场景测试', `${label} ${errMsg}`, true);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = prevLabel;
        }
    }
}

//扫描附近的G节点
// 扫描附近的G节点 - 修改为HTTP GET请求
async function scanGNodes(silent = false) {
    if (!elements.scanGnodesButton || !elements.scanLoading || !elements.gNodesTable) return;
    
    // 显示加载状态
    elements.scanGnodesButton.disabled = true;
    elements.scanLoading.classList.remove('hidden');
    elements.gNodesTable.innerHTML = '';
    if (elements.scanResultHint) {
        elements.scanResultHint.classList.add('hidden');
    }
    
    // 创建超时控制器
    try {
        // 发送HTTP GET请求到API端点
        const response = await fetchWithTimeoutCompat(API_CONFIG.scanGNodesUrl, {
            method: 'GET',  // 修改为GET请求
            headers: { 
                'Content-Type': 'application/json',
                // 可以添加认证头，如果需要的话
                // 'Authorization': 'Bearer ' + getAuthToken()
            }
        }, API_CONFIG.timeout);
        
        // 检查响应状态
        if (!response.ok) {
            throw new Error(`扫描失败: ${response.status} ${response.statusText}`);
        }
        
        // 解析响应数据
        const result = await response.json();
        
        // 验证响应数据结构
        if (!result || !Array.isArray(result.data)) {
            throw new Error('扫描结果格式不正确');
        }
        
        // 保存扫描结果
        scanResults = result.data;
        
        // 应用当前过滤器
        filterScanResults();
        
        // 更新结果计数
        if (elements.scanResultsCount) {
            elements.scanResultsCount.textContent = scanResults.length;
        }
        
        // 非静默模式下显示通知
        if (!silent) {
            showNotification('扫描完成', `发现 ${scanResults.length} 个可用G节点`, false);
        }
        
    } catch (error) {
        console.error('扫描G节点失败:', error);
        
        // 显示错误信息
        elements.gNodesTable.innerHTML = `
            <tr>
                <td colspan="8" class="py-6 px-4 text-center text-red-500">
                    <i class="fa fa-exclamation-circle mr-2"></i>
                    ${error.name === 'AbortError' 
                        ? `扫描超时（${API_CONFIG.timeout/1000}秒）` 
                        : error.message.includes('Failed to fetch')
                            ? '网络连接失败，无法扫描'
                            : `扫描失败: ${error.message}`
                    }
                </td>
            </tr>
        `;
        
        // 非静默模式下显示通知
        if (!silent) {
            showNotification('扫描失败', error.message, true);
        }
    } finally {
        // 隐藏加载状态
        elements.scanGnodesButton.disabled = false;
        elements.scanLoading.classList.add('hidden');
    }
}

// 过滤扫描结果
function filterScanResults() {
    if (!elements.gNodesTable) return;
    
    let filteredResults = scanResults.slice();
    
    // 应用过滤条件
    if (activeScanFilter === 'strong') {
        // 强信号 (-70 dBm 以上)
        filteredResults = filteredResults.filter(node => node.rssi > -70);
    } else if (activeScanFilter === 'medium') {
        // 中等信号 (-70 到 -85 dBm)
        filteredResults = filteredResults.filter(node => node.rssi <= -70 && node.rssi > -85);
    } else if (activeScanFilter === 'weak') {
        // 弱信号 (-85 dBm 及以下)
        filteredResults = filteredResults.filter(node => node.rssi <= -85);
    }
    // 'all' 则不过滤
    
    // 更新表格显示
    if (filteredResults.length === 0) {
        elements.gNodesTable.innerHTML = `
            <tr>
                <td colspan="7" class="py-6 px-4 text-center text-gray-500">
                    <i class="fa fa-info-circle mr-2"></i>
                    没有符合条件的G节点
                </td>
            </tr>
        `;
        return;
    }
    
    elements.gNodesTable.innerHTML = '';
    
    filteredResults.forEach(node => {
        const row = document.createElement('tr');
        row.className = 'border-b border-dark-lighter hover:bg-dark-lighter/50 transition-colors';
        
        // 信号强度样式
        let rssiClass, rssiIcon;
        if (node.rssi > -70) {
            rssiClass = 'text-green-400'; // 强信号
            rssiIcon = 'fa-signal';
        } else if (node.rssi > -85) {
            rssiClass = 'text-yellow-400'; // 中等信号
            rssiIcon = 'fa-signal';
        } else {
            rssiClass = 'text-red-400'; // 弱信号
            rssiIcon = 'fa-wifi';
        }
        
        // 状态样式
        let statusClass = 'px-2 py-1 rounded-full text-xs font-medium ';
        if (node.status === '在线') {
            statusClass += 'bg-green-500/20 text-green-400';
        } else if (node.status === '离线') {
            statusClass += 'bg-gray-500/20 text-gray-400';
        } else {
            statusClass += 'bg-yellow-500/20 text-yellow-400';
        }
        
        row.innerHTML = `
			<td class="py-3 px-4">${node.index}</td>
            <td class="py-3 px-4">${node.name || '未知设备'}</td>
            <td class="py-3 px-4">${node.channel || '未知信道'}</td>
            <td class="py-3 px-4">
                <i class="fa ${rssiIcon} mr-1"></i>
                <span class="${rssiClass} font-medium">${node.rssi || 'N/A'} dBm</span>
            </td>
            <td class="py-3 px-4">
                <button onclick="connectToGNode('${node.mac}','${node.index}','${node.name || '未知设备'}')" 
                        class="px-3 py-1 bg-primary hover:bg-primary/90 text-white text-sm rounded-lg transition-colors">
                    <i class="fa fa-link mr-1"></i>连接
                </button>
            </td>
        `;
        
        elements.gNodesTable.appendChild(row);
    });
}


// 连接到G节点
// 连接到G节点 - 已更新为真实请求
async function connectToGNode(mac, idx, name) {
    if (!confirm(`确定要连接到G节点 "${name}" 吗？`)) {
        return;
    }
    
    // 显示加载状态
    elements.scanGnodesButton.disabled = true;
    elements.scanLoading.classList.remove('hidden');
    
    try {
        // 发送真实POST请求到connectGNodeUrl，传入id参数
        const response = await fetch(API_CONFIG.connectGNodeUrl, {
            method: 'POST',
            headers: buildAuthHeaders({
                'Content-Type': 'application/json'
            }),
            body: JSON.stringify({ 
                index: idx  // 按照要求传入id参数，使用mac作为标识符
            }),
            timeout: API_CONFIG.timeout
        });
        
        // 检查HTTP响应状态
        if (!response.ok) {
            throw new Error(`HTTP错误: ${response.status} ${response.statusText}`);
        }
        
        // 解析响应数据
        const result = await response.json();
        
        // 验证业务逻辑成功
        if (!result.status) {
            throw new Error(result.message || '连接失败，服务器返回错误');
        }
        
        // 保存连接信息
        currentDevice.connectedGnode = name;
        currentDevice.connectedGnodeId = mac;
        
        // 刷新设备信息
        await fetchDeviceInfo();

        // 切换到设备信息页面
        setTimeout(() => {
            switchPage('device-display');
        }, 30);
        
        showNotification('连接成功切换页面缓存中', `已成功连接到G节点 "${name}"`, false);
        
    } catch (error) {
        console.error('连接G节点失败:', error);
        // 根据错误类型提供更具体的提示
        let errorMsg = `无法连接到G节点: ${error.message}`;
        if (error.name === 'AbortError') {
            errorMsg = `连接超时（${API_CONFIG.timeout/1000}秒），请检查网络`;
        } else if (error.message.includes('Failed to fetch')) {
            errorMsg = '网络连接失败，请检查API服务是否可用';
        }
        showNotification('连接失败', errorMsg, true);
    } finally {
        // 隐藏加载状态
        elements.scanGnodesButton.disabled = false;
        elements.scanLoading.classList.add('hidden');
    }
}


// 显示通知
function showNotification(title, message, isError = false) {
    const notification = document.getElementById('notification');
    const titleEl = document.getElementById('notification-title');
    const messageEl = document.getElementById('notification-message');
    const iconEl = document.querySelector('#notification-icon i');
    
    if (!notification || !titleEl || !messageEl || !iconEl) return;
    
    // 设置通知内容
    titleEl.textContent = title;
    messageEl.textContent = message;
    
    // 设置通知样式
    if (isError) {
        notification.classList.remove('border-primary/50');
        notification.classList.add('border-red-500/50');
        iconEl.className = 'fa fa-times-circle text-red-500 text-xl';
    } else {
        notification.classList.remove('border-red-500/50');
        notification.classList.add('border-primary/50');
        iconEl.className = 'fa fa-check-circle text-green-500 text-xl';
    }
    
    // 显示通知
    notification.classList.remove('translate-x-full');
    
    // 3秒后自动关闭
    setTimeout(() => {
        notification.classList.add('translate-x-full');
    }, 3000);
}
