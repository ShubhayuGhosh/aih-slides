// Step-through 3D model of AIH pathogenesis.
// Grounded in: Mieli-Vergani et al., Nat Rev Dis Primers 2018; Sîrbe et al., Int J Mol Sci 2021;
// de Boer et al., Gastroenterology 2014 (GWAS); Kerkar et al., J Immunol 2003 (CYP2D6 mimicry);
// Longhi et al., J Hepatol 2004 (Treg impairment).
import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const COL = {
  hep: 0xef9fb5, hepNuc: 0xb4476a, antigen: 0x7d1f43, dead: 0xbdb9c9, deadNuc: 0x8d8a99,
  apc: 0x3ba99c, apcArm: 0x74c9bb, cd4: 0x4f3fb5, treg: 0x7fa7e8, cd8: 0x2c2672,
  bcell: 0x9b8fe0, plasma: 0x8f5bd6, plasmaNuc: 0x4b2a86, virus: 0x6f8fd8, bile: 0xd9a21b,
  gut: 0x6fae8f, enterocyte: 0xa2b4df, enterocyteLeak: 0xc2bfcf, vessel: 0xeba7b8,
  thymus: 0xf0be95, thymusMed: 0xfae1c8, lps: 0xc58b5f, ink: 0x2c2672, cyto: 0xc04f9a,
  liverBg: 0xe69db3,
};
const mat = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, clearcoat: 0.9, clearcoatRoughness: 0.2, sheen: 0.4, sheenColor: new THREE.Color(0xffffff), ...o });
const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const damp = (k, dt) => 1 - Math.exp(-k * dt);
const P = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const Y = new THREE.Vector3(0, 1, 0);
const Zax = new THREE.Vector3(0, 0, 1);

export function antibodyGeometry(scale = 1) {
  const parts = [];
  const stem = new THREE.CylinderGeometry(0.11, 0.11, 0.8, 12); stem.translate(0, -0.4, 0); parts.push(stem);
  for (const s of [-1, 1]) {
    const arm = new THREE.CylinderGeometry(0.1, 0.1, 0.78, 12); arm.translate(0, 0.39, 0); arm.rotateZ(s * 0.7); parts.push(arm);
    const tip = new THREE.SphereGeometry(0.14, 12, 10); tip.translate(-s * Math.sin(0.7) * 0.8, Math.cos(0.7) * 0.8, 0); parts.push(tip);
  }
  parts.push(new THREE.SphereGeometry(0.16, 12, 10));
  const g = mergeGeometries(parts);
  g.scale(scale, scale, scale);
  return g;
}

export class Patho {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.step = 0;
    this.time = 0;
    this.tEnter = { 0: 0 };
    this.actors = {};

    const lr = (this.labelRenderer = new CSS2DRenderer());
    Object.assign(lr.domElement.style, { position: 'fixed', top: '0', left: '0', pointerEvents: 'none', zIndex: '1' });
    lr.domElement.className = 'labels';
    document.body.appendChild(lr.domElement);

    this.build();
  }

  // ---------- helpers ----------
  label(obj, html, y = 0.42, x = 0) {
    const d = document.createElement('div');
    d.className = 'lbl3d';
    d.innerHTML = html;
    d.style.opacity = '0';
    const l = new CSS2DObject(d);
    l.position.set(x, y, 0);
    obj.add(l);
    return { obj: l, el: d };
  }
  add(name, obj, labelHtml, ly, lx) {
    this.group.add(obj);
    const a = { obj, v: 0, tv: 0, sc: 1, tsc: 1, tpos: obj.position.clone(), lab: null };
    if (labelHtml) a.lab = this.label(obj, labelHtml, ly, lx);
    obj.scale.setScalar(1e-4);
    this.actors[name] = a;
    return a;
  }
  cell(color, r = 0.2, extra) {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 24), mat(color));
    g.add(m);
    g.userData.body = m;
    if (extra) extra(g, r);
    return g;
  }

  // ---------- build ----------
  build() {
    // Translucent liver parenchymal silhouette (compartment backdrop for stages 2–6)
    {
      const g = new THREE.Group();
      const sh = new THREE.Shape();
      sh.moveTo(-2.15, -1.65);
      sh.bezierCurveTo(-2.35, -0.35, -2.05, 1.45, -0.55, 1.75);
      sh.bezierCurveTo(0.15, 1.85, 1.95, 1.6, 2.35, 0.9);
      sh.bezierCurveTo(2.45, 0.45, 1.35, -0.55, 0.35, -1.35);
      sh.bezierCurveTo(-0.35, -1.85, -1.65, -1.9, -2.15, -1.65);
      const ext = new THREE.ExtrudeGeometry(sh, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 4 });
      ext.translate(0, 0, -0.55);
      const lobe = new THREE.Mesh(ext, new THREE.MeshPhysicalMaterial({
        color: COL.liverBg, transparent: true, opacity: 0.14, roughness: 0.6, clearcoat: 0.4, depthWrite: false,
      }));
      // Falciform ligament divider line
      const falcPts = [P(-0.22, 1.72, -0.42), P(-0.18, 0.45, -0.42), P(-0.08, -1.15, -0.42)];
      const falc = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(falcPts),
        new THREE.LineBasicMaterial({ color: 0xc98fa5, transparent: true, opacity: 0.45 })
      );
      g.add(lobe, falc);
      this.add('liverBg', g);
    }

    // DNA double helix (genetic susceptibility)
    {
      const g = new THREE.Group();
      const n = 38, r = 0.42, rise = 0.082, turn = 0.36;
      const ball = new THREE.SphereGeometry(0.055, 16, 12);
      const bb = new THREE.InstancedMesh(ball, mat(0xffffff), n * 2);
      const rung = new THREE.CylinderGeometry(0.022, 0.022, 2 * r, 8);
      const rr = new THREE.InstancedMesh(rung, mat(0xffffff, { clearcoat: 0.4 }), n);
      const d = new THREE.Object3D(), c = new THREE.Color();
      for (let i = 0; i < n; i++) {
        const y = (i - n / 2) * rise, t = i * turn;
        for (let s = 0; s < 2; s++) {
          const a = t + s * Math.PI;
          d.position.set(Math.cos(a) * r, y, Math.sin(a) * r); d.rotation.set(0, 0, 0); d.scale.setScalar(1); d.updateMatrix();
          bb.setMatrixAt(i * 2 + s, d.matrix);
          bb.setColorAt(i * 2 + s, c.set(s ? 0x4f3fb5 : 0xd95f80));
        }
        d.position.set(0, y, 0);
        d.quaternion.setFromUnitVectors(Y, P(Math.cos(t), 0, Math.sin(t)));
        d.updateMatrix();
        rr.setMatrixAt(i, d.matrix);
        const risk = i === 11 || i === 24;
        rr.setColorAt(i, c.set(risk ? COL.bile : i % 2 ? 0xd9d3ef : 0xf3c6d3));
      }
      g.add(bb, rr);
      const a = this.add('dna', g);
      a.chips = [
        this.label(g, 'HLA-DRB1*03:01<small>type 1 susceptibility (European cohorts)</small>', 0.85, 1.15),
        this.label(g, 'HLA-DRB1*04:01<small>type 1 susceptibility association</small>', -0.15, 1.15),
        this.label(g, 'Non-HLA genes<small>CTLA4, SH2B3, CARD10</small>', -0.95, 1.15),
      ];
    }

    // Thymus (bilobed organ with medulla & escaping autoreactive T cell)
    {
      const g = new THREE.Group();
      const lobeGeo = new THREE.SphereGeometry(0.24, 24, 18);
      lobeGeo.scale(0.85, 1.35, 0.65);
      const left = new THREE.Mesh(lobeGeo, mat(COL.thymus, { roughness: 0.45 }));
      left.position.set(-0.15, 0.02, 0); left.rotation.z = 0.18;
      const right = new THREE.Mesh(lobeGeo, mat(COL.thymus, { roughness: 0.45 }));
      right.position.set(0.15, 0, 0); right.rotation.z = -0.18;
      const medGeo = new THREE.SphereGeometry(0.11, 16, 12);
      const m1 = new THREE.Mesh(medGeo, mat(COL.thymusMed)); m1.position.set(-0.15, -0.02, 0.12);
      const m2 = new THREE.Mesh(medGeo, mat(COL.thymusMed)); m2.position.set(0.15, -0.04, 0.12);
      const tEscape = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 12), mat(COL.cd4));
      tEscape.position.set(0.02, 0.36, 0.14);
      g.add(left, right, m1, m2, tEscape);
      g.userData.tEscape = tEscape;
      this.add('thymus', g, 'Central tolerance<small>AIRE defects in APECED</small>', -0.52, 0);
    }

    // Hepatocyte cluster
    {
      const g = new THREE.Group();
      const prism = new THREE.CylinderGeometry(0.3, 0.3, 0.26, 6); prism.rotateX(Math.PI / 2);
      const nuc = new THREE.SphereGeometry(0.085, 20, 14);
      const bump = new THREE.SphereGeometry(0.04, 12, 8);
      this.heps = [];
      const offs = [P(0, 0)];
      for (let k = 0; k < 6; k++) { const a = (k * Math.PI) / 3 + Math.PI / 6; offs.push(P(Math.cos(a) * 0.56, Math.sin(a) * 0.56)); }
      offs.forEach((o) => {
        const h = new THREE.Group();
        h.position.copy(o);
        const body = new THREE.Mesh(prism, mat(COL.hep, { roughness: 0.45 }));
        const n = new THREE.Mesh(nuc, mat(COL.hepNuc)); n.position.z = 0.12;
        h.add(body, n);
        for (let b = 0; b < 2; b++) {
          const m = new THREE.Mesh(bump, mat(COL.antigen)); m.position.set(-0.1 + b * 0.2, 0.2, 0.12); h.add(m);
        }
        h.userData = { body, n, base: o.clone() };
        g.add(h);
        this.heps.push(h);
      });
      const a = this.add('heps', g, 'Hepatocytes<small>self-antigens: CYP2D6, SepSecS</small>', -0.82, -0.35);
      a.deadLab = this.label(this.heps[2], 'Apoptotic hepatocyte', -0.45, -0.55);
    }

    // Virus with look-alike epitopes (same colour as hepatocyte self-antigen)
    {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 1), mat(COL.virus, { flatShading: true })));
      const ico = new THREE.IcosahedronGeometry(1, 0);
      const seen = new Set(), p = ico.attributes.position;
      const stalk = new THREE.CylinderGeometry(0.012, 0.012, 0.09, 6); stalk.translate(0, 0.245, 0);
      const tip = new THREE.SphereGeometry(0.035, 10, 8); tip.translate(0, 0.3, 0);
      for (let i = 0; i < p.count; i++) {
        const v = P(p.getX(i), p.getY(i), p.getZ(i)).normalize();
        const key = v.toArray().map((x) => x.toFixed(2)).join();
        if (seen.has(key)) continue; seen.add(key);
        const q = new THREE.Quaternion().setFromUnitVectors(Y, v);
        const s = new THREE.Mesh(stalk, mat(COL.virus)); s.quaternion.copy(q);
        const t = new THREE.Mesh(tip, mat(COL.antigen)); t.quaternion.copy(q);
        g.add(s, t);
      }
      this.add('virus', g, 'Viral antigens<small>proposed molecular mimicry</small>', 0.48);
    }

    // Drug capsule (two-tone via vertex colours)
    {
      const geo = new THREE.CapsuleGeometry(0.09, 0.26, 8, 20);
      const p = geo.attributes.position, cols = [];
      const a = new THREE.Color(0xf4f2f9), b = new THREE.Color(COL.bile);
      for (let i = 0; i < p.count; i++) { const c = p.getY(i) > 0 ? a : b; cols.push(c.r, c.g, c.b); }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      const m = new THREE.Mesh(geo, mat(0xffffff, { vertexColors: true }));
      m.rotation.z = -0.7;
      const g = new THREE.Group(); g.add(m);
      this.add('pill', g, 'Drugs<small>nitrofurantoin, minocycline</small>', 0.42);
    }

    // Gut-liver axis: intestinal epithelial barrier (enterocytes + microvilli + disrupted tight junction + portal vessel)
    {
      const g = new THREE.Group();
      const cellGeo = new THREE.CapsuleGeometry(0.085, 0.22, 8, 14);
      const villusGeo = new THREE.CapsuleGeometry(0.016, 0.06, 4, 8);
      const nucGeo = new THREE.SphereGeometry(0.048, 12, 10);
      const tjGeo = new THREE.BoxGeometry(0.06, 0.022, 0.04);
      for (let i = 0; i < 5; i++) {
        const leaky = i === 2;
        const x = (i - 2) * 0.21 + (i > 2 ? 0.045 : i === 2 ? 0.015 : 0);
        const col = leaky ? COL.enterocyteLeak : COL.enterocyte;
        const c = new THREE.Mesh(cellGeo, mat(col, { roughness: 0.45 }));
        c.position.set(x, 0, 0);
        const n = new THREE.Mesh(nucGeo, mat(leaky ? 0x8d8a99 : 0x5c73b8));
        n.position.set(x, -0.04, 0.07);
        g.add(c, n);
        for (let v = -1; v <= 1; v++) {
          const mv = new THREE.Mesh(villusGeo, mat(col));
          mv.position.set(x + v * 0.045, 0.2, 0);
          g.add(mv);
        }
        // tight junctions between intact cells (absent at the leaky gap between i=1 and i=2)
        if (i === 0 || i === 3) {
          for (const dy of [0.06, 0.01]) {
            const tj = new THREE.Mesh(tjGeo, mat(COL.cd4));
            tj.position.set(x + 0.105, dy, 0.06);
            g.add(tj);
          }
        }
      }
      // Subepithelial portal vessel bar beneath lamina propria
      const vessel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.15, 14), mat(COL.vessel, { roughness: 0.5 }));
      vessel.rotation.z = Math.PI / 2;
      vessel.position.set(0, -0.28, -0.02);
      g.add(vessel);
      // Commensal / pathobiont rods above microvilli
      const rod = new THREE.CapsuleGeometry(0.032, 0.12, 6, 10);
      [[-0.22, 0.38, 0.3], [0.05, 0.42, -0.5], [0.28, 0.36, 0.8]].forEach(([x, y, r]) => {
        const m = new THREE.Mesh(rod, mat(COL.gut)); m.position.set(x, y, 0.04); m.rotation.z = r; g.add(m);
      });
      this.add('gut', g, 'Gut–liver signalling<small>proposed microbial translocation</small>', 0.56);
    }

    // Dendritic cell (APC)
    {
      const g = this.cell(COL.apc, 0.24, (grp) => {
        const cone = new THREE.ConeGeometry(0.05, 0.36, 8); cone.translate(0, 0.38, 0);
        for (let i = 0; i < 11; i++) {
          const v = P(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
          const m = new THREE.Mesh(cone, mat(COL.apcArm)); m.quaternion.setFromUnitVectors(Y, v); grp.add(m);
        }
      });
      this.add('apc', g, 'Dendritic cell (APC)', 0.62);
    }

    // Synapse marker: HLA class II + self-peptide → TCR
    {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), mat(COL.antigen, { emissive: new THREE.Color(0x7d1f43), emissiveIntensity: 0.4 })));
      this.add('synapse', g, 'HLA class II + self-peptide<small>presented to the T-cell receptor</small>', -0.36);
    }

    // CD4 T cell + clones
    this.add('cd4', this.cell(COL.cd4, 0.2), 'Naive CD4⁺ T cell', 0.38, -0.45);
    this.clones = [];
    const cOff = [P(0.38, 0.22), P(0.46, -0.18), P(0.1, -0.36), P(-0.24, 0.34)];
    cOff.forEach((o, i) => {
      const a = this.add('clone' + i, this.cell(i % 2 ? COL.cyto : COL.cd4, 0.15), i === 1 ? 'Th1 / Th17 cells<small>IFN-γ, IL-17</small>' : null, -0.34, 0.35);
      a.off = o;
      this.clones.push(a);
    });

    // Treg with ring
    this.add('treg', this.cell(COL.treg, 0.2, (grp, r) => {
      const t = new THREE.Mesh(new THREE.TorusGeometry(r * 1.25, 0.018, 8, 48), mat(COL.treg));
      t.rotation.x = 1.2; grp.add(t);
    }), 'Regulatory T cell<small>CD4⁺CD25⁺FOXP3⁺</small>', 0.42);

    // Dual Inhibition "brakes" ( ⊣ ) from Treg to CD4 AND Treg to APC (matching reference diagram)
    {
      const g = new THREE.Group();
      const bm = mat(COL.ink);
      const makeArm = () => ({
        a: new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1, 8), bm),
        b: new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1, 8), bm),
        bar: new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.04), bm),
        mid: new THREE.Object3D(),
      });
      this.brake1 = makeArm(); // Treg ⊣ CD4
      this.brake2 = makeArm(); // Treg ⊣ APC
      for (const br of [this.brake1, this.brake2]) g.add(br.a, br.b, br.bar, br.mid);
      const a = this.add('brake', g);
      a.lab = this.label(this.brake1.mid, 'Impaired immune regulation', 0.0, 0.62);
    }

    // CD8 cytotoxic T cell
    this.add('cd8', this.cell(COL.cd8, 0.2), 'CD8⁺ cytotoxic T cell<small>perforin, granzyme, Fas–FasL</small>', -0.38, 0.45);

    // B cell and plasma cell
    this.add('bcell', this.cell(COL.bcell, 0.18), 'B cell', 0.36, 0.2);
    this.add('plasma', this.cell(COL.plasma, 0.26, (grp) => {
      grp.userData.body.scale.set(1.25, 1, 1);
      const n = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 14), mat(COL.plasmaNuc)); n.position.set(0.17, 0.02, 0.1); grp.add(n);
      for (let i = 0; i < 3; i++) {
        const t = new THREE.Mesh(new THREE.TorusGeometry(0.1 + i * 0.045, 0.008, 6, 32, Math.PI * 0.9), mat(0xd9c8f5));
        t.position.set(-0.1, 0, 0.22); t.rotation.z = Math.PI * 0.55; grp.add(t);
      }
    }), 'Plasma cell<small>secretes IgG and autoantibodies</small>', -0.45, 0.35);

    // particle streams
    this.streams = {
      antigen: this.stream(14, COL.antigen, 0.035, 0.22, 0.25),
      lps: this.stream(12, COL.lps, 0.03, 0.18, 0.3),
      gran: this.stream(12, COL.bile, 0.03, 0.55, 0.1),
      cyto: this.stream(16, COL.cyto, 0.025, 0.3, 0.35),
      help: this.stream(10, COL.cd4, 0.026, 0.32, 0.15),
    };

    // antibodies
    this.abGeo = antibodyGeometry(0.11);
    this.abs = new THREE.InstancedMesh(this.abGeo, mat(COL.bile), 14);
    this.abs.frustumCulled = false;
    this.group.add(this.abs);
    this.abT = [];
    for (let i = 0; i < 14; i++) {
      const h = this.heps[[0, 1, 3, 5, 6, 4, 2][i % 7]];
      const ang = (i * 2.4) % (Math.PI * 2);
      this.abT.push({ hep: h, off: P(Math.cos(ang) * 0.26, Math.sin(ang) * 0.26, 0.2), delay: i * 0.22, q: new THREE.Quaternion() });
    }
  }

  stream(n, color, size, speed, arc) {
    const m = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), mat(color, { clearcoat: 0.2 }), n);
    m.frustumCulled = false;
    this.group.add(m);
    return { m, n, size, speed, arc, w: 0, tw: 0, from: P(0, 0), to: P(0, 0), seed: Array.from({ length: n }, () => Math.random()) };
  }

  // ---------- step logic ----------
  setStep(n) {
    if (n === this.step) return;
    const still = location.search.includes('still');
    for (const k of Object.keys(this.tEnter)) if (+k > n) delete this.tEnter[k];
    for (let k = 0; k < n; k++) if (this.tEnter[k] === undefined) this.tEnter[k] = this.time - 10;
    if (this.tEnter[n] === undefined) this.tEnter[n] = this.time - (still ? 10 : 0);
    this.step = n;
    const cd4 = this.actors.cd4.lab.el;
    cd4.innerHTML = n <= 2 ? 'Naive CD4⁺ T cell' : n === 3 ? 'Autoreactive CD4⁺ T cell<small>clonal expansion</small>' : 'Activated CD4⁺ helper T cell';
  }
  since(k) { return this.tEnter[k] === undefined ? -1 : this.time - this.tEnter[k]; }

  layout() {
    const s = this.step, A = this.actors;
    const set = (name, v, pos, sc = 1, from) => {
      const a = A[name];
      if (v && a.tv === 0 && from) { a.obj.position.copy(from); }
      a.tv = v ? 1 : 0; if (pos) a.tpos.copy(pos); a.tsc = sc;
    };
    set('liverBg', s >= 2, P(0.05, 0.1, 0), 1);
    set('dna', 1, s === 0 ? P(-0.55, 0.12) : P(-2.48, 1.55, -0.4), s === 0 ? 1.12 : 0.28);
    set('thymus', 1, s === 0 ? P(1.25, -0.65) : P(-2.48, -1.35, -0.35), s === 0 ? 1.15 : 0.38);
    set('heps', s >= 1, P(-0.45, -1.15));
    set('virus', s === 1 || (s === 2 && this.since(2) < 1.2), s === 2 ? P(-1.55, 0.45) : P(0.95, 0.95), s === 2 ? 0.4 : 1, P(2.6, 2.0));
    set('pill', s === 1, P(2.05, 0.48), 1, P(2.8, 1.0));
    set('gut', s === 1, P(1.55, -0.9), 1, P(2.8, -1.6));
    set('apc', s >= 2, P(-1.55, 0.45), 1, P(-2.4, 0.6));
    const syn = s >= 2;
    set('synapse', s === 2 && this.since(2) > 1.2, P(-1.18, 0.47, 0.15));
    const cd4Pos = s === 2 ? (this.since(2) > 0.6 ? P(-0.92, 0.48) : P(0.2, 0.75)) : P(-0.15, 0.45);
    set('cd4', syn, cd4Pos, 1, P(0.6, 0.9));
    set('treg', s >= 3, P(0.35, 1.42), 1, P(0.9, 2.2));
    const brokenAt = 1.3;
    set('brake', s >= 3);
    this.broken = s > 3 ? 1 : s === 3 ? ease((this.since(3) - brokenAt) / 0.8) : 0;
    const showClones = s > 3 || (s === 3 && this.since(3) > brokenAt + 0.5);
    this.clones.forEach((c, i) => {
      const on = showClones && (s > 3 || this.since(3) > brokenAt + 0.5 + i * 0.22);
      set('clone' + i, on, cd4Pos.clone().add(c.off), 1, cd4Pos);
    });
    set('cd8', s >= 4, P(0.55, -0.95), 1, P(1.3, -0.1));
    set('bcell', s >= 5, P(1.25, 0.55), 1, P(1.8, 1.2));
    set('plasma', s >= 5 && this.since(5) > 0.7, P(1.55, -0.3), 1, P(1.25, 0.55));
    this.deadK = s >= 4 ? ease((this.since(4) - 1.0) / 1.4) : 0;
    this.abK = s >= 5 ? this.since(5) - 1.2 : -1;
  }

  update(dt, on) {
    this.time += dt;
    const t = this.time;
    this.group.visible = on > 0.01;
    if (!this.group.visible) { this.labelRenderer.domElement.style.display = 'none'; return; }
    this.labelRenderer.domElement.style.display = '';
    this.group.scale.setScalar(Math.max(1e-4, on));
    this.layout();
    const A = this.actors, s = this.step;

    for (const [, a] of Object.entries(A)) {
      a.v += (a.tv - a.v) * damp(5, dt);
      a.sc += (a.tsc - a.sc) * damp(3, dt);
      a.obj.position.lerp(a.tpos, damp(2.6, dt));
      const k = ease(a.v);
      a.obj.scale.setScalar(Math.max(1e-4, k * a.sc));
      a.obj.visible = a.v > 0.01;
      if (a.lab) a.lab.el.style.opacity = a.v > 0.35 && on > 0.35 && a.tv === 1 && a.sc > 0.6 ? '1' : '0';
    }
    // labels with special rules
    A.dna.chips.forEach((c) => (c.el.style.opacity = s === 0 && on > 0.35 && A.dna.sc > 0.8 ? '1' : '0'));
    if (A.thymus.lab) A.thymus.lab.el.style.opacity = s === 0 && on > 0.35 && A.thymus.sc > 0.8 ? '1' : '0';
    A.heps.deadLab.el.style.opacity = this.deadK > 0.65 && s === 4 ? '1' : '0';
    A.brake.lab.el.style.opacity = this.broken > 0.45 && s === 3 ? '1' : '0';
    if (A.cd4.lab) A.cd4.lab.el.style.opacity = A.cd4.v > 0.35 && on > 0.35 && s <= 3 ? '1' : '0';
    if (A.clone1.lab) A.clone1.lab.el.style.opacity = A.clone1.v > 0.35 && s >= 4 ? '1' : '0';
    if (s === 6) for (const name of ['virus', 'pill', 'gut', 'synapse']) if (A[name].lab) A[name].lab.el.style.opacity = '0';

    // idle motion
    A.dna.obj.rotation.y += dt * 0.7;
    A.thymus.obj.rotation.y = Math.sin(t * 0.6) * 0.18;
    const te = A.thymus.obj.userData.tEscape;
    if (te) te.position.y = 0.34 + Math.sin(t * 1.8) * 0.05;
    A.apc.obj.rotation.y += dt * 0.25; A.apc.obj.rotation.x = Math.sin(t * 0.5) * 0.2;
    A.virus.obj.rotation.set(t * 0.4, t * 0.6, 0);
    A.gut.obj.rotation.z = Math.sin(t * 0.5) * 0.04;
    A.pill.obj.rotation.z = Math.sin(t * 0.8) * 0.25;
    for (const [i, name] of ['cd4', 'treg', 'cd8', 'bcell', 'plasma', 'clone0', 'clone1', 'clone2', 'clone3'].entries()) {
      A[name].obj.position.y += Math.sin(t * 1.3 + i * 1.7) * 0.0012;
    }

    // hepatocyte injury
    const dead = [2, 4];
    this.heps.forEach((h, i) => {
      const k = dead.includes(i) ? this.deadK : 0;
      h.userData.body.material.color.set(COL.hep).lerp(new THREE.Color(COL.dead), k);
      h.userData.n.material.color.set(COL.hepNuc).lerp(new THREE.Color(COL.deadNuc), k);
      h.scale.setScalar(1 - 0.18 * k);
      const jitter = s >= 4 && dead.includes(i) ? Math.sin(t * 9 + i) * 0.006 * (1 - k) : 0;
      h.position.set(h.userData.base.x + jitter, h.userData.base.y, 0);
    });

    // dual brakes ( ⊣ ) from Treg to CD4 and Treg to APC
    this.updateBrakeArm(this.brake1, A.treg.obj.position, A.cd4.obj.position, this.broken, 1);
    this.updateBrakeArm(this.brake2, A.treg.obj.position, A.apc.obj.position, this.broken, -1);

    // particle streams
    const hepW = (i) => A.heps.obj.position.clone().add(this.heps[i].userData.base);
    const st = this.streams;
    st.lps.tw = s === 1 ? 1 : 0; st.lps.from.copy(A.gut.obj.position).add(P(0, -0.25, 0)); st.lps.to.copy(hepW(5));
    st.antigen.tw = s >= 2 ? 1 : 0; st.antigen.from.copy(hepW(3)); st.antigen.to.copy(A.apc.obj.position);
    st.gran.tw = s >= 4 && this.since(4) > 0.5 ? 1 : 0; st.gran.from.copy(A.cd8.obj.position); st.gran.to.copy(hepW(4));
    st.cyto.tw = s >= 4 ? 1 : 0; st.cyto.from.copy(A.clone1.obj.position); st.cyto.to.copy(hepW(2));
    st.help.tw = s >= 5 ? 1 : 0; st.help.from.copy(A.cd4.obj.position); st.help.to.copy(A.bcell.obj.position);
    for (const S of Object.values(st)) this.updateStream(S, dt, t);

    // antibodies: plasma cell → hepatocyte surface, then stay bound
    const d = new THREE.Object3D();
    const src = A.plasma.obj.position;
    this.abT.forEach((a, i) => {
      const k = ease((this.abK - a.delay) / 1.3);
      const target = A.heps.obj.position.clone().add(a.hep.userData.base).add(a.off);
      d.position.lerpVectors(src, target, k);
      d.position.y += Math.sin(k * Math.PI) * 0.35;
      const dir = A.heps.obj.position.clone().add(a.hep.userData.base).sub(target).normalize();
      if (k < 1) d.rotation.set(t * 2 + i, t * 1.5, 0); else d.quaternion.setFromUnitVectors(Y, dir);
      if (k >= 1) a.q.copy(d.quaternion);
      d.scale.setScalar(this.abK > a.delay ? Math.min(1, (this.abK - a.delay) * 4) : 1e-4);
      d.updateMatrix();
      this.abs.setMatrixAt(i, d.matrix);
    });
    this.abs.instanceMatrix.needsUpdate = true;
  }

  updateBrakeArm(br, A, B, b, sign = 1) {
    const dir = B.clone().sub(A); dir.normalize();
    const start = A.clone().addScaledVector(dir, 0.27), end = B.clone().addScaledVector(dir, -0.34);
    const mid = start.clone().lerp(end, 0.5);
    const perp = P(-dir.y, dir.x, 0).multiplyScalar(sign);
    const half = start.distanceTo(mid) * 0.92;
    const qA = new THREE.Quaternion().setFromUnitVectors(Y, dir);
    const rot = (ang) => new THREE.Quaternion().setFromAxisAngle(Zax, ang * sign);
    br.a.position.copy(start.clone().lerp(mid, 0.5)).addScaledVector(perp, b * 0.035).addScaledVector(dir, -b * 0.04);
    br.a.quaternion.copy(rot(b * 0.18)).multiply(qA);
    br.a.scale.set(1, half * (1 - 0.22 * b), 1);
    br.b.position.copy(mid.clone().lerp(end, 0.5)).addScaledVector(perp, -b * 0.035).addScaledVector(dir, b * 0.04);
    br.b.quaternion.copy(rot(-b * 0.18)).multiply(qA);
    br.b.scale.set(1, half * (1 - 0.22 * b), 1);
    br.bar.position.copy(end).addScaledVector(perp, -b * 0.04).addScaledVector(dir, b * 0.03);
    br.bar.quaternion.copy(rot(-b * 0.18)).multiply(qA);
    br.mid.position.copy(mid);
    br.a.material.color.set(COL.ink).lerp(new THREE.Color(0xd95f80), b);
  }

  updateStream(S, dt, t) {
    S.w += (S.tw - S.w) * damp(3, dt);
    const d = new THREE.Object3D();
    const dir = S.to.clone().sub(S.from);
    const perp = P(-dir.y, dir.x, 0).normalize();
    for (let i = 0; i < S.n; i++) {
      const u = (t * S.speed + i / S.n + S.seed[i] * 0.05) % 1;
      d.position.lerpVectors(S.from, S.to, u).addScaledVector(perp, Math.sin(u * Math.PI) * S.arc * (0.6 + S.seed[i] * 0.8));
      d.position.z += (S.seed[i] - 0.5) * 0.2;
      d.scale.setScalar(Math.max(1e-4, S.size * S.w * Math.sqrt(Math.sin(u * Math.PI))));
      d.updateMatrix();
      S.m.setMatrixAt(i, d.matrix);
    }
    S.m.instanceMatrix.needsUpdate = true;
    S.m.visible = S.w > 0.01;
  }
}
