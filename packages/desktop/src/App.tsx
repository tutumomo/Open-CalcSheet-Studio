import { useState, useEffect, useCallback, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import i18next from "./i18n/config";
import TitleBar from "./components/TitleBar";
import Ribbon from "./components/ribbon/Ribbon";
import DocumentBar from "./components/DocumentBar";
import StatusBar from "./components/StatusBar";
import Backstage from "./components/backstage/Backstage";
import SettingsDialog, { applyTheme, applyTextSize } from "./components/settings/SettingsDialog";
import Modal from "./components/Modal";
import HelpPanel from "./components/calc/HelpPanel";
import Welkom, { welkomBijStart } from "./components/Welkom";
import Editor from "./components/calc/Editor";
import Preview from "./components/calc/Preview";
import SplitPane from "./components/calc/SplitPane";
import ProjectBrowser from "./components/calc/ProjectBrowser";
import { designerVoor } from "./components/calc/designerKeuze";
import { invoerSchermVoor } from "./components/calc/invoer/invoerScherm";
import ProjectGegevensPanel from "./components/calc/ProjectGegevensPanel";
import RapportPanel from "./components/rapport/RapportPanel";
import { vellenNaarPdf, wachtOpDrukbeelden, wachtOpVellen, zetDrukvellenKlaar } from "./components/rapport/afdruk/drukvellen";
import AfdrukVoorbeeld from "./components/calc/AfdrukVoorbeeld";
import ModuleKiezer from "./components/calc/ModuleKiezer";
import BladBijwerken from "./components/calc/BladBijwerken";
import TekenEditor from "./components/tekenen/TekenEditor";
import { BladVersieKop, BladVersieMelding } from "./components/calc/BladVersieKop";
import IfcViewerPanel from "./components/calc/IfcViewerPanel";
import { PdfBladInfo, PdfBladWeergave } from "./components/calc/PdfBladWeergave";
import { SpreadsheetBladInfo, SpreadsheetBladWeergave, SpreadsheetHouder } from "./components/calc/SpreadsheetBladWeergave";
import { MarkdownBladInfo, MarkdownBron, MarkdownWeergave } from "./components/calc/MarkdownBladWeergave";
import FeedbackDialog from "./components/FeedbackDialog";
import { CanvasBladWeergave } from "./components/calc/CanvasBladWeergave";
import VariantenPaneel from "./components/calc/varianten/VariantenPaneel";
import { isPdfBlad } from "./store/pdfBijlage";
import { isSpreadsheetBlad } from "./store/spreadsheetBlad";
import { isMarkdownBlad } from "./store/markdownBlad";
import { isCanvasBlad } from "./store/canvasBlad";
import { GraafBladInfo, GraafBladWeergave } from "./components/graaf/GraafBladWeergave";
import { isGraafBlad } from "./store/graafBlad";
import { TekenbladInfo, TekenbladWeergave } from "./components/calc/TekenbladWeergave";
import { isTekenBlad } from "./store/tekenBlad";
import { JupyterBladInfo, JupyterBladWeergave, JupyterHouder, MarimoBladInfo } from "./components/calc/JupyterBladWeergave";
import { isJupyterBlad } from "./store/jupyterBlad";
import { isMarimoBlad } from "./store/marimoBlad";
import { getSetting } from "./store";
import { useProjectStore, PROJECT_ID, RAPPORT_ID } from "./store/projectStore";
import { usePrintStore } from "./store/printStore";
import { useCodeVerzoek } from "./store/codeVerzoek";
import { useRecentFiles } from "./hooks/useRecentFiles";
import { useSneltoetsen } from "./hooks/useSneltoetsen";
import { useMcpBrug } from "./mcp/useMcpBrug";
import { useBestandActies } from "./hooks/useBestandActies";
import { GeenProjectFout, leesProjectBestand } from "./store/projectBestand";
import { startbestand } from "./tauri/fileOps";
import type { AngleMode } from "@ifc-calc/core";
import { zetHoekmodus, useBladResultaat } from "./rekenen/doorrekening";
import { werkToetsingenBij } from "./rekenen/femToetsing";
import { UNITS_DEFAULTS, type UnitsSettings } from "./components/settings/SettingsDialog";

/**
 * Een paneel van de werkruimte met een kopregel (CODE, VISUEEL, UITWERKING),
 * zoals de panelen van de Blueprint-schil. Rechts in de kop wat je van dat
 * paneel wilt weten zonder te zoeken.
 */
function WerkPaneel({ titel, info, papier, children }: { titel: string; info?: ReactNode; papier?: boolean; children: ReactNode }) {
  return (
    <section className="werk-paneel">
      <div className="werk-paneel-kop">
        <span className="werk-paneel-titel">{titel}</span>
        {info && <span className="werk-paneel-info">{info}</span>}
      </div>
      {/* Het beeld en de uitwerking zijn papier: in elk thema licht, net als
          het afdrukvoorbeeld (themes.css). De code volgt het thema. */}
      <div className="werk-paneel-body" data-oa-theme={papier ? "light" : undefined}>{children}</div>
    </section>
  );
}

/** De maatgevende UC van het blad, rechts in de kop van de uitwerking. */
function UcInfo({ blad }: { blad: string }) {
  const { t, i18n } = useTranslation("werkruimte");
  const r = useBladResultaat(blad);
  if (r?.nietGetoetst) return <span className="werk-uc">{t("browser.nietGetoetst")}</span>;
  if (!r || r.uc === null) return null;
  const voldoet = r.voldoet ?? r.uc <= 1;
  const getal = Number.isFinite(r.uc)
    ? r.uc.toLocaleString(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "∞";
  return (
    <span className={voldoet ? "werk-uc voldoet" : "werk-uc voldoet-niet"}>
      {t(voldoet ? "browser.ucVoldoet" : "browser.ucVoldoetNiet", { uc: getal })}
    </span>
  );
}

/** Het startbestand is geopend; een later effect opent het niet nog eens. */
let startbestandGeopend = false;

export default function App() {
  const { t } = useTranslation("werkruimte");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState("general");
  const [helpOpen, setHelpOpen] = useState(false);
  // Het welkomstvenster bij het opstarten, tot je het uitzet (Welkom.tsx).
  const [welkomOpen, setWelkomOpen] = useState(false);
  useEffect(() => {
    welkomBijStart().then((tonen) => { if (tonen) setWelkomOpen(true); });
  }, []);
  const openSettings = useCallback((tab = "general") => {
    setSettingsTab(tab);
    setSettingsOpen(true);
  }, []);
  const [backstageOpen, setBackstageOpen] = useState(false);
  const [activeView, setActiveView] = useState("default");
  const [theme, setTheme] = useState("light");
  // 2-pane werkruimte-modus: code+visueel / code+uitwerking / visueel+uitwerking
  const [splitMode, setSplitMode] = useState<"cv" | "cu" | "vu">("vu");
  // Een canvas-blad opent op het canvas; zijn rekentekst is de tab ernaast.
  const [canvasCode, setCanvasCode] = useState(false);
  // De tab Varianten van een rekenblad (docs/varianten.md); een ander blad opent weer in zijn gewone weergave.
  const [variantenOpen, setVariantenOpen] = useState(false);

  useEffect(() => {
    getSetting<string>("theme", "light").then((saved) => {
      setTheme(saved);
      applyTheme(saved);
    });
    getSetting<string>("textSize", "standard").then(applyTextSize);
    getSetting<UnitsSettings>("units", UNITS_DEFAULTS).then((u) => {
      zetHoekmodus(u.angleMode as AngleMode);
    });
    const onUnits = (e: Event) => {
      const detail = (e as CustomEvent<UnitsSettings>).detail;
      if (detail) zetHoekmodus(detail.angleMode as AngleMode);
    };
    window.addEventListener("units-changed", onUnits);
    // Show window once theme is applied (avoids flash of unstyled chrome)
    import("@tauri-apps/api/window")
      .then(({ getCurrentWindow }) => {
        getCurrentWindow().show();
      })
      .catch(() => {
        // Browser fallback (npm run dev without Tauri)
      });
    return () => window.removeEventListener("units-changed", onUnits);
  }, []);

  const handleThemeChange = (newTheme: string) => {
    setTheme(newTheme);
    applyTheme(newTheme);
  };

  const activeId = useProjectStore((s) => s.activeId);
  const exemplaren = useProjectStore((s) => s.exemplaren);
  const laadProject = useProjectStore((s) => s.laadProject);
  const markeerOpgeslagen = useProjectStore((s) => s.markeerOpgeslagen);
  const actief = exemplaren.find((e) => e.id === activeId) ?? null;
  const source = actief?.source ?? "";
  const { addRecentFile } = useRecentFiles();
  const { openen } = useBestandActies();
  useSneltoetsen();
  // Een blad waar je de rekentekst schrijft of leest (een eigen rekenblad, de demo van de
  // rekentaal) opent met de code; het invoerscherm is daar een tab erbij. Ook als zo'n blad
  // tijdens het typen zijn eerste invoerveld krijgt, blijft de editor staan waarin je typt.
  // Tot je zelf een weergave kiest. Een module opent met haar invoerscherm. De keuze valt
  // bij het openen van een blad (`blad` is het blad waarvoor ze geldt).
  const [opening, setOpening] = useState<{ blad: string; code: boolean }>({ blad: "", code: false });
  const kiesSplitMode = useCallback((m: "cv" | "cu" | "vu") => {
    setOpening((o) => ({ ...o, code: false }));
    setSplitMode(m);
  }, []);
  useMcpBrug({ splitMode, setSplitMode: kiesSplitMode, activeView, setActiveView, setTheme });

  const printBezig = usePrintStore((s) => s.bezig);
  const printVoorbeeld = usePrintStore((s) => s.voorbeeld);
  const printKlaar = usePrintStore((s) => s.klaar);
  const toonVoorbeeld = usePrintStore((s) => s.toonVoorbeeld);
  const sluitVoorbeeld = usePrintStore((s) => s.sluitVoorbeeld);
  const printSelectie = usePrintStore((s) => s.selectie);
  const kiesSelectie = usePrintStore((s) => s.kiesSelectie);
  const printSoort = usePrintStore((s) => s.soort);
  // Afdrukken gaat altijd via de vellen van het afdrukvoorbeeld (drukvellen.ts): wat je daar
  // ziet, komt op papier. De browser zelf laten pagineren zet een vaste kop en voet midden op
  // de pagina. De app blijft staan, want het voorbeeld moet die vellen bouwen; losse bladen
  // gaan daarna terug naar waar je was.
  useEffect(() => {
    if (!printBezig) return;
    let afgebroken = false;
    const rapport = printSoort === "rapport";
    const { voorbeeld: alOpen, selectie } = usePrintStore.getState();
    const project = useProjectStore.getState();
    if (rapport) project.selecteer(RAPPORT_ID);
    else if (project.activeId === RAPPORT_ID) project.selecteer(selectie?.[0] ?? project.exemplaren[0]?.id ?? "");
    toonVoorbeeld(rapport ? null : undefined, printSoort);
    // Eerst de @toets-blokken zonder antwoord laten toetsen: anders staan ze als niet
    // getoetst op papier. Een ouder antwoord blijft staan; opnieuw toetsen is een knop.
    // Het rapport heeft alle bladen.
    werkToetsingenBij(rapport ? null : usePrintStore.getState().selectie)
      .then(() => wachtOpVellen())
      .then(async (vellen) => {
        if (afgebroken) return;
        const opruimen = zetDrukvellenKlaar(vellen);
        try {
          await wachtOpDrukbeelden();
          const { pdfPad, meldPdfGeschreven } = usePrintStore.getState();
          if (pdfPad && (await vellenNaarPdf(pdfPad))) meldPdfGeschreven(pdfPad);
          else window.print();
        } finally {
          opruimen();
          printKlaar();
          if (!rapport && !alOpen) sluitVoorbeeld();
        }
      })
      .catch((err) => {
        alert((err as Error).message);
        printKlaar();
      });
    return () => {
      afgebroken = true;
    };
  }, [printBezig, printSoort, printKlaar, toonVoorbeeld, sluitVoorbeeld]);

  // Staat het afdrukvoorbeeld op één blad en open je een ander blad, dan volgt
  // het voorbeeld mee. Een keuze voor het hele project blijft staan.
  useEffect(() => {
    if (!printVoorbeeld || !actief) return;
    if (printSelectie && printSelectie.length === 1 && printSelectie[0] !== actief.id) {
      kiesSelectie([actief.id]);
    }
  }, [printVoorbeeld, actief, printSelectie, kiesSelectie]);

  // Het rapportvoorbeeld hoort bij de knoop Rapport, het voorbeeld van bladen
  // bij de bladen. Kies je een andere knoop terwijl het rapportvoorbeeld
  // openstaat, of de knoop Rapport terwijl er bladen in het voorbeeld staan,
  // dan gaat het voorbeeld dicht. Anders blijft het onzichtbaar "open" en
  // drukt Ctrl+P iets anders af dan je ziet. Hetzelfde als je vanuit het
  // voorbeeld van een blad het rapport afdrukt: dat voorbeeld zou daarna het
  // rapport tonen onder de tabs van het blad.
  useEffect(() => {
    if (!printVoorbeeld) return;
    if ((printSoort === "rapport") !== (activeId === RAPPORT_ID)) sluitVoorbeeld();
  }, [printVoorbeeld, printSoort, activeId, sluitVoorbeeld]);

  // Het parametrische beeld van het blad. Een rekenblad zonder eigen beeld krijgt het
  // invoerscherm uit zijn eigen velden, bij een module met een beeld erboven
  // (components/calc/invoer/invoerScherm.tsx).
  const eigenBeeld = designerVoor(source);
  const invoerScherm = eigenBeeld || !actief ? null : invoerSchermVoor(actief);
  const designerPane = eigenBeeld ?? invoerScherm?.scherm ?? null;
  const opentMetScherm = eigenBeeld !== null || !!invoerScherm?.opent;
  // Het projectgegevens-formulier is geen rekenblad: geen editor, geen
  // uitwerking, geen splitsing — alleen het formulier.
  const toontProjectGegevens = activeId === PROJECT_ID;
  // Het rapport is evenmin een rekenblad: een eigen paneel, met het hele
  // rapport als afdrukvoorbeeld in de tweede tab. Net als bij de bladen wint
  // een open voorbeeld van de IFC-weergave, het invulpaneel niet.
  const toontRapport = activeId === RAPPORT_ID;
  const rapportVoorbeeld = printVoorbeeld && printSoort === "rapport";
  const rapportWerkruimte = toontRapport && (rapportVoorbeeld || activeView !== "ifc");
  const hasDesigner = designerPane !== null && !toontProjectGegevens;
  // Een PDF-blad heeft geen code, beeld of uitwerking: alleen zijn pagina's.
  const pdfBlad = actief !== null && isPdfBlad(actief);
  // Idem een spreadsheet-blad: alleen zijn werkmap.
  const spreadsheetBlad = actief !== null && isSpreadsheetBlad(actief);
  // Idem een Markdown-blad: zijn tekst, als bron en opgemaakt.
  const markdownBlad = actief !== null && isMarkdownBlad(actief);
  // Een canvas-blad heeft gewone rekentekst: de weergaven van een blad, met het canvas ervoor.
  const canvasBlad = actief !== null && isCanvasBlad(actief);
  const toontCanvas = canvasBlad && !canvasCode;
  useEffect(() => setCanvasCode(false), [activeId]);
  useEffect(() => setVariantenOpen(false), [activeId]);
  // Idem een grafblad: alleen zijn vlak.
  const graafBlad = actief !== null && isGraafBlad(actief);
  // En een tekenblad: alleen zijn vel.
  const tekenBlad = actief !== null && isTekenBlad(actief);
  // Idem een Jupyter-blad: alleen zijn omgeving.
  const jupyterBlad = actief !== null && isJupyterBlad(actief);
  // En een Marimo-blad: ook alleen zijn omgeving.
  const marimoBlad = actief !== null && isMarimoBlad(actief);
  // Alleen bij het openen van een blad: wat het daarna krijgt, komt erbij als tab. Tijdens
  // het tekenen beslist, niet in een effect: anders staat het invoerscherm er één beeld lang.
  let codeBlijft = opening.code;
  if (opening.blad !== activeId) {
    codeBlijft = !(hasDesigner && opentMetScherm);
    setOpening({ blad: activeId, code: codeBlijft });
  }
  const mode = hasDesigner && !codeBlijft ? splitMode : "cu";
  const regels = source.split("\n").length;
  const codePaneel = (
    <WerkPaneel titel={t("paneel.code")} info={t("paneel.regels", { count: regels })}>
      <Editor />
    </WerkPaneel>
  );
  // Het formulier zonder beeld heet naar wat het is: invoer.
  const beeldPaneel = (
    <WerkPaneel titel={invoerScherm && !invoerScherm.metBeeld ? t("paneel.invoer") : t("paneel.visueel")} papier>{designerPane}</WerkPaneel>
  );
  const uitwerkingPaneel = (
    <WerkPaneel titel={t("paneel.uitwerking")} info={actief ? <UcInfo blad={actief.id} /> : null} papier>
      <Preview />
    </WerkPaneel>
  );
  const leftPane = mode === "vu" ? beeldPaneel : codePaneel;
  const rightPane = mode === "cv" ? beeldPaneel : uitwerkingPaneel;

  // De weergaven van een geopend blad, met het afdrukvoorbeeld als laatste tab.
  // Dat voorbeeld toont de bladen, ook als er eerder een rapport is afgedrukt.
  // Rechts in de balk de modulestatus en rekenversie van het blad; eronder de
  // melding als de module intussen een nieuwere rekenversie heeft.
  const kiesWeergave = (m: "cv" | "cu" | "vu") => {
    sluitVoorbeeld();
    kiesSplitMode(m);
    setCanvasCode(true);
    setVariantenOpen(false);
  };
  // Varianten bij elk blad met rekentekst: een rekenblad, een module of een canvas.
  const kanVarianten = actief !== null && !pdfBlad && !spreadsheetBlad && !markdownBlad && !graafBlad && !tekenBlad && !jupyterBlad && !marimoBlad;
  const toontVarianten = variantenOpen && kanVarianten && !printVoorbeeld;
  const aantalVarianten = actief?.varianten?.lijst.length ?? 0;

  // Het lint (tab Rekentaal) vraagt om de code: weg uit de IFC-weergave en het
  // afdrukvoorbeeld, en een weergave mét editor.
  const codeVerzoek = useCodeVerzoek((s) => s.teller);
  useEffect(() => {
    if (codeVerzoek === 0) return;
    setActiveView("default");
    sluitVoorbeeld();
    setSplitMode((m) => (m === "vu" ? "cv" : m));
    setCanvasCode(true);
    setVariantenOpen(false);
  }, [codeVerzoek, sluitVoorbeeld]);
  const tabBalk = actief && !toontProjectGegevens && (pdfBlad || spreadsheetBlad || markdownBlad || graafBlad || tekenBlad || jupyterBlad || marimoBlad) ? (
    <div className="split-tabs">
      <button className={`split-tab${printVoorbeeld ? "" : " active"}`} onClick={() => sluitVoorbeeld()}>{t(pdfBlad ? "pdf.tab" : jupyterBlad ? "jupyter.tab" : marimoBlad ? "marimo.tab" : tekenBlad ? "tekenblad.tab" : graafBlad ? "graaf.tab" : spreadsheetBlad ? "spreadsheet.tab" : "markdown.tab")}</button>
      <button className={`split-tab${printVoorbeeld ? " active" : ""}`} onClick={() => toonVoorbeeld([actief.id], "bladen")}>{t("algemeen.afdrukvoorbeeld")}</button>
    </div>
  ) : actief && !toontProjectGegevens ? (
    <>
      <div className="split-tabs">
        {canvasBlad && (
          <button
            className={`split-tab${!printVoorbeeld && !toontVarianten && toontCanvas ? " active" : ""}`}
            onClick={() => {
              sluitVoorbeeld();
              setCanvasCode(false);
              setVariantenOpen(false);
            }}
          >
            {t("canvas.tab")}
          </button>
        )}
        {hasDesigner && (
          <button className={`split-tab${!printVoorbeeld && !toontVarianten && !toontCanvas && mode === "cv" ? " active" : ""}`} onClick={() => kiesWeergave("cv")}>{t("weergave.codeVisueel")}</button>
        )}
        <button className={`split-tab${!printVoorbeeld && !toontVarianten && !toontCanvas && mode === "cu" ? " active" : ""}`} onClick={() => kiesWeergave("cu")}>{t("weergave.codeUitwerking")}</button>
        {hasDesigner && (
          <button className={`split-tab${!printVoorbeeld && !toontVarianten && !toontCanvas && mode === "vu" ? " active" : ""}`} onClick={() => kiesWeergave("vu")}>{t("weergave.visueelUitwerking")}</button>
        )}
        <button
          className={`split-tab${toontVarianten ? " active" : ""}`}
          onClick={() => {
            sluitVoorbeeld();
            setVariantenOpen(true);
          }}
        >
          {aantalVarianten ? t("varianten.tabAantal", { count: aantalVarianten }) : t("varianten.tab")}
        </button>
        <button className={`split-tab${printVoorbeeld ? " active" : ""}`} onClick={() => toonVoorbeeld([actief.id], "bladen")}>{t("algemeen.afdrukvoorbeeld")}</button>
        <BladVersieKop ex={actief} />
      </div>
      <BladVersieMelding ex={actief} />
    </>
  ) : null;

  // De knoop Rapport: het invulpaneel, of het hele rapport zoals het op papier komt.
  const rapportTabs = (
    <div className="split-tabs">
      <button className={`split-tab${rapportVoorbeeld ? "" : " active"}`} onClick={() => sluitVoorbeeld()}>{t("algemeen.rapport")}</button>
      <button className={`split-tab${rapportVoorbeeld ? " active" : ""}`} onClick={() => toonVoorbeeld(null, "rapport")}>{t("algemeen.afdrukvoorbeeld")}</button>
    </div>
  );

  // De meldingen via i18next.t op het moment zelf, niet via de `t` van de
  // hook: zo blijft deze callback dezelfde bij een taalwissel, en leest het
  // effect hieronder het startbestand niet opnieuw.
  const handleOpenRecent = useCallback(async (path: string) => {
    try {
      // Only Tauri runtime can read by absolute path; browser fallback cannot.
      const win = window as unknown as { __TAURI_INTERNALS__?: unknown };
      if (!win.__TAURI_INTERNALS__) {
        alert(i18next.t("werkruimte:bestand.recentAlleenDesktop"));
        return;
      }
      const { readTextFile } = await import("@tauri-apps/plugin-fs");
      const raw = await readTextFile(path);
      const name = path.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, "") ?? path;
      laadProject(leesProjectBestand(raw, name));
      markeerOpgeslagen(path);
      await addRecentFile(path);
    } catch (err) {
      const fout = err instanceof GeenProjectFout ? i18next.t("werkruimte:bestandDialoog.geenProject") : (err as Error).message;
      alert(i18next.t("werkruimte:bestand.openenMislukt", { fout }));
    }
  }, [laadProject, markeerOpgeslagen, addRecentFile]);

  // Gestart met een bestand (bestandskoppeling): dat bestand openen, één keer.
  useEffect(() => {
    let afgebroken = false;
    startbestand()
      .then((pad) => {
        if (!pad || afgebroken || startbestandGeopend) return;
        startbestandGeopend = true;
        void handleOpenRecent(pad);
      })
      .catch((err) => console.error("Startbestand lezen mislukt:", err));
    return () => { afgebroken = true; };
  }, [handleOpenRecent]);

  return (
    <>
      <TitleBar onSettingsClick={() => openSettings()} onFeedbackClick={() => setFeedbackOpen(true)} />
      <Ribbon
        onFileTabClick={() => setBackstageOpen(true)}
        onSettingsClick={openSettings}
        onHelpClick={() => setHelpOpen(true)}
        onWelkomClick={() => setWelkomOpen(true)}
        activeView={activeView}
        onViewChange={setActiveView}
      />
      <DocumentBar />
      <main className="main-view" style={{ flex: 1, minHeight: 0, display: "flex" }}>
        <ProjectBrowser />
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          {rapportWerkruimte ? (
            <>
              {rapportTabs}
              {rapportVoorbeeld ? (
                <AfdrukVoorbeeld />
              ) : (
                <div style={{ flex: 1, minHeight: 0 }}>
                  <RapportPanel />
                </div>
              )}
            </>
          ) : printVoorbeeld ? (
            <>
              {tabBalk}
              <AfdrukVoorbeeld />
            </>
          ) : activeView === "ifc" ? (
            <IfcViewerPanel />
          ) : toontProjectGegevens ? (
            <ProjectGegevensPanel />
          ) : !actief ? (
            <div className="werkruimte-leeg">
              <h2>{t("leeg.titel")}</h2>
              <p>
                <Trans t={t} i18nKey="leeg.uitleg" components={{ b: <b /> }} />
              </p>
            </div>
          ) : toontVarianten && actief ? (
            <>
              {tabBalk}
              <div style={{ flex: 1, minHeight: 0 }}>
                <VariantenPaneel key={actief.id} ex={actief} />
              </div>
            </>
          ) : markdownBlad ? (
            <>
              {tabBalk}
              <div style={{ flex: 1, minHeight: 0 }}>
                <SplitPane
                  left={<WerkPaneel titel={t("markdown.bron")} info={<MarkdownBladInfo ex={actief} />}><MarkdownBron key={actief.id} ex={actief} /></WerkPaneel>}
                  right={<WerkPaneel titel={t("markdown.weergave")} papier><MarkdownWeergave ex={actief} /></WerkPaneel>}
                />
              </div>
            </>
          ) : toontCanvas ? (
            <>
              {tabBalk}
              <div style={{ flex: 1, minHeight: 0 }}>
                <WerkPaneel titel={t("canvas.paneel")} info={<UcInfo blad={actief.id} />}>
                  <CanvasBladWeergave key={actief.id} ex={actief} />
                </WerkPaneel>
              </div>
            </>
          ) : graafBlad ? (
            <>
              {tabBalk}
              <div style={{ flex: 1, minHeight: 0 }}>
                {/* Papier, zoals een rekenblad en zijn 3D-beeld: in elk thema licht. */}
                <WerkPaneel titel={t("graaf.paneel")} info={<GraafBladInfo ex={actief} />} papier>
                  <GraafBladWeergave key={actief.id} ex={actief} />
                </WerkPaneel>
              </div>
            </>
          ) : tekenBlad ? (
            <>
              {tabBalk}
              <div style={{ flex: 1, minHeight: 0 }}>
                <WerkPaneel titel={t("tekenblad.paneel")} info={<TekenbladInfo ex={actief} />}>
                  <TekenbladWeergave ex={actief} />
                </WerkPaneel>
              </div>
            </>
          ) : jupyterBlad ? (
            <>
              {tabBalk}
              <div style={{ flex: 1, minHeight: 0 }}>
                <WerkPaneel titel={t("jupyter.paneel")} info={<JupyterBladInfo ex={actief} />}>
                  <JupyterBladWeergave />
                </WerkPaneel>
              </div>
            </>
          ) : marimoBlad ? (
            <>
              {tabBalk}
              <div style={{ flex: 1, minHeight: 0 }}>
                <WerkPaneel titel={t("marimo.paneel")} info={<MarimoBladInfo ex={actief} />}>
                  <JupyterBladWeergave />
                </WerkPaneel>
              </div>
            </>
          ) : spreadsheetBlad ? (
            <>
              {tabBalk}
              <div style={{ flex: 1, minHeight: 0 }}>
                <WerkPaneel titel={t("spreadsheet.paneel")} info={<SpreadsheetBladInfo ex={actief} />}>
                  <SpreadsheetBladWeergave />
                </WerkPaneel>
              </div>
            </>
          ) : pdfBlad ? (
            <>
              {tabBalk}
              <div style={{ flex: 1, minHeight: 0 }}>
                <WerkPaneel titel={t("pdf.paneel")} info={<PdfBladInfo ex={actief} />}>
                  <PdfBladWeergave ex={actief} />
                </WerkPaneel>
              </div>
            </>
          ) : (
            <>
              {tabBalk}
              <div style={{ flex: 1, minHeight: 0 }}>
                <SplitPane left={leftPane} right={rightPane} />
              </div>
            </>
          )}
        </div>
      </main>
      {welkomOpen && <Welkom onSluit={() => setWelkomOpen(false)} />}
      <StatusBar />
      <SpreadsheetHouder />
      <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
      <JupyterHouder />
      <Backstage
        open={backstageOpen}
        onClose={() => setBackstageOpen(false)}
        onOpenSettings={() => {
          setBackstageOpen(false);
          openSettings();
        }}
        onBrowse={openen}
        onOpenFile={handleOpenRecent}
      />
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        theme={theme}
        onThemeChange={handleThemeChange}
        startTab={settingsTab}
      />
      {/* De rekentaal in het kort; een fragment aanklikken voegt het in op de cursor. */}
      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title={t("ribbon:calc.helpButton")} width={760} height="80vh" className="help-dialoog">
        <HelpPanel />
      </Modal>
      <ModuleKiezer />
      <BladBijwerken />
      <TekenEditor />
    </>
  );
}
