/**
 * WebGL2 drawing for the rigid bodies, called by the clothes renderer
 * (js/cloth/render.js) inside its passes:
 *
 *   castShadow  — each body's depth from the light, into the shadow map;
 *   drawContact — a soft dark patch where each body meets what it rests on;
 *   drawSolid   — each body as its heightfield, textured, lit and glossy;
 *   drawWrap    — the figurine's clear bag over it, blended, writing no depth.
 *
 * Everything is in parcel units; a body's mesh is built once in its own
 * space (heightfield.js) and moved into place by its model matrix.
 */

import { LIGHT_DIR } from '../cloth/shading.js';
import {
  SHADOW_SIZE, DARK, PCF, RELIEF_NORMAL, createProgram, createTexture, createReliefTexture, vertexBuffer,
} from '../gl/common.js';
import { heightfieldMesh, modelMatrix } from './heightfield.js';
import { CLEARANCE } from './load.js';

const ATTRIBUTES = ['aPos', 'aNormal', 'aUv'];
const GLOSS = { figurine: { sheen: 0.45, power: 40 }, food: { sheen: 0.12, power: 24 }, wrap: { sheen: 0.9, power: 80 } };
const PX = 4; // pixels a unit in the bodies' pictures
const DETAIL = 0.2; // share of the relief map's slope added on top of the heightfield's own shading
const CONTACT = { grow: 1.5, growPerLift: 0.25, above: 0.15, alpha: 0.55, fade: 15 };
const DARK_GLSL = `vec3(${DARK.map((c) => c.toFixed(4)).join(', ')})`;

const SHADOW_VS = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 2) in vec2 aUv;
uniform mat4 uLight;
uniform mat4 uModel;
out vec2 vUv;
void main() {
  vUv = aUv;
  gl_Position = uLight * uModel * vec4(aPos, 1.0);
}`;

const SHADOW_FS = `#version 300 es
precision mediump float;
uniform sampler2D uTex;
in vec2 vUv;
void main() {
  if (texture(uTex, vUv).a < 0.5) discard;
}`;

const SURFACE_VS = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aUv;
uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uLight;
out vec3 vPos;
out vec3 vNormal;
out vec3 vShadow;
out vec2 vUv;
void main() {
  vec4 p = uModel * vec4(aPos, 1.0);
  vPos = p.xyz;
  vNormal = mat3(uModel) * aNormal;
  vUv = aUv;
  vShadow = (uLight * p).xyz * 0.5 + 0.5;
  gl_Position = uView * p;
}`;

const SURFACE_HEAD = `#version 300 es
precision highp float;
${PCF}
uniform sampler2D uTex;
uniform vec3 uEye;
uniform vec3 uLightDir;
uniform float uSheen;
uniform float uPower;
uniform float uLightLevel;
in vec3 vPos;
in vec3 vNormal;
in vec3 vShadow;
in vec2 vUv;
out vec4 outColor;
${RELIEF_NORMAL}`;

// A painted, glazed solid: firm shading, a gloss that follows the light, a crisp cut-out edge.
const SOLID_FS = `${SURFACE_HEAD}
void main() {
  vec4 tex = texture(uTex, vUv); // premultiplied on upload
  float alpha = clamp((tex.a - 0.5) / max(fwidth(tex.a), 1e-4) + 0.5, 0.0, 1.0);
  if (alpha < 0.01) discard;
  vec3 base = tex.rgb / max(tex.a, 1e-3);
  vec3 n = relief(normalize(vNormal));
  vec3 toEye = normalize(uEye - vPos);
  float sun = sunlit(vShadow);
  float shade = max(0.0, dot(n, uLightDir)) * 0.7 + 0.35;
  float gloss = pow(max(0.0, dot(n, normalize(uLightDir + toEye))), uPower) * uSheen * sun;
  vec3 color = base * shade * mix(0.6, 1.0, sun) + gloss;
  color = mix(color, ${DARK_GLSL}, (1.0 - uLightLevel) * 0.95);
  outColor = vec4(color * alpha, alpha);
}`;

// Thin clear film: its own faint colour, and bright glints along its creases.
const WRAP_FS = `${SURFACE_HEAD}
void main() {
  vec4 tex = texture(uTex, vUv); // premultiplied on upload
  if (tex.a < 0.004) discard;
  vec3 base = tex.rgb / max(tex.a, 1e-3);
  vec3 n = relief(normalize(vNormal));
  vec3 toEye = normalize(uEye - vPos);
  float sun = sunlit(vShadow);
  float shade = max(0.0, dot(n, uLightDir)) * 0.5 + 0.5;
  // creases and edges, where the film is denser, catch the light; flat film hardly glints
  float crease = mix(0.12, 1.0, smoothstep(0.12, 0.35, tex.a));
  float glint = pow(max(0.0, dot(n, normalize(uLightDir + toEye))), uPower) * uSheen * sun * uLightLevel * crease;
  vec3 color = mix(base * shade, ${DARK_GLSL}, (1.0 - uLightLevel) * 0.95);
  outColor = vec4(min(color * tex.a + glint, vec3(1.0)), clamp(tex.a + glint * 0.6, 0.0, 1.0));
}`;

const CONTACT_VS = `#version 300 es
layout(location = 0) in vec3 aPos;
uniform mat4 uModel;
uniform mat4 uView;
uniform vec2 uHalf;
uniform vec2 uFootprint;
uniform float uGrow;
out vec2 vLocal;
out vec2 vUv;
void main() {
  vLocal = aPos.xy * (uHalf + uGrow);
  vUv = vLocal / uFootprint + 0.5;
  gl_Position = uView * uModel * vec4(vLocal, 0.0, 1.0);
}`;

const CONTACT_FS = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uHalf;
uniform float uGrow;
uniform float uAlpha;
uniform float uLod;
in vec2 vLocal;
in vec2 vUv;
out vec4 outColor;
float roundedBox(vec2 p, vec2 size, float r) {
  vec2 q = abs(p) - size + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
void main() {
  float d = roundedBox(vLocal, uHalf, min(uHalf.x, uHalf.y) * 0.35);
  // under the body's own silhouette, softened as far as the shadow spreads: the figure, not its clear bag
  float under = textureLod(uTex, vUv, uLod).a;
  float a = uAlpha * (1.0 - smoothstep(-uGrow, uGrow, d)) * under;
  outColor = vec4(0.0, 0.0, 0.0, a);
}`;

/** A heightfield's buffers and its pictures on the GPU. */
function createSurface(gl, {
  mesh, image, relief, reliefTexel, sheen, power, bump,
}, anisotropy) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  vertexBuffer(gl, ATTRIBUTES.indexOf('aPos'), 3, mesh.positions, gl.STATIC_DRAW);
  vertexBuffer(gl, ATTRIBUTES.indexOf('aNormal'), 3, mesh.normals, gl.STATIC_DRAW);
  vertexBuffer(gl, ATTRIBUTES.indexOf('aUv'), 2, mesh.uv, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return {
    vao,
    count: mesh.indices.length,
    texture: createTexture(gl, image, anisotropy),
    relief: createReliefTexture(gl, relief),
    reliefTexel,
    sheen,
    power,
    bump,
  };
}

/** A unit square, (−1, −1) to (1, 1), for the contact shadows. */
function createQuad(gl) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  vertexBuffer(gl, 0, 3, new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, 1, 1, 0, -1, 1, 0]), gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return vao;
}

/**
 * What the renderer draws for each body, from loadSolids()'s result.
 * @param {(image: HTMLImageElement) => TexImageSource} resize  the picture at the size this screen needs
 */
export function partsFor({ defs, images, reliefs, wraps, samplers }, resize) {
  const texel = (image) => [1 / image.naturalWidth, 1 / image.naturalHeight];
  return defs.map((def, i) => ({
    mesh: heightfieldMesh(def, samplers[i].shape),
    footprint: def.footprint,
    image: resize(images[i]),
    relief: resize(reliefs[i]),
    reliefTexel: texel(reliefs[i]),
    bump: (DETAIL * def.height * PX) / 2,
    ...GLOSS[def.id === 'figurine' ? 'figurine' : 'food'],
    wrap: wraps[i] && {
      mesh: heightfieldMesh({ footprint: def.footprint, height: def.height + CLEARANCE }, wraps[i].level),
      image: resize(wraps[i].image),
      relief: resize(wraps[i].relief),
      reliefTexel: texel(wraps[i].relief),
      bump: (DETAIL * (def.height + CLEARANCE) * PX) / 2,
      ...GLOSS.wrap,
    },
  }));
}

/**
 * @param gl     the clothes layer's WebGL2 context
 * @param parts  partsFor(): each body's {mesh, footprint, image, relief, reliefTexel, bump, sheen, power, wrap?}
 */
export function createRigidRenderer(gl, { parts }) {
  const anisotropy = gl.getExtension('EXT_texture_filter_anisotropic');
  const programs = {
    shadow: createProgram(gl, 'body shadow', SHADOW_VS, SHADOW_FS),
    solid: createProgram(gl, 'body', SURFACE_VS, SOLID_FS),
    wrap: createProgram(gl, 'bag', SURFACE_VS, WRAP_FS),
    contact: createProgram(gl, 'contact shadow', CONTACT_VS, CONTACT_FS),
  };
  const solids = parts.map((part) => createSurface(gl, part, anisotropy));
  // picture texels a unit, as uploaded: how far up the mipmaps a contact shadow's softness reaches
  const texels = parts.map(({ image, footprint }) => (image.naturalWidth ?? image.width) / footprint[0]);
  const wraps = parts.map((part) => (part.wrap ? createSurface(gl, part.wrap, anisotropy) : null));
  const quad = createQuad(gl);
  let placements = [];

  /** Where each body is drawn, and its contact shadow on what it rests on. */
  function setPlacements(bodies, supports) {
    placements = bodies.map((body, i) => {
      const [x, y, z] = body.position;
      const lift = Math.max(0, z - supports[i]);
      const grow = CONTACT.grow + CONTACT.growPerLift * lift;
      return {
        model: modelMatrix(body),
        contact: {
          model: modelMatrix({ position: [x, y, supports[i] + CONTACT.above], rotate: body.rotate }),
          half: body.footprint.map((v) => (v / 2) * (1 - body.inset)),
          footprint: body.footprint,
          grow,
          alpha: CONTACT.alpha / (1 + lift / CONTACT.fade),
          lod: Math.log2(Math.max(1, grow * texels[i])),
        },
      };
    });
  }

  /** Into the shadow map the clothes renderer has bound (its viewport and polygon offset set). */
  function castShadow(light) {
    const { program, uniforms } = programs.shadow;
    gl.useProgram(program);
    gl.uniformMatrix4fv(uniforms.uLight, false, light);
    gl.uniform1i(uniforms.uTex, 0);
    gl.activeTexture(gl.TEXTURE0);
    placements.forEach(({ model }, i) => {
      gl.uniformMatrix4fv(uniforms.uModel, false, model);
      gl.bindTexture(gl.TEXTURE_2D, solids[i].texture);
      gl.bindVertexArray(solids[i].vao);
      gl.drawElements(gl.TRIANGLES, solids[i].count, gl.UNSIGNED_SHORT, 0);
    });
    gl.bindVertexArray(null);
  }

  function drawContact({ view, level }) {
    const { program, uniforms } = programs.contact;
    gl.useProgram(program);
    gl.uniformMatrix4fv(uniforms.uView, false, view);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.uniform1i(uniforms.uTex, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(quad);
    placements.forEach(({ contact }, i) => {
      gl.uniformMatrix4fv(uniforms.uModel, false, contact.model);
      gl.uniform2fv(uniforms.uHalf, contact.half);
      gl.uniform2fv(uniforms.uFootprint, contact.footprint);
      gl.uniform1f(uniforms.uGrow, contact.grow);
      gl.uniform1f(uniforms.uAlpha, contact.alpha * level);
      gl.uniform1f(uniforms.uLod, contact.lod);
      gl.bindTexture(gl.TEXTURE_2D, solids[i].texture);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    });
    gl.bindVertexArray(null);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  /** One pass of `surfaces` (solids or wraps) with `program`, the shadow map on unit 1. */
  function drawSurfaces(program, surfaces, { view, light, eye, level }) {
    const { uniforms } = program;
    gl.useProgram(program.program);
    gl.uniformMatrix4fv(uniforms.uView, false, view);
    gl.uniformMatrix4fv(uniforms.uLight, false, light);
    gl.uniform1i(uniforms.uShadow, 1);
    gl.uniform1i(uniforms.uTex, 0);
    gl.uniform1i(uniforms.uRelief, 2);
    gl.uniform1f(uniforms.uTexel, 1.5 / SHADOW_SIZE);
    gl.uniform3fv(uniforms.uEye, eye);
    gl.uniform3fv(uniforms.uLightDir, LIGHT_DIR);
    gl.uniform1f(uniforms.uLightLevel, level);
    placements.forEach(({ model }, i) => {
      const surface = surfaces[i];
      if (!surface) return;
      gl.uniformMatrix4fv(uniforms.uModel, false, model);
      gl.uniform1f(uniforms.uSheen, surface.sheen);
      gl.uniform1f(uniforms.uPower, surface.power);
      gl.uniform1f(uniforms.uBump, surface.bump);
      gl.uniform2fv(uniforms.uReliefTexel, surface.reliefTexel);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, surface.relief);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, surface.texture);
      gl.bindVertexArray(surface.vao);
      gl.drawElements(gl.TRIANGLES, surface.count, gl.UNSIGNED_SHORT, 0);
    });
    gl.bindVertexArray(null);
  }

  function drawSolid(frame) {
    gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    drawSurfaces(programs.solid, solids, frame);
    gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
  }

  function drawWrap(frame) {
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    drawSurfaces(programs.wrap, wraps, frame);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  return {
    setPlacements, castShadow, drawContact, drawSolid, drawWrap,
  };
}
