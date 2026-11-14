import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { usePrintStore } from "../../store/printStore";
import { useUitdraai, UitdraaiInhoud, loopkopLinks } from "./PrintDocument";
import RapportAfdruk from "../rapport/afdruk/RapportAfdruk";
import { useInhoudPaginas } from "../../store/inhoudPaginas";
import { huisstijlVariabelen } from "../../rapport/model";
import { useKopvoet, useRapportBureau } from "../rapport/afdruk/useRapportWeergave";
import {
  meetBlokken,
  paginaVanAnkers,
  verdeelPerSectie,
  veranderdeBlokken,
  zelfdeIndeling,
  pxPerMm,
  MATEN,
  SPELING,
  type Blok,
  type Maten,
} from "./paginering";
import { useIframeVersie, vulIframesIn } from "./iframeBlok";
import { useJsVersie, vulJsIn } from "./jsBlok";
import "./PrintDocument.css";
import "./AfdrukVoorbeeld.css";

const ZOOMSTANDEN = [0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3];

/**
 * Blokken die de vellen zelf invullen, buiten de meetopstelling om: een externe pagina
 * en een `@js`-blok (iframeBlok.ts, jsBlok.ts). Een los vervangen kopie zou zijn
 * ingevulde venster kwijt zijn; zo'n blok gaat met de hele opbouw mee.
 */
const EIGEN_VULLING = ".calc-iframe, .calc-js";

/** Wat de vorige opbouw op de vellen zette. */
interface Opgebouwd {
  paginas: Blok[][];
  /** Per blok uit de meetopstelling zijn kopie op een vel. */
  kopieen: Map<HTMLElement, HTMLElement>;
  /** De blokken die bovenaan een vel staan: hun bovenmarge vervalt. */
  eersten: Set<HTMLElement>;
  /** De paginanummers voor de inhoudsopgave van het rapport. */
  nummers: Map<string, number>;
}

/** Staat deze knoop op papier? Wat niet wordt getoond (alleen op het scherm, of weg), heeft geen vak. */
function opPapier(knoop: Node): boolean {
  const el = knoop instanceof Element ? knoop : knoop.parentElement;
  return !!el && el.isConnected && el.getClientRects().length > 0;
}

/**
 * De voet van een vel van het rapport: de voetafbeelding van het bureau over
 * de volle breedte in de ondermarge (of zonder afbeelding een dunne lijn met
 * de bureaunaam), en rechts het paginanummer midden in die marge. Dezelfde
 * plaats als in de echte afdruk, waar de voet een vast element is en het
 * nummer in de paginamarge staat (RapportAfdruk.css).
 */
function rapportVoet(nummer: number, voetafbeelding: string, bureaunaam: string, maten: Maten): HTMLElement[] {
  const uit: HTMLElement[] = [];
  if (voetafbeelding) {
    const beeld = document.createElement("img");
    beeld.className = "av-rapport-voet";
    beeld.alt = "";
    beeld.src = voetafbeelding;
    beeld.style.height = `${maten.marge.onder}mm`;
    uit.push(beeld);
  } else {
    const lijn = document.createElement("div");
    lijn.className = "av-rapport-lijn";
    // De voettekst uit het rapport (`tw.kopvoet.voet`) gaat vóór de bureaunaam.
    lijn.textContent = bureaunaam;
    lijn.style.left = `${maten.marge.links}mm`;
    lijn.style.right = `${maten.marge.rechts}mm`;
    uit.push(lijn);
  }
  const nr = document.createElement("div");
  nr.className = "av-rapport-nummer";
  nr.textContent = String(nummer);
  nr.style.right = `${maten.marge.rechts}mm`;
  nr.style.height = `${maten.marge.onder}mm`;
  uit.push(nr);
  return uit;
}

/**
 * Afdrukvoorbeeld als paneel in de applicatie.
 *
 * De uitdraai wordt eerst op ware bladbreedte opgebouwd in een meetopstelling
 * buiten beeld. Daarna wordt hij opgemeten en in vellen verdeeld, en komen er
 * kopieën van de regels op losse A4-pagina's te staan. Kopieën, geen
 * verplaatsingen: de meetopstelling blijft van React, en die zou omvallen als
 * er nodes onder vandaan worden gehaald.
 *
 * Waarom niet gewoon de doorlopende uitdraai tonen: dan zie je niet waar het
 * papier ophoudt, en dat is juist wat je vooraf wilt weten.
 *
 * Twee soorten uitdraai: de losse bladen (loopkop en loopvoet) en het
 * constructierapport (de voet van het bureau en een paginanummer, geen
 * loopkop). Het verdelen is voor beide hetzelfde; de maten en de omlijsting
 * van een vel verschillen.
 *
 * De balk erboven en het nummer onder elk vel volgen de taal van de app, net als wat op
 * een los blad staat. Wat op een vel van het rapport staat, volgt de taal van het rapport.
 */
export default function AfdrukVoorbeeld() {
  const { t } = useTranslation("beelden");
  const uitdraai = useUitdraai();
  const { alleBladen, onderdeel, datum } = uitdraai;
  const soort = usePrintStore((s) => s.soort);
  const sluitVoorbeeld = usePrintStore((s) => s.sluitVoorbeeld);
  const afdrukken = usePrintStore((s) => s.afdrukken);
  const selectie = usePrintStore((s) => s.selectie);
  const kiesSelectie = usePrintStore((s) => s.kiesSelectie);
  // De keuzelijst kent twee soorten: het hele project, of één blad.
  const bereik = selectie && selectie.length === 1 ? selectie[0] : "project";

  const rapport = soort === "rapport";
  const maten: Maten = MATEN[soort];
  // Het bureau voor de voet en het logo van de vellen.
  const bureau = useRapportBureau();
  const voetafbeelding = bureau.voetafbeelding;
  const bureaunaam = bureau.naam;
  const kopLogo = bureau.logoInKop ? bureau.logo : "";
  // De kop- en voettekst uit het rapport (tw.kopvoet), met de plaatshouders ingevuld.
  const { kop: koptekst, voet: voettekst } = useKopvoet();
  const huisstijl = useMemo(() => huisstijlVariabelen(bureau.huisstijl), [bureau.huisstijl]);
  // Een bevestigde externe pagina (iframeBlok.ts) en een uitgevoerd `@js`-blok
  // (jsBlok.ts) vullen de vellen zelf in; de meetopstelling verandert daarbij niet.
  // Dan alles opnieuw opbouwen. Al het andere dat klaar komt (een PDF-pagina, een
  // werkmap, een 3D-afbeelding) verandert de meetopstelling zelf, en dat ziet de
  // MutationObserver hieronder.
  const iframeVersie = useIframeVersie();
  const jsVersie = useJsVersie();
  const scriptsWeg = useRef<(() => void) | null>(null);
  const iframesWeg = useRef<(() => void) | null>(null);

  const meetRef = useRef<HTMLDivElement>(null);
  const vellenRef = useRef<HTMLDivElement>(null);
  const schuifRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(0.75);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  // Het punt onder de muis bij Ctrl+scrollen, om na het zoomen terug te zetten.
  const anker = useRef<{ cx: number; cy: number; x: number; y: number; van: number } | null>(null);
  const [aantal, setAantal] = useState(0);
  const [bezig, setBezig] = useState(true);

  // Kopregels per vel: dezelfde als de loopkop van de echte afdruk.
  const linksBoven = loopkopLinks(uitdraai);

  /**
   * Wat de vorige opbouw op de vellen zette, en wat er sindsdien in de meetopstelling
   * veranderde. Daarmee kan een blok dat alleen van inhoud wisselt (een PDF-pagina
   * die getekend is, een 3D-afbeelding op de plaats van de projectie) los op zijn
   * vel worden vervangen. Alles opnieuw opbouwen kostte bij een project van 33
   * bladen telkens bijna een seconde, en zulke beelden komen een voor een klaar.
   */
  const opgebouwd = useRef<Opgebouwd | null>(null);
  const veranderd = useRef(new Set<Node>());
  const heelOpnieuw = useRef(true);

  /** Een kopie van een blok voor op een vel. */
  const kopieVan = useCallback((el: HTMLElement, eerste: boolean, nummers: Map<string, number>) => {
    const kloon = el.cloneNode(true) as HTMLElement;
    // De bovenmarge van het eerste blok vervalt op een pagina-overgang. In
    // de doorlopende meting klapt die marge samen met die van het blok
    // erboven; bovenaan een vers vel is er niets om mee samen te klappen en
    // komt hij er als extra ruimte bij — genoeg om de onderste regel van
    // het vel af te duwen.
    if (eerste) kloon.style.marginTop = "0";
    // De paginanummers in een inhoudsopgave: die van het rapport en die op het voorblad.
    const doelen = [...(kloon.matches("[data-inhoud-doel]") ? [kloon] : []), ...kloon.querySelectorAll<HTMLElement>("[data-inhoud-doel]")];
    for (const doel of doelen) doel.textContent = String(nummers.get(doel.dataset.inhoudDoel ?? "") ?? "");
    return kloon;
  }, []);

  /**
   * Een klik op een regel van een inhoudsopgave springt naar het vel waar hij naar
   * wijst, met de loopkop in beeld. Staat de kop een eind lager op dat vel (een
   * paragraaf midden op een vel van het rapport), dan naar de kop zelf.
   */
  const naarInhoud = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    const regel = (e.target as Element).closest<HTMLElement>("[data-naar], .rpa-inhoud .rpa-rij");
    const anker = regel?.dataset.naar ?? regel?.querySelector<HTMLElement>("[data-inhoud-doel]")?.dataset.inhoudDoel;
    const nummer = anker ? opgebouwd.current?.nummers.get(anker) : undefined;
    const vel = nummer ? vellenRef.current?.children[nummer - 1] : undefined;
    if (!anker || !vel) return;
    vel.scrollIntoView({ block: "start" });
    // Een vel buiten beeld heeft nog geen opmaak (AfdrukVoorbeeld.css); na twee frames wel.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const kop = vel.querySelector(`[data-inhoud="${CSS.escape(anker)}"]`);
      const v = vel.getBoundingClientRect();
      if (kop && kop.getBoundingClientRect().top - v.top > v.height / 4) kop.scrollIntoView({ block: "start" });
    }));
  }, []);

  /**
   * Vervangt alleen de blokken die veranderden, als de indeling gelijk bleef. Geeft
   * `false` als dat niet gaat: dan moet alles opnieuw.
   */
  const vervangLos = useCallback((vorig: Opgebouwd, knopen: Iterable<Node>, bron: HTMLElement): boolean => {
    const { veranderd: geraakt, buiten } = veranderdeBlokken(knopen, new Set(vorig.kopieen.keys()), bron);
    // Buiten elk blok: een wikkel of sectie die veranderde. Alleen niet erg als het
    // niet op papier staat.
    if (buiten.some((k) => opPapier(k as Node))) return false;
    const blokken = [...geraakt] as HTMLElement[];
    if (blokken.some((el) => el.matches(EIGEN_VULLING) || el.querySelector(EIGEN_VULLING) || el.dataset.velPagina !== undefined)) return false;
    for (const el of blokken) {
      const oud = vorig.kopieen.get(el);
      if (!oud?.isConnected) return false;
      const nieuw = kopieVan(el, vorig.eersten.has(el), vorig.nummers);
      oud.replaceWith(nieuw);
      vorig.kopieen.set(el, nieuw);
    }
    return true;
  }, [kopieVan]);

  const bouwPaginas = useCallback(() => {
    const bron = meetRef.current;
    const host = vellenRef.current;
    if (!bron || !host) return;
    delete bron.dataset.opnieuw;
    // Tijdens het printen verdwijnt de hoofdweergave, en daarmee dit paneel.
    // Meten levert dan overal nul op en de hele uitdraai zou op één pagina
    // belanden. Niets doen is beter: zodra het paneel terug is meet de
    // ResizeObserver opnieuw.
    if (bron.offsetHeight === 0) return;

    const mm = pxPerMm();
    // Elke sectie begint op een vers vel en wordt apart verdeeld, met een
    // eigen bladhoogte: een rekenblad (ook in bijlage A) rekent met de
    // speling, het rapport zelf staat op een vast raster en mag het vel tot en
    // met de laatste regel vullen, net als de referentie.
    const paginas = verdeelPerSectie(meetBlokken(bron), (sectie) =>
      (/\bprint-blad\b/.test(sectie) ? maten.inhoud.hoogte - SPELING : maten.inhoud.vulhoogte) * mm,
    );

    // Bleef de indeling gelijk, dan alleen de veranderde blokken vervangen.
    const knopen = [...veranderd.current];
    veranderd.current.clear();
    const vorig = opgebouwd.current;
    const heel = heelOpnieuw.current;
    heelOpnieuw.current = false;
    if (!heel && vorig && zelfdeIndeling(vorig.paginas, paginas) && vervangLos(vorig, knopen, bron)) {
      vorig.paginas = paginas;
      return;
    }

    // De paginanummers van de inhoudsopgave, uit dezelfde verdeling als de vellen.
    const nummers = paginaVanAnkers(paginas);
    // Ook voor het zijpaneel, zodat de inhoud daar de pagina's kent (InhoudLijst.tsx).
    if (rapport) useInhoudPaginas.setState({ paginas: Object.fromEntries(nummers) });

    iframesWeg.current?.();
    scriptsWeg.current?.();
    host.replaceChildren();
    const kopieen = new Map<HTMLElement, HTMLElement>();
    const eersten = new Set<HTMLElement>();
    paginas.forEach((pagina, i) => {
      const vel = document.createElement("div");
      vel.className = rapport ? "av-pagina print-opmaak rpa-wortel" : "av-pagina print-opmaak";
      // De huisstijl staat als CSS-variabelen op de wortel in de meetopstelling. Een vel
      // staat daar los van, dus krijgt hij ze mee.
      for (const [naam, waarde] of Object.entries(huisstijl)) vel.style.setProperty(naam, waarde);
      // Een tekenblad staat op zijn eigen formaat, zonder marges, loopkop of voet.
      const eigenVel = pagina.find((b) => b.el.dataset.velPagina)?.el.dataset;

      // De sectieklasse mee: de opmaakregels hangen eraan, en zonder die ouder
      // valt een losgeknipte regel terug op de schermopmaak.
      const inhoud = document.createElement("div");
      inhoud.className = `av-pagina-inhoud ${pagina[0]?.sectie ?? ""}`.trim();
      inhoud.style.top = eigenVel ? "0" : `${maten.marge.boven}mm`;
      inhoud.style.left = eigenVel ? "0" : `${maten.marge.links}mm`;
      inhoud.style.width = eigenVel ? `${eigenVel.velBreedte}mm` : `${maten.inhoud.breedte}mm`;
      inhoud.style.height = eigenVel ? `${eigenVel.velHoogte}mm` : `${maten.inhoud.hoogte}mm`;
      if (eigenVel) {
        vel.style.width = `${eigenVel.velBreedte}mm`;
        vel.style.height = `${eigenVel.velHoogte}mm`;
        vel.style.setProperty("page", eigenVel.velPagina ?? "");
      }
      // Idem voor de wikkels waar de regels uit komen: de kern schrijft zijn
      // lettertype en regelafstand op `.ifc-calc`. Regels met dezelfde wikkels
      // gaan samen in één opgebouwde keten, zodat het er niet alleen goed
      // uitziet maar ook precies zo hoog blijft als bij het meten.
      let doel = inhoud;
      let vorigeWikkels = "";
      let eersteVanDezePagina = true;
      for (const blok of pagina) {
        const sleutel = blok.wikkels.join(" > ");
        if (sleutel !== vorigeWikkels) {
          doel = inhoud;
          for (const klasse of blok.wikkels) {
            const wikkel = document.createElement("div");
            wikkel.className = klasse;
            doel.appendChild(wikkel);
            doel = wikkel;
          }
          vorigeWikkels = sleutel;
        }
        if (eersteVanDezePagina) eersten.add(blok.el);
        const kloon = kopieVan(blok.el, eersteVanDezePagina, nummers);
        eersteVanDezePagina = false;
        kopieen.set(blok.el, kloon);
        doel.appendChild(kloon);
      }

      if (eigenVel) {
        vel.append(inhoud);
        // In het rapport loopt de nummering ook over een vel op eigen formaat door.
        if (rapport) {
          const nr = document.createElement("div");
          nr.className = "av-rapport-nummer";
          nr.textContent = String(i + 1);
          nr.style.right = "6mm";
          nr.style.height = "8mm";
          vel.append(nr);
        }
      } else if (rapport) {
        // Geen loopkop: het rapport heeft alleen een voet, en op elk vel na het voorblad
        // het logo. Het voorblad draagt het al groter.
        vel.append(inhoud, ...rapportVoet(i + 1, voetafbeelding, voettekst || bureaunaam, maten));
        if (koptekst && i > 0) {
          const kopregel = document.createElement("div");
          kopregel.className = "av-rapport-kop";
          kopregel.textContent = koptekst;
          kopregel.style.left = `${maten.marge.links}mm`;
          kopregel.style.right = `${maten.marge.rechts}mm`;
          vel.append(kopregel);
        }
        if (kopLogo && i > 0) {
          const logo = document.createElement("img");
          logo.className = "av-rapport-logo";
          logo.alt = "";
          logo.src = kopLogo;
          logo.style.right = `${maten.marge.rechts}mm`;
          vel.append(logo);
        }
      } else {
        const kop = document.createElement("div");
        kop.className = "av-loopkop";
        kop.innerHTML = "<span></span><span></span>";
        (kop.firstChild as HTMLElement).textContent = linksBoven;
        (kop.lastChild as HTMLElement).textContent = onderdeel ?? "";
        if (kopLogo) {
          const logo = document.createElement("img");
          logo.className = "print-kop-logo";
          logo.alt = "";
          logo.src = kopLogo;
          kop.append(logo);
        }

        const voet = document.createElement("div");
        voet.className = "av-loopvoet";
        voet.innerHTML = "<span></span><span></span><span></span>";
        (voet.children[0] as HTMLElement).textContent = "Open CalcSheet Studio";
        (voet.children[1] as HTMLElement).textContent = t("afdruk.paginaVan", { nummer: i + 1, totaal: paginas.length });
        (voet.children[2] as HTMLElement).textContent = datum;

        vel.append(kop, inhoud, voet);
      }

      // Het nummer buiten het vel: het papier klemt af wat er niet op past, en
      // een bijschrift binnen die rand zou daar in meegaan.
      const nummer = document.createElement("div");
      nummer.className = "av-nummer";
      nummer.textContent = t("afdruk.paginaVan", { nummer: i + 1, totaal: paginas.length });

      const omhulsel = document.createElement("div");
      omhulsel.className = "av-vel";
      // Een vel buiten beeld wordt niet opgemaakt (AfdrukVoorbeeld.css); tot hij in
      // beeld komt, houdt hij deze maat vrij: het papier en het nummer eronder.
      if (eigenVel) omhulsel.style.containIntrinsicSize = `auto ${eigenVel.velBreedte}mm auto calc(${eigenVel.velHoogte}mm + 24px)`;
      omhulsel.append(vel, nummer);
      host.appendChild(omhulsel);
    });
    opgebouwd.current = { paginas, kopieen, eersten, nummers };
    // Op de vellen en niet in de meetopstelling: de hoogte staat vast, en een
    // iframe in de meetopstelling zou elke pagina dubbel laden.
    iframesWeg.current = vulIframesIn(host);
    scriptsWeg.current = vulJsIn(host);

    setAantal(paginas.length);
    setBezig(false);
  }, [linksBoven, onderdeel, datum, rapport, maten, voetafbeelding, bureaunaam, kopLogo, huisstijl, t, kopieVan, vervangLos]);

  /*
   * Opnieuw verdelen zodra de opmaak verandert.
   *
   * De parametrische beelden meten hun eigen tekengebied en schalen zich pas
   * daarna; meteen verdelen zou op hoogtes gebeuren die een tel later niet meer
   * kloppen. Een ResizeObserver op de meetopstelling vangt elke wijziging van
   * de maat op, en een korte vertraging bundelt een reeks wijzigingen tot één
   * verdeling. Wat de maat niet verandert (een woord, een kleur, een PDF-pagina
   * die getekend is) ziet een MutationObserver; een geladen afbeelding de
   * `load`-luisteraar.
   *
   * Zulke wijzigingen bouwen niet alles opnieuw op. Blijft de indeling gelijk,
   * dan krijgen alleen de veranderde blokken een nieuwe kopie op hun vel
   * (`vervangLos`). Alleen wat de vellen zelf raakt (de loopkop, de huisstijl,
   * een bevestigd venster: de afhankelijkheden hier) bouwt alles opnieuw op.
   *
   * Bewust geen requestAnimationFrame: dat staat volledig stil zodra het
   * venster niet zichtbaar is. Het voorbeeld zou dan blijven hangen op
   * "pagina's opmaken" tot de gebruiker terugkomt.
   */
  useEffect(() => {
    const bron = meetRef.current;
    if (!bron) return;
    setBezig(true);
    heelOpnieuw.current = true;

    let timer = 0;
    // `data-opnieuw`: er komt een nieuwe verdeling; de afdruk wacht daarop (drukvellen.ts).
    const plan = () => {
      bron.dataset.opnieuw = "";
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        // Wat nog niet is afgeleverd, telt ook mee.
        neem(mo.takeRecords());
        bouwPaginas();
      }, 120);
    };
    const neem = (lijst: MutationRecord[]) => {
      let iets = false;
      for (const r of lijst) {
        // `data-opnieuw` op de meetopstelling zelf zet dit effect.
        if (r.target === bron && r.type === "attributes") continue;
        veranderd.current.add(r.target);
        iets = true;
      }
      return iets;
    };

    const ro = new ResizeObserver(plan);
    ro.observe(bron);
    const mo = new MutationObserver((lijst) => {
      if (neem(lijst)) plan();
    });
    mo.observe(bron, { subtree: true, childList: true, attributes: true, characterData: true });
    // `load` borrelt niet op; vangen op de weg naar beneden.
    bron.addEventListener("load", plan, true);
    plan();

    return () => {
      ro.disconnect();
      neem(mo.takeRecords());
      mo.disconnect();
      bron.removeEventListener("load", plan, true);
      window.clearTimeout(timer);
    };
  }, [bouwPaginas, iframeVersie, jsVersie]);

  useEffect(() => () => {
    iframesWeg.current?.();
    scriptsWeg.current?.();
  }, []);

  /*
   * Ctrl+scrollen zoomt door de zoomstanden, rond het punt onder de muis.
   * Niet via onWheel: React luistert passief, en dan houdt preventDefault het
   * gewone scrollen niet tegen. Een muiswiel geeft ±100 per tik, knijpen op
   * een touchpad veel kleine stapjes met ctrlKey; die tellen op tot een stand.
   */
  useEffect(() => {
    const el = schuifRef.current;
    if (!el) return;
    let opgeteld = 0;
    const wiel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      if (Math.sign(e.deltaY) !== Math.sign(opgeteld)) opgeteld = 0;
      opgeteld += e.deltaY;
      if (Math.abs(opgeteld) < 50) return;
      const inzoomen = opgeteld < 0;
      opgeteld = 0;
      const huidig = zoomRef.current;
      const nieuw = inzoomen
        ? ZOOMSTANDEN.find((z) => z > huidig + 1e-6)
        : [...ZOOMSTANDEN].reverse().find((z) => z < huidig - 1e-6);
      if (nieuw === undefined) return;
      const r = el.getBoundingClientRect();
      anker.current = { cx: e.clientX - r.left, cy: e.clientY - r.top, x: el.scrollLeft, y: el.scrollTop, van: huidig };
      setZoom(nieuw);
    };
    el.addEventListener("wheel", wiel, { passive: false });
    return () => el.removeEventListener("wheel", wiel);
  }, []);

  // Na een zoomstap het punt onder de muis op zijn plek houden. De vellen
  // schalen vanaf de bovenrand van de inhoud, onder de bovenpadding.
  useLayoutEffect(() => {
    const el = schuifRef.current;
    const a = anker.current;
    if (!el || !a) return;
    anker.current = null;
    const f = zoom / a.van;
    const boven = parseFloat(getComputedStyle(el).paddingTop) || 0;
    el.scrollLeft = (a.x + a.cx) * f - a.cx;
    el.scrollTop = (a.y + a.cy - boven) * f + boven - a.cy;
  }, [zoom]);

  return (
    <div className="av-paneel">
      <div className="av-balk">
        <span className="av-titel">{rapport ? t("afdruk.titelRapport") : t("afdruk.titel")}</span>
        <span className="av-tel">
          {bezig ? t("afdruk.opmaken") : t("afdruk.paginas", { count: aantal })}
        </span>
        {/* Het rapport kent geen bereik: het bevat altijd alle bladen. */}
        {!rapport && (
          <span className="av-bereik">
            <label htmlFor="av-bereik">{t("afdruk.bereik")}</label>
            <select
              id="av-bereik"
              value={bereik}
              onChange={(e) => kiesSelectie(e.target.value === "project" ? null : [e.target.value])}
            >
              <option value="project">{t("afdruk.heleProject", { count: alleBladen.length })}</option>
              {alleBladen.map((ex) => (
                <option key={ex.id} value={ex.id}>{t("afdruk.alleen", { naam: ex.naam })}</option>
              ))}
            </select>
          </span>
        )}
        <span className="av-rek" />
        <span className="av-zoom">
          <label htmlFor="av-zoom">{t("afdruk.zoom")}</label>
          <select
            id="av-zoom"
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
          >
            {ZOOMSTANDEN.map((z) => (
              <option key={z} value={z}>{Math.round(z * 100)}%</option>
            ))}
          </select>
        </span>
        <button className="av-primair" onClick={() => afdrukken()}>{t("afdruk.afdrukken")}</button>
        <button onClick={sluitVoorbeeld}>{t("afdruk.sluiten")}</button>
      </div>

      <div className="av-vellen" ref={schuifRef}>
        <div className="av-vellen-binnen" ref={vellenRef} style={{ zoom }} onClick={naarInhoud} />
      </div>

      {/* De meetopstelling: buiten beeld, op de breedte van de bladspiegel van deze soort. */}
      <div
        className="av-meet print-opmaak"
        ref={meetRef}
        aria-hidden="true"
        style={{ ...huisstijl, width: `${maten.inhoud.breedte}mm` } as CSSProperties}
      >
        {rapport ? <RapportAfdruk /> : <UitdraaiInhoud uitdraai={uitdraai} />}
      </div>
    </div>
  );
}
