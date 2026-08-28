/* =====================================================
   SHASTRA SDK DOCS — JAVASCRIPT
   Canvas particles, tab switching, copy buttons,
   nav scroll effects, smooth interactions
   ===================================================== */

// ============================================================
// CANVAS PARTICLE SYSTEM
// ============================================================
(function initCanvas() {
    const canvas = document.getElementById('hero-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let W, H, particles = [], mouse = { x: -999, y: -999 };
    const COUNT = 80;
    const AMBER = [245, 158, 11];

    function resize() {
        W = canvas.width = window.innerWidth;
        H = canvas.height = window.innerHeight;
    }

    class Particle {
        constructor() { this.reset(); }
        reset() {
            this.x = Math.random() * W;
            this.y = Math.random() * H;
            this.vx = (Math.random() - 0.5) * 0.3;
            this.vy = (Math.random() - 0.5) * 0.3;
            this.r = Math.random() * 1.5 + 0.5;
            this.alpha = Math.random() * 0.4 + 0.1;
            this.pulse = Math.random() * Math.PI * 2;
        }
        update() {
            this.x += this.vx;
            this.y += this.vy;
            this.pulse += 0.02;
            if (this.x < 0 || this.x > W) this.vx *= -1;
            if (this.y < 0 || this.y > H) this.vy *= -1;
        }
        draw() {
            const a = this.alpha * (0.7 + 0.3 * Math.sin(this.pulse));
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${AMBER[0]},${AMBER[1]},${AMBER[2]},${a})`;
            ctx.fill();
        }
    }

    function drawLines() {
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 130) {
                    const alpha = (1 - dist / 130) * 0.12;
                    ctx.beginPath();
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.strokeStyle = `rgba(${AMBER[0]},${AMBER[1]},${AMBER[2]},${alpha})`;
                    ctx.lineWidth = 0.8;
                    ctx.stroke();
                }
            }
            // connect to mouse
            const dx = particles[i].x - mouse.x;
            const dy = particles[i].y - mouse.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 160) {
                const alpha = (1 - dist / 160) * 0.25;
                ctx.beginPath();
                ctx.moveTo(particles[i].x, particles[i].y);
                ctx.lineTo(mouse.x, mouse.y);
                ctx.strokeStyle = `rgba(${AMBER[0]},${AMBER[1]},${AMBER[2]},${alpha})`;
                ctx.lineWidth = 0.8;
                ctx.stroke();
            }
        }
    }

    function loop() {
        ctx.clearRect(0, 0, W, H);
        drawLines();
        for (const p of particles) { p.update(); p.draw(); }
        requestAnimationFrame(loop);
    }

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });

    for (let i = 0; i < COUNT; i++) particles.push(new Particle());
    loop();
})();

// ============================================================
// NAVBAR SCROLL EFFECT
// ============================================================
(function initNavScroll() {
    const nav = document.getElementById('navbar');
    if (!nav) return;
    window.addEventListener('scroll', () => {
        if (window.scrollY > 20) {
            nav.classList.add('scrolled');
        } else {
            nav.classList.remove('scrolled');
        }
    }, { passive: true });
})();

// ============================================================
// MOBILE MENU TOGGLE
// ============================================================
(function initMobileMenu() {
    const btn = document.getElementById('mobile-toggle');
    const menu = document.getElementById('mobile-menu');
    if (!btn || !menu) return;

    btn.addEventListener('click', () => {
        menu.classList.toggle('open');
        btn.textContent = menu.classList.contains('open') ? '✕' : '☰';
    });

    // Close on link click
    menu.querySelectorAll('.mobile-link').forEach(link => {
        link.addEventListener('click', () => {
            menu.classList.remove('open');
            btn.textContent = '☰';
        });
    });
})();

// ============================================================
// TAB SWITCHING
// ============================================================
function showTab(name) {
    // Hide all panels
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));

    // Show selected
    const panel = document.getElementById('panel-' + name);
    if (panel) panel.classList.add('active');

    // Activate tab button
    const tabMap = {
        'basic': 'tab-basic',
        'tools': 'tab-tools',
        'multiagent': 'tab-multiagent',
        'memory': 'tab-memory-qs'
    };
    const tabBtn = document.getElementById(tabMap[name]);
    if (tabBtn) tabBtn.classList.add('active');
}

// ============================================================
// COPY FUNCTIONS
// ============================================================
function copyInstall() {
    const text = 'npm install shastra-sdk';
    copyToClipboard(text, document.getElementById('copy-install-btn'));
}

function copyCode(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const text = el.innerText || el.textContent;
    const btn = el.closest('.code-block')?.querySelector('.copy-code-btn');
    copyToClipboard(text, btn);
}

function copyToClipboard(text, btn) {
    // Strip HTML tags if needed
    const clean = text.replace(/<[^>]*>/g, '');
    navigator.clipboard.writeText(clean).then(() => {
        if (btn) {
            const original = btn.textContent;
            btn.textContent = '✓ Copied!';
            btn.style.color = '#4ade80';
            btn.style.borderColor = '#4ade80';
            setTimeout(() => {
                btn.textContent = original;
                btn.style.color = '';
                btn.style.borderColor = '';
            }, 2000);
        }
    }).catch(() => {
        // Fallback
        const ta = document.createElement('textarea');
        ta.value = clean;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
    });
}

// ============================================================
// INTERSECTION OBSERVER — FADE IN CARDS
// ============================================================
(function initFadeIn() {
    const style = document.createElement('style');
    style.textContent = `
        .fade-in-ready {
            opacity: 0;
            transform: translateY(24px);
            transition: opacity 0.6s ease, transform 0.6s ease;
        }
        .fade-in-ready.visible {
            opacity: 1;
            transform: translateY(0);
        }
    `;
    document.head.appendChild(style);

    const targets = document.querySelectorAll(
        '.feature-card, .api-block, .guardrail-card, .graph-schema, .memory-api-panel, .stat-item'
    );

    targets.forEach((el, i) => {
        el.classList.add('fade-in-ready');
        el.style.transitionDelay = `${(i % 6) * 80}ms`;
    });

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    targets.forEach(el => observer.observe(el));
})();

// ============================================================
// SMOOTH ACTIVE NAV LINK HIGHLIGHTING
// ============================================================
(function initActiveNav() {
    const sections = document.querySelectorAll('section[id], div[id]');
    const links = document.querySelectorAll('.nav-link');

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const id = entry.target.id;
                links.forEach(link => {
                    link.style.color = '';
                    if (link.getAttribute('href') === '#' + id) {
                        link.style.color = 'var(--amber-400)';
                    }
                });
            }
        });
    }, { rootMargin: '-40% 0px -40% 0px' });

    sections.forEach(s => observer.observe(s));
})();

// ============================================================
// SVG GRAPH ANIMATION — node pulse
// ============================================================
(function initGraphAnim() {
    const nodes = document.querySelectorAll('#graph-svg .node circle');
    let idx = 0;
    function pulseNext() {
        nodes.forEach(n => n.style.filter = '');
        if (nodes[idx]) {
            nodes[idx].style.filter = 'drop-shadow(0 0 14px currentColor) brightness(1.4)';
        }
        idx = (idx + 1) % nodes.length;
    }
    setInterval(pulseNext, 900);
})();
