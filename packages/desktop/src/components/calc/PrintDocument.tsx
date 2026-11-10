import { useMemo } from "react";
import i18next from "i18next";
import { useProjectStore, type Exemplaar } from "../../store/projectStore";
import { projectScope, projectWaarde } from "../../store/projectGegevens";
import { evalOptiesVan } from "../../store/projectEenheden";
import { usePrintStore } from "../../store/printStore";
import { ucTekst } from "./bladResultaat";
import { rekenBladDoor, zorgVoorKernstijlen, type DoorgerekendBlad } from "./bladDoorrekenen";
import { rekenversie } from "./bladVersie";
import { isEurocodeBlad } from "./eurocodeModules";
import { Oordeel, PrintBlad } from "./PrintBlad";
import "./PrintDocument.css";
import { metToetsingen } from "../../rekenen/toetsCache";
import { useToetsVersie } from "../../rekenen/femToetsing";

/** Een tekst op papier: de uitdraai volgt de taal van de app (beelden.json, onder `afdruk`). */
const op = (sleutel: string, opties?: Record<string, unknown>) => i18next.t(`beelden:afdruk.${sleutel}`, opties ?? {});

/** Wat er op het voorblad en in de uitdraai staat. */
export interface Uitdraai {
  projectNaam: string;
  bladen: ({ ex: Exemplaar } & DoorgerekendBlad)[];
  /** Alle bladen van het project, voor de keuze in het afdrukvoorbeeld. */
  alleBladen: Exemplaar[];
  /** Eén losse berekening: geen voorblad, wel een projectregel onder de bladkop. */
  enkel: boolean;
  /** De ingevulde projectgegevens, als label/waarde-paren. */
  kopregels: [string, string][];
  datum: string;
  onderdeel: string | undefined;
  projectNummer: string | undefined;
  constructeur: string | undefined;
}

/**
 * Bouwt de gekozen bladen één keer door en levert alles wat een uitdraai nodig heeft, voor
 * het afdrukvoorbeeld. Ook wat er naar de printer gaat, komt daarvandaan (drukvellen.ts).
 */
export function useUitdraai(): Uitdraai {
  const projectNaam = useProjectStore((s) => s.projectNaam);
  const gegevens = useProjectStore((s) => s.gegevens);
  const exemplaren = useProjectStore((s) => s.exemplaren);
  const selectie = usePrintStore((s) => s.selectie);
  const soort = usePrintStore((s) => s.soort);
  const toetsV = useToetsVersie();

  zorgVoorKernstijlen();

  const bladen = useMemo(() => {
    // Het rapport rekent zijn bladen zelf door: allemaal, los van de selectie
    // (useRapportWeergave). Het afdrukvoorbeeld roept deze hook ook in die
    // stand aan; alles hier nog eens doorrekenen zou dubbel werk zijn.
    if (soort === "rapport") return [];
    const scope = projectScope(gegevens);
    // Een selectie met alleen verdwenen bladen valt terug op het hele project.
    const gekozen = selectie ? exemplaren.filter((e) => selectie.includes(e.id)) : exemplaren;
    // In het eenhedenstelsel van het project, net als op het scherm.
    // Lezen: een @toets-blok zonder antwoord staat op papier als niet getoetst.
    const evalOpties = metToetsingen(evalOptiesVan(gegevens), "lezen", i18next.language);
    return (gekozen.length ? gekozen : exemplaren).map((ex) => ({ ex, ...rekenBladDoor(ex, scope, i18next.language, evalOpties, exemplaren) }));
    // De taal hoort erbij: de uitvoer volgt de taal van de app.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exemplaren, gegevens, selectie, soort, i18next.language, toetsV]);

  const heeftTw = exemplaren.some((e) => e.templateId?.startsWith("tw-"));
  const heeftEuro = !heeftTw || exemplaren.some(isEurocodeBlad);
  const kop: Array<[string, string | undefined]> = [
    [op("projectnummer"), gegevens.project_nummer],
    [op("projectnaam"), gegevens.project_naam],
    [op("onderdeel"), gegevens.onderdeel],
    [op("opdrachtgever"), gegevens.opdrachtgever],
    [op("constructeur"), gegevens.constructeur],
    [op("locatie"), gegevens.locatie],
    // 台灣版：有台灣模組時印台灣的設計基礎；Eurocode 欄位（CC、RC、荷蘭 NB 年限、
    // 計算方法）只在專案有上游 Eurocode 計算表（或完全沒有台灣表）時印。
    ...(heeftTw
      ? ([
          [op("twKlasse"), gegevens.tw_klasse ? op("twKlasseWaarde", { n: gegevens.tw_klasse }) : undefined],
          [op("twTerrein"), gegevens.tw_terrein ? op("twTerreinWaarde", { n: ["", "A", "B", "C"][Number(gegevens.tw_terrein)] ?? "" }) : undefined],
          [op("twLevensduur"), gegevens.tw_DesignLife ? op("jaar", { n: gegevens.tw_DesignLife }) : undefined],
        ] as Array<[string, string | undefined]>)
      : []),
    ...(heeftEuro
      ? ([
          [op("gevolgklasse"), gegevens.CC ? `CC${gegevens.CC}` : undefined],
          [op("betrouwbaarheidsklasse"), gegevens.RC ? `RC${gegevens.RC}` : undefined],
          [op("levensduur"), gegevens.DesignLife ? op("jaar", { n: projectWaarde(gegevens, "DesignLife") }) : undefined],
        ] as Array<[string, string | undefined]>)
      : []),
    // Op de splitspunten tussen de referentie-uitwerking en de norm rekent elk blad allebei en
    // kiest er één. Welke, moet op de afdruk staan: zonder die regel zijn twee
    // rapporten uit hetzelfde project niet met elkaar te vergelijken, en weet
    // een controleur niet welke lezing hij voor zich heeft.
    ...(heeftEuro
      ? ([[op("rekenwijze"), gegevens.rekenwijze === "0" ? op("rekenwijzeNorm") : op("rekenwijzeReferentie")]] as Array<[string, string | undefined]>)
      : []),
  ];

  return {
    projectNaam,
    bladen,
    alleBladen: exemplaren,
    enkel: bladen.length === 1,
    kopregels: kop.filter((r): r is [string, string] => !!r[1]),
    datum: new Date().toLocaleDateString(
      i18next.language?.startsWith("nl") ? "nl-NL" : i18next.language?.startsWith("zh") ? "zh-TW" : "en-GB",
      { day: "numeric", month: "long", year: "numeric" },
    ),
    onderdeel: gegevens.onderdeel,
    projectNummer: gegevens.project_nummer,
    constructeur: gegevens.constructeur,
  };
}

/** Het anker van de kop van een blad in de uitdraai, voor de inhoud op het voorblad. */
export const bladAnker = (id: string) => `blad-${id}`;

/**
 * De inhoud met de resultaten: per blad de norm, de maatgevende UC, het oordeel en de
 * pagina waar het blad begint. Het paginanummer vult het afdrukvoorbeeld in zodra de
 * vellen verdeeld zijn; de kolom staat er al, dus de verdeling verandert er niet door.
 * In het voorbeeld springt een klik op een regel naar het blad, in de PDF een klik op
 * het nummer (drukvellen.ts).
 */
function Resultaten({ uitdraai }: { uitdraai: Uitdraai }) {
  const { bladen } = uitdraai;
  const nietGoed = bladen.filter((b) => b.resultaat.voldoet === false).length;
  // Een blad dat niet is getoetst, mag niet onder "alle getoetste onderdelen voldoen" vallen.
  const nietGetoetst = bladen.filter((b) => b.resultaat.nietGetoetst).length;
  return (
    <>
      <p className="print-sectiekop">{op("inhoudResultaten")}</p>
      <div className="print-inhoud">
        <div className="print-inhoud-rij print-inhoud-kop">
          <span className="nr">#</span>
          <span>{op("onderdeel")}</span>
          <span>{op("grondslag")}</span>
          <span className="uc">UC</span>
          <span>{op("oordeel")}</span>
          <span className="pag">{op("paginaKolom")}</span>
        </div>
        {bladen.map(({ ex, resultaat }, i) => (
          <div key={ex.id} className="print-inhoud-rij" data-naar={bladAnker(ex.id)}>
            <span className="nr">{i + 1}</span>
            <span>{ex.naam}</span>
            <span className="norm">{resultaat.norm || "—"}</span>
            <span className="uc">{resultaat.uc !== null ? ucTekst(resultaat.uc) : "—"}</span>
            <span><Oordeel r={resultaat} /></span>
            <span className="pag" data-inhoud-doel={bladAnker(ex.id)} />
          </div>
        ))}
      </div>
      <p className="print-resultaten-noot">
        {nietGoed === 0 && nietGetoetst === 0 && op("alleVoldoen")}
        {nietGoed > 0 && op(nietGoed === 1 ? "nietGoedEen" : "nietGoedMeer", { n: nietGoed, totaal: bladen.length })}
        {nietGoed > 0 && nietGetoetst > 0 && " "}
        {nietGetoetst > 0 && op(nietGetoetst === 1 ? "nietGetoetstEen" : "nietGetoetstMeer", { n: nietGetoetst, totaal: bladen.length })}
        {" "}{op("ucNoot")}
      </p>
    </>
  );
}

/** Het voorblad: projectgegevens plus de inhoud met de resultaten. */
export function PrintVoorblad({ uitdraai }: { uitdraai: Uitdraai }) {
  const { projectNaam, kopregels, datum, onderdeel, projectNummer, constructeur } = uitdraai;
  return (
    <section className="print-voorblad">
      <div className="print-voorblad-band" />
      <p className="print-soort">{op("soort")}</p>
      <h1>{projectNaam || op("berekening")}</h1>
      {onderdeel && <p className="print-ondertitel">{onderdeel}</p>}
      {kopregels.length > 0 && (
        <table className="print-gegevens">
          <tbody>
            {kopregels.map(([label, waarde]) => (
              <tr key={label}>
                <th>{label}</th>
                <td>{waarde}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Resultaten uitdraai={uitdraai} />
      <div className="print-voorblad-voet">
        <span>{projectNummer ? op("project", { nummer: projectNummer }) : ""}</span>
        <span>{constructeur ? op("opgesteldDoor", { naam: constructeur }) : ""}</span>
        <span>{datum}</span>
      </div>
    </section>
  );
}

/**
 * De projectgegevens bij een losse berekening, als één compacte regel onder
 * de bladkop. Een apart titelblok kostte zoveel hoogte dat een groot
 * parametrisch beeld niet meer op de eerste pagina paste en die pagina
 * verder leeg bleef; het project staat bovendien al in de loopkop.
 *
 * `rekenversie` is de vingerafdruk van de bladtekst (bladVersie.ts): zo is
 * later na te gaan met welke versie van de rekenmodule er gerekend is.
 */
export function PrintProjectregel({ uitdraai, rekenversie }: { uitdraai: Uitdraai; rekenversie?: string }) {
  const { kopregels, datum } = uitdraai;
  // Naam en nummer staan al in de loopkop; hier de rest van de gegevens.
  const regels = kopregels.filter(([label]) => label !== op("projectnaam") && label !== op("projectnummer"));
  return (
    <p className="print-projectregel">
      <span className="print-soort">{op("soort")}</span>
      {regels.map(([label, waarde]) => (
        <span key={label}><b>{label}</b> {waarde}</span>
      ))}
      {rekenversie && <span><b>{op("rekenversie")}</b> {rekenversie}</span>}
      <span>{datum}</span>
    </p>
  );
}

/** Voorblad plus bladen, of bij één blad het blad met een projectregel. */
export function UitdraaiInhoud({ uitdraai }: { uitdraai: Uitdraai }) {
  const { bladen, enkel } = uitdraai;
  return (
    <>
      {!enkel && <PrintVoorblad uitdraai={uitdraai} />}
      {bladen.map(({ ex, html, resultaat, eenheden }, i) => (
        <PrintBlad key={ex.id} ex={ex} html={html} nummer={i + 1} resultaat={resultaat} titelInKop eenheden={eenheden}
          anker={enkel ? undefined : bladAnker(ex.id)}
          projectregel={enkel ? <PrintProjectregel uitdraai={uitdraai} rekenversie={rekenversie(ex.source)} /> : undefined} />
      ))}
    </>
  );
}

/** Tekst voor de loopkop links: projectnummer en -naam. */
export const loopkopLinks = (u: Uitdraai) => (u.projectNummer ? `${u.projectNummer} · ` : "") + u.projectNaam;

