/**
 * Het draaibare beeld van een `@3d`-blok, met three.js.
 *
 * Dit bestand wordt pas geladen als een uitwerking een 3D-blok heeft
 * (drieD.ts, `laadWeergave`); three.js zit zo niet in het startpakket.
 *
 * De rekenkern levert de scène als JSON in `data-scene` (packages/core/src/
 * drieD.ts). De vorm van elk lichaam komt uit `drieDVlakken` van de kern, en
 * het eerste standpunt uit `drieDBeeldvlak`: zo tonen het draaibare beeld, de
 * stilstaande projectie in de kern en de afbeelding op papier hetzelfde.
 *
 * Twee gebruikers:
 *   Kijker           het beeld in de uitwerking: draaien, zoomen, schuiven met
 *                    de muis, knoppen voor de standpunten. Blijft bestaan over
 *                    herberekeningen heen (`verhuis`), zodat het standpunt niet
 *                    bij elke toetsaanslag terugspringt.
 *   naarAfbeelding   één beeld als PNG, voor het afdrukvoorbeeld en de afdruk.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  drieDBeeldvlak, drieDGrenzen, drieDGrootte, drieDVlakken,
  type DrieDElement, type DrieDScene, type Punt3D,
} from "@ifc-calc/core";
import { sprite } from "../ribbon/calcIcons";

/** De achtergrond van de uitwerking: papier. */
export const PAPIER = "#fafaf9";
const RASTER = "#e2dfdc";
export const FOV = 30;
/** De richting van het licht, gelijk aan die van de stilstaande projectie. */
const LICHT = new THREE.Vector3(0.35, -0.55, 1).normalize();
const ASKLEUREN: [Punt3D, string, string][] = [
  [[1, 0, 0], "#dc2626", "x"],
  [[0, 1, 0], "#16a34a", "y"],
  [[0, 0, 1], "#2563eb", "z"],
];

export type Standpunt = DrieDScene["camera"];

/** De teksten van de knoppen; ze volgen de taal van de app (rekentaal.json, drieD). */
export interface DrieDTeksten {
  hint: string;
  standpunt: Record<Standpunt, string>;
  passend: string;
}

// ── Het model ─────────────────────────────────────────────────────────────────

export interface Model {
  groep: THREE.Group;
  /** De grenzen van de elementen (zonder raster en assen); daarop past het standpunt. */
  grenzen: THREE.Box3;
}

const v3 = (p: Punt3D) => new THREE.Vector3(p[0], p[1], p[2]);

/** De vlakken van een lichaam als driehoeken, elk vlak met zijn eigen normaal (scherpe randen). */
function vlakkenGeometrie(el: DrieDElement): THREE.BufferGeometry | null {
  const vlakken = drieDVlakken(el);
  if (vlakken.length === 0) return null;
  const pos: number[] = [];
  const nor: number[] = [];
  for (const v of vlakken) {
    const p = v.punten.map(v3);
    // Newell: ook goed als drie punten bijna op een lijn liggen.
    const n = new THREE.Vector3();
    for (let k = 0; k < p.length; k++) {
      const a = p[k];
      const b = p[(k + 1) % p.length];
      n.x += (a.y - b.y) * (a.z + b.z);
      n.y += (a.z - b.z) * (a.x + b.x);
      n.z += (a.x - b.x) * (a.y + b.y);
    }
    n.normalize();
    for (let k = 1; k + 1 < p.length; k++) {
      for (const q of [p[0], p[k], p[k + 1]]) {
        pos.push(q.x, q.y, q.z);
        nor.push(n.x, n.y, n.z);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

/** Een cilinder van a naar b (staaf, as, schacht van een pijl). */
function cilinder(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material, segmenten = 10): THREE.Mesh | null {
  const d = new THREE.Vector3().subVectors(b, a);
  const L = d.length();
  if (!(L > 0)) return null;
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, segmenten), mat);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  m.position.copy(a).add(b).multiplyScalar(0.5);
  return m;
}

/** Een pijl met de punt op `naar`; de kop schaalt met de pijl, maar niet verder dan de scène. */
function pijl(van: THREE.Vector3, naar: THREE.Vector3, S: number, mat: THREE.Material): THREE.Object3D[] {
  const d = new THREE.Vector3().subVectors(naar, van);
  const L = d.length();
  if (!(L > 0)) return [];
  const e = d.clone().normalize();
  const kop = Math.min(0.35 * L, 0.045 * S);
  const rKop = kop * 0.38;
  const voet = naar.clone().addScaledVector(e, -kop);
  const uit: THREE.Object3D[] = [];
  const schacht = cilinder(van, voet, rKop * 0.32, mat, 8);
  if (schacht) uit.push(schacht);
  const kegel = new THREE.Mesh(new THREE.ConeGeometry(rKop, kop, 16), mat);
  kegel.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), e);
  kegel.position.copy(naar).addScaledVector(e, -kop / 2);
  uit.push(kegel);
  return uit;
}

/** Een tekst die altijd naar de kijker staat en nooit achter iets verdwijnt. */
function label(tekst: string, kleur: string, hoogte: number): THREE.Sprite {
  const px = 64;
  const font = `700 ${px}px "Segoe UI", Inter, system-ui, sans-serif`;
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");
  let breedte = px * Math.max(1, tekst.length) * 0.6;
  if (ctx) {
    ctx.font = font;
    breedte = ctx.measureText(tekst).width;
  }
  c.width = Math.ceil(breedte) + 24;
  c.height = px + 24;
  if (ctx) {
    ctx.font = font;
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = 8;
    ctx.strokeStyle = "rgba(250, 250, 249, 0.95)";
    ctx.strokeText(tekst, 12, c.height / 2);
    ctx.fillStyle = kleur;
    ctx.fillText(tekst, 12, c.height / 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.center.set(0, 0.25);
  s.scale.set((hoogte * c.width) / c.height, hoogte, 1);
  s.renderOrder = 10;
  return s;
}

/** Een mooie stap voor het raster: 1, 2 of 5 maal een macht van tien (zoals in de kern). */
function mooieStap(ruw: number): number {
  if (!(ruw > 0)) return 1;
  const macht = 10 ** Math.floor(Math.log10(ruw));
  const f = ruw / macht;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * macht;
}

/**
 * Bouwt de scène op: de lichamen met hun randen, lijnen, pijlen, teksten,
 * raster en assen. `tekstSchaal` vergroot de teksten (op papier staat het
 * beeld kleiner dan op het scherm).
 */
export function bouwModel(scene: DrieDScene, tekstSchaal = 1): Model {
  const groep = new THREE.Group();
  const S = drieDGrootte(scene);
  const materialen = new Map<string, THREE.MeshLambertMaterial>();
  const materiaal = (kleur: string, opaciteit = 1) => {
    const sleutel = `${kleur}|${opaciteit}`;
    let m = materialen.get(sleutel);
    if (!m) {
      m = new THREE.MeshLambertMaterial({
        color: new THREE.Color(kleur), side: THREE.DoubleSide,
        // De randen liggen zo net vóór de vlakken, zonder te flikkeren.
        polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
        ...(opaciteit < 1 ? { transparent: true, opacity: opaciteit, depthWrite: false } : {}),
      });
      materialen.set(sleutel, m);
    }
    return m;
  };
  const randen = new Map<string, THREE.LineBasicMaterial>();
  const rand = (kleur: string) => {
    let m = randen.get(kleur);
    if (!m) {
      m = new THREE.LineBasicMaterial({ color: new THREE.Color(kleur).multiplyScalar(0.42) });
      randen.set(kleur, m);
    }
    return m;
  };

  for (const el of scene.elementen) {
    switch (el.soort) {
      case "staaf": {
        const m = cilinder(v3(el.van), v3(el.naar), S * 0.0022, materiaal(el.kleur), 6);
        if (m) groep.add(m);
        break;
      }
      case "pijl":
        groep.add(...pijl(v3(el.van), v3(el.naar), S, materiaal(el.kleur)));
        break;
      case "knoop": {
        const m = new THREE.Mesh(new THREE.SphereGeometry(el.r, 20, 14), materiaal(el.kleur));
        m.position.copy(v3(el.plek));
        groep.add(m);
        break;
      }
      case "tekst": {
        const s = label(el.tekst, el.kleur, S * 0.052 * tekstSchaal);
        s.position.copy(v3(el.plek));
        groep.add(s);
        break;
      }
      case "net": {
        // Het vlak van een @fem-model: elk vlak in zijn eigen kleur (de klassen van de
        // legenda), beide kanten zichtbaar, met de normaal per vlak voor het licht.
        const pos: number[] = [];
        const nor: number[] = [];
        const kleur: number[] = [];
        const c = new THREE.Color();
        el.vlakken.forEach((v, i) => {
          const p = v.map((k) => v3(el.punten[k]));
          const n = new THREE.Vector3().subVectors(p[2], p[0]).cross(new THREE.Vector3().subVectors(p[3], p[1])).normalize();
          c.set(el.kleuren[i] ?? el.kleur);
          for (const q of [p[0], p[1], p[2], p[0], p[2], p[3]]) {
            pos.push(q.x, q.y, q.z);
            nor.push(n.x, n.y, n.z);
            kleur.push(c.r, c.g, c.b);
          }
        });
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
        g.setAttribute("color", new THREE.Float32BufferAttribute(kleur, 3));
        groep.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
        break;
      }
      default: {
        const g = vlakkenGeometrie(el);
        if (!g) break;
        const mesh = new THREE.Mesh(g, materiaal(el.kleur, el.soort === "vlakken" ? el.opaciteit : 1));
        // Een lichaam uit een IFCX-document onthoudt zijn element (ifcxWeergave.ts).
        if (el.soort === "vlakken" && el.pad) mesh.userData.pad = el.pad;
        groep.add(mesh);
        // Een lichaam zonder omtreklijn (een wapeningsstaaf, ifcxLezen.ts) ook hier zonder.
        if (el.soort !== "vlakken" || el.vlakken.some((v) => v.rand)) {
          groep.add(new THREE.LineSegments(new THREE.EdgesGeometry(g, 20), rand(el.kleur)));
        }
      }
    }
  }

  // De grenzen van de elementen zelf, zonder raster en assen.
  const kern = drieDGrenzen(scene);
  const grenzen = kern
    ? new THREE.Box3(v3(kern.min), v3(kern.max))
    : new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(S, S, S * 0.3));
  // Een tekst telt mee met zijn breedte, zodat hij er bij het passend maken op staat.
  groep.updateMatrixWorld(true);
  if (kern) grenzen.union(new THREE.Box3().setFromObject(groep, true));

  if (scene.raster) {
    const lo = grenzen.min;
    const hi = grenzen.max;
    const spanne = Math.max(hi.x - lo.x, hi.y - lo.y, S * 0.2);
    const marge = 0.15 * spanne;
    const stap = mooieStap(spanne / 8);
    const x0 = Math.floor((lo.x - marge) / stap) * stap;
    const x1 = Math.ceil((hi.x + marge) / stap) * stap;
    const y0 = Math.floor((lo.y - marge) / stap) * stap;
    const y1 = Math.ceil((hi.y + marge) / stap) * stap;
    const z = kern ? kern.min[2] : 0;
    const punten: number[] = [];
    for (let x = x0; x <= x1 + stap / 2; x += stap) punten.push(x, y0, z, x, y1, z);
    for (let y = y0; y <= y1 + stap / 2; y += stap) punten.push(x0, y, z, x1, y, z);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(punten, 3));
    const lijnen = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: RASTER }));
    lijnen.renderOrder = -1;
    groep.add(lijnen);
  }

  if (scene.assen) {
    const l = 0.12 * S;
    const nul = new THREE.Vector3();
    for (const [as, kleur, naam] of ASKLEUREN) {
      const mat = new THREE.MeshBasicMaterial({ color: kleur });
      const eind = v3(as).multiplyScalar(l);
      const m = cilinder(nul, eind, S * 0.003, mat, 6);
      if (m) groep.add(m);
      const s = label(naam, kleur, S * 0.04 * tekstSchaal);
      s.position.copy(v3(as).multiplyScalar(l * 1.08));
      groep.add(s);
    }
  }

  return { groep, grenzen };
}

export function ruimModelOp(model: Model) {
  model.groep.traverse((o) => {
    const ding = o as THREE.Mesh;
    // Een sprite deelt zijn vlak met alle andere sprites; dat blijft staan.
    if (!(o instanceof THREE.Sprite)) ding.geometry?.dispose();
    const mats = Array.isArray(ding.material) ? ding.material : ding.material ? [ding.material] : [];
    for (const m of mats) {
      (m as THREE.SpriteMaterial).map?.dispose();
      m.dispose();
    }
  });
}

export function belichting(doel: THREE.Scene) {
  // Lambert in three.js deelt door π: omgeving 0,62π en zon 0,40π geven
  // dezelfde schaduw als de stilstaande projectie (0,62 + 0,38 · cos).
  doel.add(new THREE.AmbientLight(0xffffff, 0.62 * Math.PI));
  const zon = new THREE.DirectionalLight(0xffffff, 0.4 * Math.PI);
  zon.position.copy(LICHT);
  doel.add(zon);
}

/** De richting van het doel naar de camera voor een standpunt. Recht van boven iets gekanteld, anders weet de camera niet waar "boven" is. */
function richting(standpunt: Standpunt): THREE.Vector3 {
  if (standpunt === "boven") return new THREE.Vector3(0, -0.001, 1).normalize();
  return v3(drieDBeeldvlak(standpunt).naarCamera);
}

/**
 * Zet de camera zo dat de grenzen het beeld vullen, gezien uit `standpunt`.
 * Per hoekpunt van de grenzen de afstand waarop hij nog binnen het beeld
 * valt; de grootste telt.
 */
export function pasIn(camera: THREE.PerspectiveCamera, doel: THREE.Vector3, grenzen: THREE.Box3, standpunt: Standpunt) {
  const naarCamera = richting(standpunt);
  const vooruit = naarCamera.clone().negate();
  const rechts = new THREE.Vector3().crossVectors(vooruit, new THREE.Vector3(0, 0, 1));
  if (rechts.lengthSq() < 1e-12) rechts.set(1, 0, 0);
  rechts.normalize();
  const boven = new THREE.Vector3().crossVectors(rechts, vooruit).normalize();
  grenzen.getCenter(doel);
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const tanH = tanV * camera.aspect;
  let d = 0;
  const q = new THREE.Vector3();
  for (const x of [grenzen.min.x, grenzen.max.x]) {
    for (const y of [grenzen.min.y, grenzen.max.y]) {
      for (const z of [grenzen.min.z, grenzen.max.z]) {
        q.set(x, y, z).sub(doel);
        const diepte = q.dot(naarCamera);
        d = Math.max(d, diepte + Math.abs(q.dot(rechts)) / tanH, diepte + Math.abs(q.dot(boven)) / tanV);
      }
    }
  }
  const grootte = grenzen.getSize(new THREE.Vector3()).length() || 1;
  d = Math.max(d * 1.08, grootte * 0.05);
  camera.position.copy(doel).addScaledVector(naarCamera, d);
  camera.near = d / 100;
  camera.far = d * 40;
  camera.up.set(0, 0, 1);
  camera.lookAt(doel);
  camera.updateProjectionMatrix();
}

// ── De kijker in de uitwerking ────────────────────────────────────────────────

/**
 * Het draaibare beeld in één `.calc-3d-beeld`. Linksklik en slepen draait,
 * rechtsklik (of shift) en slepen schuift, scrollen zoomt zodra je in het
 * beeld hebt geklikt: anders zou de uitwerking bij het scrollen in het beeld
 * blijven hangen. Er wordt alleen getekend als er iets verandert.
 */
export class Kijker {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly camera = new THREE.PerspectiveCamera(FOV, 2, 1, 1000);
  private readonly wereld = new THREE.Scene();
  private readonly controls: OrbitControls;
  private readonly knoppen: HTMLDivElement;
  private readonly hint: HTMLDivElement;
  private readonly ro: ResizeObserver;
  private vak: HTMLElement;
  private model: Model | null = null;
  private json = "";
  private camera3d: Standpunt = "iso";
  private standpunt: Standpunt = "iso";
  /** De gebruiker heeft het beeld gedraaid of gezoomd: een herberekening laat het standpunt staan. */
  private aangeraakt = false;
  private gepland = 0;
  private weg = false;

  constructor(vak: HTMLElement, scene: DrieDScene, json: string, teksten: DrieDTeksten) {
    this.vak = vak;
    // Gooit als er geen WebGL is; dan blijft de projectie van de kern staan.
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(PAPIER, 1);
    const canvas = this.renderer.domElement;
    canvas.className = "calc-3d-canvas";
    canvas.addEventListener("webglcontextlost", this.contextKwijt);
    belichting(this.wereld);

    // z wijst omhoog. Vóór de besturing instellen: die legt bij het maken vast
    // om welke as hij draait.
    this.camera.up.set(0, 0, 1);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableZoom = false;
    this.controls.screenSpacePanning = true;
    this.controls.addEventListener("change", this.plan);
    this.controls.addEventListener("start", this.aanraking);
    canvas.addEventListener("pointerdown", this.activeer);
    canvas.addEventListener("wheel", this.wiel, { passive: true });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    this.knoppen = document.createElement("div");
    this.knoppen.className = "calc-3d-knoppen";
    for (const s of ["iso", "voor", "boven", "zij"] as const) {
      const knop = document.createElement("button");
      knop.type = "button";
      knop.dataset.standpunt = s;
      knop.textContent = teksten.standpunt[s];
      knop.addEventListener("click", () => this.kies(s));
      this.knoppen.appendChild(knop);
    }
    const passend = document.createElement("button");
    passend.type = "button";
    passend.title = teksten.passend;
    passend.setAttribute("aria-label", teksten.passend);
    passend.innerHTML = `<svg class="oa-icon" width="16" height="16" aria-hidden="true"><use href="${sprite("standard")}#i16-view.fit"/></svg>`;
    passend.addEventListener("click", () => this.kies(this.standpunt));
    this.knoppen.appendChild(passend);

    this.hint = document.createElement("div");
    this.hint.className = "calc-3d-hint";
    this.hint.textContent = teksten.hint;

    this.ro = new ResizeObserver(() => this.maat());
    this.verhuis(vak, scene, json, true);
  }

  /**
   * Zet de kijker in een (nieuw) vak en toont `scene`. Na een herberekening
   * vervangt de uitwerking haar html; de kijker verhuist dan mee. Dezelfde
   * scène wordt niet opnieuw opgebouwd; een andere wel, met hetzelfde
   * standpunt als de gebruiker het beeld al had gedraaid.
   */
  verhuis(vak: HTMLElement, scene: DrieDScene, json: string, eerste = false) {
    if (this.weg) return;
    if (vak !== this.vak || eerste) {
      this.ro.disconnect();
      this.vak = vak;
      vak.querySelector<SVGElement>(":scope > svg")?.style.setProperty("display", "none");
      vak.append(this.renderer.domElement, this.knoppen, this.hint);
      this.ro.observe(vak);
    }
    if (json === this.json && !eerste) {
      this.maat();
      return;
    }
    this.json = json;
    if (this.model) {
      this.wereld.remove(this.model.groep);
      ruimModelOp(this.model);
    }
    this.model = bouwModel(scene);
    this.wereld.add(this.model.groep);
    // Een ander standpunt in het blok geldt meteen; anders blijft staan wat
    // de gebruiker koos.
    if (scene.camera !== this.camera3d || eerste) {
      this.camera3d = scene.camera;
      this.standpunt = scene.camera;
      this.aangeraakt = false;
    }
    this.markeer();
    this.maat(!this.aangeraakt);
  }

  /** Kiest een standpunt en maakt het beeld passend. */
  private kies(standpunt: Standpunt) {
    this.standpunt = standpunt;
    this.aangeraakt = false;
    this.markeer();
    this.pas();
  }

  private markeer() {
    for (const knop of this.knoppen.querySelectorAll<HTMLButtonElement>("button[data-standpunt]")) {
      knop.classList.toggle("gekozen", knop.dataset.standpunt === this.standpunt);
    }
  }

  private pas() {
    if (!this.model) return;
    pasIn(this.camera, this.controls.target, this.model.grenzen, this.standpunt);
    const d = this.camera.position.distanceTo(this.controls.target);
    this.controls.minDistance = d * 0.02;
    this.controls.maxDistance = d * 10;
    this.controls.update();
    this.plan();
  }

  /** Neemt de maat van het vak over; `opnieuw`: daarna ook passend maken. */
  private maat(opnieuw = false) {
    const b = this.vak.clientWidth;
    const h = this.vak.clientHeight;
    if (b > 0 && h > 0) {
      this.renderer.setSize(b, h, false);
      this.camera.aspect = b / h;
      this.camera.updateProjectionMatrix();
    }
    if (opnieuw) this.pas();
    else this.plan();
  }

  private readonly plan = () => {
    if (this.weg || this.gepland) return;
    this.gepland = requestAnimationFrame(() => {
      this.gepland = 0;
      if (!this.weg) this.renderer.render(this.wereld, this.camera);
    });
  };

  private readonly aanraking = () => {
    this.aangeraakt = true;
  };

  private readonly activeer = () => {
    if (this.controls.enableZoom) return;
    this.controls.enableZoom = true;
    this.vak.classList.add("actief");
    const uit = () => {
      this.controls.enableZoom = false;
      this.vak.classList.remove("actief");
      this.vak.removeEventListener("pointerleave", uit);
    };
    this.vak.addEventListener("pointerleave", uit);
  };

  /** Zolang het beeld actief is, zoomt het wiel alleen het beeld, niet de uitwerking. */
  private readonly wiel = (e: WheelEvent) => {
    if (this.controls.enableZoom) e.stopPropagation();
  };

  /** De browser nam de WebGL-context terug (te veel beelden): dan de projectie weer tonen. */
  private readonly contextKwijt = () => {
    this.renderer.domElement.style.display = "none";
    this.knoppen.style.display = "none";
    this.hint.style.display = "none";
    this.vak.querySelector<SVGElement>(":scope > svg")?.style.removeProperty("display");
  };

  dispose() {
    if (this.weg) return;
    this.weg = true;
    if (this.gepland) cancelAnimationFrame(this.gepland);
    this.ro.disconnect();
    this.controls.dispose();
    if (this.model) ruimModelOp(this.model);
    this.model = null;
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("webglcontextlost", this.contextKwijt);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    canvas.remove();
    this.knoppen.remove();
    this.hint.remove();
    this.vak.querySelector<SVGElement>(":scope > svg")?.style.removeProperty("display");
  }
}

// ── Eén beeld als afbeelding, voor papier ─────────────────────────────────────

let rij: Promise<unknown> = Promise.resolve();

/**
 * Tekent de scène één keer, vanuit het standpunt van het blok, en geeft een
 * PNG als data-URL. `breedte` × `hoogte` in CSS-pixels, getekend op
 * `schaal` maal die maat zodat hij op papier scherp blijft. Eén tegelijk:
 * elke tekening kost een eigen WebGL-context, en die worden na afloop
 * meteen weer vrijgegeven.
 */
export function naarAfbeelding(scene: DrieDScene, breedte: number, hoogte: number, schaal = 2.5): Promise<string> {
  const taak = () =>
    new Promise<string>((klaar, mis) => {
      let renderer: THREE.WebGLRenderer | null = null;
      let model: Model | null = null;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        renderer.setPixelRatio(1);
        renderer.setSize(Math.round(breedte * schaal), Math.round(hoogte * schaal), false);
        renderer.setClearColor("#ffffff", 1);
        const wereld = new THREE.Scene();
        belichting(wereld);
        model = bouwModel(scene, 1.3);
        wereld.add(model.groep);
        const camera = new THREE.PerspectiveCamera(FOV, breedte / hoogte, 1, 1000);
        pasIn(camera, new THREE.Vector3(), model.grenzen, scene.camera);
        renderer.render(wereld, camera);
        klaar(renderer.domElement.toDataURL("image/png"));
      } catch (err) {
        mis(err);
      } finally {
        if (model) ruimModelOp(model);
        if (renderer) {
          renderer.dispose();
          renderer.forceContextLoss();
        }
      }
    });
  const p = rij.then(taak, taak);
  rij = p.catch(() => undefined);
  return p;
}
