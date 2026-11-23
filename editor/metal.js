(() => {
  function surfaceSize(width, height, dpr, limit) {
    if (![width, height, dpr, limit].every(Number.isFinite) || width <= 0 || height <= 0 || dpr <= 0 || limit < 1) {
      throw new Error('Invalid metal surface dimensions.');
    }
    const scale = Math.min(dpr, 2, limit / width, limit / height);
    return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
  }

  const FRAGMENT = `
precision highp float;
uniform vec2 uSize;
uniform vec2 uCss;
uniform float uHead;
uniform float uLight;
uniform float uReading;
float grain(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  vec2 p = uv * uCss;
  float y = (1. - uv.y) * 2. - 1.;
  vec3 n = normalize(vec3(0., -y, sqrt(max(.001, 1. - y * y))));
  // Material reflections sit beneath the scene's shared lighting and shadow pass.
  float room = .19 + .26 * pow(max(n.z, 0.), 1.5);
  float edge = .15 * exp(-pow((y + .53) / .22, 2.));
  float lower = .02 * exp(-pow((y - .86) / .10, 2.));
  vec3 steel = vec3(.88, .86, .82) * (room + edge + lower);
  // Long, fine scratches vary across the rod without crawling as the head moves.
  float brushing = grain(vec2(floor(p.x / 42.), floor(p.y * 3.))) - .5;
  steel *= 1. + brushing * .035;
  float dx = p.x - uHead;
  vec3 l = normalize(vec3(-dx, 24., 46.));
  vec3 h = normalize(l + vec3(0., 0., 1.));
  float specular = pow(max(dot(n, h), 0.), 30.);
  float reach = 1. / (1. + dx * dx / 19000.);
  float warm = (specular * .22 + reach * .025) * uLight * (1. - uReading * .8);
  steel += vec3(1., .76, .43) * warm;
  gl_FragColor = vec4(steel, 1.);
}`;

  function createRenderer(canvas) {
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false,
      stencil: false, powerPreference: 'low-power' });
    if (!gl) throw new Error('Metal rendering is unavailable.');
    const shaders = [];
    let program, buffer;
    const release = () => {
      for (const shader of shaders) gl.deleteShader(shader);
      if (buffer) gl.deleteBuffer(buffer);
      if (program) gl.deleteProgram(program);
    };
    try {
      const compile = (type, source) => {
        const shader = gl.createShader(type);
        if (!shader) throw new Error('Could not allocate a metal shader.');
        shaders.push(shader);
        gl.shaderSource(shader, source); gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('Could not compile the metal shader.');
        return shader;
      };
      program = gl.createProgram();
      if (!program) throw new Error('Could not allocate the metal program.');
      gl.attachShader(program, compile(gl.VERTEX_SHADER, 'attribute vec2 a; void main(){gl_Position=vec4(a,0.,1.);}'));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Could not link the metal shader.');
      gl.useProgram(program);
      buffer = gl.createBuffer();
      if (!buffer) throw new Error('Could not allocate the metal geometry.');
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const a = gl.getAttribLocation(program, 'a');
      gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
      const u = Object.fromEntries(['uSize', 'uCss', 'uHead', 'uLight', 'uReading'].map(name => [name, gl.getUniformLocation(program, name)]));
      const limit = Math.min(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), ...gl.getParameter(gl.MAX_VIEWPORT_DIMS));
      return {
        draw(width, height, head, light, reading) {
          const size = surfaceSize(width, height, window.devicePixelRatio || 1, limit);
          if (canvas.width !== size.width || canvas.height !== size.height) {
            canvas.width = size.width; canvas.height = size.height;
          }
          gl.viewport(0, 0, size.width, size.height);
          gl.uniform2f(u.uSize, size.width, size.height); gl.uniform2f(u.uCss, width, height);
          gl.uniform1f(u.uHead, head); gl.uniform1f(u.uLight, light); gl.uniform1f(u.uReading, reading);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        },
        release,
      };
    } catch (error) { release(); throw error; }
  }

  function install({ rail, head, shading }) {
    const root = document.documentElement;
    const canvas = document.createElement('canvas');
    canvas.id = 'metalRail'; canvas.setAttribute('aria-hidden', 'true');
    rail.append(canvas);
    let renderer = null, frameId = 0, until = 0;
    function frame(now) {
      frameId = 0;
      if (!renderer || document.hidden || root.matches('.drawer-open, .pages-open')) return;
      const box = rail.getBoundingClientRect(), block = head.querySelector('.block').getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0) return;
      const style = getComputedStyle(head);
      const level = Math.max(0, Math.min(1, parseFloat(style.getPropertyValue('--lamp')) || 0));
      const flicker = parseFloat(style.getPropertyValue('--flicker')) || 1;
      const reading = 1 - Number(getComputedStyle(shading).opacity);
      renderer.draw(box.width, box.height, block.left + block.width / 2 - box.left, level * flicker, reading);
      rail.classList.add('metal-ready');
      if (now < until) frameId = requestAnimationFrame(frame);
    }
    function wake() {
      until = performance.now() + 850;
      if (renderer && !frameId && !document.hidden) frameId = requestAnimationFrame(frame);
    }
    function initialize() {
      try { renderer = createRenderer(canvas); wake(); }
      catch { renderer = null; rail.classList.remove('metal-ready'); }
    }
    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault(); cancelAnimationFrame(frameId); frameId = 0;
      renderer = null; rail.classList.remove('metal-ready');
    });
    canvas.addEventListener('webglcontextrestored', initialize);
    const observer = new MutationObserver(wake);
    observer.observe(head, { attributes: true, attributeFilter: ['style'] });
    observer.observe(root, { attributes: true, attributeFilter: ['class', 'style'] });
    const resize = new ResizeObserver(wake); resize.observe(rail);
    document.addEventListener('visibilitychange', wake);
    initialize();
  }
  const api = { surfaceSize, createRenderer, install };
  if (typeof module !== 'undefined') module.exports = api;
  else window.TypelightMetal = api;
})();
