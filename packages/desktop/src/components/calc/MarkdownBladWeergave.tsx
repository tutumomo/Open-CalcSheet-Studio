import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { useProjectStore, type Exemplaar } from "../../store/projectStore";
import { useZoom } from "../../hooks/useZoom";
import { usePapier } from "./afdrukTaal";
import type { Maten } from "./paginering";
import { IframeBeelden } from "./iframeBlok";
import { exporteerMarkdown, kiesMarkdown } from "./markdownBlad";
import { markdownVoorPapier, markdownVoorScherm } from "./markdownRegels";
import { vulMarkdownIn } from "../../rekenen/tekstInvulling";
import { useInvulwaarden } from "./useTekstInvulling";
import { schoonUitwerking } from "./uitwerkingOpschonen";
import { UitwerkingHtml } from "./UitwerkingHtml";
import "./Editor.css";
import "./PdfBladWeergave.css";
import "./MarkdownBladWeergave.css";

/*
 * Een Markdown-blad in beeld en op papier (zie store/markdownBlad.ts). In de
 * werkruimte de bron naast de opgemaakte tekst; op papier de tekst in de opmaak
 * van het rapport, in blokken die de verdeling over de vellen kan verplaatsen.
 */

const BASE_FONT_PX = 13;
const INVOEGSELS = [markdown(), EditorView.lineWrapping];

/** Werkruimte: de bron. Ongedaan maken loopt via de projectstore, net als bij een rekenblad (Editor.tsx). */
export function MarkdownBron({ ex }: { ex: Exemplaar }) {
  const { t } = useTranslation("werkruimte");
  const zetMarkdown = useProjectStore((s) => s.zetMarkdown);
  const { ref, zoom } = useZoom();
  return (
    <div className="calc-editor" ref={ref} style={{ ["--cm-font-size" as string]: `${BASE_FONT_PX * zoom}px` }}>
      <CodeMirror
        value={ex.md?.tekst ?? ""}
        extensions={INVOEGSELS}
        placeholder={t("markdown.leeg")}
        onChange={(tekst) => zetMarkdown(ex.id, { ...(ex.md ?? { bestandsnaam: "" }), tekst })}
        basicSetup={{
          history: false,
          historyKeymap: false,
          lineNumbers: true,
          highlightActiveLineGutter: true,
          highlightActiveLine: true,
          foldGutter: true,
        }}
      />
    </div>
  );
}

/**
 * Werkruimte: de opgemaakte tekst, opgeschoond als de uitwerking van een rekenblad.
 * Een afbeelding van buiten krijgt per domein een knop, met dezelfde bevestiging
 * (iframeBlok.ts): wat al bevestigd is, laadt meteen.
 */
export function MarkdownWeergave({ ex }: { ex: Exemplaar }) {
  const { t } = useTranslation("rekentaal");
  const tRef = useRef(t);
  tRef.current = t;
  const bron = useDeferredValue(ex.md?.tekst ?? "");
  // `{#2.R_paal}`: de waarde uit een ander blad, zoals die in dat blad staat.
  const waarden = useInvulwaarden(bron, true);
  const tekst = useMemo(() => vulMarkdownIn(bron, waarden), [bron, waarden]);
  const beelden = ex.md?.beelden;
  const inhoud = useMemo(() => ({ __html: markdownVoorScherm(tekst, beelden, schoonUitwerking) }), [tekst, beelden]);
  const wortel = useRef<HTMLDivElement>(null);
  const extern = useRef<IframeBeelden | null>(null);
  useEffect(() => {
    const b = new IframeBeelden(() => {
      const vt = tRef.current;
      return { laden: vt("iframe.laden"), uitleg: vt("iframe.uitleg"), scripts: vt("iframe.scripts"), beeld: (host) => vt("iframe.beeld", { host }) };
    });
    extern.current = b;
    b.koppel(wortel.current, null);
    return () => {
      b.sluit();
      if (extern.current === b) extern.current = null;
    };
  }, []);
  useLayoutEffect(() => {
    extern.current?.koppel(wortel.current, null);
  }, [inhoud]);
  return (
    <div className="calc-preview-content md-weergave">
      <div ref={wortel} className="md-tekst" dangerouslySetInnerHTML={inhoud} />
    </div>
  );
}

/** Kop van het paneel: bestandsnaam, inlezen en wegschrijven. */
export function MarkdownBladInfo({ ex }: { ex: Exemplaar }) {
  const { t } = useTranslation("werkruimte");
  const zetMarkdown = useProjectStore((s) => s.zetMarkdown);
  const lees = async () => {
    try {
      const md = await kiesMarkdown();
      if (!md) return;
      if (ex.md?.tekst && !confirm(t("markdown.vervangenVraag", { naam: ex.naam }))) return;
      zetMarkdown(ex.id, { ...md, ...(ex.md?.koppenUit ? { koppenUit: true } : {}) });
    } catch (err) {
      console.error("Markdown inlezen mislukt:", err);
      alert(t("markdown.lezenMislukt", { fout: (err as Error)?.message ?? String(err) }));
    }
  };
  const schrijf = async () => {
    try {
      if (ex.md) await exporteerMarkdown(ex.naam, ex.md);
    } catch (err) {
      console.error("Markdown wegschrijven mislukt:", err);
      alert(t("markdown.schrijvenMislukt", { fout: (err as Error)?.message ?? String(err) }));
    }
  };
  return (
    <span className="pdf-info">
      {ex.md?.bestandsnaam && <span className="pdf-info-tekst" title={ex.md.bestandsnaam}>{ex.md.bestandsnaam}</span>}
      <button className="pdf-vervang" onClick={() => void lees()} title={t("markdown.inlezenUitleg")}>
        {t("markdown.inlezen")}
      </button>
      <button className="pdf-vervang" onClick={() => void schrijf()} disabled={!ex.md} title={t("markdown.exporterenUitleg")}>
        {t("markdown.exporteren")}
      </button>
    </span>
  );
}

/** Voor het paneel Rapport: of de koppen uit de tekst in de inhoudsopgave komen. */
export function MarkdownRapportKeuze({ ex }: { ex: Exemplaar }) {
  const { t } = useTranslation("rapport");
  const zetMarkdown = useProjectStore((s) => s.zetMarkdown);
  if (!ex.md) return null;
  const { koppenUit: _, ...md } = ex.md;
  return (
    <label className="rapport-vink">
      <input
        type="checkbox"
        checked={!ex.md.koppenUit}
        onChange={(e) => zetMarkdown(ex.id, e.target.checked ? md : { ...md, koppenUit: true })}
      />
      {t("berekeningen.koppenInInhoud")}
    </label>
  );
}

/**
 * De tekst op papier, in de opmaak van het rapport. `UitwerkingHtml` schoont op en
 * zet de afbeeldingen van buiten: bevestigd of alleen de naam van de host. Een
 * afbeelding die nog laadt draagt `data-afdruk-laadt`; het printen wacht daarop.
 */
export function MarkdownPapier({ ex }: { ex: Exemplaar; maten: Maten }) {
  const wortel = useRef<HTMLDivElement>(null);
  const t = usePapier();
  const waarden = useInvulwaarden(ex.md?.tekst ?? "", true);
  const html = useMemo(
    () =>
      ex.md
        ? markdownVoorPapier({ ...ex.md, tekst: vulMarkdownIn(ex.md.tekst, waarden) }, { id: ex.id, naam: ex.naam }, schoonUitwerking)
        : "",
    [ex.md, ex.id, ex.naam, waarden],
  );
  useLayoutEffect(() => {
    for (const img of wortel.current?.querySelectorAll("img") ?? []) {
      if (img.complete) continue;
      img.setAttribute("data-afdruk-laadt", "");
      // Het afdrukvoorbeeld ziet het merkteken verdwijnen en zet het beeld op zijn vel.
      const klaar = () => img.removeAttribute("data-afdruk-laadt");
      img.addEventListener("load", klaar, { once: true });
      img.addEventListener("error", klaar, { once: true });
    }
  }, [html]);
  if (!ex.md) return <p className="print-pdf-melding">{t("markdownBlad.ontbreekt")}</p>;
  return (
    <div ref={wortel} className="rpa-vlak md-papier">
      <UitwerkingHtml html={html} bladId={ex.id} />
    </div>
  );
}
