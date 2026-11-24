import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { drieDSvg, type DrieDScene } from "@ifc-calc/core";
import { useProjectStore } from "../../store/projectStore";
import { projectScope } from "../../store/projectGegevens";
import { isLosBlad } from "../../store/spreadsheetBlad";
import { projectTekstVan } from "../../store/projectBlad";
import { evalOptiesVan } from "../../store/projectEenheden";
import { metToetsingen } from "../../rekenen/toetsCache";
import { useToetsVersie } from "../../rekenen/femToetsing";
import { hoekmodusNu } from "../../rekenen/doorrekening";
import { DrieDBeelden } from "./drieDBlok";
import { modelDeel, modelScene, standaardKoppeling, maatTekst, type Lengtes, type ModelKeuze } from "./projectModel3D";
import type { ModelInvoer } from "./projectModelWorker";
import "./ProjectModelVenster.css";

const SLEUTEL = "_projectmodel3d";

function ModelBeeld({ scene }: { scene: DrieDScene }) {
  const ref = useRef<HTMLDivElement>(null);
  const beelden = useRef<DrieDBeelden | null>(null);
  const { t } = useTranslation("rekentaal");
  useEffect(() => {
    const kijker = new DrieDBeelden(() => ({
      hint: t("drieD.hint"), passend: t("drieD.passend"),
      standpunt: { iso: t("drieD.standpunt.iso"), boven: t("drieD.standpunt.boven"), voor: t("drieD.standpunt.voor"), zij: t("drieD.standpunt.zij") },
    }));
    beelden.current = kijker;
    kijker.koppel(ref.current);
    return () => kijker.sluit();
  }, [t]);
  const json = useMemo(() => JSON.stringify(scene), [scene]);
  const svg = useMemo(() => ({ __html: drieDSvg(scene) }), [scene]);
  useEffect(() => beelden.current?.koppel(ref.current), [scene]);
  return <div ref={ref}><div className="calc-3d" data-scene={json}>
    <div key={json} className="calc-3d-beeld" dangerouslySetInnerHTML={svg} />
  </div></div>;
}

export default function ProjectModelVenster({ sluit }: { sluit: () => void }) {
  const { t } = useTranslation("werkruimte");
  const dialoog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialoog.current!;
    el.showModal();
    return () => el.close();
  }, []);
  const alle = useProjectStore(s => s.exemplaren);
  const bladen = useMemo(() => alle.filter(e => !isLosBlad(e)), [alle]);
  const gegevens = useProjectStore(useShallow(s => Object.fromEntries(Object.entries(s.gegevens).filter(([k]) => k !== SLEUTEL))));
  const opgeslagen = useProjectStore(s => s.gegevens[SLEUTEL]);
  const zetGegeven = useProjectStore(s => s.zetGegeven);
  const belastingen = useProjectStore(s => s.rapport.belastingen);
  const taal = useProjectStore(s => s.rapport.taal);
  const toetsversie = useToetsVersie();
  const keuzes = useMemo<Record<string, ModelKeuze>>(() => {
    try { return JSON.parse(opgeslagen || "{}") ?? {}; } catch { return {}; }
  }, [opgeslagen]);
  function wijzig(id: string, deel: ModelKeuze) {
    zetGegeven(SLEUTEL, JSON.stringify({ ...keuzes, [id]: { ...keuzes[id], ...deel } }));
  }
  const [maten, zetMaten] = useState<Record<string, Lengtes> | null>(null);
  const [fout, zetFout] = useState(false);
  useEffect(() => {
    zetMaten(null);
    zetFout(false);
    const worker = new Worker(new URL("./projectModelWorker.ts", import.meta.url), { type: "module" });
    worker.onmessage = e => zetMaten(e.data);
    worker.onerror = () => zetFout(true);
    const invoer: ModelInvoer = {
      bladen: bladen.map(({ id, ref, source, waarden }) => ({ id, ref, source, waarden })),
      scope: projectScope(gegevens), hoekmodus: hoekmodusNu(),
      opties: metToetsingen({ ...evalOptiesVan(gegevens), project: projectTekstVan(gegevens, belastingen, taal) }, "lezen"),
    };
    worker.postMessage(invoer);
    return () => worker.terminate();
  }, [bladen, gegevens, belastingen, taal, toetsversie]);
  const rijen = useMemo(() => bladen.map((e, index) => {
    const keuze = { y: index * 5, ...standaardKoppeling(e.templateId), ...keuzes[e.id] };
    const lengtes = maten?.[e.id] ?? {};
    const deel = modelDeel({ ...e, keuze, maten: lengtes });
    return { e, keuze, lengtes, deel };
  }), [bladen, keuzes, maten]);
  const scene = useMemo(() => modelScene(rijen.flatMap(r => r.keuze.zichtbaar !== false && r.deel ? [r.deel] : [])), [rijen]);
  return createPortal(<dialog ref={dialoog} onCancel={sluit} className="pm-venster" aria-labelledby="pm-titel">
    <header><h2 id="pm-titel">{t("projectmodel.titel")}</h2><button type="button" onClick={sluit}>{t("projectmodel.sluiten")}</button></header>
    <div className="pm-indeling">
      <div className="pm-beeld">{scene.elementen.length ? <ModelBeeld scene={scene}/> : <p role="status">{t(`projectmodel.${fout ? "fout" : !maten ? "rekenen" : "leeg"}`)}</p>}</div>
      <aside><p>{t("projectmodel.plaatsing")}</p>{rijen.map(({ e, keuze, lengtes, deel }) => <section key={e.id}>
        <label><input type="checkbox" checked={keuze.zichtbaar !== false} onChange={ev => wijzig(e.id, { zichtbaar: ev.target.checked })}/> <strong>{e.naam}</strong></label>
        {deel ? <p>{t("projectmodel.lengte")} {deel.velden.map(maatTekst).join(" + ")} m
          {deel.velden.length > 1 && " = " + maatTekst(deel.lengte) + " m"}
          {deel.breedte > 0 && deel.hoogte > 0 && <> · {maatTekst(deel.breedte*1000)} × {maatTekst(deel.hoogte*1000)} mm</>}
          {deel.vloer > 0 && <><br/>{t("projectmodel.vloer")} {maatTekst(deel.vloer)} m · {deel.velden.map(v => maatTekst(v * deel.vloer) + " m²").join(" + ")}</>}
          {deel.vloerRechts > 0 && <><br/>{t("projectmodel.vloerRechts")} {maatTekst(deel.vloerRechts)} m · {deel.velden.map(v => maatTekst(v * deel.vloerRechts) + " m²").join(" + ")}</>}
          {(deel.strook > 0 || deel.strookRechts > 0) && <><br/>{t("projectmodel.strook")} {maatTekst(deel.strook)}{keuze.zijde === "beide" && " + " + maatTekst(deel.strookRechts)} m · {maatTekst(deel.oppervlak)} m²</>}</p>
          : maten && <p>{t("projectmodel.geenMaat")}</p>}
        <details><summary>{t("projectmodel.instellen")}</summary><div className="pm-velden">
          {(["x","y","z","hoek"] as const).map(as => <label key={as}>{as === "hoek" ? t("projectmodel.hoek") : as.toUpperCase()+" (m)"}
            <input type="number" step="any" key={String(keuze[as])} defaultValue={keuze[as] ?? 0} onBlur={ev => {
              if (Number.isFinite(ev.target.valueAsNumber)) wijzig(e.id, { [as]: ev.target.valueAsNumber });
            }}/></label>)}
          <label>{t("projectmodel.richting")}<select value={keuze.richting ?? "liggend"} onChange={ev => wijzig(e.id, { richting: ev.target.value as ModelKeuze["richting"] })}>
            {(["liggend","omhoog","omlaag"] as const).map(v => <option key={v} value={v}>{t(`projectmodel.${v}`)}</option>)}</select></label>
          {(["lengte","breedte","hoogte","vloer","strook","vloerRechts","strookRechts"] as const).filter(v => !v.endsWith("Rechts") || keuze.zijde === "beide").map(veld => <label key={veld}>{t(`projectmodel.${veld}`)}{keuze.zijde === "beide" && (veld === "vloer" || veld === "strook") && " (" + t("projectmodel.links") + ")"}<select value={keuze[veld] ?? ""} onChange={ev => wijzig(e.id, { [veld]: ev.target.value })}>
            <option value="">—</option>{Array.from(new Set([keuze[veld], ...Object.keys(lengtes).sort()])).filter(Boolean).map(v => <option key={v} value={v}>{v}</option>)}</select></label>)}
          <label>{t("projectmodel.zijde")}<select value={keuze.zijde ?? "midden"} onChange={ev => wijzig(e.id, { zijde: ev.target.value as ModelKeuze["zijde"] })}>
            {(["links","midden","rechts","beide"] as const).map(v => <option key={v} value={v}>{t(`projectmodel.${v}`)}</option>)}</select></label>
        </div></details>
      </section>)}</aside>
    </div>
  </dialog>, document.body);
}
