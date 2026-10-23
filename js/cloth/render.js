/**
 * WebGL2 drawing for the clothes layer, in three passes:
 *
 *   1. shadow   — the cloth's and the rigid bodies' depth as seen from the
 *                 light, into a 2048² map (only redrawn when something has
 *                 moved; the light never does);
 *   2. occluder — the box's walls, flaps, floor, booklet and the table, into
 *                 the depth buffer only, so cloth behind them is hidden; their
 *                 colour is a soft black tint wherever cloth shades them;
 *   3. cloth    — each garment, textured, lit, shadowed and sharpened at its
 *                 cut-out edges with alpha-to-coverage.
 *
 * The rigid bodies (js/rigid/render.js) join in: their contact shadows after
 * the occluders, the bodies after the cloth, and the figurine's bag last.
 *
 * Everything is in parcel units; projection.js and shading.js provide the
 * matrices. This module only talks to WebGL.
 */

import {
  LIGHT_DIR, CREASE, lightMatrix, vertexNormals, neighbourLists, cavity,
} from './shading.js';
import { createSmoother } from './smooth.js';
import {
  SHADOW_SIZE, DARK, PCF, RELIEF_NORMAL, createProgram, createTexture, createReliefTexture, vertexBuffer,
} from '../gl/common.js';

const SHADOW_STRENGTH = 0.38; // darkest tint a cloth shadow lays on the box, in full light
export const DROP = 1.25; // particles float half the pile's thickness (2.25) above what they lie on: draw the cloth lower, still 1 clear
const ATTRIBUTES = ['aPos', 'aNormal', 'aUv', 'aCavity'];
const FINE_CREASE = CREASE * 4; // the drawn mesh is twice as fine: creases sit a quarter as deep below neighbours

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
${RELIEF_NORMAL}

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
  n = relief(n);
  float shade = max(0.0, dot(n, uLightDir)) * 0.6 + 0.4; // wrapped: soft fabric, no harsh terminator
  float sun = sunlit(vShadow);
  vec3 h = normalize(uLightDir + toEye);
  float sheen = pow(max(0.0, dot(n, h)), 20.0) * uSheen * 0.3 * sun;

  vec3 color = base * shade * mix(0.62, 1.0, sun) * vCavity * (back ? 0.78 : 1.0) + sheen;
  color = mix(color, vec3(${DARK.map((c) => c.toFixed(4)).join(', ')}), (1.0 - uLightLevel) * 0.95);
  outColor = vec4(color * alpha, alpha);
}`;

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

/** Buffers, textures and scratch arrays for one garment, drawn as its smooth surface. */
function createGarment(gl, mesh, { image, relief, reliefTexel, sheen, bump }, anisotropy) {
  const smooth = createSmoother(mesh);
  if (smooth.count > 65535) throw new Error('a garment has too many points to draw with 16-bit indices');
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const positions = smooth.evaluate(mesh.rest, 0, new Float32Array(3 * smooth.count));
  const normals = new Float32Array(3 * smooth.count);
  const shading = new Float32Array(smooth.count).fill(1);
  const garment = {
    smooth,
    sheen,
    bump,
    vao,
    positions,
    normals,
    shading,
    neighbours: neighbourLists({ count: smooth.count, stretch: smooth.edges }),
    position: vertexBuffer(gl, ATTRIBUTES.indexOf('aPos'), 3, positions, gl.DYNAMIC_DRAW),
    normal: vertexBuffer(gl, ATTRIBUTES.indexOf('aNormal'), 3, normals, gl.DYNAMIC_DRAW),
    uv: vertexBuffer(gl, ATTRIBUTES.indexOf('aUv'), 2, smooth.uv, gl.STATIC_DRAW),
    cavity: vertexBuffer(gl, ATTRIBUTES.indexOf('aCavity'), 1, shading, gl.DYNAMIC_DRAW),
    count: smooth.tris.length,
    texture: createTexture(gl, image, anisotropy),
    relief: createReliefTexture(gl, relief),
    reliefTexel, // one texel of the relief file: the bump keeps its strength at any upload size
  };
  const indices = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, Uint16Array.from(smooth.tris), gl.STATIC_DRAW);
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
 * @param looks      each garment's {image, relief (or null), reliefTexel, sheen 0…1, bump}
 * @param occluders  quads of the box's solid surfaces (solids.occluderQuads)
 * @param rigid      the rigid bodies' renderer (js/rigid/render.js), drawn in the same passes, or null
 * @returns {{update(world, garments:number[]): void, draw(view): void, invalidateShadow(): void}}
 */
export function createRenderer(gl, {
  meshes, looks, occluders, rigid = null,
}) {
  const anisotropy = gl.getExtension('EXT_texture_filter_anisotropic');
  const programs = {
    shadow: createProgram(gl, 'shadow', SHADOW_VS, SHADOW_FS),
    occluder: createProgram(gl, 'occluder', OCCLUDER_VS, OCCLUDER_FS),
    cloth: createProgram(gl, 'cloth', CLOTH_VS, CLOTH_FS),
  };
  const shadowMap = createShadowMap(gl);
  const garments = meshes.map((mesh, g) => createGarment(gl, mesh, looks[g], anisotropy));
  const solid = createOccluders(gl, occluders);
  const light = lightMatrix();
  let shadowStale = true;

  /** Recompute the drawn surface of `changed` garments and copy it to the GPU. */
  function update(world, changed) {
    changed.forEach((g) => {
      const garment = garments[g];
      garment.smooth.evaluate(world.pos, world.offsets[g], garment.positions);
      vertexNormals(garment.positions, 0, garment.smooth.tris, garment.normals);
      cavity(garment.positions, 0, garment.neighbours, garment.shading, { crease: FINE_CREASE });
      gl.bindBuffer(gl.ARRAY_BUFFER, garment.position);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, garment.positions);
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
    rigid?.castShadow(light);
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
    const rigidFrame = {
      view, light, eye, level,
    };
    rigid?.drawContact(rigidFrame);

    const cloth = programs.cloth;
    gl.useProgram(cloth.program);
    gl.uniformMatrix4fv(cloth.uniforms.uView, false, view);
    gl.uniformMatrix4fv(cloth.uniforms.uLight, false, light);
    gl.uniform1i(cloth.uniforms.uShadow, 1);
    gl.uniform1i(cloth.uniforms.uTex, 0);
    gl.uniform1i(cloth.uniforms.uRelief, 2);
    gl.uniform1f(cloth.uniforms.uTexel, 1.5 / SHADOW_SIZE);
    gl.uniform3fv(cloth.uniforms.uEye, eye);
    gl.uniform3fv(cloth.uniforms.uLightDir, LIGHT_DIR);
    gl.uniform1f(cloth.uniforms.uLightLevel, level);
    const drawBody = (garment) => {
      gl.uniform1f(cloth.uniforms.uSheen, garment.sheen);
      gl.uniform1f(cloth.uniforms.uBump, garment.bump);
      gl.uniform2fv(cloth.uniforms.uReliefTexel, garment.reliefTexel);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, garment.relief);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, garment.texture);
      gl.bindVertexArray(garment.vao);
      gl.drawElements(gl.TRIANGLES, garment.count, gl.UNSIGNED_SHORT, 0);
    };
    gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    garments.forEach(drawBody);
    gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    gl.bindVertexArray(null);
    rigid?.drawSolid(rigidFrame);
    rigid?.drawWrap(rigidFrame);
  }

  /** Something that casts a shadow moved without the cloth moving (a rigid body): redraw the map. */
  function invalidateShadow() {
    shadowStale = true;
  }

  return { update, draw, invalidateShadow };
}
