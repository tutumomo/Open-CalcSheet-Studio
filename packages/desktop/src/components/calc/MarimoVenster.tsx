import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { useProjectStore } from "../../store/projectStore";
import { registreerBewaarder } from "../../store/spreadsheetBlad";
import { bladSleutel, JUPYTER_RECHTEN, jupyterOmhulsel } from "../../store/jupyterBlad";
import { geldigeUitvoer, MARIMO_MAX_TEKENS } from "../../store/marimoBlad";
import { omgevingPoort } from "./JupyterVenster";
import { registreerUitvoerder } from "../../mcp/notebookUitvoer";

/*
 * Het venster van één Marimo-blad: Marimo in een iframe, op dezelfde server en met dezelfde
 * afscherming als een Jupyter-blad (zie JupyterVenster.tsx), en het gesprek ermee (zie
 * jupyter-omgeving/ocss-marimo-brug.js aan de andere kant).
 *
 * De omgeving bewaart niets zelf; het project is de enige bewaarplek. Berichten uit de
 * iframe zijn invoer van buiten: alleen een antwoord op een eigen vraag verandert het
 * notebook, en alleen dat van dit blad.
 */

const BRON = "ocss-marimo";
/** Zo lang na de laatste wijziging in de omgeving gaat de stand naar het project. */
const BEWAAR_NA_MS = 1000;
/** Antwoordt de omgeving niet, dan gaat het opslaan door. */
const STAND_TIJDSLIMIET_MS = 8000;

const isDonker = () => document.documentElement.getAttribute("data-oa-theme")?.includes("dark") ?? false;

export function MarimoVenster({ id, stijl, onOpslaan }: { id: string; stijl: CSSProperties; onOpslaan: () => void }) {
  const { t } = useTranslation("werkruimte");
  const code = useProjectStore((s) => s.exemplaren.find((e) => e.id === id)?.marimo?.code);
  const [poort, setPoort] = useState<number | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [geladen, setGeladen] = useState(false);
  /** Een nieuwe waarde laadt de iframe opnieuw: het notebook is van buitenaf veranderd. */
  const [laadTeller, setLaadTeller] = useState(0);

  const buiten = useRef<HTMLIFrameElement>(null);
  /** Het notebook dat de omgeving nu heeft: gelezen of zelf weggeschreven. */
  const eigen = useRef(code);
  const isGeladen = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wachtend = useRef(new Map<number, () => void>());
  /** Vragen van sheet_run: de stand zoals hij binnenkomt, om te zien of hij nog verandert. */
  const peilingen = useRef(new Map<number, (uitvoer: string[] | null) => void>());
  const vraagTeller = useRef(0);
  const opslaanOp = useRef(0);

  const herkomst = poort === null ? null : `http://blad-${bladSleutel(id)}.localhost:${poort}`;
  const omhulsel = useMemo(() => (herkomst ? jupyterOmhulsel(herkomst, "/marimo/index.html") : undefined), [herkomst]);

  useEffect(() => {
    let weg = false;
    if (!("__TAURI_INTERNALS__" in window)) {
      setFout(t("jupyter.alleenDesktop"));
      return;
    }
    omgevingPoort()
      .then((p) => {
        if (!weg) setPoort(p);
      })
      .catch((err) => {
        console.error("Python-omgeving starten mislukt:", err);
        if (!weg) setFout(t("jupyter.geenOmgeving", { fout: String(err) }));
      });
    return () => {
      weg = true;
    };
  }, [t]);

  const binnen = useCallback(() => buiten.current?.contentWindow?.frames[0] ?? null, []);

  const stuur = useCallback((bericht: Record<string, unknown>) => {
    if (herkomst) binnen()?.postMessage({ bron: BRON, ...bericht }, herkomst);
  }, [binnen, herkomst]);

  const bewaar = useCallback(() => {
    if (!isGeladen.current) return Promise.resolve();
    return new Promise<void>((klaar) => {
      const vraag = ++vraagTeller.current;
      const tijd = setTimeout(() => {
        if (wachtend.current.delete(vraag)) {
          console.warn("Marimo antwoordt niet; laatste stand niet opgehaald.");
          klaar();
        }
      }, STAND_TIJDSLIMIET_MS);
      wachtend.current.set(vraag, () => {
        clearTimeout(tijd);
        klaar();
      });
      stuur({ soort: "vraagStand", id: vraag });
    });
  }, [stuur]);

  /** Het antwoord op een eigen vraag: het notebook en de uitvoer in het project, als er iets veranderd is. */
  const verwerkStand = useCallback((nieuweCode: unknown, uitvoer: unknown) => {
    if (typeof nieuweCode !== "string" || nieuweCode.length > MARIMO_MAX_TEKENS) return;
    const s = useProjectStore.getState();
    const nb = s.exemplaren.find((e) => e.id === id)?.marimo;
    if (!nb) return;
    // Nog niet gedraaid: dan is er geen nieuwe uitvoer, en blijft de opgeslagen staan.
    const gelezen = geldigeUitvoer(uitvoer);
    const nieuweUitvoer = gelezen?.some((u) => u.trim()) ? gelezen : nb.uitvoer;
    eigen.current = nieuweCode;
    if (nieuweCode === nb.code && JSON.stringify(nieuweUitvoer) === JSON.stringify(nb.uitvoer)) return;
    s.zetMarimo(id, { ...nb, code: nieuweCode, uitvoer: nieuweUitvoer });
  }, [id]);

  useEffect(() => {
    if (!herkomst) return;
    const op = (e: MessageEvent) => {
      const b = e.data as { bron?: unknown; soort?: unknown; id?: unknown; code?: unknown; uitvoer?: unknown; melding?: unknown } | null;
      if (e.origin !== herkomst || e.source !== binnen() || !b || b.bron !== BRON) return;
      switch (b.soort) {
        case "gereed":
          isGeladen.current = false;
          setGeladen(false);
          stuur({ soort: "laad", code: eigen.current ?? "", donker: isDonker() });
          break;
        case "geladen":
          isGeladen.current = true;
          setGeladen(true);
          break;
        case "gewijzigd":
          if (!isGeladen.current) break;
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            timer.current = null;
            void bewaar();
          }, BEWAAR_NA_MS);
          break;
        case "stand": {
          const peiling = peilingen.current.get(b.id as number);
          if (peiling) {
            peilingen.current.delete(b.id as number);
            verwerkStand(b.code, b.uitvoer);
            peiling(geldigeUitvoer(b.uitvoer));
            break;
          }
          const klaar = wachtend.current.get(b.id as number);
          if (!klaar) break;
          wachtend.current.delete(b.id as number);
          verwerkStand(b.code, b.uitvoer);
          klaar();
          break;
        }
        case "opslaan":
          // Ctrl+S in het notebook bewaart ook het project: hoogstens eens per seconde, en
          // alleen vlak na een echte toets. Code in de omgeving kan dit bericht ook sturen.
          if (navigator.userActivation?.isActive !== false && Date.now() - opslaanOp.current > 1000) {
            opslaanOp.current = Date.now();
            onOpslaan();
          }
          break;
        case "fout":
          console.error("Marimo:", b.melding);
          if (typeof b.id === "number") {
            peilingen.current.get(b.id)?.(null);
            peilingen.current.delete(b.id);
            wachtend.current.get(b.id)?.();
            wachtend.current.delete(b.id);
          } else if (!isGeladen.current) {
            setFout(String(b.melding));
          }
          break;
      }
    };
    window.addEventListener("message", op);
    return () => window.removeEventListener("message", op);
  }, [herkomst, binnen, stuur, bewaar, verwerkStand, onOpslaan]);

  // Bij opslaan en bij het wisselen van blad: de laatste stand eerst naar het project.
  useEffect(() => registreerBewaarder(bewaar), [bewaar]);

  /*
   * sheet_run (mcp/notebookUitvoer.ts). Marimo draait alle cellen bij het laden, dus: eerst
   * bewaren, dan opnieuw laden, en de uitvoer peilen tot hij twee keer achter elkaar gelijk
   * en niet leeg is. Marimo meldt niet zelf dat hij klaar is; dit is dus een peiling.
   */
  useEffect(() => registreerUitvoerder(id, async (tijdMs) => {
    const tot = Date.now() + tijdMs;
    const wacht = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
    await bewaar();
    isGeladen.current = false;
    setGeladen(false);
    setFout(null);
    setLaadTeller((n) => n + 1);
    while (!isGeladen.current) {
      if (Date.now() > tot) return { klaar: false, melding: "Marimo did not load in time." };
      await wacht(200);
    }
    const peil = () => new Promise<string[] | null>((klaar) => {
      const vraag = ++vraagTeller.current;
      const tijd = setTimeout(() => {
        if (peilingen.current.delete(vraag)) klaar(null);
      }, STAND_TIJDSLIMIET_MS);
      peilingen.current.set(vraag, (u) => {
        clearTimeout(tijd);
        klaar(u);
      });
      stuur({ soort: "vraagStand", id: vraag });
    });
    let vorige: string | null = null;
    while (Date.now() < tot) {
      await wacht(1500);
      const u = await peil();
      const nu = u && u.some((x) => x.trim()) ? JSON.stringify(u) : null;
      if (nu !== null && nu === vorige) return { klaar: true };
      vorige = nu;
    }
    return { klaar: false, melding: "Marimo's output did not settle in time; it may be incomplete." };
  }), [id, bewaar, stuur]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    wachtend.current.forEach((klaar) => klaar());
    wachtend.current.clear();
    peilingen.current.forEach((klaar) => klaar(null));
    peilingen.current.clear();
  }, []);

  // Het notebook is van buitenaf veranderd: ongedaan maken, een ander bestand ingelezen.
  useEffect(() => {
    if (code === eigen.current) return;
    eigen.current = code;
    isGeladen.current = false;
    setGeladen(false);
    setFout(null);
    setLaadTeller((n) => n + 1);
  }, [code]);

  return (
    <div className="jupyter-venster" style={stijl}>
      {fout ? (
        <p className="pdf-melding fout">{fout}</p>
      ) : (
        <>
          {!geladen && <p className="jupyter-laden">{t("jupyter.laden")}</p>}
          {omhulsel && (
            <iframe
              key={laadTeller}
              ref={buiten}
              className="jupyter-iframe"
              title={t("marimo.paneel")}
              srcDoc={omhulsel}
              sandbox={JUPYTER_RECHTEN}
              allow="clipboard-read; clipboard-write"
            />
          )}
        </>
      )}
    </div>
  );
}
