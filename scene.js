// One persistent 3D stage that morphs between slides.
// Liver, hepatic lobule, lymphocytes and autoantibodies are all procedural (Three.js).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';
import { Patho } from './patho.js?v=20261106b';

const C = {
  liver: 0xc94f6d,
  hema: 0x4f3fb5,
  hemaLight: 0x7262dc,
  plasma: 0x2c2672,
  bile: 0xd9a21b,
  vein: 0x6f8fd8,
  artery: 0xd0465f,
};

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(11);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const damp = (k, dt) => 1 - Math.exp(-k * dt);

const NOISE_GLSL = /* glsl */`
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

export class Scene3D {
  constructor(canvas) {
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.fast = location.search.includes('still'); // preview/debug: settle instantly
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }));
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1.0;

    this.scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(r);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.75;

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    const key = new THREE.DirectionalLight(0xffffff, 1.7); key.position.set(-3, 5, 4);
    const rim = new THREE.DirectionalLight(0xc9c0ff, 1.1); rim.position.set(4, -1, -3);
    this.scene.add(key, rim, new THREE.HemisphereLight(0xffffff, 0xeadff0, 0.5));

    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.uniforms = { uTime: { value: 0 }, uInflame: { value: 0 } };

    this.buildLiver();
    this.buildLobule();
    this.buildCells();
    this.buildAntibodies();
    this.patho = new Patho(this.scene);

    this.state = { liver: 1, lobule: 0, inflame: 0, shift: 0.2, camZ: 7, camY: 0.3, pathoOn: 0 };
    this.cur = { ...this.state, liver: 0, camZ: 9 };
    this.cellMode = 'orbit';
    this.abMode = 'hidden';
    this.t = 0;

    this.mouse = new THREE.Vector2();
    this.mouseS = new THREE.Vector2();
    addEventListener('pointermove', (e) => this.mouse.set((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1));

    this._v = new THREE.Vector3(); this._n = new THREE.Vector3(); this._q = new THREE.Quaternion();
    this._dummy = new THREE.Object3D(); this._up = new THREE.Vector3(0, 1, 0);

    this.clock = new THREE.Clock();
    this.resize();
    addEventListener('resize', () => this.resize());
    r.setAnimationLoop(() => this.tick());
  }

  set(cfg) {
    for (const k of Object.keys(this.state)) if (cfg[k] !== undefined) this.state[k] = cfg[k];
    if (cfg.cells) this.cellMode = cfg.cells;
    if (cfg.abs) this.abMode = cfg.abs;
    this.state.pathoOn = cfg.patho !== undefined ? 1 : 0;
    if (cfg.patho !== undefined) this.patho.setStep(cfg.patho);
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.w = w; this.h = h;
    this.renderer.setSize(w, h, false);
    this.patho?.labelRenderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ---------- builders ----------
  buildLiver() {
    let g = new THREE.SphereGeometry(1, 200, 140);
    g.deleteAttribute('uv'); g.deleteAttribute('normal');
    g = mergeVertices(g);
    const sn = new SimplexNoise();
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const t = (x + 1) / 2; // 0 = right lobe (viewer's left), 1 = left lobe tip
      const taper = 1 - 0.72 * smooth(0.3, 1.0, t);
      let X = x * 1.85;
      let Y = y * (y > 0 ? 1.12 : 0.55) * taper;
      let Z = z * 0.95 * taper;
      if (y < 0) Y += 0.3 * t * -y * taper; // inferior border rises toward the left lobe
      const notch = Math.exp(-(((x - 0.15) / 0.06) ** 2)); // falciform notch
      Y -= 0.12 * notch * Math.max(0, y);
      const n = sn.noise3d(X * 1.1, Y * 1.1, Z * 1.1) * 0.04 + sn.noise3d(X * 3, Y * 3, Z * 3) * 0.012;
      X += x * n; Y += y * n; Z += z * n;
      p.setXYZ(i, X, Y, Z);
    }
    g.computeVertexNormals();
    g.center();

    const m = new THREE.MeshPhysicalMaterial({
      color: C.liver, roughness: 0.36, clearcoat: 0.85, clearcoatRoughness: 0.22,
      sheen: 0.6, sheenColor: new THREE.Color(0xffc3d2), sheenRoughness: 0.5,
    });
    const u = this.uniforms;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = u.uTime; sh.uniforms.uInflame = u.uInflame;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vLPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLPos = position;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vLPos;\nuniform float uTime;\nuniform float uInflame;\n' + NOISE_GLSL)
        .replace('#include <color_fragment>', `#include <color_fragment>
          float nA = snoise(vLPos*2.3 + vec3(0.0,0.0,uTime*0.12));
          float nB = snoise(vLPos*7.0 - vec3(uTime*0.2));
          float patchy = smoothstep(0.05, 0.55, nA + 0.25*nB) * uInflame;
          vec3 hot = vec3(0.52,0.05,0.2);
          diffuseColor.rgb = mix(diffuseColor.rgb, hot, patchy*0.75);`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += vec3(0.6,0.05,0.18) * patchy * (0.18 + 0.12*sin(uTime*3.0));`);
    };

    this.liver = new THREE.Mesh(g, m);
    this.liver.rotation.set(0.35, -0.45, 0.08);
    this.liverGroup = new THREE.Group();
    this.liverGroup.add(this.liver);
    this.world.add(this.liverGroup);

    // surface samples, biased to the camera-facing side so the attack reads clearly
    const nrm = g.attributes.normal;
    this.surf = [];
    const tmp = new THREE.Vector3();
    let guard = 0;
    while (this.surf.length < 420 && guard++ < 20000) {
      const i = Math.floor(rand() * p.count);
      tmp.set(nrm.getX(i), nrm.getY(i), nrm.getZ(i)).applyEuler(this.liver.rotation);
      if (tmp.z < -0.25) continue;
      this.surf.push({
        p: new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)),
        n: new THREE.Vector3(nrm.getX(i), nrm.getY(i), nrm.getZ(i)),
      });
    }
  }

  buildLobule() {
    const L = (this.lobule = new THREE.Group());
    L.rotation.x = -0.62;
    this.world.add(L);
    const R = 2.1;
    const apothem = R * Math.cos(Math.PI / 6);
    this.corners = [];
    for (let k = 0; k < 6; k++) {
      const a = k * (Math.PI / 3) + Math.PI / 6;
      this.corners.push(new THREE.Vector3(R * Math.cos(a), R * Math.sin(a), 0));
    }
    const edgeDist = (a) => {
      const s = Math.PI / 3;
      const u = ((a % s) + s) % s;
      return apothem / Math.cos(Math.min(u, s - u));
    };

    // hepatocyte plates radiating from the central vein
    const cellsData = [];
    const cords = 56;
    for (let c = 0; c < cords; c++) {
      const a = (c / cords) * Math.PI * 2 + (rand() - 0.5) * 0.03;
      const dmax = edgeDist(a) - 0.1;
      for (let r = 0.42; r < dmax; r += 0.132) {
        const x = r * Math.cos(a), y = r * Math.sin(a);
        let near = 99;
        for (const cn of this.corners) near = Math.min(near, Math.hypot(x - cn.x, y - cn.y));
        if (near < 0.42) continue;
        cellsData.push({ x, y, a, near, s: 0.1 * (0.85 + 0.3 * rand()) });
      }
    }
    const hepGeo = new RoundedBoxGeometry(1, 1, 1, 2, 0.28);
    const hepMat = new THREE.MeshPhysicalMaterial({ roughness: 0.5, clearcoat: 0.4, sheen: 0.5, sheenColor: new THREE.Color(0xffe0ea) });
    const hep = new THREE.InstancedMesh(hepGeo, hepMat, cellsData.length);
    const d = new THREE.Object3D();
    const col = new THREE.Color();
    cellsData.forEach((c, i) => {
      d.position.set(c.x, c.y, 0);
      d.rotation.set(0, 0, c.a);
      d.scale.set(c.s * 1.05, c.s * 0.92, 0.16);
      d.updateMatrix();
      hep.setMatrixAt(i, d.matrix);
      // hepatocytes at the interface look injured (deeper eosin)
      const injured = smooth(0.95, 0.5, c.near);
      col.set(0xf3bccb).lerp(new THREE.Color(0xd9708e), injured * 0.85).offsetHSL(0, 0, (rand() - 0.5) * 0.04);
      hep.setColorAt(i, col);
    });
    L.add(hep);

    // central vein
    const cv = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.05, 16, 64), new THREE.MeshPhysicalMaterial({ color: C.vein, roughness: 0.3, clearcoat: 1 }));
    const cvIn = new THREE.Mesh(new THREE.CircleGeometry(0.27, 48), new THREE.MeshStandardMaterial({ color: 0xdfe6fb, roughness: 0.8 }));
    L.add(cv, cvIn);

    // portal triads
    const tube = (r, color) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.34, 24), new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, clearcoat: 1 }));
      m.rotation.x = Math.PI / 2;
      return m;
    };
    const ct = new THREE.MeshStandardMaterial({ color: 0xeee3f1, roughness: 0.9 });
    for (const cn of this.corners) {
      const g = new THREE.Group();
      g.position.copy(cn);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.34, 40), ct);
      disc.position.z = -0.05;
      const v = tube(0.1, C.vein); v.position.set(-0.08, 0.05, 0);
      const a = tube(0.05, C.artery); a.position.set(0.1, 0.08, 0);
      const b = tube(0.06, C.bile); b.position.set(0.03, -0.11, 0);
      g.add(disc, v, a, b);
      L.add(g);
    }

    // limiting plate outline
    const line = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(this.corners),
      new THREE.LineBasicMaterial({ color: 0xb4add6, transparent: true, opacity: 0.9 })
    );
    L.add(line);
    L.scale.setScalar(1e-4);
    L.visible = false;
  }

  buildCells() {
    const N = (this.NC = 150);
    const m = new THREE.MeshPhysicalMaterial({
      roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.15, sheen: 1, sheenColor: new THREE.Color(0xb8acff),
    });
    this.cells = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 28, 20), m, N);
    this.cells.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.cells.frustumCulled = false;
    const col = new THREE.Color();
    this.cp = [];
    for (let i = 0; i < N; i++) {
      const s = Array.from({ length: 8 }, rand);
      const r = rand();
      col.set(r < 0.6 ? C.hema : r < 0.85 ? C.hemaLight : C.plasma);
      this.cells.setColorAt(i, col);
      const spill = s[6] < 0.38;
      const ang = s[7] * Math.PI * 2;
      this.cp.push({
        s, k: 1.4 + 1.6 * s[0],
        pos: new THREE.Vector3((s[1] - 0.5) * 14, (s[2] - 0.5) * 8, -6),
        tgt: new THREE.Vector3(), sc: 0,
        home: new THREE.Vector3(-3 + 12 * Math.pow(s[1], 0.55), -4 + 8 * s[2], -3 - 5 * s[3]),
        // interface hepatitis offset (lobule local, relative to its portal corner)
        spill,
        off: spill
          ? { d: 0.3 + 0.55 * s[4], j: (s[5] - 0.5) * 0.42 }
          : { x: Math.cos(ang) * 0.34 * Math.sqrt(s[4]), y: Math.sin(ang) * 0.34 * Math.sqrt(s[4]) },
      });
    }
    this.scene.add(this.cells);
  }

  buildAntibodies() {
    const parts = [];
    const stem = new THREE.CylinderGeometry(0.11, 0.11, 0.8, 14); stem.translate(0, -0.4, 0); parts.push(stem);
    for (const s of [-1, 1]) {
      const arm = new THREE.CylinderGeometry(0.1, 0.1, 0.78, 14); arm.translate(0, 0.39, 0); arm.rotateZ(s * 0.7); parts.push(arm);
      const tip = new THREE.SphereGeometry(0.14, 14, 10); tip.translate(-s * Math.sin(0.7) * 0.8, Math.cos(0.7) * 0.8, 0); parts.push(tip);
    }
    parts.push(new THREE.SphereGeometry(0.16, 14, 10));
    const g = mergeGeometries(parts);
    g.scale(0.17, 0.17, 0.17);
    const m = new THREE.MeshPhysicalMaterial({ color: C.bile, roughness: 0.28, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.1 });
    const N = (this.NA = 72);
    this.abs = new THREE.InstancedMesh(g, m, N);
    this.abs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.abs.frustumCulled = false;
    this.ap = [];
    for (let i = 0; i < N; i++) {
      const s = Array.from({ length: 8 }, rand);
      this.ap.push({
        s, k: 1.2 + 1.5 * s[0],
        pos: new THREE.Vector3((s[1] - 0.5) * 10, (s[2] - 0.5) * 6, -4),
        q: new THREE.Quaternion(), tq: new THREE.Quaternion(), tgt: new THREE.Vector3(), sc: 0,
        home: new THREE.Vector3(-2 + 10 * Math.pow(s[3], 0.5), -3.6 + 7.2 * s[4], -2.5 - 4 * s[5]),
        surf: 60 + Math.floor(s[6] * 340),
      });
    }
    this.scene.add(this.abs);
  }

  // ---------- per-frame ----------
  cellTarget(i, c, t, out) {
    const s = c.s;
    switch (this.cellMode) {
      case 'orbit':
      case 'retreat': {
        const far = this.cellMode === 'retreat';
        const a = s[1] * 6.283 + t * (0.1 + 0.12 * s[2]) * (i % 2 ? 1 : -1);
        const rad = far ? 1.85 + s[3] * 0.9 : 1.75 + s[3] * 0.85;
        const inc = (s[4] - 0.5) * 1.3;
        const x = Math.cos(a) * rad + (far ? 0.35 : 0.15), z0 = Math.sin(a) * rad;
        out.set(x, z0 * Math.sin(inc) * 0.65 + Math.sin(t * 0.8 + s[5] * 9) * 0.08, z0 * Math.cos(inc) * 0.45 - (far ? 1.4 : 0));
        if (i % 3 !== 0 && far) return 0;
        if (i % 3 === 0 && !far) return 0; // keep the orbit airy
        return (0.038 + 0.03 * s[5]) * (far ? 0.75 : 1);
      }
      case 'attack': {
        const sp = this.surf[i % this.surf.length];
        this._v.copy(sp.n).multiplyScalar(0.07).add(sp.p);
        this.liver.localToWorld(out.copy(this._v));
        out.x += Math.sin(t * 2.1 + s[2] * 20) * 0.015;
        out.y += Math.cos(t * 1.7 + s[3] * 20) * 0.015;
        return (0.045 + 0.03 * s[5]) * Math.min(1, this.cur.liver * 1.2);
      }
      case 'interface': {
        const cn = this.corners[i % 6];
        if (c.spill) {
          const dir = this._n.copy(cn).multiplyScalar(-1).normalize();
          this._v.copy(cn).addScaledVector(dir, c.off.d);
          this._v.x += -dir.y * c.off.j; this._v.y += dir.x * c.off.j;
        } else {
          this._v.set(cn.x + c.off.x, cn.y + c.off.y, 0);
        }
        this._v.z = 0.14 + 0.06 * s[2] + Math.sin(t * 1.5 + s[3] * 10) * 0.02;
        this.lobule.localToWorld(out.copy(this._v));
        return (0.05 + 0.025 * s[5]) * this.cur.lobule;
      }
      case 'scatter': {
        out.copy(c.home);
        out.x += Math.sin(t * 0.21 + s[4] * 10) * 0.35;
        out.y += Math.cos(t * 0.17 + s[5] * 10) * 0.35;
        if (i % 2 === 1) return 0;
        return 0.03 + 0.04 * s[6];
      }
      default:
        out.copy(c.pos);
        return 0;
    }
  }

  abTarget(i, c, t, out) {
    const s = c.s;
    switch (this.abMode) {
      case 'bind': {
        const sp = this.surf[c.surf % this.surf.length];
        this.liver.getWorldQuaternion(this._q);
        const n = this._n.copy(sp.n).applyQuaternion(this._q).normalize();
        this.liver.localToWorld(out.copy(sp.p));
        out.addScaledVector(n, 0.13 + Math.sin(t * 1.3 + s[2] * 10) * 0.01);
        c.tq.setFromUnitVectors(this._up, n.negate());
        return Math.min(1, this.cur.liver * 1.2);
      }
      case 'swarm': {
        const a = s[1] * 6.283 + t * (0.12 + 0.1 * s[2]);
        const rad = 0.85 + s[3] * 1.25;
        const inc = (s[4] - 0.5) * 2.0;
        const x = Math.cos(a) * rad + 0.45, z0 = Math.sin(a) * rad;
        out.set(x, z0 * Math.sin(inc) + (s[5] - 0.5) * 0.7, z0 * Math.cos(inc));
        this._dummy.rotation.set(t * (0.4 + s[5]) + s[6] * 6, t * (0.3 + s[7]) + s[1] * 6, s[2] * 6);
        c.tq.setFromEuler(this._dummy.rotation);
        return i % 3 === 0 ? 0 : 0.95;
      }
      case 'scatter': {
        out.copy(c.home);
        out.x += Math.sin(t * 0.2 + s[4] * 10) * 0.4;
        out.y += Math.cos(t * 0.16 + s[5] * 10) * 0.4;
        this._dummy.rotation.set(t * 0.2 + s[6] * 6, t * 0.15 + s[7] * 6, 0);
        c.tq.setFromEuler(this._dummy.rotation);
        return i % 2 ? 0 : 0.6;
      }
      default:
        out.copy(c.pos);
        return 0;
    }
  }

  tick() {
    const rawDt = Math.min(this.clock.getDelta(), 0.05) * (this.fast ? 12 : 1);
    const dt = rawDt * (this.reduced ? 0.35 : 1);
    const t = (this.t += dt);
    const cur = this.cur;
    for (const k of Object.keys(this.state)) cur[k] += (this.state[k] - cur[k]) * damp(2.4, rawDt);

    this.uniforms.uTime.value = t;
    this.uniforms.uInflame.value = cur.inflame;

    this.liverGroup.scale.setScalar(Math.max(1e-4, cur.liver * 0.78));
    this.liverGroup.visible = cur.liver > 0.01;
    this.lobule.scale.setScalar(Math.max(1e-4, cur.lobule * 0.82));
    this.lobule.visible = cur.lobule > 0.01;
    this.lobule.rotation.z = t * 0.06;

    this.world.rotation.y = Math.sin(t * 0.25) * 0.2;
    this.world.rotation.x = Math.sin(t * 0.18) * 0.05;

    this.mouseS.lerp(this.mouse, damp(2, rawDt));
    const cam = this.camera;
    cam.position.set(this.mouseS.x * 0.35, cur.camY - this.mouseS.y * 0.2, cur.camZ);
    cam.lookAt(0, 0, 0);
    const shift = this.w < this.h ? cur.shift * 0.3 : cur.shift;
    cam.setViewOffset(this.w, this.h, -shift * this.w, 0, this.w, this.h);

    this.world.updateMatrixWorld(true);

    const d = this._dummy;
    const tgt = new THREE.Vector3();
    for (let i = 0; i < this.NC; i++) {
      const c = this.cp[i];
      const ts = this.cellTarget(i, c, t, tgt);
      c.pos.lerp(tgt, damp(c.k, rawDt));
      c.sc += (ts - c.sc) * damp(3, rawDt);
      d.position.copy(c.pos);
      d.rotation.set(0, 0, 0);
      d.scale.setScalar(Math.max(1e-4, c.sc * (1 + 0.07 * Math.sin(t * 3 + c.s[7] * 20))));
      d.updateMatrix();
      this.cells.setMatrixAt(i, d.matrix);
    }
    this.cells.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < this.NA; i++) {
      const c = this.ap[i];
      const ts = this.abTarget(i, c, t, tgt);
      c.pos.lerp(tgt, damp(c.k, rawDt));
      c.q.slerp(c.tq, damp(3, rawDt));
      c.sc += (ts - c.sc) * damp(3, rawDt);
      d.position.copy(c.pos);
      d.quaternion.copy(c.q);
      d.scale.setScalar(Math.max(1e-4, c.sc));
      d.updateMatrix();
      this.abs.setMatrixAt(i, d.matrix);
    }
    this.abs.instanceMatrix.needsUpdate = true;

    this.patho.update(dt, cur.pathoOn);
    this.renderer.render(this.scene, cam);
    this.patho.labelRenderer.render(this.scene, cam);
  }
}
