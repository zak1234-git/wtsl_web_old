# 星闪动态子网管理系统 — 前端开发文档

> 本文档基于 **2026-02-28** 的代码快照生成  
> <!-- AUTO-DOC: Generated from source code. Do not edit directly. -->

---

## 1. 项目概览（Project Overview）

### 主要功能模块

| 模块 | 说明 |
|------|------|
| **登录认证** | 用户名/密码登录，成功后跳转至 SLB 管理页 |
| **SLB 设备管理** | 星闪 SLB 设备的信息展示、参数设置、连接设备管理、节点扫描、场景测试、固件升级 |
| **SLE 设备管理** | 星闪 SLE 设备的信息展示、扫描/连接、配置修改、TCP Client 消息下发 |
| **主题切换** | 支持亮色/暗色主题，持久化到 `localStorage` |

### 技术栈

- **HTML5 + 原生 JavaScript（ES6+）**，无框架、无模块打包器
- **TailwindCSS 3.4.17**（在支持现代语法的浏览器中按需加载）
- **Edge42 兜底样式**（`css/edge42-fallback.css`，覆盖常用布局/间距/显示类）
- **Font Awesome**（图标库）
- **CSS 自定义属性 + `data-theme` 属性**实现主题切换
- 通过 `config.json` 外部配置文件动态加载 API 地址
- Fetch API + 兼容超时封装（支持 `AbortController` 时优先使用，缺失时使用 Promise 超时兜底）

### 入口文件

| 文件 | 说明 |
|------|------|
| `index.html` | 登录页入口，加载 `js/login.js` |
| `slb.html` | SLB 设备管理页入口，加载 `js/main.js` |
| `sle.html` | SLE 设备管理页入口，加载 `js/sle.js` |

---

## 2. 目录与文件结构（File Structure）

```
/
├── index.html                 # 登录页（粒子动画背景 + 登录表单）
├── slb.html                   # 【关键】SLB 设备管理主页（多 section SPA 切换）
├── sle.html                   # SLE 设备管理主页（独立页面）
├── sle设备api接口配置.txt      # SLE 接口文档备忘录
├── config.json                # 【运行时需要】API 服务地址配置（serverip / port）
├── logo_big.png               # 品牌 Logo
├── router.png                 # 粒子背景中路由器节点图片
│
├── css/
│   ├── login.css              # 【关键】登录页专用样式（布局、动画、毛玻璃效果）
│   ├── styles.css             # 【关键】SLB/SLE 共用的自定义工具类、主题变量、场景卡片等
│   └── font-awesome.min.css   # Font Awesome 图标库
│
├── fonts/                     # Font Awesome 字体文件
│
├── js/
│   ├── login.js               # 【关键】登录逻辑（粒子动画 + 认证管理）
│   ├── main.js                # 【关键】SLB 核心逻辑（2800+ 行），设备信息/设置/扫描/升级/场景测试
│   ├── sle.js                 # 【关键】SLE 独立管理脚本（700 行），不依赖 main.js
│   └── tailwindcss_3.4.17.js  # TailwindCSS 运行时（第三方库，勿修改）
│
└── docs/
    ├── frontend-doc-prompt.md # 文档生成提示词
    └── dev-doc.md             # 本文件：前端开发文档
```

---

## 3. 数据流与状态管理（Data Flow）

### 3.1 页面间数据传递

| 机制 | 用途 | 涉及页面 |
|------|------|----------|
| `localStorage('theme')` | 主题偏好持久化 | 全部页面 |
| `localStorage('autoRefreshEnabled')` | SLB 自动刷新开关状态 | slb.html |
| `localStorage('sle-basic-info')` | SLE 基本信息缓存（接口失败时回退） | sle.html |
| `sessionStorage('sle-connected-devices')` | SLE 已连接设备列表缓存（标签页内保留，关闭即清） | sle.html |
| 页面跳转（`window.location.href`） | 登录成功后从 index.html → slb.html | index.html → slb.html |
| HTML `<a>` 链接 | SLB ↔ SLE 页面切换（顶部导航标签） | slb.html ↔ sle.html |

### 3.2 关键全局状态变量

#### main.js（SLB 页面）

| 变量名 | 类型 | 用途 | 变更时机 |
|--------|------|------|----------|
| `currentDevice` | `Object` | 【关键】当前 SLB 设备的完整信息 | `fetchDeviceInfo()` / `fetchAdvancedInfo()` / `handleSaveBasicSettings()` / `handleSaveAdvancedSettings()` 成功后更新 |
| `connectedDevices` | `Array` | 已连接设备列表 | `fetchDeviceInfo()` 成功后从 `conninfo` 接口获取 |
| `API_SERVER` | `Object` | API 服务器 ip/port | `initApiConfig()` 从 config.json 读取 |
| `API_CONFIG` | `Object` | 所有 SLB API 端点 URL | `initApiConfig()` 动态拼装 |
| `ADV_API_CONFIG` | `Object` | 高级参数 + 场景测试专用 API URL | `setAdvApiConfig()` 构造 |
| `usingDefaultData` | `boolean` | 是否使用默认/兜底数据 | 网络请求成功时设为 `false` |
| `isAutoRefreshEnabled` | `boolean` | 自动刷新开关 | 用户切换开关 / localStorage 恢复 |
| `refreshTimer` | `number\|null` | 自动刷新定时器 ID | `startAutoRefresh()` / `stopAutoRefresh()` |
| `selectedScenarioId` | `string\|null` | 当前选中的场景测试 ID | 用户点击场景卡片时更新 |
| `scanResults` | `Array` | G 节点扫描结果 | `scanGNodes()` / `fetchAndRenderBssInfo()` |
| `bssPollingInterval` | `number\|null` | BSS 轮询定时器 | 进入节点扫描页启动，离开时停止 |

#### sle.js（SLE 页面）

| 变量名 | 类型 | 用途 | 变更时机 |
|--------|------|------|----------|
| `SLE_API_CONFIG` | `Object` | SLE API 端点配置 | `loadSleApiConfig()` 从 config.json 读取 |
| `sleLocalConnections` | `Array` | 本地维护的已连接设备列表 | 连接成功后 push / `fetchConnectedDevices()` 拉取 |
| `sleCurrentType` | `number\|null` | 当前 SLE 设备类型 (5=G / 6=T) | `renderBasicInfo()` 更新 |
| `slePendingReboot` | `boolean` | 设备类型变更后等待重启标志 | `handleConfigSubmit()` 类型变更时设为 true |
| `sleTcpManualSelect` | `boolean` | TCP 发送是否为手动选择模式 | 用户点击"选择通道"按钮 |
| `sleTcpAvailableChannels` | `Array` | 可用的 TCP 发送目标通道 | `renderTcpTargetOptions()` 从已连接设备提取 |

### 3.3 状态依赖关系

```
config.json
  └─→ initApiConfig() / loadSleApiConfig()
        └─→ API_CONFIG / SLE_API_CONFIG（所有网络请求依赖此配置）

fetchDeviceInfo()
  ├─→ currentDevice（合并 basicinfo + conninfo）
  │     ├─→ updateDeviceDisplay()       → 刷新设备信息卡片
  │     ├─→ populateSettingsForm()       → 同步设置表单
  │     ├─→ updateScenarioDeviceStatus() → 更新场景测试区状态
  │     └─→ updateAutoJoinVisibility()   → G/T 节点控制自动入网可见性
  ├─→ connectedDevices → initConnectedDevicesTable() → 渲染连接设备表格
  └─→ fetchAdvancedInfo()（静默追加高级参数到 currentDevice）

SLE: fetchBasicInfo()
  ├─→ renderBasicInfo()  → 展示区更新
  ├─→ fillConfigForm()   → 配置表单回填
  └─→ sleCurrentType     → 控制扫描卡片显隐（仅 G 节点显示扫描）

SLE: fetchConnectedDevices() / handleConnect()
  └─→ sleLocalConnections → renderConnectedDevices() → renderTcpTargetOptions()
```

【若修改此逻辑，请同步更新本节】

---

## 4. 接口文档速查（API Reference）

> **基础路径：** `http://{serverip}:{port}/api/v1`  
> **鉴权方式：** `Authorization: Bearer <token>`（部分接口）  
> **数据格式：** JSON  

### 4.1 SLB 接口

| 方法 | 路径 | 描述 | 调用位置 |
|------|------|------|----------|
| GET | `/nodes/0/basicinfo` | 获取 SLB 设备基本信息 | `fetchDeviceInfo()` |
| GET | `/nodes/0/conninfo` | 获取已连接设备列表 | `fetchDeviceInfo()` |
| POST | `/nodes/0/basicinfo` | 设置 SLB 设备基础参数 | `handleSaveBasicSettings()` |
| GET | `/nodes/0/advinfo` | 获取高级参数（cp_type、symbol_type 等） | `fetchAdvancedInfo()` |
| POST | `/nodes/0/advinfo` | 保存高级参数 | `handleSaveAdvancedSettings()` |
| GET | `/nodes/0/scan` | 扫描附近 G 节点 | `scanGNodes()` |
| GET | `/nodes/0/show_bss_info` | 轮询 BSS 信息 | `fetchAndRenderBssInfo()` |
| POST | `/nodes/0/connect` | 连接到指定 G 节点 | `connectToGNode()` |
| POST | `/nodes/0/autoJoinNetwork` | 设置自动入网开关 | `handleAutoJoinChange()` |
| POST | `/nodes/0/timesync` | 时间同步 | `syncTimeWithServer()` |
| POST | `/nodes/0/firmware/upload` | 上传固件文件 | `uploadFirmware()` |
| POST | `/nodes/0/firmware/upgrade` | 执行固件升级 | `performUpgrade()` |
| POST | `/nodes/0/throughput_test` | 吞吐量峰值测试 | `postScenarioTest()` |
| POST | `/nodes/0/shortrange_test` | 近距测试 | `postScenarioTest()` |
| POST | `/nodes/0/remoterange_test` | 远距测试 | `postScenarioTest()` |
| POST | `/nodes/0/lowpow_test` | 低功耗测试 | `postScenarioTest()` |
| POST | `/nodes/0/lowlatency_test` | 低时延测试 | `postScenarioTest()` |

### 4.2 SLE 接口

| 方法 | 路径 | 描述 | 调用位置 |
|------|------|------|----------|
| GET | `/nodes/0/sle_basicinfo` | 获取 SLE 设备基本信息 | `fetchBasicInfo()` |
| POST | `/nodes/0/sle_basicinfo` | 设置 SLE 设备基本信息 | `handleConfigSubmit()` |
| GET | `/nodes/0/sle_conninfo` | 获取 SLE 已连接设备列表 | `fetchConnectedDevices()` |
| GET | `/nodes/0/sle_scan` | SLE 设备扫描 | `fetchScanResults()` |
| POST | `/nodes/0/sle_connect` | 连接 SLE 设备 | `handleConnect()` |
| POST | `/nodes/0/sle_announce_id` | TCP Client 下发消息到指定通道 | `handleTcpSend()` |

### 4.3 通用响应结构

```json
{
  "status": "success",
  "data": { ... }
}
```

【若修改此逻辑，请同步更新本节】

---

## 5. 模块详解（按功能拆分）

---

### 5.1 登录模块（login.js）

- **作用**：渲染登录页粒子动画背景，处理用户名/密码表单提交
- **触发时机**：`index.html` 的 `DOMContentLoaded` 事件
- **关键变量**：
  - 【关键】硬编码账号：`admin` / `123456`（仅前端校验，无后端认证接口）
- **核心函数**：

<details>
<summary>🔍 展开：Particle 类</summary>

- 参数：`bgSystem`, `x`, `y`, `directionX`, `directionY`, `size`, `color`, `type`
- 作用：单个粒子对象，支持 `dot`（普通点）、`router-hub`（中心路由器图标）、`router-leaf`（叶子路由器图标）三种类型
- 方法：`draw()` 绘制、`update()` 更新位置（含鼠标排斥、边界反弹、浮动动效）
</details>

<details>
<summary>🔍 展开：ParticleBackground 类</summary>

- 参数：`canvasId` (string)、`containerSelector` (string)
- 作用：管理粒子系统的初始化、画布尺寸自适应、动画循环
- 核心方法：
  - `initParticles()`：创建背景粒子 + 路由器节点拓扑（1 hub + 7 leaf）
  - `connectBackground()`：绘制近距离粒子间的连线
  - `connectRouters()`：绘制路由器节点间的树形连线
  - `animate()`：`requestAnimationFrame` 驱动的动画主循环
</details>

<details>
<summary>🔍 展开：AuthManager 类</summary>

- 参数：`formId` (string)
- 作用：绑定登录表单 submit 事件，执行前端校验
- 核心方法：
  - `handleSubmit(e)`：获取输入、模拟延迟 800ms、比对硬编码凭据
  - `onLoginSuccess()`：将页面跳转至 `slb.html`
  - `onLoginFailure()`：弹出 `alert()` 提示错误，清空密码框
- 副作用：修改按钮文本状态（"正在连接..." / "登录成功"）
</details>

- **依赖关系**：无外部依赖，完全独立
- **注意事项**：
  - 当前为硬编码认证，无 token/session 机制
  - 粒子密度基于 `canvas 面积 / 9000`，大屏设备可能性能敏感

【若修改此逻辑，请同步更新本节】

---

### 5.2 SLB 核心模块（main.js）

- **作用**：SLB 设备管理页的完整业务逻辑，包含设备信息展示、参数设置、节点扫描、场景测试、固件升级
- **触发时机**：`slb.html` 的 `DOMContentLoaded` 事件
- **关键变量**：（见 §3.2）

#### 5.2.1 初始化与配置

<details>
<summary>🔍 展开：initApiConfig() 详细逻辑</summary>

- 参数：无
- 返回值：`Promise<Object>` — 初始化后的 `API_CONFIG`
- 副作用：设置全局 `API_SERVER`、`API_CONFIG`、`ADV_API_CONFIG`
- 逻辑：
  1. `fetch('config.json')` 读取外部配置
  2. 提取 `serverip` / `port` 构造所有 API URL
  3. 调用 `setAdvApiConfig()` 构造高级接口配置
  4. 失败时使用 `localhost:8080` 兜底
- 失败处理：`catch` 中使用默认配置，不中断页面初始化
</details>

<details>
<summary>🔍 展开：init() 初始化流程</summary>

- 调用顺序：
  1. `initChannelSelect()` — 初始化信道下拉框
  2. `setupEventListeners()` — 绑定所有 UI 事件
  3. `updateSymbolTypeOptions()` — 初始化符号类型联动
  4. `fetchDeviceInfo()` — 首次加载设备信息
  5. `initAutoRefreshToggle()` — 初始化自动刷新开关
  6. `updateManualScanButtonState()` — 按设备类型设置扫描按钮状态
  7. `syncFooterWithCurrentPage()` — 同步页脚样式
</details>

#### 5.2.2 设备信息与显示

<details>
<summary>🔍 展开：fetchDeviceInfo() 详细逻辑</summary>

- 参数：无
- 返回值：`Promise<void>`
- 副作用：更新 `currentDevice`、`connectedDevices`，刷新全部 UI
- 逻辑：
  1. 先调用 `syncTimeWithServer()` 同步时间
  2. `Promise.all` 并行请求 `basicinfo` + `conninfo`
  3. 合并数据到 `currentDevice`，提取已连接设备到 `connectedDevices`
  4. 静默调用 `fetchAdvancedInfo()` 追加高级参数
  5. 依次调用 `updateDeviceDisplay()`、`initConnectedDevicesTable()`、`populateSettingsForm()` 等更新 UI
- 失败处理：显示错误提示卡片，使用默认数据渲染
- 调用接口：`GET /nodes/0/basicinfo`、`GET /nodes/0/conninfo`
</details>

<details>
<summary>🔍 展开：fetchAdvancedInfo(silent, skipUiUpdate) 详细逻辑</summary>

- 参数：`silent` (boolean) — 是否关闭通知；`skipUiUpdate` (boolean) — 是否跳过 UI 刷新
- 返回值：`Promise<void>`
- 副作用：向 `currentDevice` 追加 `cell_id / cp_type / symbol_type / sysmsg_period / s_cfg_idx / range_opt / acs_enable / tx_power`
- 调用接口：`GET /nodes/0/advinfo`
</details>

<details>
<summary>🔍 展开：updateDeviceDisplay() 详细逻辑</summary>

- 参数：无
- 作用：将 `currentDevice` 中的字段映射到对应 DOM 元素
- 涵盖字段：设备名称（essid）、设备类型（slb_role/type）、IP（ipaddr）、信道（channel）、物理带宽（bw）、业务带宽（tfc_bw）、网管 IP/端口、固件版本、高级参数（cell_id/cp_type 等）
- 附加行为：调用 `updateScenarioDeviceStatus()` 同步场景测试区域，调用 `updateManualScanButtonState()` 按类型显隐扫描按钮
</details>

#### 5.2.3 设备设置

<details>
<summary>🔍 展开：handleSaveBasicSettings() 详细逻辑</summary>

- 参数：无
- 返回值：`Promise<void>`
- 验证逻辑：
  1. 业务带宽 ≤ 物理带宽
  2. 信道与带宽互相兼容
  3. 业务带宽必须为 20 / 40 / 80
- 提交字段：`type`、`name`、`ip`、`channel`、`bw`、`tfc_bw`、`net_manage_ip`、`log_port`
- 调用接口：`POST /nodes/0/basicinfo`
- 副作用：更新 `currentDevice`，刷新 UI
</details>

<details>
<summary>🔍 展开：handleSaveAdvancedSettings() 详细逻辑</summary>

- 参数：无
- 返回值：`Promise<void>`
- 验证逻辑：
  1. `cell_id` 范围 1-20
  2. 功率 `pow` 范围 -310 到 250
  3. 所有 select 字段不可为空
- 提交字段：`cell_id`、`cp_type`、`s_cfg_idx`、`symbol_type`、`sysmsg_period`、`range_opt`、`acs_enable`、（可选）`tx_power`
- 调用接口：`POST /nodes/0/advinfo`
</details>

#### 5.2.4 信道与带宽联动

<details>
<summary>🔍 展开：信道/带宽互斥规则</summary>

- 配置常量：
  - `CHANNEL_BANDWIDTH_RULES`：指定信道 → 允许的带宽
  - `BANDWIDTH_CHANNEL_RULES`：指定带宽 → 允许的信道
  - `SYMBOL_TYPE_RULES`：`cp_type × s_cfg_idx` → 允许的 `symbol_type`
- 联动函数：
  - `updateChannelOptionsByBandwidth()`：带宽变化 → 重建信道下拉选项
  - `updateBandwidthOptionsByChannel()`：信道变化 → 重建带宽下拉选项
  - `updateServiceBandwidthOptions()`：物理带宽变化 → 限制业务带宽
  - `updateSymbolTypeOptions()`：cp_type / s_cfg_idx 变化 → 重建 symbol_type 选项
</details>

#### 5.2.5 页面切换（SPA 模式）

<details>
<summary>🔍 展开：switchPage(pageId) 详细逻辑</summary>

- 参数：`pageId` (string) — section 的 id，如 `device-display`、`device-settings`、`scenario-test`、`firmware-upgrade`、`node-scan`
- 逻辑：隐藏所有 `.page-section`，显示目标 section
- 附加行为：
  - 离开当前页时停止自动刷新/BSS 轮询
  - 进入 `device-display` 且开关开启时启动自动刷新
  - 进入 `node-scan` 时自动执行 `scanGNodes()` 并启动 BSS 轮询
  - 同步页脚样式 `updateFooterMode()`
</details>

#### 5.2.6 节点扫描与连接

<details>
<summary>🔍 展开：scanGNodes(silent) 详细逻辑</summary>

- 参数：`silent` (boolean) — 是否关闭通知
- 调用接口：`GET /nodes/0/scan`
- 返回数据存入 `scanResults`，然后调用 `filterScanResults()` 渲染表格
- 表格行包含"连接"按钮，绑定 `connectToGNode()`
</details>

<details>
<summary>🔍 展开：connectToGNode(mac, idx, name) 详细逻辑</summary>

- 调用接口：`POST /nodes/0/connect`，请求体 `{ index }`
- 成功后调用 `fetchDeviceInfo()` 刷新并切换到设备信息页
</details>

#### 5.2.7 场景测试

<details>
<summary>🔍 展开：场景测试模块</summary>

- 配置对象：`SCENARIO_TESTS`（5 种测试类型：throughput / shortrange / remoterange / lowpower / lowlatency）
- 交互流程：
  1. 用户点击左侧卡片 → `setScenarioSelection()` 高亮 + 更新说明区
  2. 点击"开始测试" → `postScenarioTest(apiUrl, label, btn)` 发送 POST 请求
- 设备状态区显示组网状态（基于 `getNetworkStatusFromCurrentDevice()` 判断）
</details>

#### 5.2.8 固件升级

<details>
<summary>🔍 展开：uploadFirmware() 详细逻辑</summary>

- 逻辑：
  1. 验证文件类型（.bin / .fw）和大小（≤ 30MB）
  2. 使用 `FormData` 上传到 `/nodes/0/firmware/upload`
  3. 成功后启用"升级到最新版本"按钮
</details>

<details>
<summary>🔍 展开：performUpgrade() 详细逻辑</summary>

- 逻辑：`confirm()` 确认 → POST `/nodes/0/firmware/upgrade` → 超时时间 × 3
- 成功后提示设备将重启
</details>

#### 5.2.9 自动刷新

<details>
<summary>🔍 展开：自动刷新机制</summary>

- 开关：`auto-refresh-toggle` 复选框，状态存入 `localStorage('autoRefreshEnabled')`
- `startAutoRefresh()`：立即执行 `fetchDeviceInfo()` 后每 5 秒定时刷新
- `stopAutoRefresh()`：清除定时器
- 页面不可见时暂停（`visibilitychange` 事件），可见时恢复
- 仅在 `device-display` 页面激活
</details>

#### 5.2.10 通知系统

<details>
<summary>🔍 展开：showNotification(title, message, isError)</summary>

- 参数：`title` (string)、`message` (string)、`isError` (boolean)
- 行为：显示右上角通知卡片，3 秒后自动隐藏
- 样式：成功 = 绿色 check-circle + 蓝色边框；错误 = 红色 times-circle + 红色边框
</details>

【若修改此逻辑，请同步更新本节】

---

### 5.3 SLE 独立模块（sle.js）

- **作用**：SLE 设备管理页的完整业务逻辑，**不依赖 main.js**
- **触发时机**：`sle.html` 的 `DOMContentLoaded` 事件，入口为 `initSlePage()`
- **关键变量**：（见 §3.2 SLE 部分）

#### 5.3.1 初始化流程

<details>
<summary>🔍 展开：initSlePage() 详细逻辑</summary>

- 调用顺序：
  1. `initSleRefs()` — 缓存所有 DOM 引用到 `sleRefs` 对象
  2. `bindSleEvents()` — 绑定主题切换、通知关闭、扫描、配置保存、TCP 发送等事件
  3. `renderTcpTargetOptions()` — 使用缓存的已连接设备初始化 TCP 目标选项
  4. `initTheme()` — 应用主题
  5. `loadSleApiConfig()` — 从 config.json 加载 API 配置
  6. `fetchBasicInfo()` — 获取基本信息
  7. `fetchScanResults()` — 执行一次扫描
  8. `fetchConnectedDevices()` — 获取已连接设备列表
</details>

#### 5.3.2 基本信息与配置

<details>
<summary>🔍 展开：fetchBasicInfo() 详细逻辑</summary>

- 调用接口：`GET /nodes/0/sle_basicinfo`
- 响应字段：`sle_type`（5=G/6=T/7=P）、`sle_name`、`mac`
- 成功后调用 `renderBasicInfo()` 展示 + `fillConfigForm()` 回填表单
- 失败回退：先尝试 `localStorage` 缓存，再使用 `sleBasicMock` 兜底数据
</details>

<details>
<summary>🔍 展开：handleConfigSubmit() 详细逻辑</summary>

- 调用接口：`POST /nodes/0/sle_basicinfo`
- 请求体：`{ sle_type, sle_name }`
- 特殊逻辑：若设备类型变更，设置 `slePendingReboot = true` 并禁用所有操作按钮
</details>

#### 5.3.3 扫描与连接

<details>
<summary>🔍 展开：fetchScanResults() 详细逻辑</summary>

- 调用接口：`GET /nodes/0/sle_scan`
- 响应字段：`rssi`（信号强度）、`mac`
- 渲染扫描结果表格，每行附带"连接"按钮
- 仅 G 节点（sle_type=5）显示扫描卡片
</details>

<details>
<summary>🔍 展开：handleConnect(index, mac, name, buttonEl) 详细逻辑</summary>

- 调用接口：`POST /nodes/0/sle_connect`
- 请求体：`{ mac }`
- 成功后将设备加入 `sleLocalConnections`，保存到 `sessionStorage`，刷新已连接设备表格和 TCP 目标通道
</details>

#### 5.3.4 TCP Client

<details>
<summary>🔍 展开：handleTcpSend() 详细逻辑</summary>

- 调用接口：`POST /nodes/0/sle_announce_id`
- 请求体：`{ announce_id: [通道号数组] }`
- 两种模式：
  - 默认模式：发送到所有已连接设备的通道
  - 手动选择模式：仅发送到用户勾选的通道
- 通道号从已连接设备的 `conn_id` 字段提取
</details>

- **依赖关系**：
  - 依赖 `config.json` 获取 API 地址
  - 与 SLB 共享 `localStorage('theme')` 实现主题同步
  - 无 main.js 依赖
- **注意事项**：
  - SLE 已连接设备使用 `sessionStorage` 缓存，刷新后可保留，关闭标签页后清空
  - 设备类型变更后设备将重启，UI 进入锁定状态（`slePendingReboot = true`）

【若修改此逻辑，请同步更新本节】

---

## 6. 样式与 UI 规范（CSS）

### 6.1 主要 CSS 文件

| 文件 | 作用 |
|------|------|
| `css/login.css` | 登录页专用：左右分栏布局、粒子画布、毛玻璃登录卡片、圆环装饰动画 |
| `css/styles.css` | SLB/SLE 共用：主题变量定义、自定义 Tailwind 工具类、场景卡片、自动刷新开关 |
| `css/font-awesome.min.css` | 图标库 |
| `slb.html / sle.html 内联 <style>` | 各页面的主题覆盖规则（`[data-theme="light"]` / `[data-theme="dark"]` 选择器）、滚动条样式 |

### 6.2 主题机制

- **实现方式**：`document.documentElement.setAttribute('data-theme', 'light' | 'dark')`
- **CSS 变量**：定义在 `css/styles.css` 的 `:root` 和 `[data-theme="dark"]` / `[data-theme="light"]` 中
- **Tailwind 覆盖**：在 `slb.html` / `sle.html` 的内联 `<style>` 中通过 `[data-theme="light"] .bg-dark` 等选择器覆盖 Tailwind 暗色类
- **图标切换**：`fa-moon-o`（暗色）↔ `fa-sun-o`（亮色）

### 6.3 关键 CSS 类名（被 JS 动态操作）

```
.hidden
  - 何时添加：页面切换隐藏 section / 加载状态隐藏 / 错误提示隐藏
  - 何时移除：对应 section 激活 / 请求开始 / 出错时
  - 对应函数：switchPage()、fetchDeviceInfo()、各 fetch 函数

.translate-x-full
  - 何时添加：通知隐藏（滑出屏幕右侧）
  - 何时移除：通知显示
  - 对应函数：showNotification()、hideNotification()

.loader
  - 作用：旋转加载动画（border-top + spinner keyframe）
  - 何时显示：各请求发起时对应 loading 元素移除 hidden
  - 何时隐藏：请求完成后添加 hidden

.scenario-card--selected
  - 何时添加：用户选中场景测试卡片
  - 何时移除：选中其他卡片 / 取消选择
  - 对应函数：setScenarioSelection()

.btn-disabled
  - 何时添加：场景测试按钮未选中测试类型时
  - 何时移除：用户选中测试类型后
  - 对应函数：updateScenarioInfo()

.opacity-50 / .cursor-not-allowed
  - 何时添加：按钮禁用状态（手动扫描按钮 G 节点时、升级按钮未上传时）
  - 对应函数：updateManualScanButtonState()、disableUpgradeButton()
```

### 6.4 响应式布局

- **登录页**：`@media (max-width: 900px)` — 左右分栏切换为上下堆叠，右侧面板添加圆角
- **SLB / SLE 管理页**：依赖 Tailwind 响应式类 (`md:grid-cols-2`, `lg:grid-cols-3`, `xl:grid-cols-3`)，移动端通过 `md:hidden` / `md:flex` 切换桌面/移动导航

【若修改此逻辑，请同步更新本节】

---

## 7. 已知问题与待办（Issues & TODO）

> 代码中未发现显式的 `TODO` / `FIXME` 注释。以下为代码审查中识别的待优化项：

- [ ] 登录认证使用硬编码凭据 `admin/123456`，无后端鉴权接口（位置：[login.js:324](js/login.js#L324)）
- [ ] `uploadFirmware()` 中引用了未定义变量 `progressContainer` 和 `progressBar`（位置：[main.js:1342](js/main.js#L1342)）
- [ ] `performUpgrade()` 失败时引用了未定义的 `upgradeHistory` 和 `firmwareVersions`（位置：[main.js:1220](js/main.js#L1220)）
- [ ] SLE 已连接设备接口 `sle_conninfo` 的实际可用性 [需确认: sle设备api接口配置.txt 中标注"获取连接信息之前给过"但未提供完整文档]
- [ ] SLB 和 SLE 页面的主题覆盖 CSS 大量重复（`slb.html` 和 `sle.html` 的内联 `<style>` 块几乎相同），建议抽取到公共 CSS 文件
- [ ] main.js 超过 2800 行且全为全局函数/变量，建议按功能拆分模块
- [ ] `config.json` 文件不在版本库中 [需确认: 是否应提供示例配置 config.example.json]
- [ ] 登录页无 token/session 机制，SLB/SLE 页面可直接通过 URL 访问而绕过登录

---

## 变更日志

| 日期 | 修改人 | 修改内容 | 影响模块 |
|------|--------|----------|----------|
| 2026-02-28 | AI Agent | 初始文档生成 | 全部 |
| 2026-03-03 | AI Agent | Edge42 兼容性重构：移除业务脚本中的 `?.`/`??`，请求超时改为兼容封装，Tailwind 运行时改为按需加载并新增 fallback CSS | `js/main.js`、`js/sle.js`、`slb.html`、`sle.html`、`css/edge42-fallback.css` |
