/**
 * Het draaibare beeld van een IFCX-document, in een wereld van That Open
 * (@thatopen/components: scène, camera met besturing, renderer en raycaster).
 *
 * That Open leest zelf geen IFCX, alleen zijn eigen Fragments en via web-ifc
 * IFC-STEP. De geometrie komt daarom uit onze lezer (packages/core/src/
 * ifcxLezen.ts) en wordt als gewone meshes in de scène gezet. Dit bestand krijgt
 * niets anders dan de JSON van het document: de vormen, kleuren en attributen in
 * beeld komen daar allemaal uit.
 *
 * Dit bestand wordt pas geladen bij het eerste blok op het scherm (ifcxBlok.ts);
 * That Open zit zo niet in het startpakket. web-ifc zit als onderdeel van het
 * pakket in dezelfde chunk, maar wordt nooit gestart.
 *
 * De bediening is die van `@3d`: slepen draait, rechts slepen schuift, scrollen
 * zoomt pas na een klik in het beeld. Een klik zonder slepen op een element toont
 * zijn attributen uit het IFCX. Er wordt alleen getekend als er iets verandert.
 */
import * as OBC from "@thatopen/components";
import CameraControls from "camera-controls";
import i18next from "i18next";
import * as THREE from "three";
import { ifcxNaarScene, leesIfcx, type IfcxElement } from "@ifc-calc/core";
import { sprite } from "../ribbon/calcIcons";
import { belichting, bouwModel, FOV, PAPIER, pasIn, ruimModelOp, type Model, type Standpunt } from "./drieDWeergave";
import { bewaarIfcx } from "./ifcxBewaren";

/** De teksten van de knoppen en het paneel; ze volgen de taal van de app (rekentaal.json, ifcx). */
export interface IfcxTeksten {
  hint: string;
  standpunt: Record<Standpunt, string>;
  passend: string;
  opslaan: string;
  sluiten: string;
  /** De naam van een attribuut bij zijn laatste deel: `Width` → Breedte; onbekend blijft zoals het is. */
  attribuut: (kort: string) => string;
}

/** Eenheden van de attributen van de standaard en van `ocss::calc`: alles SI, zoals de voorbeelden. */
const EENHEDEN: Readonly<Record<string, string>> = {
  Length: "m", Width: "m", Height: "m", Depth: "m", CrossSectionArea: "m²", NetVolume: "m³", Volume: "m³",
  MassDensity: "kg/m³", hartOpHart: "m", overspanning: "m", diameter: "m",
};
/** De naam staat al boven het paneel; de klasse en de rest eronder in deze volgorde. */
const VOLGORDE = [
  "class", "TypeName", "material", "StrengthClass", "MassDensity", "diameter", "Length", "Width", "Height", "Depth",
  "CrossSectionArea", "NetVolume", "hartOpHart", "overspanning", "unityCheck", "toetsen", "aantalStaven", "aantalGetoond", "opmerking",
];

const kortNaam = (sleutel: string) => sleutel.split("::").pop() ?? sleutel;

function getalTekst(n: number): string {
  const taal = i18next.language?.startsWith("nl") ? "nl-NL" : i18next.language?.startsWith("zh") ? "zh-TW" : "en-GB";
  return n.toLocaleString(taal, { maximumFractionDigits: 6 });
}

/** Een attribuut als rijen voor het paneel; een object met losse getallen geeft een rij per sleutel. */
function rijenVan(sleutel: string, waarde: unknown, t: IfcxTeksten): [string, string, string][] {
  const kort = kortNaam(sleutel);
  const label = t.attribuut(kort);
  if (typeof waarde === "number") {
    const eenheid = EENHEDEN[kort];
    return [[label, eenheid ? `${getalTekst(waarde)} ${eenheid}` : getalTekst(waarde), sleutel]];
  }
  if (typeof waarde === "string") return [[label, waarde, sleutel]];
  if (typeof waarde === "boolean") return [[label, i18next.t(waarde ? "beelden:kit.ja" : "beelden:kit.nee"), sleutel]];
  if (typeof waarde === "object" && waarde !== null) {
    const code = (waarde as { code?: unknown }).code;
    if (typeof code === "string") return [[label, code, sleutel]];
    return Object.entries(waarde).flatMap(([k, w]) =>
      typeof w === "number" ? ([[t.attribuut(k), getalTekst(w), `${sleutel} / ${k}`]] as [string, string, string][]) : []);
  }
  return [];
}

export class IfcxKijker {
  private readonly components = new OBC.Components();
  private readonly world: OBC.SimpleWorld<OBC.SimpleScene, OBC.SimpleCamera, OBC.SimpleRenderer>;
  private readonly renderer: OBC.SimpleRenderer;
  /** De houder van de renderer: blijft dezelfde als het beeld naar een nieuw blok verhuist. */
  private readonly host: HTMLDivElement;
  private readonly knoppen: HTMLDivElement;
  private readonly hint: HTMLDivElement;
  private readonly paneel: HTMLDivElement;
  private readonly teksten: IfcxTeksten;
  private vak: HTMLElement;
  private model: Model | null = null;
  private elementen: IfcxElement[] = [];
  private json = "";
  private naam: string;
  private readonly blad: string | undefined;
  private standpunt: Standpunt = "iso";
  /** De gebruiker heeft het beeld gedraaid of gezoomd: een herberekening laat de camera staan. */
  private aangeraakt = false;
  private gekozen: string | null = null;
  private neer: { x: number; y: number } | null = null;
  private doel = new THREE.Vector3();
  private weg = false;

  constructor(vak: HTMLElement, json: string, naam: string, blad: string | undefined, teksten: IfcxTeksten) {
    this.vak = vak;
    this.naam = naam;
    this.blad = blad;
    this.teksten = teksten;

    this.host = document.createElement("div");
    this.host.className = "calc-ifcx-houder";
    // De houder moet al een maat hebben als de renderer hem opmeet.
    vak.appendChild(this.host);

    const worlds = this.components.get(OBC.Worlds);
    this.world = worlds.create<OBC.SimpleScene, OBC.SimpleCamera, OBC.SimpleRenderer>();
    this.world.scene = new OBC.SimpleScene(this.components);
    // Gooit als er geen WebGL is; dan blijft de projectie van de kern staan.
    try {
      this.renderer = new OBC.SimpleRenderer(this.components, this.host);
    } catch (err) {
      this.host.remove();
      this.components.dispose();
      throw err;
    }
    this.world.renderer = this.renderer;
    this.world.camera = new OBC.SimpleCamera(this.components);
    // Een eigen merkteken hoort niet in de uitwerking van een rekenblad; het kan aan met één regel.
    this.renderer.showLogo = false;
    // Alleen tekenen als er iets verandert; `teken` vraagt erom.
    this.renderer.mode = OBC.RendererMode.MANUAL;
    this.world.scene.three.background = new THREE.Color(PAPIER);
    belichting(this.world.scene.three);
    this.components.init();

    const camera = this.world.camera.three as THREE.PerspectiveCamera;
    camera.fov = FOV;
    camera.up.set(0, 0, 1);
    const controls = this.world.camera.controls;
    controls.updateCameraUp();
    controls.infinityDolly = false;
    controls.smoothTime = 0.1;
    controls.draggingSmoothTime = 0.05;
    this.wielUit();
    controls.addEventListener("update", this.teken);
    controls.addEventListener("controlstart", this.aanraking);
    this.renderer.onResize.add(this.opGrootte);

    const canvas = this.renderer.three.domElement;
    canvas.classList.add("calc-3d-canvas");
    canvas.addEventListener("webglcontextlost", this.contextKwijt);
    canvas.addEventListener("pointerdown", this.activeer);
    canvas.addEventListener("pointerdown", this.drukNeer);
    canvas.addEventListener("pointerup", this.laatLos);
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
    const opslaan = document.createElement("button");
    opslaan.type = "button";
    opslaan.className = "calc-ifcx-opslaan";
    opslaan.textContent = teksten.opslaan;
    opslaan.addEventListener("click", () => {
      void bewaarIfcx(this.json, this.naam, this.blad).catch((err) => console.error("IFCX opslaan mislukt:", err));
    });
    this.knoppen.appendChild(opslaan);

    this.hint = document.createElement("div");
    this.hint.className = "calc-3d-hint";
    this.hint.textContent = teksten.hint;

    this.paneel = document.createElement("div");
    this.paneel.className = "calc-ifcx-paneel";
    this.paneel.hidden = true;

    this.verhuis(vak, json, naam, true);
  }

  /**
   * Zet het beeld in een (nieuw) vak en toont het document. Na een herberekening
   * vervangt de uitwerking haar html; het beeld verhuist dan mee. Hetzelfde
   * document wordt niet opnieuw opgebouwd; een ander wel, met dezelfde camera als de
   * gebruiker het beeld al had gedraaid.
   */
  verhuis(vak: HTMLElement, json: string, naam: string, eerste = false) {
    if (this.weg) return;
    this.naam = naam;
    if (vak !== this.vak || eerste) {
      this.vak = vak;
      // Actief blijft actief: de muis staat nog in het beeld.
      vak.classList.toggle("actief", this.world.camera.controls.mouseButtons.wheel !== CameraControls.ACTION.NONE);
      vak.querySelector<SVGElement>(":scope > svg")?.style.setProperty("display", "none");
      vak.append(this.host, this.knoppen, this.hint, this.paneel);
    }
    if (json === this.json && !eerste) {
      this.opGrootte();
      return;
    }
    this.json = json;
    this.ruimModelOp();
    const gelezen = leesIfcx(JSON.parse(json));
    for (const m of gelezen.meldingen) console.warn(m);
    this.elementen = gelezen.elementen;
    this.model = bouwModel(ifcxNaarScene(gelezen));
    this.world.scene.three.add(this.model.groep);
    this.model.groep.traverse((o) => {
      if (o instanceof THREE.Mesh && o.userData.pad) this.world.meshes.add(o);
    });
    this.markeerStandpunt();
    this.toonGekozen();
    this.opGrootte();
    if (!this.aangeraakt) this.pas();
  }

  private ruimModelOp() {
    if (!this.model) return;
    this.world.scene.three.remove(this.model.groep);
    // Een opgelicht element draagt een kopie; het eigen materiaal hangt eraan.
    this.model.groep.traverse((o) => (o.userData.gewoon as THREE.Material | undefined)?.dispose());
    ruimModelOp(this.model);
    this.world.meshes.clear();
    this.model = null;
  }

  // ── Camera ──────────────────────────────────────────────────────────────────

  private kies(standpunt: Standpunt) {
    this.standpunt = standpunt;
    this.aangeraakt = false;
    this.markeerStandpunt();
    this.pas();
  }

  private markeerStandpunt() {
    for (const knop of this.knoppen.querySelectorAll<HTMLButtonElement>("button[data-standpunt]")) {
      knop.classList.toggle("gekozen", knop.dataset.standpunt === this.standpunt);
    }
  }

  private pas() {
    if (!this.model) return;
    const camera = this.world.camera.three as THREE.PerspectiveCamera;
    this.world.camera.updateAspect();
    pasIn(camera, this.doel, this.model.grenzen, this.standpunt);
    const controls = this.world.camera.controls;
    const p = camera.position;
    const d = p.distanceTo(this.doel);
    controls.minDistance = d * 0.02;
    controls.maxDistance = d * 10;
    void controls.setLookAt(p.x, p.y, p.z, this.doel.x, this.doel.y, this.doel.z, false);
    this.teken();
  }

  private readonly teken = () => {
    if (!this.weg) this.renderer.needsUpdate = true;
  };

  private readonly opGrootte = () => {
    if (this.weg) return;
    this.world.camera.updateAspect();
    this.teken();
  };

  private readonly aanraking = () => {
    this.aangeraakt = true;
  };

  private wielUit() {
    this.world.camera.controls.mouseButtons.wheel = CameraControls.ACTION.NONE;
  }

  /** Scrollen zoomt pas na een klik in het beeld: anders blijft de uitwerking erin hangen. */
  private readonly activeer = () => {
    const controls = this.world.camera.controls;
    if (controls.mouseButtons.wheel !== CameraControls.ACTION.NONE) return;
    controls.mouseButtons.wheel = CameraControls.ACTION.DOLLY;
    this.vak.classList.add("actief");
    const canvas = this.renderer.three.domElement;
    const uit = () => {
      this.wielUit();
      this.vak.classList.remove("actief");
      canvas.removeEventListener("pointerleave", uit);
    };
    canvas.addEventListener("pointerleave", uit);
  };

  /** Zolang het beeld actief is, zoomt het wiel alleen het beeld, niet de uitwerking. */
  private readonly wiel = (e: WheelEvent) => {
    if (this.world.camera.controls.mouseButtons.wheel !== CameraControls.ACTION.NONE) {
      e.stopPropagation();
      this.aangeraakt = true;
      this.teken();
    }
  };

  // ── Klikken: de attributen uitlezen ─────────────────────────────────────────

  private readonly drukNeer = (e: PointerEvent) => {
    this.neer = e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
  };

  private readonly laatLos = (e: PointerEvent) => {
    const n = this.neer;
    this.neer = null;
    if (!n || Math.hypot(e.clientX - n.x, e.clientY - n.y) > 4) return;
    const vak = this.renderer.three.domElement.getBoundingClientRect();
    const positie = new THREE.Vector2(((e.clientX - vak.left) / vak.width) * 2 - 1, -((e.clientY - vak.top) / vak.height) * 2 + 1);
    this.kiesElement(this.vindPad(positie));
  };

  /** Eerst wat dekkend is: door de doorzichtige plaat heen klik je op de balk eronder. */
  private vindPad(positie: THREE.Vector2): string | null {
    const caster = this.components.get(OBC.Raycasters).get(this.world);
    const meshes = [...this.world.meshes];
    const dekkend = meshes.filter((m) => !(m.material as THREE.Material).transparent);
    const raak = caster.castRayToObjects(dekkend, positie) ?? caster.castRayToObjects(meshes, positie);
    return (raak?.object.userData.pad as string | undefined) ?? null;
  }

  private kiesElement(pad: string | null) {
    this.gekozen = pad;
    this.toonGekozen();
    this.teken();
  }

  /** Toont het gekozen element in het paneel en licht het op; ook na een herberekening. */
  private toonGekozen() {
    const el = this.gekozen ? this.elementen.find((e) => e.pad === this.gekozen) : undefined;
    if (!el) this.gekozen = null;
    this.model?.groep.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || !o.userData.pad) return;
      const mat = o.material as THREE.MeshLambertMaterial;
      const aan = o.userData.pad === this.gekozen;
      if (aan && !o.userData.gewoon) {
        o.userData.gewoon = mat;
        const licht = mat.clone();
        licht.emissive.set("#b45309");
        licht.emissiveIntensity = 0.55;
        o.material = licht;
      } else if (!aan && o.userData.gewoon) {
        mat.dispose();
        o.material = o.userData.gewoon;
        delete o.userData.gewoon;
      }
    });
    this.paneel.hidden = !el;
    this.paneel.replaceChildren();
    if (!el) return;
    const t = this.teksten;
    const kop = document.createElement("div");
    kop.className = "calc-ifcx-paneel-kop";
    const naam = document.createElement("strong");
    naam.textContent = el.naam;
    const sluit = document.createElement("button");
    sluit.type = "button";
    sluit.textContent = "×";
    sluit.title = t.sluiten;
    sluit.setAttribute("aria-label", t.sluiten);
    sluit.addEventListener("click", () => this.kiesElement(null));
    kop.append(naam, sluit);
    const tabel = document.createElement("table");
    const positie = (k: string) => {
      const i = VOLGORDE.indexOf(kortNaam(k));
      return i === -1 ? VOLGORDE.length : i;
    };
    const sleutels = Object.keys(el.attributen)
      .filter((k) => kortNaam(k) !== "Name")
      .sort((a, b) => positie(a) - positie(b));
    for (const k of sleutels) {
      for (const [label, waarde, bron] of rijenVan(k, el.attributen[k], t)) {
        const rij = tabel.insertRow();
        rij.title = bron;
        rij.insertCell().textContent = label;
        rij.insertCell().textContent = waarde;
      }
    }
    this.paneel.append(kop, tabel);
  }

  /** De browser nam de WebGL-context terug (te veel beelden): dan de projectie weer tonen. */
  private readonly contextKwijt = () => {
    this.host.style.display = "none";
    this.hint.style.display = "none";
    this.paneel.hidden = true;
    for (const knop of this.knoppen.querySelectorAll<HTMLElement>("button:not(.calc-ifcx-opslaan)")) knop.style.display = "none";
    this.vak.querySelector<SVGElement>(":scope > svg")?.style.removeProperty("display");
  };

  dispose() {
    if (this.weg) return;
    this.weg = true;
    const canvas = this.renderer.three.domElement;
    canvas.removeEventListener("webglcontextlost", this.contextKwijt);
    this.ruimModelOp();
    this.components.dispose();
    this.host.remove();
    this.knoppen.remove();
    this.hint.remove();
    this.paneel.remove();
    this.vak.querySelector<SVGElement>(":scope > svg")?.style.removeProperty("display");
  }
}
