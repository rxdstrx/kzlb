// MagicBento (React Bits) — vanilla port: border glow + global spotlight + click ripple
// + hover particles. No gsap dependency; plain CSS transitions/keyframes instead.
(function () {
  const GLOW_COLOR = '132, 0, 255';
  const SPOTLIGHT_RADIUS = 300;
  const PARTICLE_COUNT = 8;

  function initSection(section) {
    const cards = section.querySelectorAll('.magic-bento-card');
    if (!cards.length) return;

    const spotlight = document.createElement('div');
    spotlight.className = 'global-spotlight';
    spotlight.style.cssText = `
      position:fixed;width:800px;height:800px;border-radius:50%;
      background:radial-gradient(circle, rgba(${GLOW_COLOR},0.15) 0%, rgba(${GLOW_COLOR},0.08) 15%, rgba(${GLOW_COLOR},0.04) 25%, rgba(${GLOW_COLOR},0.02) 40%, rgba(${GLOW_COLOR},0.01) 65%, transparent 70%);
      z-index:200;opacity:0;transform:translate(-50%,-50%);
      transition:opacity 0.3s ease;
    `;
    document.body.appendChild(spotlight);

    const proximity = SPOTLIGHT_RADIUS * 0.5;
    const fadeDistance = SPOTLIGHT_RADIUS * 0.75;

    function onMove(e) {
      const rect = section.getBoundingClientRect();
      const inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
      if (!inside) {
        spotlight.style.opacity = '0';
        cards.forEach(c => c.style.setProperty('--glow-intensity', '0'));
        return;
      }

      let minDistance = Infinity;
      cards.forEach(card => {
        const cardRect = card.getBoundingClientRect();
        const cx = cardRect.left + cardRect.width / 2;
        const cy = cardRect.top + cardRect.height / 2;
        const distance = Math.max(0, Math.hypot(e.clientX - cx, e.clientY - cy) - Math.max(cardRect.width, cardRect.height) / 2);
        minDistance = Math.min(minDistance, distance);

        let glow = 0;
        if (distance <= proximity) glow = 1;
        else if (distance <= fadeDistance) glow = (fadeDistance - distance) / (fadeDistance - proximity);

        const relX = ((e.clientX - cardRect.left) / cardRect.width) * 100;
        const relY = ((e.clientY - cardRect.top) / cardRect.height) * 100;
        card.style.setProperty('--glow-x', relX + '%');
        card.style.setProperty('--glow-y', relY + '%');
        card.style.setProperty('--glow-intensity', glow.toString());
        card.style.setProperty('--glow-radius', SPOTLIGHT_RADIUS + 'px');
      });

      spotlight.style.left = e.clientX + 'px';
      spotlight.style.top = e.clientY + 'px';
      const targetOpacity = minDistance <= proximity ? 0.8
        : minDistance <= fadeDistance ? ((fadeDistance - minDistance) / (fadeDistance - proximity)) * 0.8
        : 0;
      spotlight.style.opacity = targetOpacity.toString();
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseleave', () => {
      spotlight.style.opacity = '0';
      cards.forEach(c => c.style.setProperty('--glow-intensity', '0'));
    });

    cards.forEach(card => {
      card.addEventListener('click', e => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left, y = e.clientY - rect.top;
        const maxDistance = Math.max(
          Math.hypot(x, y), Math.hypot(x - rect.width, y),
          Math.hypot(x, y - rect.height), Math.hypot(x - rect.width, y - rect.height)
        );
        const ripple = document.createElement('div');
        ripple.className = 'bento-ripple';
        ripple.style.cssText = `
          width:${maxDistance * 2}px;height:${maxDistance * 2}px;
          background:radial-gradient(circle, rgba(${GLOW_COLOR},0.4) 0%, rgba(${GLOW_COLOR},0.2) 30%, transparent 70%);
          left:${x - maxDistance}px;top:${y - maxDistance}px;
        `;
        card.appendChild(ripple);
        requestAnimationFrame(() => ripple.classList.add('bento-ripple-active'));
        setTimeout(() => ripple.remove(), 800);
      });

      let particleTimers = [];
      card.addEventListener('mouseenter', () => {
        const rect = card.getBoundingClientRect();
        for (let i = 0; i < PARTICLE_COUNT; i++) {
          const t = setTimeout(() => {
            const p = document.createElement('div');
            p.className = 'bento-particle';
            p.style.left = (Math.random() * rect.width) + 'px';
            p.style.top = (Math.random() * rect.height) + 'px';
            p.style.setProperty('--dx', ((Math.random() - 0.5) * 100) + 'px');
            p.style.setProperty('--dy', ((Math.random() - 0.5) * 100) + 'px');
            card.appendChild(p);
            setTimeout(() => p.remove(), 3000);
          }, i * 100);
          particleTimers.push(t);
        }
      });
      card.addEventListener('mouseleave', () => {
        particleTimers.forEach(clearTimeout);
        particleTimers = [];
        card.querySelectorAll('.bento-particle').forEach(p => p.remove());
      });
    });
  }

  document.querySelectorAll('.bento-section').forEach(initSection);
})();
