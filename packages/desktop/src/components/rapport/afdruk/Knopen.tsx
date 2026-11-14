import type { ReactNode } from "react";
import type { Rapportknoop } from "../../../rapport/opzet";
import { vulIn } from "../../../rapport/invullen";
import { samenvatting } from "../../calc/bladResultaat";
import { MATEN } from "../../calc/paginering";
import { bladSoortVan } from "../../calc/bladSoorten";
import { UitwerkingHtml } from "../../calc/UitwerkingHtml";
import { isCanvasBlad } from "../../../store/canvasBlad";
import { CanvasVellen } from "../../calc/PrintBlad";
import type { RapportWeergave } from "./useRapportWeergave";
import { Bijschrift, Cel, Leeg, PaginaCel, Rij, Tekst, Vlak } from "./raster";
import { bijschriftSleutel } from "../../../rapport/tw/nummering";
import { Bestaand, Bouwwerk, Brand, Conservering, Factoren, Materialen, Vervormingen } from "./Uitgangspunten";
import { Groep, Sneeuw, Veranderlijk, Wind } from "./Belastingen";
// ── 台灣版 ────────────────────────────────────────────────────────────────
import { bepaalTwEindoordeel, verzamelTwNormen } from "../../../rapport/tw/opzet";
import {
  TW_DAK_VERANDERLIJK_T26,
  TW_RC_BELASTINGCOMBINATIES,
  TW_VERANDERLIJK_BIJZONDER,
  TW_VLOER_VERANDERLIJK_STATUS,
  TW_VLOER_VERANDERLIJK_TABEL,
} from "../../../rapport/tw/normwaarden";

/*
 * De hoofdstukken van het rapport: koppen met nummering, en per soort inhoud
 * de weergave.
 *
 * Uitkomst is een rij "stukken": één per knoop, met zijn kop en zijn eigen
 * inhoud. RapportAfdruk zet stukken die doorlopen in één sectie en begint een
 * nieuwe sectie waar een knoop op een nieuwe pagina hoort. Zo kan elk
 * hoofdstuk, elke paragraaf en ook het blok WANDEN op een vers vel beginnen,
 * zonder dat een kop en zijn inhoud van elkaar loskomen.
 *
 * Witregels volgen de referentie: een kop heeft een lege regel boven zich,
 * behalve direct onder de kop van zijn ouder; hoofdstuk-, paragraaf- en
 * blokkoppen hebben er ook een onder zich.
 */

/** Een stuk rapport: begint het op een nieuw vel, en wat staat erin. */
export interface Stuk {
  sleutel: string;
  nieuwePagina: boolean;
  inhoud: ReactNode;
}

/** Waar een knoop staat. */
interface Plaats {
  /** Begint een nieuwe sectie, en dus een nieuw vel. */
  begin: boolean;
  /** Staat direct onder de kop van zijn ouder, zonder iets ertussen. */
  direct: boolean;
  /** Inspringen van de inhoud, geërfd van het hoofdstuk. */
  inspringen: 0 | 1;
}

type Blad = NonNullable<Rapportknoop["blad"]>;

/** De kop van een knoop, met nummer. */
function Kop({ knoop, plaats }: { knoop: Rapportknoop; plaats: Plaats }) {
  const tekst = knoop.nummer ? `${knoop.nummer} ${knoop.titel}` : knoop.titel;
  const direct = plaats.direct ? " rpa-direct" : "";
  // `data-inhoud`: de plek voor de inhoudsopgave (paginaVanAnkers in paginering.ts).
  if (knoop.blad) return <h2 className="rpa-hb" data-inhoud={knoop.id}>{tekst}</h2>;
  // Een hoofdstuk dat binnen een sectie doorloopt krijgt een extra lege regel
  // boven zich; bovenaan een vel begint het blok van drie regels meteen.
  if (knoop.niveau === 1) return <h1 className={plaats.begin ? "rpa-h1" : "rpa-h1 rpa-vervolg"} data-inhoud={knoop.id}>{tekst}</h1>;
  if (knoop.niveau === 2) return <h2 className={`rpa-h2${direct}`} data-inhoud={knoop.id}>{tekst}</h2>;
  if (knoop.niveau === 3) return <h3 className={`rpa-h3${direct}`} data-inhoud={knoop.id}>{tekst}</h3>;
  return <h4 className={`rpa-h4${direct}`} data-inhoud={knoop.id}>{tekst}</h4>;
}

/** 2.2 Rol binnen het project: de openingszin, dan de rol, de architect en de datum van de onderlegger. */
function RolInhoud({ w }: { w: RapportWeergave }) {
  const { rol } = w.rapport;
  return (
    <>
      <Tekst tekst={w.rapport.teksten.rol} invul={w.invul} subkoppen={w.rapport.opmaak.subkoppen} />
      <Rij>
        <Cel k={1} n={5}>{vulIn(w.t("afdruk.rol.rolVan"), w.invul)}</Cel>
        <Cel k={6} n={5}>{rol.rol}</Cel>
      </Rij>
      <Rij>
        <Cel k={2} n={4}>{w.t("afdruk.rol.architect")}</Cel>
        <Cel k={6} n={5}>{rol.architect}</Cel>
      </Rij>
      <Rij>
        <Cel k={2} n={4}>{w.t("afdruk.rol.datumOnderlegger")}</Cel>
        <Cel k={6} n={5}>{rol.datumOnderlegger}</Cel>
      </Rij>
    </>
  );
}

/**
 * Het begin van hoofdstuk Berekeningen: een eigen inhoudsopgave van de
 * paragrafen, met een lijn onder elke regel, het paginanummer van de paragraaf
 * rechts en twee lege regels erna. Zonder rekenbladen is er geen hoofdstuk
 * Berekeningen (bouwOpzet laat het weg).
 */
function BerekeningenInhoud({ knoop, w }: { knoop: Rapportknoop; w: RapportWeergave }) {
  const paragrafen = knoop.kinderen.filter((k) => k.blad);
  if (paragrafen.length === 0) return null;

  // 台灣版檢核章節總結卡
  const isTw = w.rapport.opzetSoort === "tw";
  const eindoordeel = isTw
    ? bepaalTwEindoordeel(
        w.bladen.map((b) => ({
          voldoet: b.resultaat.voldoet,
          nietGetoetst: b.resultaat.nietGetoetst,
          uc: b.resultaat.uc,
        })),
      )
    : null;

  return (
    <>
      {isTw && eindoordeel && (
        <>
          <Rij klasse="rpa-koprij">
            <Cel k={1} n={3} o>{w.taal === "zh-TW" ? "結構檢核總結判定" : "Overall verification result"}</Cel>
            <Cel k={4} n={3}>{w.taal === "zh-TW" ? "全案最大控制檢核比" : "Governing UC"}</Cel>
            <Cel k={7} n={3}>{w.taal === "zh-TW" ? "檢核項目統計" : "Check items"}</Cel>
          </Rij>
          <Rij klasse="rpa-tt">
            <Cel k={1} n={3} klasse="rpa-vet" o>{eindoordeel.oordeel}</Cel>
            <Cel k={4} n={3} klasse="rpa-vet">{eindoordeel.ucMax !== null ? `UC ${w.f(eindoordeel.ucMax, 2)}` : "—"}</Cel>
            <Cel k={7} n={3}>
              {w.taal === "zh-TW"
                ? `共 ${eindoordeel.aantal} 項（合格：${eindoordeel.geslaagd}，不合格：${eindoordeel.afgekeurd}，未檢核：${eindoordeel.ongecontroleerd}）`
                : `Total ${eindoordeel.aantal} (Passed: ${eindoordeel.geslaagd}, Failed: ${eindoordeel.afgekeurd}, Unchecked: ${eindoordeel.ongecontroleerd})`}
            </Cel>
          </Rij>
          <Leeg />
        </>
      )}
      <h3 className="rpa-io-kop">{w.t("afdruk.inhoud.inhoudsopgave")}</h3>
      {paragrafen.map((k) => (
        <Rij key={k.id} klasse="rpa-tt">
          <Cel k={1} n={3} o>{k.nummer} {k.titel}</Cel>
          <PaginaCel anker={k.id} />
        </Rij>
      ))}
      <Leeg />
    </>
  );
}

/** 台灣版：設計規範自動彙整表格 */
function TwNormenInhoud({ w }: { w: RapportWeergave }) {
  const normen = verzamelTwNormen(w.bladen.map((b) => ({ naam: b.ex.naam, norm: b.resultaat.norm })));
  const tekst = w.rapport.teksten["tw-normen"];
  return (
    <>
      {tekst && <Tekst tekst={tekst} invul={w.invul} subkoppen={w.rapport.opmaak.subkoppen} />}
      <Leeg />
      <Rij klasse="rpa-koprij">
        <Cel k={1} n={3} o>{w.taal === "zh-TW" ? "規範代碼與名稱" : "Code ID & Title"}</Cel>
        <Cel k={4} n={3}>{w.taal === "zh-TW" ? "發布版次與機關" : "Edition"}</Cel>
        <Cel k={7} n={3}>{w.taal === "zh-TW" ? "本案引用計算表" : "Applied Sheets"}</Cel>
      </Rij>
      {normen.length > 0 ? (
        normen.map((n) => (
          <Rij key={n.normId} klasse="rpa-tt">
            <Cel k={1} n={3} o>{n.naam}</Cel>
            <Cel k={4} n={3}>{n.editie}</Cel>
            <Cel k={7} n={3}>{n.bladen.join("、")}</Cel>
          </Rij>
        ))
      ) : (
        <Rij klasse="rpa-tt">
          <Cel k={1} n={9}>{w.rapport.normen || (w.taal === "zh-TW" ? "依中華民國現行建築技術規則及結構設計規範" : "Taiwan Building Codes")}</Cel>
        </Rij>
      )}
      <Leeg />
    </>
  );
}

/** 台灣版：載重組合（rc112 表 5.3.1） */
function TwCombinatiesInhoud({ w }: { w: RapportWeergave }) {
  const taal = w.taal;
  return (
    <>
      <Bijschrift tekst={w.bijschriften.get(bijschriftSleutel.factoren)} />
      <Rij klasse="rpa-koprij">
        <Cel k={1} n={2} o>{taal === "zh-TW" ? "組合編號" : "ID"}</Cel>
        <Cel k={3} n={4}>{taal === "zh-TW" ? "設計強度計算式" : "Design formula"}</Cel>
        <Cel k={7} n={3}>{taal === "zh-TW" ? "控制狀況與出處" : "Condition & Source"}</Cel>
      </Rij>
      {TW_RC_BELASTINGCOMBINATIES.map((c) => (
        <Rij key={c.id} klasse="rpa-tt">
          <Cel k={1} n={2} o>{c.naam}（{c.id}）</Cel>
          <Cel k={3} n={4} klasse="rpa-vet">{c.formule}</Cel>
          <Cel k={7} n={3}>{c.omschrijving}</Cel>
        </Rij>
      ))}
      <Leeg />
      <p className="rpa-tekst">{taal === "zh-TW" ? "出處：A 級 建築物混凝土結構設計規範 (rc112) 第 5.3 節表 5.3.1。" : "Source: A-level rc112 Table 5.3.1."}</p>
    </>
  );
}

/** 台灣版：活載重（構造編第 17 條待補說明、第 26 條屋頂活載重表） */
function TwVeranderlijkInhoud({ w }: { w: RapportWeergave }) {
  const taal = w.taal;
  return (
    <>
      <Bijschrift tekst={w.bijschriften.get(bijschriftSleutel.veranderlijk)} />
      <Rij klasse="rpa-koprij">
        <Cel k={1} n={4} o>{taal === "zh-TW" ? "樓地板活載重場所" : "Floor use"}</Cel>
        <Cel k={5} n={2}>{taal === "zh-TW" ? "最低均布載重" : "Uniform load"}</Cel>
        <Cel k={7} n={3}>{taal === "zh-TW" ? "依據與出處" : "Basis & Source"}</Cel>
      </Rij>
      <Rij klasse="rpa-tt">
        <Cel k={1} n={9} klasse="rpa-cursief">{TW_VLOER_VERANDERLIJK_STATUS}</Cel>
      </Rij>
      {TW_VLOER_VERANDERLIJK_TABEL.map((item) => (
        <Rij key={`t17-${item.id}`} klasse="rpa-tt">
          <Cel k={1} n={4} o>{`${item.groep} ${item.gebruik}`}</Cel>
          <Cel k={5} n={2}>{`${item.qlast_kgf} kgf/m²`}</Cel>
          <Cel k={7} n={3}>{item.menigte === 1 ? "第 17 條附表；人群聚集（不折減）" : "第 17 條附表"}</Cel>
        </Rij>
      ))}
      {TW_VERANDERLIJK_BIJZONDER.map((item, i) => (
        <Rij key={i} klasse="rpa-tt">
          <Cel k={1} n={4} o>{item.gebruik}</Cel>
          <Cel k={5} n={2}>{`${item.qlast_kgf} kgf/m²`}</Cel>
          <Cel k={7} n={3}>{item.bron}</Cel>
        </Rij>
      ))}
      <Leeg />
      <h4 className="rpa-kop">{taal === "zh-TW" ? "屋頂最低活載重（建築技術規則建築構造編第 26 條表）" : "Minimum roof live load (Art. 26)"}</h4>
      <Rij klasse="rpa-koprij">
        <Cel k={1} n={3} o>{taal === "zh-TW" ? "屋頂種類與坡度" : "Roof type & slope"}</Cel>
        <Cel k={4} n={2}>≤ 20 m²</Cel>
        <Cel k={6} n={2}>20–60 m²</Cel>
        <Cel k={8} n={2}>{"> 60 m²"}</Cel>
      </Rij>
      {TW_DAK_VERANDERLIJK_T26.map((r, i) => (
        <Rij key={i} klasse="rpa-tt">
          <Cel k={1} n={3} o>{r.dakvorm} ({r.helling})</Cel>
          <Cel k={4} n={2}>{`${r.klein_20} kgf/m²`}</Cel>
          <Cel k={6} n={2}>{`${r.midden_60} kgf/m²`}</Cel>
          <Cel k={8} n={2}>{`${r.groot_60} kgf/m²`}</Cel>
        </Rij>
      ))}
      <Leeg />
    </>
  );
}

/**
 * Eén blad in hoofdstuk Berekeningen: de automatische samenvatting uit de
 * bladkop, daaronder de eigen toelichting als die er is; dan de verwijzing
 * naar bijlage A, of — als het blad in het hoofdstuk zelf hoort — de
 * uitwerking hier. Bij een aangemelde soort (bladSoorten.tsx) is die uitwerking zijn
 * eigen afdrukonderdeel, onder de paragraafkop.
 */
function Berekening({ blad, w }: { blad: Blad; w: RapportWeergave }) {
  const b = w.bladen.find((x) => x.ex.id === blad.id);
  const toelichting = w.rapport.toelichting[blad.id] ?? "";
  const inHoofdstuk = blad.bijlage === "";
  const soort = b && bladSoortVan(b.ex);
  return (
    <>
      {/* Zonder UC of oordeel zegt de samenvatting niets meer dan de kop. */}
      {b && (b.resultaat.uc !== null || b.resultaat.voldoet !== null) && (
        <p className="rpa-tekst">{samenvatting(b.resultaat, w.taal)}</p>
      )}
      {toelichting.trim() && <Tekst tekst={toelichting} invul={w.invul} subkoppen={w.rapport.opmaak.subkoppen} />}
      {inHoofdstuk && b && soort ? (
        <soort.Afdruk ex={b.ex} maten={MATEN.rapport} />
      ) : inHoofdstuk && b ? (
        // `print-blad` geeft de uitwerking dezelfde compacte opmaak als een
        // los blad; `rpa-inline` haalt de paginasprong van een los blad weg.
        <Vlak klasse="print-blad rpa-inline">
          {isCanvasBlad(b.ex) && b.eenheden
            ? <CanvasVellen eenheden={b.eenheden} bladId={b.ex.id} />
            : <UitwerkingHtml html={b.html} bladId={b.ex.id} />}
        </Vlak>
      ) : (
        blad.bijlage && <p className="rpa-tekst">{w.t("afdruk.zieBijlage", { nummer: blad.bijlage })}</p>
      )}
    </>
  );
}

/** De eigen inhoud van een knoop, naar zijn soort. */
function InhoudVan({ knoop, w }: { knoop: Rapportknoop; w: RapportWeergave }) {
  switch (knoop.inhoud) {
    case "tekst":
      if (knoop.id === "tw-normen") return <TwNormenInhoud w={w} />;
      return <Tekst tekst={w.rapport.teksten[knoop.id]} invul={w.invul} subkoppen={w.rapport.opmaak.subkoppen} />;
    case "rol":
      return <RolInhoud w={w} />;
    case "bouwwerk":
      return <Bouwwerk w={w} />;
    case "brand":
      return <Brand w={w} />;
    case "materialen":
      return <Materialen w={w} />;
    case "conservering":
      return <Conservering w={w} />;
    case "factoren":
      return w.rapport.opzetSoort === "tw" ? <TwCombinatiesInhoud w={w} /> : <Factoren w={w} />;
    case "bestaand":
      return <Bestaand w={w} />;
    case "vervormingen":
      return <Vervormingen w={w} />;
    case "sneeuw":
      return <Sneeuw w={w} />;
    case "wind":
      return <Wind w={w} />;
    case "veranderlijk":
      return w.rapport.opzetSoort === "tw" ? <TwVeranderlijkInhoud w={w} /> : <Veranderlijk w={w} />;
    case "berekeningen":
      return <BerekeningenInhoud knoop={knoop} w={w} />;
    case "tw-normen":
      return <TwNormenInhoud w={w} />;
    default:
      // "blijvend" krijgt in voegToe een eigen behandeling; zonder inhoud is er niets.
      return null;
  }
}

/** Zet een knoop en daarna zijn kinderen als stukken in `uit`. */
function voegToe(knoop: Rapportknoop, w: RapportWeergave, plaats: Plaats, uit: Stuk[]): void {
  const inspringen = knoop.inspringen ?? plaats.inspringen;
  const kop = <Kop knoop={knoop} plaats={plaats} />;

  // 5.5 heeft twee groepen. WANDEN begint standaard op een nieuw vel — maar
  // alleen als er ook vloeren of daken zijn, anders bleef de kop 5.5 alleen
  // achter op het vorige vel.
  if (knoop.inhoud === "blijvend") {
    const { vloerenDaken, wanden } = w.rapport.belastingen;
    const wandenApart = vloerenDaken.length > 0 && wanden.length > 0;
    uit.push({
      sleutel: knoop.id,
      nieuwePagina: plaats.begin,
      inhoud: (
        <Vlak>
          {kop}
          {vloerenDaken.length > 0 && (
            <Groep titel={w.t("afdruk.belastingen.vloerDaken")} opbouwen={vloerenDaken} direct inspringen={inspringen} w={w} />
          )}
          {wanden.length > 0 && !wandenApart && (
            <Groep titel={w.t("afdruk.belastingen.wanden")} opbouwen={wanden} direct={vloerenDaken.length === 0} inspringen={inspringen} w={w} />
          )}
        </Vlak>
      ),
    });
    if (wandenApart) {
      uit.push({
        sleutel: `${knoop.id}-wanden`,
        nieuwePagina: true,
        inhoud: (
          <Vlak>
            <Groep titel={w.t("afdruk.belastingen.wanden")} opbouwen={wanden} direct={false} inspringen={inspringen} w={w} />
          </Vlak>
        ),
      });
    }
    return;
  }

  const eigen = knoop.blad ? (
    <Berekening blad={knoop.blad} w={w} />
  ) : knoop.inhoud ? (
    <InhoudVan knoop={knoop} w={w} />
  ) : null;
  uit.push({
    sleutel: knoop.id,
    nieuwePagina: plaats.begin,
    inhoud: (
      <Vlak>
        {kop}
        {eigen && (inspringen ? <Vlak klasse="rpa-in">{eigen}</Vlak> : eigen)}
      </Vlak>
    ),
  });

  // Het eerste kind staat direct onder deze kop als deze knoop zelf niets
  // toont en het kind niet op een nieuw vel begint.
  const zonderEigen = !knoop.inhoud && !knoop.blad;
  knoop.kinderen.forEach((kind, i) =>
    voegToe(
      kind,
      w,
      { begin: kind.nieuwePagina, direct: i === 0 && zonderEigen && !kind.nieuwePagina, inspringen },
      uit,
    ),
  );
}

/** Alle hoofdstukken als stukken. Het eerste begint altijd op een vers vel: de inhoud gaat eraan vooraf. */
export function hoofdstukStukken(w: RapportWeergave): Stuk[] {
  const uit: Stuk[] = [];
  w.knopen.forEach((knoop, i) =>
    voegToe(knoop, w, { begin: i === 0 || knoop.nieuwePagina, direct: false, inspringen: 0 }, uit),
  );
  return uit;
}
