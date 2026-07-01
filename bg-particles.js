// Interactive dot-grid background particles
(function () {
  const s = document.createElement('style');
  s.textContent = 'body::before{display:none!important}';
  document.head.appendChild(s);

  const canvas = document.createElement('canvas');
  canvas.id = 'bg-particles';
  Object.assign(canvas.style, {
    position: 'fixed', inset: '0', width: '100%', height: '100%',
    pointerEvents: 'none', zIndex: '0',
  });
  document.body.prepend(canvas);

  const ctx = canvas.getContext('2d');
  const SPACING = 30, REPEL_R = 100, REPEL_F = 1.8, SPRING = 0.07, DAMP = 0.80;
  let W, H, dots = [], mx = -9999, my = -9999;

  function build() {
    const dpr = window.devicePixelRatio || 1;
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);
    dots = [];
    for (let x = SPACING / 2; x < W; x += SPACING) {
      for (let y = SPACING / 2; y < H; y += SPACING) {
        dots.push({ bx: x, by: y, x, y, vx: 0, vy: 0 });
      }
    }
  }

  window.addEventListener('resize', build);
  document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; });
  document.addEventListener('mouseleave', () => { mx = -9999; my = -9999; });

  function frame() {
    ctx.clearRect(0, 0, W, H);
    for (const d of dots) {
      const dx = d.x - mx, dy = d.y - my;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      if (dist < REPEL_R) {
        const f = ((REPEL_R - dist) / REPEL_R) * REPEL_F;
        d.vx += (dx / dist) * f;
        d.vy += (dy / dist) * f;
      }
      d.vx += (d.bx - d.x) * SPRING;
      d.vy += (d.by - d.y) * SPRING;
      d.vx *= DAMP; d.vy *= DAMP;
      d.x  += d.vx; d.y  += d.vy;

      const proximity = Math.max(0, 1 - dist / REPEL_R);
      const alpha = 0.10 + proximity * 0.35;
      const radius = 1 + proximity * 0.8;
      ctx.beginPath();
      ctx.arc(d.x, d.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(168,85,247,${alpha})`;
      ctx.fill();
    }
    requestAnimationFrame(frame);
  }

  build();
  frame();
})();
