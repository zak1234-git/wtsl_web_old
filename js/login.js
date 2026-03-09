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
    constructor(formId) {
        this.form = document.getElementById(formId);
        if (this.form) {
            this.init();
        }
    }

    /**
     * 初始化表单事件
     */
    init() {
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
    }

    /**
     * 处理表单提交
     * @param {Event} e - 提交事件
     */
    async handleSubmit(e) {
        e.preventDefault();

        const usernameInput = document.getElementById('username');
        const passwordInput = document.getElementById('password');
        const username = usernameInput ? usernameInput.value.trim() : '';
        const password = passwordInput ? passwordInput.value : '';
        
        const btnTextEl = document.querySelector('.login-btn span');
        const originalText = btnTextEl ? btnTextEl.innerText : '';

        if (btnTextEl) btnTextEl.innerText = '正在连接...';

        try {
            await new Promise(resolve => setTimeout(resolve, 800));
            if (username === 'admin' && password === '123456') {
                this.onLoginSuccess(btnTextEl);
            } else {
                this.onLoginFailure(btnTextEl, originalText, passwordInput);
            }

        } catch (error) {
            console.error('登录请求异常:', error);
            this.onLoginFailure(btnTextEl, originalText, passwordInput, '服务器连接失败');
        }
    }

    /**
     * 登录成功处理
     * @param {HTMLElement} btnTextEl - 登录按钮的文本元素
     */
    onLoginSuccess(btnTextEl) {
        if (btnTextEl) btnTextEl.innerText = '登录成功';

        // 生成随机会话令牌，写入 sessionStorage。
        // sessionStorage 与标签页绑定，关闭标签页后自动清除。
        // slb.html / sle.html 在加载时校验此令牌，
        // 未登录直接访问时因令牌不存在而被重定向回登录页。
        var token = Math.random().toString(36).slice(2) + Date.now().toString(36);
        sessionStorage.setItem('_auth', token);

        window.location.href = 'slb.html';
    }

    /**
     * 登录失败处理
     * @param {HTMLElement} btnTextEl - 登录按钮的文本元素
     * @param {string} originalText - 按钮的原始文本
     * @param {HTMLElement} passwordInput - 密码输入框
     * @param {string} [message] - 错误消息
     */
    onLoginFailure(btnTextEl, originalText, passwordInput, message) {
        const msg = message || '认证失败：密钥无效或ID错误';
        alert(msg);
        
        if (btnTextEl) btnTextEl.innerText = originalText || '立即登录';
        
        if (passwordInput) {
            passwordInput.value = '';
            passwordInput.focus();
        }
    }
}

// 挂载到全局对象
window.ParticleBackground = ParticleBackground;
window.AuthManager = AuthManager;

// 页面加载完成后初始化模块
document.addEventListener('DOMContentLoaded', () => {
    new ParticleBackground('backgroundCanvas', '.left-panel');
    new AuthManager('loginForm');
});
