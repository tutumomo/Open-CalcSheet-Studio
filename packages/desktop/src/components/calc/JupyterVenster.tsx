import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { useProjectStore } from "../../store/projectStore";
import { registreerBewaarder } from "../../store/spreadsheetBlad";
import {
  bestandenVoorOmgeving, bladSleutel, eersteNotebook, JUPYTER_RECHTEN, jupyterOmhulsel, pakWerkmapIn, pakWerkmapUit,
  uitBase64, veiligPad, WERKMAP_MAX_BYTES, type WerkmapBestand,
} from "../../store/jupyterBlad";
import { bytesNaarBase64 } from "./pdfBlad";
import { registreerUitvoerder, type NotebookRonde } from "../../mcp/notebookUitvoer";

/*
 * Het venster van één Jupyter-blad: JupyterLite in een iframe, met een eigen herkomst
 * per blad, en het gesprek ermee (zie jupyter-omgeving/ocss-brug.js aan de andere kant).
 *
 * De omgeving bewaart zijn bestanden in zijn eigen geheugen; het project is de enige
 * bewaarplek. Bij het laden gaan de bestanden erheen, en na elke wijziging haalt de app
 * de stand op en zet die als ZIP in het project. Berichten uit de iframe zijn invoer van
 * buiten: alleen een antwoord op een eigen vraag verandert de werkmap, en alleen die van
 * dit blad.
 *
 * Het hoofdvenster komt hier nooit bij kijken: er is geen doorgeefluik naar Tauri, en
 * de server is alleen te bereiken met een sleutel in de hostnaam. Zie jupyter_omgeving.rs.
 */

const BRON = "ocss-jupyter";
/** Zo lang na de laatste wijziging in de omgeving gaat de stand naar het project. */
const BEWAAR_NA_MS = 1500;
/** Antwoordt de omgeving niet (een lange cel houdt hem niet tegen, een crash wel), dan gaat het opslaan door. */
const STAND_TIJDSLIMIET_MS = 20_000;
/** Is hij eenmaal stil, dan wacht het opslaan nog maar even. */
const STIL_TIJDSLIMIET_MS = 1500;

let poortBelofte: Promise<number> | null = null;

/** Start de server van de omgeving, één keer. Een fout blijft de melding: die verandert niet. */
export function omgevingPoort(): Promise<number> {
  if (!poortBelofte) {
    poortBelofte = import("@tauri-apps/api/core").then(({ invoke }) => invoke<number>("jupyter_omgeving_start"));
  }
  return poortBelofte;
}

/** Klopt het antwoord van de omgeving? Wat er niet in hoort, valt weg. */
function leesStand(x: unknown): WerkmapBestand[] | null {
  if (!Array.isArray(x)) return null;
  const uit: WerkmapBestand[] = [];
  let totaal = 0;
  for (const b of x as { pad?: unknown; bytes?: unknown }[]) {
    if (typeof b?.pad !== "string" || !(b.bytes instanceof Uint8Array) || !veiligPad(b.pad)) continue;
    totaal += b.bytes.length;
    if (totaal > WERKMAP_MAX_BYTES) return null;
    uit.push({ pad: b.pad, bytes: b.bytes });
  }
  return uit;
}

export function JupyterVenster({ id, stijl, onOpslaan }: { id: string; stijl: CSSProperties; onOpslaan: () => void }) {
  const { t } = useTranslation("werkruimte");
  const data = useProjectStore((s) => s.exemplaren.find((e) => e.id === id)?.jupyter?.data);
  const automatisch = useProjectStore((s) => s.exemplaren.find((e) => e.id === id)?.jupyter?.automatisch === true);
  const [poort, setPoort] = useState<number | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [geladen, setGeladen] = useState(false);
  const [stil, setStil] = useState(false);
  /** Een nieuwe waarde laadt de iframe opnieuw: de werkmap is van buitenaf veranderd. */
  const [laadTeller, setLaadTeller] = useState(0);

  const buiten = useRef<HTMLIFrameElement>(null);
  /** De werkmap die de omgeving nu heeft: gelezen of zelf weggeschreven. */
  const eigen = useRef(data);
  /** De keuze die de omgeving nu kent. */
  const automatischNu = useRef(automatisch);
  const isGeladen = useRef(false);
  const isStil = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wachtend = useRef(new Map<number, () => void>());
  /** Rondes van sheet_run die op hun stand wachten. */
  const rondes = useRef(new Map<number, (r: NotebookRonde) => void>());
  const vraagTeller = useRef(0);
  const opslaanOp = useRef(0);

  const herkomst = poort === null ? null : `http://blad-${bladSleutel(id)}.localhost:${poort}`;
  const omhulsel = useMemo(() => (herkomst ? jupyterOmhulsel(herkomst) : undefined), [herkomst]);

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
        console.error("Jupyter-omgeving starten mislukt:", err);
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

  const herlaad = useCallback(() => {
    isGeladen.current = false;
    isStil.current = false;
    setGeladen(false);
    setStil(false);
    setFout(null);
    setLaadTeller((n) => n + 1);
  }, []);

  const bewaar = useCallback(() => {
    if (!isGeladen.current) return Promise.resolve();
    return new Promise<void>((klaar) => {
      const vraag = ++vraagTeller.current;
      const tijd = setTimeout(() => {
        if (wachtend.current.delete(vraag)) {
          console.warn("Jupyter-omgeving antwoordt niet; laatste stand niet opgehaald.");
          isStil.current = true;
          setStil(true);
          klaar();
        }
      }, isStil.current ? STIL_TIJDSLIMIET_MS : STAND_TIJDSLIMIET_MS);
      wachtend.current.set(vraag, () => {
        clearTimeout(tijd);
        klaar();
      });
      stuur({ soort: "vraagStand", id: vraag });
    });
  }, [stuur]);

  /** Het antwoord op een eigen vraag: de stand als ZIP in het project, als er iets veranderd is. */
  const verwerkStand = useCallback(async (bestanden: unknown) => {
    const lijst = leesStand(bestanden);
    if (!lijst) {
      setFout(t("jupyter.teGroot"));
      return;
    }
    // Zonder vertrouwen: dat hoort niet in het project, en alleen openen is zo geen wijziging.
    const nieuw = await bytesNaarBase64(pakWerkmapIn(bestandenVoorOmgeving(lijst)));
    if (nieuw === eigen.current) return;
    eigen.current = nieuw;
    const s = useProjectStore.getState();
    const blad = s.exemplaren.find((e) => e.id === id);
    if (blad) s.zetJupyter(id, { ...blad.jupyter, bestandsnaam: blad.jupyter?.bestandsnaam ?? "", metCode: blad.jupyter?.metCode ?? true, data: nieuw });
  }, [id, t]);

  useEffect(() => {
    if (!herkomst) return;
    const op = (e: MessageEvent) => {
      const b = e.data as { bron?: unknown; soort?: unknown; id?: unknown; bestanden?: unknown; melding?: unknown } | null;
      if (e.origin !== herkomst || e.source !== binnen() || !b || b.bron !== BRON) return;
      if (isStil.current) {
        isStil.current = false;
        setStil(false);
      }
      switch (b.soort) {
        case "gereed": {
          // Ook als de pagina zichzelf herlaadt: het geheugen is dan leeg.
          isGeladen.current = false;
          setGeladen(false);
          let bestanden: WerkmapBestand[];
          try {
            bestanden = bestandenVoorOmgeving(eigen.current ? pakWerkmapUit(uitBase64(eigen.current)) : []);
          } catch (err) {
            setFout(t("jupyter.lezenMislukt", { fout: (err as Error)?.message ?? String(err) }));
            return;
          }
          stuur({ soort: "laad", bestanden, open: eersteNotebook(bestanden), automatisch: automatischNu.current });
          stuur({ soort: "thema", donker: document.documentElement.getAttribute("data-oa-theme")?.includes("dark") ?? false });
          break;
        }
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
          const ronde = rondes.current.get(b.id as number);
          if (ronde) {
            rondes.current.delete(b.id as number);
            verwerkStand(b.bestanden).then(
              () => ronde({ klaar: true }),
              (err) => ronde({ klaar: false, melding: String((err as Error)?.message ?? err) }),
            );
            break;
          }
          const klaar = wachtend.current.get(b.id as number);
          if (!klaar) break;
          wachtend.current.delete(b.id as number);
          verwerkStand(b.bestanden)
            .catch((err) => console.error("Jupyter-stand bewaren mislukt:", err))
            .finally(klaar);
          break;
        }
        case "opslaan":
          // Ctrl+S in een notebook bewaart ook het project: hoogstens eens per seconde,
          // en alleen vlak na een echte toets of klik. Code in de omgeving kan dit
          // bericht ook sturen, maar zo geen opslaan-dialogen achter elkaar openen.
          if (navigator.userActivation?.isActive !== false && Date.now() - opslaanOp.current > 1000) {
            opslaanOp.current = Date.now();
            onOpslaan();
          }
          break;
        case "fout":
          console.error("Jupyter-omgeving:", b.melding);
          if (typeof b.id === "number") {
            rondes.current.get(b.id)?.({ klaar: false, melding: String(b.melding) });
            rondes.current.delete(b.id);
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
  }, [herkomst, binnen, stuur, bewaar, verwerkStand, onOpslaan, t]);

  // Bij opslaan en bij het wisselen van blad: de laatste stand eerst naar het project.
  useEffect(() => registreerBewaarder(bewaar), [bewaar]);

  // sheet_run (mcp/notebookUitvoer.ts): alle cellen draaien en de uitvoer in het project.
  useEffect(() => registreerUitvoerder(id, async (tijdMs) => {
    const tot = Date.now() + tijdMs;
    while (!isGeladen.current) {
      if (Date.now() > tot) return { klaar: false, melding: "The Jupyter environment did not load in time." };
      await new Promise((ok) => setTimeout(ok, 200));
    }
    return new Promise<NotebookRonde>((klaar) => {
      const vraag = ++vraagTeller.current;
      const tijd = setTimeout(() => {
        if (rondes.current.delete(vraag)) klaar({ klaar: false, melding: "The notebook did not finish in time; its output may be incomplete." });
      }, Math.max(1000, tot - Date.now()));
      rondes.current.set(vraag, (r) => {
        clearTimeout(tijd);
        klaar(r);
      });
      stuur({ soort: "voerUit", id: vraag });
    });
  }), [id, stuur]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    wachtend.current.forEach((klaar) => klaar());
    wachtend.current.clear();
    rondes.current.forEach((klaar) => klaar({ klaar: false, melding: "The notebook window closed." }));
    rondes.current.clear();
  }, []);

  // De werkmap is van buitenaf veranderd: ongedaan maken, een ander bestand ingelezen.
  useEffect(() => {
    if (data === eigen.current) return;
    eigen.current = data;
    herlaad();
  }, [data, herlaad]);

  // De keuze Automatisch uitvoeren: aanzetten rekent meteen alles door.
  useEffect(() => {
    if (automatisch === automatischNu.current) return;
    automatischNu.current = automatisch;
    stuur({ soort: "automatisch", aan: automatisch });
  }, [automatisch, stuur]);

  // Het thema van de app volgen.
  useEffect(() => {
    const waarnemer = new MutationObserver(() => {
      if (isGeladen.current) {
        stuur({ soort: "thema", donker: document.documentElement.getAttribute("data-oa-theme")?.includes("dark") ?? false });
      }
    });
    waarnemer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-oa-theme"] });
    return () => waarnemer.disconnect();
  }, [stuur]);

  return (
    <div className="jupyter-venster" style={stijl}>
      {fout ? (
        <p className="pdf-melding fout">{fout}</p>
      ) : (
        <>
          {!geladen && <p className="jupyter-laden">{t("jupyter.laden")}</p>}
          {stil && (
            <p className="jupyter-stil">
              {t("jupyter.stil")}
              <button className="pdf-vervang" onClick={herlaad}>{t("jupyter.opnieuwLaden")}</button>
            </p>
          )}
          {omhulsel && (
            <iframe
              key={laadTeller}
              ref={buiten}
              className="jupyter-iframe"
              title={t("jupyter.paneel")}
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
