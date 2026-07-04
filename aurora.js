// Aurora — vanilla WebGL2 port (React Bits), no external deps
(function () {
  const VERT = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

  const FRAG = `#version 300 es
precision highp float;

uniform float uTime;
uniform float uAmplitude;
uniform vec3 uColorStops[3];
uniform vec2 uResolution;
uniform float uBlend;

out vec4 fragColor;

vec3 permute(vec3 x) {
  return mod(((x * 34.0) + 1.0) * x, 289.0);
}

float snoise(vec2 v){
  const vec4 C = vec4(
      0.211324865405187, 0.366025403784439,
      -0.577350269189626, 0.024390243902439
  );
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);

  vec3 p = permute(
      permute(i.y + vec3(0.0, i1.y, 1.0))
    + i.x + vec3(0.0, i1.x, 1.0)
  );

  vec3 m = max(
      0.5 - vec3(
          dot(x0, x0),
          dot(x12.xy, x12.xy),
          dot(x12.zw, x12.zw)
      ),
      0.0
  );
  m = m * m;
  m = m * m;

  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);

  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

struct ColorStop {
  vec3 color;
  float position;
};

#define COLOR_RAMP(colors, factor, finalColor) {              \\
  int index = 0;                                            \\
  for (int i = 0; i < 2; i++) {                               \\
     ColorStop currentColor = colors[i];                    \\
     bool isInBetween = currentColor.position <= factor;    \\
     index = int(mix(float(index), float(i), float(isInBetween))); \\
  }                                                         \\
  ColorStop currentColor = colors[index];                   \\
  ColorStop nextColor = colors[index + 1];                  \\
  float range = nextColor.position - currentColor.position; \\
  float lerpFactor = (factor - currentColor.position) / range; \\
  finalColor = mix(currentColor.color, nextColor.color, lerpFactor); \\
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;

  ColorStop colors[3];
  colors[0] = ColorStop(uColorStops[0], 0.0);
  colors[1] = ColorStop(uColorStops[1], 0.5);
  colors[2] = ColorStop(uColorStops[2], 1.0);

  vec3 rampColor;
  COLOR_RAMP(colors, uv.x, rampColor);

  float height = snoise(vec2(uv.x * 2.0 + uTime * 0.1, uTime * 0.25)) * 0.5 * uAmplitude;
  height = exp(height);
  height = (uv.y * 2.0 - height + 0.2);
  float intensity = 0.6 * height;

  float midPoint = 0.20;
  float auroraAlpha = smoothstep(midPoint - uBlend * 0.5, midPoint + uBlend * 0.5, intensity);

  vec3 auroraColor = intensity * rampColor;

  fragColor = vec4(auroraColor * auroraAlpha, auroraAlpha);
}
`;

  function hexToRgb01(hex) {
    const h = hex.replace('#', '');
    return [
      parseInt(h.slice(0, 2), 16) / 255,
      parseInt(h.slice(2, 4), 16) / 255,
      parseInt(h.slice(4, 6), 16) / 255,
    ];
  }

  function compileShader(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('Aurora shader error:', gl.getShaderInfoLog(s));
    }
    return s;
  }

  function initAurora(container, opts) {
    const { colorStops = ['#3A29FF', '#FF94B4', '#FF3232'], speed = 1.0, amplitude = 1.0, blend = 0.5 } = opts || {};

    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
    container.appendChild(canvas);

    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: 'low-power' });
    if (!gl) { console.error('Aurora: WebGL2 not supported'); return () => {}; }

    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const vs = compileShader(gl, gl.VERTEX_SHADER, VERT);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG);
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Aurora program link error:', gl.getProgramInfoLog(program));
    }
    gl.useProgram(program);

    // Fullscreen triangle
    const posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(program, 'uTime');
    const uAmplitude = gl.getUniformLocation(program, 'uAmplitude');
    const uColorStops = gl.getUniformLocation(program, 'uColorStops');
    const uResolution = gl.getUniformLocation(program, 'uResolution');
    const uBlend = gl.getUniformLocation(program, 'uBlend');

    let W = 0, H = 0;
    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      W = container.offsetWidth;
      H = container.offsetHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uResolution, canvas.width, canvas.height);
    }
    window.addEventListener('resize', resize);
    resize();

    const stopsFlat = new Float32Array(9);
    function setColorStops(stops) {
      stops.slice(0, 3).forEach((hex, i) => {
        const [r, g, b] = hexToRgb01(hex);
        stopsFlat[i * 3] = r; stopsFlat[i * 3 + 1] = g; stopsFlat[i * 3 + 2] = b;
      });
      gl.uniform3fv(uColorStops, stopsFlat);
    }
    setColorStops(colorStops);
    gl.uniform1f(uAmplitude, amplitude);
    gl.uniform1f(uBlend, blend);

    // Capped to ~30fps — a slow-moving noise gradient doesn't need 60fps, and
    // halving the draw rate meaningfully cuts GPU cost for every backdrop-filter
    // panel (navbar, dropdowns, header rows) that has to re-blur this live canvas
    // every time it redraws.
    const FRAME_INTERVAL = 1000 / 30;
    let raf, start = performance.now(), lastDraw = 0;
    function loop(now) {
      raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      if (now - lastDraw < FRAME_INTERVAL) return;
      lastDraw = now;
      const t = (now - start) * 0.001;
      gl.uniform1f(uTime, t * speed * 0.1 * 10);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    raf = requestAnimationFrame(loop);

    return function destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      if (canvas.parentElement === container) container.removeChild(canvas);
    };
  }

  window.initAurora = initAurora;
})();
