/**
 * WebGL2 pieces shared by the clothes and the rigid bodies: the shadow map's
 * size and lookup, the relief-map normal, the interior's darkness, and the
 * helpers that compile programs and upload buffers and textures.
 */

export const SHADOW_SIZE = 2048;
export const SHADOW_BIAS = 0.0015; // ≈ 1.2 units of light depth
export const DARK = [0x14 / 255, 0x0d / 255, 0x07 / 255]; // .inside::after
const FLAT_RELIEF = new Uint8Array([128]); // a surface without a relief map is lit as plain

/** GLSL: how much of the light reaches shadow-map point s, softened over 3 × 3 texels. */
export const PCF = `
uniform highp sampler2DShadow uShadow;
uniform float uTexel;
float sunlit(vec3 s) {
  if (s.x < 0.0 || s.x > 1.0 || s.y < 0.0 || s.y > 1.0 || s.z > 1.0) return 1.0;
  float sum = 0.0;
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      sum += texture(uShadow, vec3(s.xy + vec2(float(x), float(y)) * uTexel, s.z - ${SHADOW_BIAS}));
    }
  }
  return sum / 9.0;
}`;

/** GLSL: relief(n), the normal n tilted by the relief map. The shader declares `in vec3 vPos` and `in vec2 vUv` first. */
export const RELIEF_NORMAL = `
uniform sampler2D uRelief;
uniform vec2 uReliefTexel;
uniform float uBump;

// Tilt the normal by the relief map's slope along the surface's own u and v
// directions. The tangent frame comes from screen-space derivatives
// (Schüler's cotangent frame), so no tangents need storing per vertex.
vec3 relief(vec3 n) {
  float l = texture(uRelief, vUv - vec2(uReliefTexel.x, 0.0)).r;
  float r = texture(uRelief, vUv + vec2(uReliefTexel.x, 0.0)).r;
  float d = texture(uRelief, vUv - vec2(0.0, uReliefTexel.y)).r;
  float u = texture(uRelief, vUv + vec2(0.0, uReliefTexel.y)).r;
  vec3 dpx = dFdx(vPos);
  vec3 dpy = dFdy(vPos);
  vec2 dtx = dFdx(vUv);
  vec2 dty = dFdy(vUv);
  vec3 px = cross(dpy, n);
  vec3 py = cross(n, dpx);
  vec3 tu = px * dtx.x + py * dty.x;
  vec3 tv = px * dtx.y + py * dty.y;
  float scale = inversesqrt(max(max(dot(tu, tu), dot(tv, tv)), 1e-12));
  return normalize(n - uBump * scale * ((r - l) * tu + (u - d) * tv));
}`;

export function compile(gl, type, source, name) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`the ${name} shader did not compile: ${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

/** Compile and link a program; returns it with its uniform locations by name. */
export function createProgram(gl, name, vertex, fragment) {
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vertex, `${name} vertex`));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragment, `${name} fragment`));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`the ${name} program did not link: ${gl.getProgramInfoLog(program)}`);
  }
  const uniforms = {};
  const total = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < total; i += 1) {
    const { name: uniform } = gl.getActiveUniform(program, i);
    uniforms[uniform] = gl.getUniformLocation(program, uniform);
  }
  return { program, uniforms };
}

export function createTexture(gl, image, anisotropy) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true); // filter in premultiplied space: no dark fringes
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (anisotropy) gl.texParameterf(gl.TEXTURE_2D, anisotropy.TEXTURE_MAX_ANISOTROPY_EXT, 4);
  return texture;
}

/** Single-channel relief texture; a 1 × 1 plain one when the surface has none. */
export function createReliefTexture(gl, image) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  if (image) gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gl.RED, gl.UNSIGNED_BYTE, image);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, FLAT_RELIEF);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

export function vertexBuffer(gl, location, size, data, usage) {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, usage);
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
  return buffer;
}
