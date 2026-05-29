/**
 * 登录页面入口脚本
 * 负责组装各个模块
 */

/**
 * 粒子类
 * 表示单个粒子对象，负责绘制和更新粒子状态
 */
class Particle {
    /**
     * 构造函数
     * @param {Object} bgSystem - 粒子背景系统实例
     * @param {number} x - 粒子初始的 x 坐标
     * @param {number} y - 粒子初始的 y 坐标
     * @param {number} directionX - 粒子在 x 轴的移动方向和速度
     * @param {number} directionY - 粒子在 y 轴的移动方向和速度
     * @param {number} size - 粒子的大小
     * @param {string} color - 粒子的颜色
     * @param {string} type - 粒子的类型 ('dot', 'router-hub', 'router-leaf')
     */
    constructor(bgSystem, x, y, directionX, directionY, size, color, type) {
        this.bgSystem = bgSystem;
        this.x = x;
        this.y = y;
        this.directionX = directionX;
        this.directionY = directionY;
        this.size = size;
        this.color = color;
        this.type = type; // 'dot', 'router-hub', 'router-leaf'
        this.parentHub = null; // 仅 leaf 有效
    }

    /**
     * 绘制粒子
     */
    draw() {
        const ctx = this.bgSystem.ctx;
        if (this.type.startsWith('router')) {
            const img = this.bgSystem.routerImage;
            if (img.complete && img.naturalWidth !== 0) {
                const w = this.size;
                const h = this.size; 
                ctx.drawImage(img, this.x - w/2, this.y - h/2, w, h);
            }
        } else {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.fill();
        }
    }

    /**
     * 更新粒子状态
     */
    update() {
        if (this.type.startsWith('router')) {
            const time = Date.now() * 0.001;
            const floatSpeed = 1.5;
            const floatAmp = 5;
            this.y = this.baseY + Math.sin(time * floatSpeed + this.floatPhase) * floatAmp;
            this.draw();
            return;
        }

        const canvas = this.bgSystem.canvas;
        const mouse = this.bgSystem.mouse;

        // 边界反弹逻辑
        if (this.x + this.size > canvas.width || this.x - this.size < 0) {
            this.directionX = -this.directionX;
        }
        if (this.y + this.size > canvas.height || this.y - this.size < 0) {
            this.directionY = -this.directionY;
        }

        // 鼠标排斥逻辑
        if (mouse.x !== undefined && mouse.y !== undefined) {
            const dx = mouse.x - this.x;
            const dy = mouse.y - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const forceRadius = this.type.startsWith('router') ? mouse.radius * 1.5 : mouse.radius;

            if (distance < forceRadius + this.size) {
                const push = this.type.startsWith('router') ? 2 : 8;
                if (mouse.x < this.x && this.x < canvas.width - this.size * 10) this.x += push;
                if (mouse.x > this.x && this.x > this.size * 10) this.x -= push;
                if (mouse.y < this.y && this.y < canvas.height - this.size * 10) this.y += push;
                if (mouse.y > this.y && this.y > this.size * 10) this.y -= push;
            }
        }

        this.x += this.directionX;
        this.y += this.directionY;

        this.draw();
    }
}

/**
 * 粒子背景类
 * 负责管理粒子系统的初始化、更新和动画
 */
class ParticleBackground {
    /**
     * 构造函数
     * @param {string} canvasId - 画布的 ID
     * @param {string} containerSelector - 容器的选择器
     */
    constructor(canvasId, containerSelector) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;

        this.ctx = this.canvas.getContext('2d');
        this.container = document.querySelector(containerSelector);
        this.bgParticles = [];
        this.routerNodes = [];
        this.routerImage = new Image();
        this.routerImage.src = 'router.png';
        this.mouse = { x: undefined, y: undefined, radius: 150 };

        this.init();
    }

    /**
     * 初始化粒子背景
     */
    init() {
        if (!this.canvas || !this.ctx) return;

        window.addEventListener('resize', () => {
            this.resizeCanvas();
            this.initParticles();
        });

        window.addEventListener('mousemove', (e) => {
            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;
        });

        window.addEventListener('mouseout', () => {
            this.mouse.x = undefined;
            this.mouse.y = undefined;
        });

        this.resizeCanvas();
        this.initParticles();
        this.animate();
    }

    /**
     * 调整画布大小
     */
    resizeCanvas() {
        if (this.container) {
            this.canvas.width = this.container.clientWidth;
            this.canvas.height = this.container.clientHeight;
        } else {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
        }
    }

    /**
     * 初始化粒子
     */
    initParticles() {
        this.bgParticles = [];
        this.routerNodes = [];

        const density = 9000; 
        const numberOfParticles = Math.floor((this.canvas.width * this.canvas.height) / density);

        for (let i = 0; i < numberOfParticles; i++) {
            const size = Math.random() * 3 + 1;
            const x = Math.random() * (this.canvas.width - size * 2) + size;
            const y = Math.random() * (this.canvas.height - size * 2) + size;
            const directionX = Math.random() * 1 - 0.5;
            const directionY = Math.random() * 1 - 0.5;
            const color = '#bdc3c7';

            this.bgParticles.push(new Particle(this, x, y, directionX, directionY, size, color, 'dot'));
        }

        const centerX = this.canvas.width * 0.325;
        const centerY = this.canvas.height * 0.5;
        const hubX = centerX;
        const hubY = centerY - 50;
        const hubSize = 80; 
        const hub = new Particle(this, hubX, hubY, 0, 0, hubSize, null, 'router-hub');
        this.routerNodes.push(hub);

        const offsets = [
            { x: -220, y: 80 },
            { x: -100, y: 180 },
            { x: 100,  y: 180 },
            { x: 220,  y: 80 },
            { x: -180, y: -120 },
            { x: 180,  y: -120 },
            { x: 0,    y: -200 }
        ];

        offsets.forEach(offset => {
            const leafX = hubX + offset.x;
            const leafY = hubY + offset.y;
            const leafSize = 40; 
            const leaf = new Particle(this, leafX, leafY, 0, 0, leafSize, null, 'router-leaf');
            leaf.parentHub = hub;
            leaf.baseX = leafX;
            leaf.baseY = leafY;
            leaf.floatPhase = Math.random() * Math.PI * 2;
            this.routerNodes.push(leaf);
        });

        hub.baseX = hubX;
        hub.baseY = hubY;
        hub.floatPhase = 0;
    }

    /**
     * 绘制背景粒子的连线
     */
    connectBackground() {
        for (let a = 0; a < this.bgParticles.length; a++) {
            for (let b = a + 1; b < this.bgParticles.length; b++) {
                const dx = this.bgParticles[a].x - this.bgParticles[b].x;
                const dy = this.bgParticles[a].y - this.bgParticles[b].y;
                const dist = dx * dx + dy * dy;
                const threshold = (this.canvas.width / 7) * (this.canvas.height / 7);

                if (dist < threshold) {
                    const opacity = 1 - dist / 20000;
                    this.ctx.strokeStyle = `rgba(189, 195, 199, ${opacity})`;
                    this.ctx.lineWidth = 1;
                    this.ctx.beginPath();
                    this.ctx.moveTo(this.bgParticles[a].x, this.bgParticles[a].y);
                    this.ctx.lineTo(this.bgParticles[b].x, this.bgParticles[b].y);
                    this.ctx.stroke();
                }
            }
        }
    }

    /**
     * 绘制路由器网络的连线
     */
    connectRouters() {
        this.ctx.strokeStyle = 'rgba(52, 152, 219, 0.4)';
        this.ctx.lineWidth = 2;

        for (let i = 0; i < this.routerNodes.length; i++) {
            const node = this.routerNodes[i];
            if (node.type === 'router-leaf' && node.parentHub) {
                this.ctx.beginPath();
                this.ctx.moveTo(node.x, node.y);
                this.ctx.lineTo(node.parentHub.x, node.parentHub.y);
                this.ctx.stroke();
            }
        }
    }

    /**
     * 动画循环
     */
    animate() {
        requestAnimationFrame(() => this.animate());
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        for (let i = 0; i < this.bgParticles.length; i++) {
            this.bgParticles[i].update();
        }
        this.connectBackground();

        this.connectRouters();
        for (let i = 0; i < this.routerNodes.length; i++) {
            this.routerNodes[i].update();
        }
    }
}

/**
 * 认证管理类
 * 负责登录表单的验证与提交逻辑
 */
class AuthManager {
    constructor(formId, api, tabs) {
        this.form = document.getElementById(formId);
        this.api = api;
        this.tabs = tabs;
        if (this.form) {
            this.init();
        }
    }

    /**
     * 初始化表单事件
     */
    // 绑定登录表单提交事件
    init() {
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
    }

    /**
     * 处理表单提交
     * @param {Event} e - 提交事件
     */
    async handleSubmit(e) {
        e.preventDefault();

        const usernameInput = this.form.querySelector('input[name="username"]');
        const passwordInput = this.form.querySelector('input[name="password"]');
        const username = usernameInput ? usernameInput.value.trim() : '';
        const password = passwordInput ? passwordInput.value : '';
        
        const resetButton = setButtonLoading(this.form, '正在连接...');

        try {
            const result = await this.api.login(username, password);
            const token = result && result.data ? result.data.token : '';
            if (!token) {
                throw new Error('登录响应缺少 token');
            }
            this.onLoginSuccess(token, result && result.data ? result.data.expires : null);
        } catch (error) {
            console.error('登录请求异常:', error);
            this.onLoginFailure(passwordInput, error && error.message ? error.message : '服务器连接失败');
        } finally {
            resetButton();
        }
    }

    /**
     * 登录成功处理
     * @param {string} token - 登录成功后返回的 token
     * @param {number|null} expires - token 过期时间（可选）
     */
    // 登录成功后保存 token 并跳转
    onLoginSuccess(token, expires) {
        sessionStorage.setItem(AUTH_STORAGE_KEY, token);
        if (expires) {
            sessionStorage.setItem('auth_token_expires', String(expires));
        }

        window.location.href = 'slb.html';
    }

    /**
     * 登录失败处理
     * @param {HTMLElement} passwordInput - 密码输入框
     * @param {string} [message] - 错误消息
     */
    // 登录失败时清空密码并提示
    onLoginFailure(passwordInput, message) {
        const msg = message || '认证失败：密钥无效或ID错误';
        alert(msg);
        
        if (passwordInput) {
            passwordInput.value = '';
            passwordInput.focus();
        }
    }
}

class RegisterManager {
    constructor(formId, api, tabs) {
        this.form = document.getElementById(formId);
        this.api = api;
        this.tabs = tabs;
        if (this.form) {
            this.init();
        }
    }

    // 绑定注册表单提交事件
    init() {
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
    }

    // 处理注册请求并切回登录
    async handleSubmit(e) {
        e.preventDefault();

        const usernameInput = this.form.querySelector('input[name="username"]');
        const passwordInput = this.form.querySelector('input[name="password"]');
        const confirmInput = this.form.querySelector('input[name="passwordConfirm"]');

        const username = usernameInput ? usernameInput.value.trim() : '';
        const password = passwordInput ? passwordInput.value : '';
        const confirmPassword = confirmInput ? confirmInput.value : '';

        if (!username || !password) {
            alert('请输入完整的账号和密码');
            return;
        }

        if (password !== confirmPassword) {
            alert('两次输入的密码不一致');
            if (confirmInput) {
                confirmInput.value = '';
                confirmInput.focus();
            }
            return;
        }

        const resetButton = setButtonLoading(this.form, '正在提交...');

        try {
            await this.api.register(username, password);
            alert('注册成功，请使用新账号登录');
            if (this.tabs) {
                this.tabs.activate('login');
            }
        } catch (error) {
            console.error('注册请求异常:', error);
            alert(error && error.message ? error.message : '注册失败');
        } finally {
            resetButton();
        }
    }
}

class ChangePasswordManager {
    constructor(formId, api, tabs) {
        this.form = document.getElementById(formId);
        this.api = api;
        this.tabs = tabs;
        if (this.form) {
            this.init();
        }
    }

    // 绑定修改密码表单提交事件
    init() {
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
    }

    // 处理修改密码请求并切回登录
    async handleSubmit(e) {
        e.preventDefault();

        const usernameInput = this.form.querySelector('input[name="username"]');
        const oldPasswordInput = this.form.querySelector('input[name="oldpassword"]');
        const newPasswordInput = this.form.querySelector('input[name="newpassword"]');

        const username = usernameInput ? usernameInput.value.trim() : '';
        const oldPassword = oldPasswordInput ? oldPasswordInput.value : '';
        const newPassword = newPasswordInput ? newPasswordInput.value : '';

        if (!username || !oldPassword || !newPassword) {
            alert('请填写完整的账号与密码信息');
            return;
        }

        const resetButton = setButtonLoading(this.form, '正在提交...');

        try {
            await this.api.changePassword(username, oldPassword, newPassword);
            alert('密码修改成功，请重新登录');
            if (this.tabs) {
                this.tabs.activate('login');
            }
        } catch (error) {
            console.error('修改密码请求异常:', error);
            alert(error && error.message ? error.message : '修改密码失败');
        } finally {
            resetButton();
        }
    }
}

// 统一的登录态 token 存储键
const AUTH_STORAGE_KEY = 'auth_token';

// 按钮加载态：锁定按钮并在请求结束后恢复
// 设置按钮加载态并返回恢复函数
const setButtonLoading = (form, loadingText) => {
    const button = form ? form.querySelector('.login-btn') : null;
    const span = button ? button.querySelector('span') : null;
    const originalText = span ? span.innerText : '';

    if (button) {
        button.disabled = true;
    }
    if (span) {
        span.innerText = loadingText;
    }

    return () => {
        if (button) {
            button.disabled = false;
        }
        if (span) {
            span.innerText = originalText || span.innerText;
        }
    };
};

// 兼容超时的请求封装（AbortController 不可用时走 Promise.race）
// 兼容超时的请求封装（AbortController 不可用时走 Promise.race）
const fetchWithTimeoutCompat = (url, options, timeoutMs) => {
    const resolvedTimeout = timeoutMs || 10000;
    const finalOptions = options || {};

    if (typeof AbortController !== 'undefined') {
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
};

class AuthApi {
    constructor() {
        this.baseUrl = '';
        this.timeout = 10000;
        this.ready = false;
    }

    // 延迟初始化：读取 config.json 获取 API 基址与超时时间
    // 读取配置并缓存 API 基址
    async init() {
        if (this.ready) return;
        try {
            const response = await fetch('config.json', { cache: 'no-store' });
            if (!response.ok) {
                throw new Error(`配置请求失败: ${response.status}`);
            }
            const config = await response.json();
            const ip = config.serverip || config.ip || 'localhost';
            const port = config.port || config.serverport || '8080';
            const baseUrl = config.baseUrl || `http://${ip}:${port}`;
            this.baseUrl = baseUrl.replace(/\/+$/, '');
            this.timeout = config.timeout || 10000;
        } catch (error) {
            console.warn('认证配置读取失败，使用默认地址:', error && error.message ? error.message : error);
            this.baseUrl = 'http://localhost:8080';
            this.timeout = 10000;
        }
        this.ready = true;
    }

    // 统一的 POST 请求封装
    async post(path, payload) {
        await this.init();
        const url = `${this.baseUrl}/api/v1${path}`;
        const response = await fetchWithTimeoutCompat(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload || {})
        }, this.timeout);

        let data = null;
        try {
            data = await response.json();
        } catch (error) {
            data = null;
        }

        if (!response.ok) {
            throw new Error((data && data.message) || `请求失败: ${response.status}`);
        }

        if (data && data.status && data.status !== 'success') {
            const errMsg = data.data && data.data.errmsg ? data.data.errmsg : (data.message || '请求失败');
            throw new Error(errMsg);
        }

        return data || {};
    }

    // 登录接口
    login(username, password) {
        return this.post('/user/login', { username: username, password: password });
    }

    // 注册接口
    register(username, password) {
        return this.post('/user/register', { username: username, password: password });
    }

    // 修改密码接口
    changePassword(username, oldpassword, newpassword) {
        return this.post('/user/change_pwd', {
            username: username,
            oldpassword: oldpassword,
            newpassword: newpassword
        });
    }
}

/**
 * 认证切换控制
 * 负责切换登录 / 注册 / 修改密码面板
 */
class AuthTabs {
    constructor() {
        this.tabs = Array.from(document.querySelectorAll('.auth-tab'));
        this.switchButtons = Array.from(document.querySelectorAll('[data-auth-tab]'));
        this.panels = Array.from(document.querySelectorAll('.auth-panel'));
        this.subtitle = document.getElementById('authSubtitle');
        this.subtitleMap = {
            login: '欢迎回来，请验证您的身份',
            register: '创建新的账号',
            change: '请验证旧密码并设置新密码'
        };

        this.init();
    }

    // 绑定切换按钮并设置默认面板
    init() {
        if (this.panels.length === 0) return;

        document.addEventListener('click', (event) => {
            const target = event.target.closest('[data-auth-tab]');
            if (!target) return;

            event.preventDefault();
            const panelKey = target.getAttribute('data-auth-tab');
            this.activate(panelKey);
        });

        this.activate('login');
    }

    // 切换面板显示并更新标题
    activate(panelKey) {
        this.tabs.forEach((tab) => {
            const isActive = tab.getAttribute('data-auth-tab') === panelKey;
            tab.classList.toggle('is-active', isActive);
            tab.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });

        this.switchButtons.forEach((button) => {
            if (!button.hasAttribute('aria-pressed')) return;
            const isActive = button.getAttribute('data-auth-tab') === panelKey;
            button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });

        this.panels.forEach((panel) => {
            const isActive = panel.getAttribute('data-auth-panel') === panelKey;
            panel.classList.toggle('is-active', isActive);
            panel.style.display = isActive ? '' : 'none';
        });

        if (this.subtitle) {
            this.subtitle.textContent = this.subtitleMap[panelKey] || '';
        }
    }
}

// 挂载到全局对象
window.ParticleBackground = ParticleBackground;
window.AuthManager = AuthManager;

// 页面加载完成后初始化模块
document.addEventListener('DOMContentLoaded', () => {
    new ParticleBackground('backgroundCanvas', '.left-panel');
    const authTabs = new AuthTabs();
    const authApi = new AuthApi();
    new AuthManager('loginForm', authApi, authTabs);
    new RegisterManager('registerForm', authApi, authTabs);
    new ChangePasswordManager('changePasswordForm', authApi, authTabs);
});
