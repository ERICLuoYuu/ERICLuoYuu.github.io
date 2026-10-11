/**
 * WebGL2 drawing for the clothes layer, in three passes:
 *
 *   1. shadow   — the cloth's depth as seen from the light, into a 2048² map
 *                 (only redrawn when cloth has moved; the light never does);
 *   2. occluder — the box's walls, flaps, floor, booklet and the table, into
 *                 the depth buffer only, so cloth behind them is hidden; their
 *                 colour is a soft black tint wherever cloth shades them;
 *   3. cloth    — each garment, textured, lit, shadowed and sharpened at its
 *                 cut-out edges with alpha-to-coverage.
 *
 * Everything is in parcel units; projection.js and shading.js provide the
 * matrices. This module only talks to WebGL.
 */

import { LIGHT_DIR, lightMatrix, vertexNormals, neighbourLists, cavity } from './shading.js';

const SHADOW_SIZE = 2048;
const SHADOW_STRENGTH = 0.38; // darkest tint a cloth shadow lays on the box, in full light
const SHADOW_BIAS = 0.0015; // ≈ 1.2 units of light depth
const DROP = 2.5; // particles float half a thickness above what they lie on; draw the cloth a little lower
const DARK = [0x14 / 255, 0x0d / 255, 0x07 / 255]; // .inside::after
const ATTRIBUTES = ['aPos', 'aNormal', 'aUv', 'aCavity'];

const PCF = `
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

const SHADOW_VS = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 2) in vec2 aUv;
uniform mat4 uLight;
out vec2 vUv;
void main() {
  vUv = aUv;
  gl_Position = uLight * vec4(aPos - vec3(0.0, 0.0, ${DROP.toFixed(1)}), 1.0);
}`;

const SHADOW_FS = `#version 300 es
precision mediump float;
uniform sampler2D uTex;
in vec2 vUv;
void main() {
  if (texture(uTex, vUv).a < 0.5) discard;
}`;

const OCCLUDER_VS = `#version 300 es
layout(location = 0) in vec3 aPos;
uniform mat4 uView;
uniform mat4 uLight;
out vec3 vShadow;
void main() {
  vShadow = (uLight * vec4(aPos, 1.0)).xyz * 0.5 + 0.5;
  gl_Position = uView * vec4(aPos, 1.0);
}`;

const OCCLUDER_FS = `#version 300 es
precision highp float;
${PCF}
uniform float uStrength;
in vec3 vShadow;
out vec4 outColor;
void main() {
  outColor = vec4(0.0, 0.0, 0.0, (1.0 - sunlit(vShadow)) * uStrength);
}`;

const CLOTH_VS = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aUv;
layout(location = 3) in float aCavity;
uniform mat4 uView;
uniform mat4 uLight;
out vec3 vPos;
out vec3 vNormal;
out vec3 vShadow;
out vec2 vUv;
out float vCavity;
void main() {
  vec3 p = aPos - vec3(0.0, 0.0, ${DROP.toFixed(1)});
  vPos = p;
  vNormal = aNormal;
  vUv = aUv;
  vCavity = aCavity;
  vShadow = (uLight * vec4(p, 1.0)).xyz * 0.5 + 0.5;
  gl_Position = uView * vec4(p, 1.0);
}`;

const CLOTH_FS = `#version 300 es
precision highp float;
${PCF}
uniform sampler2D uTex;
uniform vec3 uEye;
uniform vec3 uLightDir;
uniform float uSheen;
uniform float uLightLevel;
in vec3 vPos;
in vec3 vNormal;
in vec3 vShadow;
in vec2 vUv;
in float vCavity;
out vec4 outColor;
void main() {
  vec4 tex = texture(uTex, vUv); // premultiplied on upload
  // a crisp cut-out edge, about one pixel wide, whatever the zoom
  float alpha = clamp((tex.a - 0.5) / max(fwidth(tex.a), 1e-4) + 0.5, 0.0, 1.0);
  if (alpha < 0.01) discard;
  vec3 base = tex.rgb / max(tex.a, 1e-3);

  vec3 n = normalize(vNormal);
  vec3 toEye = normalize(uEye - vPos);
  bool back = dot(n, toEye) < 0.0;
  if (back) n = -n;
  float shade = max(0.0, dot(n, uLightDir)) * 0.6 + 0.4; // wrapped: soft fabric, no harsh terminator
  float sun = sunlit(vShadow);
  vec3 h = normalize(uLightDir + toEye);
  float sheen = pow(max(0.0, dot(n, h)), 20.0) * uSheen * 0.3 * sun;

  vec3 color = base * shade * mix(0.62, 1.0, sun) * vCavity * (back ? 0.78 : 1.0) + sheen;
  color = mix(color, vec3(${DARK.map((c) => c.toFixed(4)).join(', ')}), (1.0 - uLightLevel) * 0.95);
  outColor = vec4(color * alpha, alpha);
}`;

function compile(gl, type, source, name) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`the ${name} shader did not compile: ${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

/** Compile and link a program; returns it with its uniform locations by name. */
function createProgram(gl, name, vertex, fragment) {
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

function createShadowMap(gl) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, SHADOW_SIZE, SHADOW_SIZE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, texture, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error(`the shadow map framebuffer is incomplete (${status})`);
  return { texture, framebuffer };
}

function createTexture(gl, image, anisotropy) {
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

function vertexBuffer(gl, location, size, data, usage) {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, usage);
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
  return buffer;
}

/** Buffers, texture and scratch arrays for one garment. */
function createGarment(gl, mesh, image, sheen, anisotropy) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const normals = new Float32Array(3 * mesh.count);
  const shading = new Float32Array(mesh.count).fill(1);
  const garment = {
    mesh,
    sheen,
    vao,
    normals,
    shading,
    neighbours: neighbourLists(mesh),
    position: vertexBuffer(gl, ATTRIBUTES.indexOf('aPos'), 3, mesh.rest, gl.DYNAMIC_DRAW),
    normal: vertexBuffer(gl, ATTRIBUTES.indexOf('aNormal'), 3, normals, gl.DYNAMIC_DRAW),
    uv: vertexBuffer(gl, ATTRIBUTES.indexOf('aUv'), 2, mesh.uv, gl.STATIC_DRAW),
    cavity: vertexBuffer(gl, ATTRIBUTES.indexOf('aCavity'), 1, shading, gl.DYNAMIC_DRAW),
    count: mesh.tris.length,
    texture: createTexture(gl, image, anisotropy),
  };
  const indices = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, Uint16Array.from(mesh.tris), gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return garment;
}

function createOccluders(gl, quads) {
  const triangles = quads.flatMap(([a, b, c, d]) => [a, b, c, a, c, d]);
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  vertexBuffer(gl, ATTRIBUTES.indexOf('aPos'), 3, new Float32Array(triangles.flat()), gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return { vao, count: triangles.length };
}

/**
 * @param gl         a WebGL2 context (antialias on, premultiplied alpha)
 * @param meshes     each garment's mesh (mesh.js), in world order
 * @param images     each garment's decoded texture image
 * @param sheens     each garment's sheen strength, 0…1
 * @param occluders  quads of the box's solid surfaces (solids.occluderQuads)
 * @returns {{update(world, garments:number[]): void, draw(view): void}}
 */
export function createRenderer(gl, { meshes, images, sheens, occluders }) {
  const anisotropy = gl.getExtension('EXT_texture_filter_anisotropic');
  const programs = {
    shadow: createProgram(gl, 'shadow', SHADOW_VS, SHADOW_FS),
    occluder: createProgram(gl, 'occluder', OCCLUDER_VS, OCCLUDER_FS),
    cloth: createProgram(gl, 'cloth', CLOTH_VS, CLOTH_FS),
  };
  const shadowMap = createShadowMap(gl);
  const garments = meshes.map((mesh, g) => createGarment(gl, mesh, images[g], sheens[g], anisotropy));
  const solid = createOccluders(gl, occluders);
  const light = lightMatrix();
  let shadowStale = true;

  /** Copy the current shape of `changed` garments to the GPU. */
  function update(world, changed) {
    changed.forEach((g) => {
      const garment = garments[g];
      const offset = world.offsets[g];
      vertexNormals(world.pos, offset, garment.mesh.tris, garment.normals);
      cavity(world.pos, offset, garment.neighbours, garment.shading);
      gl.bindBuffer(gl.ARRAY_BUFFER, garment.position);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, world.pos.subarray(3 * offset, 3 * (offset + world.counts[g])));
      gl.bindBuffer(gl.ARRAY_BUFFER, garment.normal);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, garment.normals);
      gl.bindBuffer(gl.ARRAY_BUFFER, garment.cavity);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, garment.shading);
    });
    if (changed.length > 0) shadowStale = true;
  }

  function drawShadowMap() {
    const { program, uniforms } = programs.shadow;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, null); // never sample the map while drawing into it
    gl.bindFramebuffer(gl.FRAMEBUFFER, shadowMap.framebuffer);
    gl.viewport(0, 0, SHADOW_SIZE, SHADOW_SIZE);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(1.5, 3);
    gl.useProgram(program);
    gl.uniformMatrix4fv(uniforms.uLight, false, light);
    gl.uniform1i(uniforms.uTex, 0);
    gl.activeTexture(gl.TEXTURE0);
    garments.forEach((garment) => {
      gl.bindTexture(gl.TEXTURE_2D, garment.texture);
      gl.bindVertexArray(garment.vao);
      gl.drawElements(gl.TRIANGLES, garment.count, gl.UNSIGNED_SHORT, 0);
    });
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    shadowStale = false;
  }

  /** @param {{view: Float32Array, eye: number[], light: number, width: number, height: number}} frame */
  function draw({ view, eye, light: level, width, height }) {
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    if (shadowStale) drawShadowMap();

    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, shadowMap.texture);

    const occluder = programs.occluder;
    gl.useProgram(occluder.program);
    gl.uniformMatrix4fv(occluder.uniforms.uView, false, view);
    gl.uniformMatrix4fv(occluder.uniforms.uLight, false, light);
    gl.uniform1i(occluder.uniforms.uShadow, 1);
    gl.uniform1f(occluder.uniforms.uTexel, 1.5 / SHADOW_SIZE);
    gl.uniform1f(occluder.uniforms.uStrength, SHADOW_STRENGTH * level);
    gl.bindVertexArray(solid.vao);
    gl.drawArrays(gl.TRIANGLES, 0, solid.count);

    const cloth = programs.cloth;
    gl.useProgram(cloth.program);
    gl.uniformMatrix4fv(cloth.uniforms.uView, false, view);
    gl.uniformMatrix4fv(cloth.uniforms.uLight, false, light);
    gl.uniform1i(cloth.uniforms.uShadow, 1);
    gl.uniform1i(cloth.uniforms.uTex, 0);
    gl.uniform1f(cloth.uniforms.uTexel, 1.5 / SHADOW_SIZE);
    gl.uniform3fv(cloth.uniforms.uEye, eye);
    gl.uniform3fv(cloth.uniforms.uLightDir, LIGHT_DIR);
    gl.uniform1f(cloth.uniforms.uLightLevel, level);
    gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    gl.activeTexture(gl.TEXTURE0);
    garments.forEach((garment) => {
      gl.uniform1f(cloth.uniforms.uSheen, garment.sheen);
      gl.bindTexture(gl.TEXTURE_2D, garment.texture);
      gl.bindVertexArray(garment.vao);
      gl.drawElements(gl.TRIANGLES, garment.count, gl.UNSIGNED_SHORT, 0);
    });
    gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    gl.bindVertexArray(null);
  }

  return { update, draw };
}
