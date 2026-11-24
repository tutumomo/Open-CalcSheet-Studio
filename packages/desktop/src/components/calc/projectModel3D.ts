import type { DrieDElement, DrieDScene, Punt3D } from "@ifc-calc/core";

export type ModelRichting = "liggend" | "omhoog" | "omlaag";
export interface ModelKeuze {
  zichtbaar?: boolean;
  x?: number;
  y?: number;
  z?: number;
  hoek?: number;
  richting?: ModelRichting;
  lengte?: string;
  breedte?: string;
  hoogte?: string;
  strook?: string;
  vloer?: string;
  zijde?: "links" | "midden" | "rechts" | "beide";
  vloerRechts?: string;
  strookRechts?: string;
}
export type Lengtes = Record<string, number>;

/** Alleen lengte-eenheden uit de werkelijke rekenscope; alle modelcoördinaten zijn meters. */
export function lengteWaarden(scope: Record<string, unknown>): Lengtes {
  const maten: Lengtes = Object.create(null);
  for (const [naam, waarde] of Object.entries(scope)) {
    const v = waarde as { toNumber?: (eenheid: string) => number } | null;
    if (typeof v?.toNumber !== "function") continue;
    try {
      const m = v.toNumber("m");
      if (Number.isFinite(m)) maten[naam] = m;
    } catch { /* Een kracht, oppervlak of andere grootheid is geen lengtemaat. */ }
  }
  return maten;
}

export function standaardKoppeling(id: string): ModelKeuze {
  switch (id) {
    case "balklaag": return { lengte: "L_th", breedte: "b_balk", hoogte: "h_balk", strook: "b_belast", vloer: "b_vloer" };
    case "tweepaalspoer": return { lengte: "l_poer", breedte: "b_poer", hoogte: "h_poer" };
    case "ligger": return { lengte: "L_tot", breedte: "b", hoogte: "h" };
    case "voorgespannen-heipaal": return { lengte: "L", breedte: "b", hoogte: "b", richting: "omlaag" };
    default: return {};
  }
}

export interface ModelBlad {
  id: string;
  naam: string;
  templateId: string;
  maten: Lengtes;
  keuze: ModelKeuze;
}
export interface ModelDeel {
  elementen: DrieDElement[];
  velden: number[];
  lengte: number;
  breedte: number;
  hoogte: number;
  strook: number;
  oppervlak: number;
  vloerRechts: number;
  strookRechts: number;
  vloer: number;
}
export const maatTekst = (v: number) => Number(v.toFixed(4)).toString();

/** Een getekend veld is de aan dit element toegerekende strook, per veldlengte. */
export function modelDeel(blad: ModelBlad): ModelDeel | null {
  const k = blad.keuze;
  const maat = (naam?: string) => naam ? blad.maten[naam] : undefined;
  const basis = maat(k.lengte);
  if (!(basis !== undefined && basis > 0)) return null;
  const verticaal = k.richting === "omhoog" || k.richting === "omlaag";
  let velden = [basis];
  if (!verticaal && blad.templateId === "balklaag" && k.lengte === "L_th") {
    velden.push(maat("L_veld2") ?? 0, maat("a_over") ?? 0);
  }
  if (!verticaal && blad.templateId === "ligger" && k.lengte === "L_tot") {
    const delen = ["a_l", "L_1", "L_2", "L_3", "a_r"].map(n => maat(n) ?? 0);
    if (Math.abs(delen.reduce((a,b) => a+b, 0) - basis) < 1e-6) velden = delen;
  }
  velden = velden.filter(v => v > 0);
  const lengte = velden.reduce((a,b) => a+b, 0);
  const breedte = maat(k.breedte) ?? 0;
  const hoogte = maat(k.hoogte) ?? 0;
  const strook = verticaal ? 0 : Math.max(0, maat(k.strook) ?? 0);
  const vloer = verticaal ? 0 : Math.max(0, maat(k.vloer) ?? 0);
  const hoek = (k.hoek ?? 0) * Math.PI / 180;
  const punt = (u: number, v = 0, w = 0): Punt3D => [
    (k.x ?? 0) + u*Math.cos(hoek) - v*Math.sin(hoek),
    (k.y ?? 0) + u*Math.sin(hoek) + v*Math.cos(hoek), (k.z ?? 0) + w,
  ];
  const as = (u: number) => verticaal ? punt(0, 0, k.richting === "omlaag" ? -u : u) : punt(u);
  const kleur = verticaal ? "#857260" : "#36667a";
  const elementen: DrieDElement[] = [breedte > 0 && hoogte > 0
    ? { soort: "balk", van: as(0), naar: as(lengte), b: breedte, h: hoogte, kleur }
    : { soort: "staaf", van: as(0), naar: as(lengte), kleur }];
  const gesplitst = k.zijde === "beide" && !verticaal;
  const vloerRechts = gesplitst ? Math.max(0, maat(k.vloerRechts) ?? 0) : 0;
  const strookRechts = gesplitst ? Math.max(0, maat(k.strookRechts) ?? 0) : 0;
  const zijden = [{ vloer, strook, positie: gesplitst ? "links" : k.zijde }];
  if (gesplitst) zijden.push({ vloer: vloerRechts, strook: strookRechts, positie: "rechts" });
  let vanaf = 0;
  for (const veld of velden) {
    const einde = vanaf + veld;
    const z = Math.max(0, hoogte) / 2;
    for (const { vloer, strook, positie } of zijden) {
      if (vloer > 0) {
        const rand = positie === "links" ? 0 : positie === "rechts" ? -vloer : -vloer / 2;
        const hoeken = [punt(vanaf, rand, z), punt(einde, rand, z), punt(einde, rand + vloer, z), punt(vanaf, rand + vloer, z)];
        hoeken.forEach((van, i) => elementen.push({ soort: "staaf", van, naar: hoeken[(i+1)%4], kleur: "#406ca0" }));
        elementen.push({ soort: "tekst", plek: punt((vanaf + einde)/2, rand + vloer, z), tekst: maatTekst(veld * vloer) + " m²", kleur: "#406ca0" });
      }
      if (strook > 0) {
        const begin = positie === "links" ? 0 : positie === "rechts" ? -strook : -strook / 2;
        const punten = [punt(vanaf, begin, z), punt(einde, begin, z), punt(einde, begin+strook, z), punt(vanaf, begin+strook, z)];
        elementen.push({ soort: "tekst", plek: punt(einde, begin + strook/2, z), tekst: maatTekst(strook) + " m", kleur: "#21806c" });
        elementen.push({ soort: "vlakken", vlakken: [{ punten, rand: true }], kleur: "#4fa892", opaciteit: 0.35 });
      }
    }
    elementen.push({ soort: "tekst", plek: as(vanaf + veld / 2), tekst: maatTekst(veld) + " m", kleur });
    vanaf = einde;
  }
  elementen.push({ soort: "tekst", plek: as(0), tekst: blad.naam, kleur });
  return { elementen, velden, lengte, breedte, hoogte, strook, oppervlak: lengte * (strook + strookRechts), vloer, vloerRechts, strookRechts };
}

export function modelScene(delen: ModelDeel[]): DrieDScene {
  return { eenheid: "m", camera: "iso", raster: true, assen: true, hoogte: 480, elementen: delen.flatMap(d => d.elementen) };
}
