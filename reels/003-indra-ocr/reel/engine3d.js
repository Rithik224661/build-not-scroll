// engine3d.js — a deterministic 3D "studio world" for code-rendered reels.
// One continuous space the camera flies through (no slide-to-slide cuts), lit like a product shoot:
// glossy dark floor with real reflections of the environment, soft key + coloured rim, fog for depth,
// floating panels whose faces are live Canvas2D textures (UI, terminals, cards), drifting dust motes.
// Everything is a pure function of t: call world.render(t) and read world.canvas.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Reflector } from 'three/addons/objects/Reflector.js';

export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const lerp = (a, b, k) => a + (b - a) * k;
export const easeInOut = (x) => { x = clamp01(x); return x < 0.5 ? 8 * x ** 4 : 1 - Math.pow(-2 * x + 2, 4) / 2; };
export const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 4);
export const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
// smoother-step for camera moves (zero velocity and acceleration at the ends)
export const sstep = (x) => { x = clamp01(x); return x * x * x * (x * (x * 6 - 15) + 10); };

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function createWorld({ width = 1080, height = 1920, bg = '#07090D', fog = '#07090D', accent = '#7EF0C4', rim = '#4D8BFF', floor = true } = {}) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  r.setPixelRatio(1); r.setSize(width, height, false);
  r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
  r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(bg);
  scene.fog = new THREE.FogExp2(new THREE.Color(fog), 0.028);
  const pm = new THREE.PMREMGenerator(r);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;

  const camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 200);

  // lights: soft key from above-front, coloured rims, low fill
  const key = new THREE.SpotLight(0xffffff, 260, 40, Math.PI / 6, 0.75, 1.6);
  key.position.set(2.5, 9, 6); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.radius = 6; key.shadow.bias = -0.0005;
  scene.add(key, key.target);
  const rimA = new THREE.PointLight(new THREE.Color(accent), 60, 22, 2); rimA.position.set(-6, 3, -5); scene.add(rimA);
  const rimB = new THREE.PointLight(new THREE.Color(rim), 70, 24, 2); rimB.position.set(7, 4, -8); scene.add(rimB);
  scene.add(new THREE.HemisphereLight(0x9fb4d8, 0x0a0c10, 0.35));

  // floor: dark, slightly glossy, catches shadows and reflects the environment
  let floorMesh = null;
  if (floor) {
    // glossy floor = a real mirror (Reflector) under a translucent dark lacquer, so panels and lights
    // leave soft reflections like a product-shoot floor
    const mirror = new Reflector(new THREE.PlaneGeometry(400, 400), { textureWidth: width / 2, textureHeight: height / 2, color: 0x6b7480 });
    mirror.rotation.x = -Math.PI / 2; mirror.position.y = -0.001; scene.add(mirror);
    floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(400, 400),
      new THREE.MeshStandardMaterial({ color: 0x07090c, roughness: 0.6, metalness: 0.2, transparent: true, opacity: 0.88 }));
    floorMesh.rotation.x = -Math.PI / 2; floorMesh.receiveShadow = true; scene.add(floorMesh);
    const grid = new THREE.GridHelper(200, 100, 0x2a3442, 0x1a212c);
    grid.material.transparent = true; grid.material.opacity = 0.6; grid.position.y = 0.003; scene.add(grid);
  }
  // cyclorama light wall far behind everything: a huge soft glow that gives the frame a horizon and depth
  const wc = document.createElement('canvas'); wc.width = 512; wc.height = 512; const wx = wc.getContext('2d');
  const wg = wx.createRadialGradient(256, 300, 0, 256, 300, 300); wg.addColorStop(0, 'rgba(255,255,255,1)'); wg.addColorStop(0.5, 'rgba(255,255,255,.25)'); wg.addColorStop(1, 'rgba(255,255,255,0)');
  wx.fillStyle = wg; wx.fillRect(0, 0, 512, 512);
  const wallMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(wc), color: new THREE.Color(accent).multiplyScalar(0.32), transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(90, 50), wallMat); wall.position.set(0, 4, -70); scene.add(wall);
  const wall2 = new THREE.Mesh(new THREE.PlaneGeometry(70, 40), new THREE.MeshBasicMaterial({ map: wallMat.map, color: new THREE.Color(rim).multiplyScalar(0.28), transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  wall2.position.set(-30, 6, -60); scene.add(wall2);

  // dust motes: deterministic positions, slow drift, additive
  const rng = mulberry32(42), N = 420, pos = new Float32Array(N * 3), seeds = [];
  for (let i = 0; i < N; i++) { seeds.push([rng() * 40 - 20, rng() * 9 + 0.3, rng() * 50 - 40, rng() * 6.28]); }
  const dustG = new THREE.BufferGeometry(); dustG.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dc = document.createElement('canvas'); dc.width = dc.height = 64; const dx = dc.getContext('2d');
  const dg = dx.createRadialGradient(32, 32, 0, 32, 32, 32); dg.addColorStop(0, 'rgba(255,255,255,1)'); dg.addColorStop(0.4, 'rgba(255,255,255,.35)'); dg.addColorStop(1, 'rgba(255,255,255,0)');
  dx.fillStyle = dg; dx.fillRect(0, 0, 64, 64);
  const dust = new THREE.Points(dustG, new THREE.PointsMaterial({ size: 0.07, map: new THREE.CanvasTexture(dc), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xcfe9ff }));
  scene.add(dust);

  const updaters = [];

  // a floating panel: rounded slab with a live Canvas2D face. draw(ctx, t, w, h) paints the face each frame.
  function panel({ w = 3, h = 2, depth = 0.08, px = 1024, draw, glass = false, emissive = 1.0, radius = 0.12 }) {
    const ph = Math.round(px * h / w);
    const fc = document.createElement('canvas'); fc.width = px; fc.height = ph; const fx = fc.getContext('2d');
    const tex = new THREE.CanvasTexture(fc); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const group = new THREE.Group();
    const body = new THREE.Mesh(new RoundedBoxGeometry(w, h, depth, 6, Math.min(radius, depth / 2 - 0.001) > 0 ? Math.min(radius, depth / 2 - 0.001) : 0.01),
      new THREE.MeshPhysicalMaterial({ color: glass ? 0x1a2230 : 0x10141b, metalness: 0.3, roughness: glass ? 0.12 : 0.45, clearcoat: 1, clearcoatRoughness: 0.12, transparent: glass, opacity: glass ? 0.85 : 1 }));
    body.castShadow = true; group.add(body);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.06, h - 0.06), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent: true }));
    face.position.z = depth / 2 + 0.002; face.material.color.setScalar(emissive); group.add(face);
    // thin rim highlight
    const edge = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.02, 0.012), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18 }));
    edge.position.set(0, h / 2 - 0.02, depth / 2 + 0.003); group.add(edge);
    scene.add(group);
    const api = { group, face, canvas: fc, ctx: fx, w: px, h: ph, visible: 1 };
    updaters.push((t) => {
      group.visible = api.visible > 0.002;
      if (!group.visible) return;
      fx.setTransform(1, 0, 0, 1, 0, 0); fx.clearRect(0, 0, px, ph);
      draw && draw(fx, t, px, ph);
      tex.needsUpdate = true;
      face.material.opacity = api.visible; body.material.opacity = glass ? 0.85 * api.visible : api.visible; body.material.transparent = glass || api.visible < 1;
    });
    return api;
  }

  // camera rig: keyframes {t, p:[x,y,z], l:[x,y,z], fov?}; between keys we move with smootherstep,
  // positions follow a Catmull-Rom curve through the keys so the path never kinks.
  let keys = [];
  function cameraPath(k) { keys = k.slice().sort((a, b) => a.t - b.t); }
  const v = (a) => new THREE.Vector3(...a);
  function cam(t) {
    if (!keys.length) return;
    let i = keys.findIndex((k) => k.t > t); if (i === -1) i = keys.length; i = Math.max(1, Math.min(keys.length - 1, i));
    const a = keys[i - 1], b = keys[i], u = sstep((t - a.t) / Math.max(1e-6, b.t - a.t));
    const p0 = v((keys[i - 2] || a).p), p1 = v(a.p), p2 = v(b.p), p3 = v((keys[i + 1] || b).p);
    const curve = new THREE.CatmullRomCurve3([p0, p1, p2, p3], false, 'centripetal');
    const pos = t <= keys[0].t ? v(keys[0].p) : t >= keys[keys.length - 1].t ? v(keys[keys.length - 1].p) : curve.getPoint((1 + u) / 3);
    const look = t <= keys[0].t ? v(keys[0].l) : t >= keys[keys.length - 1].t ? v(keys[keys.length - 1].l) : v(a.l).lerp(v(b.l), u);
    // tiny deterministic handheld breathing (sub-degree, never a shake)
    pos.x += Math.sin(t * 0.7) * 0.025; pos.y += Math.sin(t * 0.53 + 1) * 0.018;
    camera.position.copy(pos); camera.lookAt(look);
    const fa = a.fov ?? 34, fb = b.fov ?? fa; camera.fov = lerp(fa, fb, u); camera.updateProjectionMatrix();
  }

  function render(t) {
    for (let i = 0; i < N; i++) {
      const [x, y, z, ph] = seeds[i];
      pos[i * 3] = x + Math.sin(t * 0.13 + ph) * 0.4; pos[i * 3 + 1] = y + Math.sin(t * 0.21 + ph * 2) * 0.25; pos[i * 3 + 2] = z + Math.cos(t * 0.11 + ph) * 0.4;
    }
    dustG.attributes.position.needsUpdate = true;
    cam(t);
    for (const u of updaters) u(t);
    r.render(scene, camera);
    return canvas;
  }

  return { THREE, scene, camera, renderer: r, canvas, key, rimA, rimB, panel, cameraPath, render, updaters, RoundedBoxGeometry, floor: floorMesh, wall, wall2 };
}
