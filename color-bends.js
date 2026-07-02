// ColorBends — vanilla JS + Three.js port
(function () {
  const MAX_COLORS = 8;

  const frag = `
#define MAX_COLORS ${MAX_COLORS}
uniform vec2 uCanvas;
uniform float uTime;
uniform float uSpeed;
uniform vec2 uRot;
uniform int uColorCount;
uniform vec3 uColors[MAX_COLORS];
uniform int uTransparent;
uniform float uScale;
uniform float uFrequency;
uniform float uWarpStrength;
uniform vec2 uPointer;
uniform float uMouseInfluence;
uniform float uParallax;
uniform float uNoise;
uniform int uIterations;
uniform float uIntensity;
uniform float uBandWidth;
varying vec2 vUv;

void main() {
  float t = uTime * uSpeed;
  vec2 p = vUv * 2.0 - 1.0;
  p += uPointer * uParallax * 0.1;
  vec2 rp = vec2(p.x * uRot.x - p.y * uRot.y, p.x * uRot.y + p.y * uRot.x);
  vec2 q = vec2(rp.x * (uCanvas.x / uCanvas.y), rp.y);
  q /= max(uScale, 0.0001);
  q /= 0.5 + 0.2 * dot(q, q);
  q += 0.2 * cos(t) - 7.56;
  vec2 toward = (uPointer - rp);
  q += toward * uMouseInfluence * 0.2;

  for (int j = 0; j < 5; j++) {
    if (j >= uIterations - 1) break;
    vec2 rr = sin(1.5 * (q.yx * uFrequency) + 2.0 * cos(q * uFrequency));
    q += (rr - q) * 0.15;
  }

  vec3 col = vec3(0.0);
  float a = 1.0;

  if (uColorCount > 0) {
    vec2 s = q;
    vec3 sumCol = vec3(0.0);
    float cover = 0.0;
    for (int i = 0; i < MAX_COLORS; ++i) {
      if (i >= uColorCount) break;
      s -= 0.01;
      vec2 r = sin(1.5 * (s.yx * uFrequency) + 2.0 * cos(s * uFrequency));
      float m0 = length(r + sin(5.0 * r.y * uFrequency - 3.0 * t + float(i)) / 4.0);
      float kBelow = clamp(uWarpStrength, 0.0, 1.0);
      float kMix = pow(kBelow, 0.3);
      float gain = 1.0 + max(uWarpStrength - 1.0, 0.0);
      vec2 disp = (r - s) * kBelow;
      vec2 warped = s + disp * gain;
      float m1 = length(warped + sin(5.0 * warped.y * uFrequency - 3.0 * t + float(i)) / 4.0);
      float m = mix(m0, m1, kMix);
      float w = 1.0 - exp(-uBandWidth / exp(uBandWidth * m));
      sumCol += uColors[i] * w;
      cover = max(cover, w);
    }
    col = clamp(sumCol, 0.0, 1.0);
    a = uTransparent > 0 ? cover : 1.0;
  } else {
    vec2 s = q;
    for (int k = 0; k < 3; ++k) {
      s -= 0.01;
      vec2 r = sin(1.5 * (s.yx * uFrequency) + 2.0 * cos(s * uFrequency));
      float m0 = length(r + sin(5.0 * r.y * uFrequency - 3.0 * t + float(k)) / 4.0);
      float kBelow = clamp(uWarpStrength, 0.0, 1.0);
      float kMix = pow(kBelow, 0.3);
      float gain = 1.0 + max(uWarpStrength - 1.0, 0.0);
      vec2 disp = (r - s) * kBelow;
      vec2 warped = s + disp * gain;
      float m1 = length(warped + sin(5.0 * warped.y * uFrequency - 3.0 * t + float(k)) / 4.0);
      float m = mix(m0, m1, kMix);
      col[k] = 1.0 - exp(-uBandWidth / exp(uBandWidth * m));
    }
    a = uTransparent > 0 ? max(max(col.r, col.g), col.b) : 1.0;
  }

  col *= uIntensity;

  if (uNoise > 0.0001) {
    float n = fract(sin(dot(gl_FragCoord.xy + vec2(uTime), vec2(12.9898, 78.233))) * 43758.5453123);
    col += (n - 0.5) * uNoise;
    col = clamp(col, 0.0, 1.0);
  }

  vec3 rgb = (uTransparent > 0) ? col * a : col;
  gl_FragColor = vec4(rgb, a);
}
`;

  const vert = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

  function hexToVec3(hex, THREE) {
    const h = hex.replace('#', '').trim();
    const r = parseInt(h.length === 3 ? h[0] + h[0] : h.slice(0, 2), 16) / 255;
    const g = parseInt(h.length === 3 ? h[1] + h[1] : h.slice(2, 4), 16) / 255;
    const b = parseInt(h.length === 3 ? h[2] + h[2] : h.slice(4, 6), 16) / 255;
    return new THREE.Vector3(r, g, b);
  }

  function initColorBends(container, opts) {
    const {
      colors       = ['#8b5cf6', '#38bdf8', '#0ea5e9', '#6366f1'],
      rotation     = 90,
      speed        = 0.2,
      transparent  = false,
      autoRotate   = 0,
      scale        = 1,
      frequency    = 1,
      warpStrength = 1,
      mouseInfluence = 0.6,
      parallax     = 0.3,
      noise        = 0.06,
      iterations   = 2,
      intensity    = 1.2,
      bandWidth    = 6,
    } = opts || {};

    const THREE = window.THREE;
    if (!THREE) { console.error('ColorBends: THREE not found'); return; }

    const scene    = new THREE.Scene();
    const camera   = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geometry = new THREE.PlaneGeometry(2, 2);

    const uColorsArray = Array.from({ length: MAX_COLORS }, () => new THREE.Vector3(0, 0, 0));
    const parsedColors = colors.filter(Boolean).slice(0, MAX_COLORS).map(c => hexToVec3(c, THREE));
    parsedColors.forEach((v, i) => uColorsArray[i].copy(v));

    const deg = rotation % 360;
    const rad = (deg * Math.PI) / 180;

    const material = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        uCanvas:         { value: new THREE.Vector2(1, 1) },
        uTime:           { value: 0 },
        uSpeed:          { value: speed },
        uRot:            { value: new THREE.Vector2(Math.cos(rad), Math.sin(rad)) },
        uColorCount:     { value: parsedColors.length },
        uColors:         { value: uColorsArray },
        uTransparent:    { value: transparent ? 1 : 0 },
        uScale:          { value: scale },
        uFrequency:      { value: frequency },
        uWarpStrength:   { value: warpStrength },
        uPointer:        { value: new THREE.Vector2(0, 0) },
        uMouseInfluence: { value: mouseInfluence },
        uParallax:       { value: parallax },
        uNoise:          { value: noise },
        uIterations:     { value: iterations },
        uIntensity:      { value: intensity },
        uBandWidth:      { value: bandWidth },
      },
      premultipliedAlpha: true,
      transparent: true,
    });

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
      alpha: transparent,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, transparent ? 0 : 1);
    renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
    container.appendChild(renderer.domElement);

    const clock = new THREE.Clock();
    let rotVal = rotation;
    const pointerTarget  = new THREE.Vector2(0, 0);
    const pointerCurrent = new THREE.Vector2(0, 0);

    function resize() {
      const w = container.clientWidth  || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false);
      material.uniforms.uCanvas.value.set(w, h);
    }
    resize();

    const ro = window.ResizeObserver
      ? new ResizeObserver(resize)
      : null;
    if (ro) ro.observe(container);
    else window.addEventListener('resize', resize);

    function onPointer(e) {
      const rect = container.getBoundingClientRect();
      pointerTarget.set(
        ((e.clientX - rect.left) / (rect.width  || 1)) * 2 - 1,
       -(((e.clientY - rect.top)  / (rect.height || 1)) * 2 - 1)
      );
    }
    container.addEventListener('pointermove', onPointer);

    let raf;
    function loop() {
      const dt      = clock.getDelta();
      const elapsed = clock.elapsedTime;
      material.uniforms.uTime.value = elapsed;

      const d   = ((rotVal % 360) + autoRotate * elapsed) * Math.PI / 180;
      material.uniforms.uRot.value.set(Math.cos(d), Math.sin(d));

      pointerCurrent.lerp(pointerTarget, Math.min(1, dt * 6));
      material.uniforms.uPointer.value.copy(pointerCurrent);

      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    return function destroy() {
      cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      else window.removeEventListener('resize', resize);
      container.removeEventListener('pointermove', onPointer);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }

  window.initColorBends = initColorBends;
})();
