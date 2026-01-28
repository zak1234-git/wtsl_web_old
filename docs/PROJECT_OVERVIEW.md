# 项目概览

## 总览
这是一个轻量级设备管理前端，包含两个主要页面：
- **SLB**：主站设备管理与配置页面。
- **SLE**：简化的扫描/连接管理页面。

前端为静态 HTML + Tailwind（本地脚本）+ Font Awesome + 原生 JavaScript。

## 目录结构
- index.html — SLB 主页面
- sle.html — SLE 页面
- css/
  - style.css
  - font-awesome.min.css
- js/
  - main.js — SLB 逻辑（设备信息、设置、扫描、场景测试）
  - sle.js — SLE 逻辑（扫描/连接、基础信息）
  - tailwindcss_3.4.17.js — Tailwind 运行时
- fonts/ — 字体与图标资源
- *.txt — 参考说明与接口描述

## 页面结构
### SLB（index.html）
- 模块：设备信息、设备设置、场景配置、软件升级、隐藏的节点扫描。
- 行为逻辑由 js/main.js 提供。
- 场景配置采用卡片选择 + 说明区布局，并在场景配置页调整页脚位置以减少底部空白。

### SLE（sle.html）
- 模块：基础信息、已连接设备、扫描结果。
- 行为逻辑由 js/sle.js 提供。

## JavaScript 模块
### js/main.js（SLB）
**主要职责**
- 读取 config.json，生成 API 端点。
- 获取并渲染设备基础信息与高级信息。
- 处理设备设置表单与校验。
- 调用场景测试接口。
- 扫描并连接 G 节点。

**关键状态**
- `connectedDevices`：当前连接设备列表（来自后端）。
- `currentDevice`：基础 + 连接 + 高级信息合并后的设备对象。
- `API_CONFIG`：SLB 基础 API 配置。
- `ADV_API_CONFIG`：高级信息与场景测试 API 配置。

**核心函数**
- `initApiConfig()`：读取配置并构建 `API_CONFIG` / `ADV_API_CONFIG`。
- `fetchDeviceInfo()`：请求基础/连接信息并更新 UI。
- `fetchAdvancedInfo()`：请求高级信息并合并到 `currentDevice`。
- `handleSaveBasicSettings()` / `handleSaveAdvancedSettings()`：保存参数。
- `scanGNodes()`：扫描附近 G 节点。
- `connectToGNode()`：连接 G 节点。
- `postScenarioTest()`：场景测试 POST 请求统一入口。
- `showNotification()`：通知提示。
- `initScenarioSelection()` / `updateScenarioInfo()`：场景卡片选择与说明区更新。
- `updateFooterMode()`：场景配置页脚位置同步。

**场景测试 API（POST）**
- `throughput_test`
- `shortrange_test`
- `remoterange_test`
- `lowpow_test`

### js/sle.js（SLE）
**主要职责**
- 读取 config.json，生成 SLE API 端点。
- 获取基础信息（接口未就绪时使用占位数据）。
- 扫描设备并渲染表格。
- 连接设备并更新“本地已连接列表”。

**关键状态**
- `SLE_API_CONFIG`：SLE API 配置。
- `sleLocalConnections`：本地已连接列表，使用 sessionStorage（切页保留，关闭标签页清空）。

**核心函数**
- `loadSleApiConfig()`：加载配置并构建 API。
- `fetchBasicInfo()`：获取基础信息。
- `fetchScanResults()`：扫描并渲染结果。
- `handleConnect()`：连接设备（带加载状态）。
- `showNotification()`：通知提示。

## API 配置
- 两个页面都从 config.json 读取 IP/端口/Token。
- SLB：`API_CONFIG` 与 `ADV_API_CONFIG`。
- SLE：`SLE_API_CONFIG`。

## UI 约定
- 加载动画使用 `.loader` 样式。
- 按钮请求期间会禁用。
- 通知在右上角显示并自动关闭。
- 场景配置页使用弹性布局让页脚贴近底部。

## 更新维护指南（保持同步）
新增功能时请更新此文档：
1. 新页面或新模块
2. 新增 API 或端点
3. 新增关键函数与职责
4. 新增状态变量或缓存策略

## 变更记录（手动维护）
- 2026-01-28：SLE 连接按钮加载态与会话缓存；SLB 场景测试 API 接入。
- 2026-01-28：SLB 场景配置改为卡片选择 + 说明区布局，并调整场景配置页页脚位置。
