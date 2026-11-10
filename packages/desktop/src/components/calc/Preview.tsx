import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { defaultStyles, invoerNaarBron, leesVerwijzing, toonInvoer } from "@ifc-calc/core";
import {
  useActiefExemplaar,
  useActieveBron,
  useActieveWaarden,
  useProjectScope,
  useZetActieveWaarde,
} from "../../store/actiefBlad";
import { useZoom } from "../../hooks/useZoom";
import { useDoorrekening } from "../../rekenen/doorrekening";
import { klikOpToetsKnop } from "../../rekenen/femToetsing";
import HelpPanel from "./HelpPanel";
import { DrieDBeelden } from "./drieDBlok";
import { IfcxBeelden, ifcxTeksten } from "./ifcxBlok";
import { IframeBeelden } from "./iframeBlok";
import { JsBeelden } from "./jsBlok";
import { schoonUitwerking } from "./uitwerkingOpschonen";
import "katex/dist/katex.min.css";
import "./Preview.css";

let stylesInjected = false;
function ensureCoreStyles() {
  if (stylesInjected || typeof document === "undefined") return;
  const style = document.createElement("style");
  style.textContent = defaultStyles;
  style.dataset.ifcCalc = "core-styles";
  document.head.appendChild(style);
  stylesInjected = true;
}

export default function Preview() {
  const source = useActieveBron();
  // Invoerwaarden horen bij het blad dat openstaat, niet bij de app. Twee
  // exemplaren van dezelfde module hebben dus elk hun eigen set.
  const selectValues = useActieveWaarden();
  const setSelectValue = useZetActieveWaarde();
  // De projectgegevens (gevolgklasse, levensduur, ...) staan als variabelen
  // klaar voordat de eerste regel van het blad draait.
  const projectScope = useProjectScope();
  const containerRef = useRef<HTMLDivElement>(null);
  // De laag met de iframes: buiten de html van de uitwerking, anders begint een
  // iframe opnieuw bij elke herberekening (iframeBlok.ts).
  const laagRef = useRef<HTMLDivElement>(null);
  // Het invoerveld waarin getypt wordt, met de cursorpositie. Elke toetsaanslag
  // rekent het blad opnieuw door en vervangt de hele uitwerking, dus ook dit
  // veld; zonder deze administratie verloor het na één teken de focus en kwam
  // de rest van de invoer nergens terecht.
  const typtIn = useRef<{ naam: string; start: number; eind: number; tekst: string } | null>(null);

  useEffect(() => {
    ensureCoreStyles();
  }, []);

  // Het doorrekenen gebeurt in een worker (rekenen/doorrekening.ts), samen met
  // het parametrische beeld; zo blijft het venster bedienbaar bij een groot
  // blad. Tot de nieuwe uitkomst er is, blijft de vorige staan.
  const exemplaar = useActiefExemplaar();
  const { doorrekening, bezig } = useDoorrekening(
    exemplaar?.id, source, selectValues, projectScope, exemplaar?.naam ?? "",
  );
  const html = doorrekening?.html ?? "";
  // Hetzelfde object zolang de html gelijk blijft. React 19 zet de html bij
  // elk nieuw object opnieuw neer, ook als de tekst niet veranderde; dan
  // verdween bij elke andere aanleiding (zoomen, de rekenstand) het
  // draaibare 3D-beeld uit de uitwerking.
  const inhoud = useMemo(() => ({ __html: schoonUitwerking(html) }), [html]);

  // Een `@3d`-blok krijgt een draaibaar beeld (drieDBlok.ts). De beelden
  // blijven bestaan over herberekeningen heen en verhuizen mee naar de nieuwe
  // uitwerking; vóór het tekenen (layout-effect), zodat de stilstaande
  // projectie niet even oplicht. Weg pas als de uitwerking sluit.
  const { t } = useTranslation("rekentaal");
  const tRef = useRef(t);
  tRef.current = t;
  const beelden = useRef<DrieDBeelden | null>(null);
  useLayoutEffect(() => {
    const b = new DrieDBeelden(() => {
      const vt = tRef.current;
      return {
        hint: vt("drieD.hint"),
        passend: vt("drieD.passend"),
        standpunt: {
          iso: vt("drieD.standpunt.iso"),
          voor: vt("drieD.standpunt.voor"),
          boven: vt("drieD.standpunt.boven"),
          zij: vt("drieD.standpunt.zij"),
        },
      };
    });
    beelden.current = b;
    return () => {
      b.sluit();
      if (beelden.current === b) beelden.current = null;
    };
  }, []);

  // Een `@ifcx`-blok: hetzelfde, maar het beeld leest een IFCX-document (ifcxBlok.ts).
  const ifcxBeelden = useRef<IfcxBeelden | null>(null);
  useLayoutEffect(() => {
    const b = new IfcxBeelden(() => ifcxTeksten(tRef.current));
    ifcxBeelden.current = b;
    return () => {
      b.sluit();
      if (ifcxBeelden.current === b) ifcxBeelden.current = null;
    };
  }, []);

  // Een `@iframe`-regel: een kader met een knop, en na bevestiging de pagina (iframeBlok.ts).
  const iframes = useRef<IframeBeelden | null>(null);
  useLayoutEffect(() => {
    const b = new IframeBeelden(() => {
      const vt = tRef.current;
      return { laden: vt("iframe.laden"), uitleg: vt("iframe.uitleg"), scripts: vt("iframe.scripts"), beeld: (host) => vt("iframe.beeld", { host }) };
    });
    iframes.current = b;
    return () => {
      b.sluit();
      if (iframes.current === b) iframes.current = null;
    };
  }, []);

  // Een `@js`-blok: een knop, en na bevestiging een afgeschermd venster (jsBlok.ts).
  const scripts = useRef<JsBeelden | null>(null);
  useLayoutEffect(() => {
    const b = new JsBeelden(() => {
      const vt = tRef.current;
      return {
        uitvoeren: vt("js.uitvoeren"),
        uitleg: vt("js.uitleg"),
        geenNetwerk: vt("js.geenNetwerk"),
        netwerk: (hosts) => vt("js.netwerk", { hosts }),
        bibliotheek: (naam) => vt("js.bibliotheek", { naam }),
        vast: vt("js.vast"),
        weg: vt("js.weg"),
      };
    });
    scripts.current = b;
    return () => {
      b.sluit();
      if (scripts.current === b) scripts.current = null;
    };
  }, []);

  const isEmpty = source.trim().length === 0;
  const bladId = exemplaar?.id;
  const bladNaam = exemplaar?.naam ?? "";
  useLayoutEffect(() => {
    const wortel = isEmpty ? null : containerRef.current;
    beelden.current?.koppel(wortel, bladId);
    ifcxBeelden.current?.koppel(wortel, bladId, bladNaam);
    iframes.current?.koppel(wortel, laagRef.current);
    scripts.current?.koppel(wortel, laagRef.current, bladId);
  }, [html, isEmpty, bladId, bladNaam]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const selects = root.querySelectorAll<HTMLSelectElement>(".calc-select-input");
    const selectHandlers: Array<[HTMLSelectElement, () => void]> = [];

    for (const sel of selects) {
      const varName = sel.dataset.var;
      if (!varName) continue;
      const stored = selectValues[varName];
      if (stored !== undefined) sel.value = String(stored);
      const handler = () => {
        if (varName) setSelectValue(varName, sel.value);
      };
      sel.addEventListener("change", handler);
      selectHandlers.push([sel, handler]);
    }

    // `?` input prompts — same selectValues store, different DOM
    const prompts = root.querySelectorAll<HTMLInputElement>(".calc-input-value");
    const promptHandlers: Array<[HTMLInputElement, () => void, () => void]> = [];

    for (const inp of prompts) {
      const varName = inp.dataset.prompt;
      if (!varName) continue;
      // De eenheid van de bladtekst, en die in beeld als het eenhedenstelsel hem
      // omrekent (renderer.ts). Opgeslagen wordt altijd in de eenheid van de bladtekst.
      const bron = inp.dataset.eenheid;
      const toon = inp.dataset.toonEenheid;
      const stored = selectValues[varName];
      // Zolang je typt, staat er wat je typte: teruggerekend en weer omgezet zou
      // "12," halverwege "12" worden.
      const getyptNu = typtIn.current?.naam === varName ? typtIn.current.tekst : undefined;
      // De waarde zoals hij in beeld staat als niemand typt: omgerekend naar het stelsel.
      // Een verwijzing naar een ander blad (#1.R_paal) staat er zoals hij getypt is.
      const inBeeld = stored === undefined ? undefined : bron && toon && !leesVerwijzing(String(stored)) ? toonInvoer(String(stored), bron, toon) : String(stored);
      if (getyptNu !== undefined) inp.value = getyptNu;
      else if (inBeeld !== undefined) inp.value = inBeeld;
      // "12" in een veld in inch, of "5 m" in een veld in mm: terug naar de eenheid van de
      // bladtekst. Een eenheid die niet past of nog niet af is, krijgt een rode rand en
      // wordt niet opgeslagen; ook als het veld opnieuw getekend wordt.
      const lees = (tekst: string) => {
        // #1.R_paal: een waarde uit een ander blad; de kern rekent hem om naar de eenheid van het veld.
        const terug = leesVerwijzing(tekst) ? { waarde: tekst.trim() } : bron ? invoerNaarBron(tekst, toon ?? bron, bron) : { waarde: tekst };
        if ("fout" in terug) {
          inp.classList.add("calc-input-fout");
          inp.title = terug.fout;
        } else {
          inp.classList.remove("calc-input-fout");
          inp.removeAttribute("title");
        }
        return terug;
      };
      if (getyptNu !== undefined && bron) lees(getyptNu);
      const handler = () => {
        typtIn.current = {
          naam: varName,
          start: inp.selectionStart ?? inp.value.length,
          eind: inp.selectionEnd ?? inp.value.length,
          tekst: inp.value,
        };
        const terug = lees(inp.value);
        if ("fout" in terug) return;
        // Terug naar wat er stond (177.165 in een veld in inch): de opgeslagen waarde
        // houden, anders wordt 4500 mm na één keer typen 4499,991.
        if (toon && inp.value.trim() === inBeeld) return;
        setSelectValue(varName, terug.waarde);
      };
      // Pas bij het echt verlaten van het veld de administratie loslaten. De
      // browser stuurt ook een blur als het veld vervangen wordt, en dan hangt
      // het op dat moment nog in de pagina; daarom een tel later kijken. Is het
      // veld dan weg, dan was het een vervanging en blijft de administratie staan.
      const verlaat = () => {
        window.setTimeout(() => {
          if (inp.isConnected && typtIn.current?.naam === varName) typtIn.current = null;
        }, 0);
      };
      inp.addEventListener("input", handler);
      inp.addEventListener("blur", verlaat);
      promptHandlers.push([inp, handler, verlaat]);
    }

    // Het veld waarin werd getypt is door de nieuwe uitwerking vervangen:
    // focus en cursor terug op de plek waar ze stonden.
    const vorig = typtIn.current;
    if (vorig) {
      const opnieuw = [...prompts].find((p) => p.dataset.prompt === vorig.naam);
      if (opnieuw && document.activeElement !== opnieuw) {
        opnieuw.focus({ preventScroll: true });
        const max = opnieuw.value.length;
        opnieuw.setSelectionRange(Math.min(vorig.start, max), Math.min(vorig.eind, max));
      }
    }

    return () => {
      for (const [sel, handler] of selectHandlers) {
        sel.removeEventListener("change", handler);
      }
      for (const [inp, handler, verlaat] of promptHandlers) {
        inp.removeEventListener("input", handler);
        inp.removeEventListener("blur", verlaat);
      }
    };
  }, [html, selectValues, setSelectValue]);

  const { ref: zoomRef, zoom } = useZoom();

  return (
    <div
      className={`calc-preview${bezig ? " rekent" : ""}`}
      ref={zoomRef}
      style={{ fontSize: `${zoom * 100}%` }}
    >
      {isEmpty ? (
        <HelpPanel />
      ) : (
        <div className="calc-preview-content">
          <div ref={containerRef} dangerouslySetInnerHTML={inhoud} onClick={(e) => klikOpToetsKnop(e.target)} />
          <div ref={laagRef} className="calc-iframe-laag" />
        </div>
      )}
    </div>
  );
}
