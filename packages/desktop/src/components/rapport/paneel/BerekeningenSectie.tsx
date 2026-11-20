import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { evaluate, parse } from "@ifc-calc/core";
import { rekentaalImageUrls, rekentaalIncludes } from "../../../templates/rekentaal-includes";
import { bronVoorUitvoer } from "../../../templates/vertalingen";
import { projectScope } from "../../../store/projectGegevens";
import { useProjectStore } from "../../../store/projectStore";
import { metToetsingen } from "../../../rekenen/toetsCache";
import { staatInHoofdstuk } from "../../../rapport/opzet";
import { leesResultaat, samenvatting, type Resultaat } from "../../calc/bladResultaat";
import { bladSoortVan, bladVoorOpzet } from "../../calc/bladSoorten";
import BeeldenInvoer from "./BeeldenInvoer";
import { GroeiVeld, Sectie, SubkopMelding, useOpzetStand, useRapport, Vink } from "./velden";

interface Uitkomst {
  resultaat: Resultaat;
  /** De foutmelding als het blad niet door te rekenen was. */
  fout: string | null;
}

/**
 * Rekent elk blad door en leest zijn uitkomst, net als de afdruk. Hangt
 * alleen af van de bladen, de projectgegevens en de taal van het rapport: typen in het
 * rapport rekent niets opnieuw.
 */
function useUitkomsten(taal: string): Map<string, Uitkomst> {
  const exemplaren = useProjectStore((s) => s.exemplaren);
  const gegevens = useProjectStore((s) => s.gegevens);
  return useMemo(() => {
    const scope = projectScope(gegevens);
    const opties = { includes: rekentaalIncludes, imageUrls: rekentaalImageUrls };
    const uit = new Map<string, Uitkomst>();
    for (const ex of exemplaren) {
      try {
        const nodes = evaluate(parse(bronVoorUitvoer(ex.source, taal).bron, opties), ex.waarden, scope, metToetsingen({}, "lezen"));
        uit.set(ex.id, { resultaat: leesResultaat(nodes, ex.naam), fout: null });
      } catch (err) {
        uit.set(ex.id, {
          resultaat: { titel: ex.naam, norm: "", uc: null, voldoet: null },
          fout: (err as Error).message,
        });
      }
    }
    return uit;
  }, [exemplaren, gegevens, taal]);
}

/**
 * Sectie Berekeningen (hoofdstuk 6): per rekenblad de samenvatting die in
 * het rapport komt, een eigen toelichting, en de keuze of de volledige
 * uitwerking in het hoofdstuk zelf staat of in bijlage A.
 */
export default function BerekeningenSectie() {
  const { t } = useTranslation("rapport");
  const exemplaren = useProjectStore((s) => s.exemplaren);
  const zet = useProjectStore((s) => s.zetRapportVeld);
  const rapport = useRapport();
  const stand = useOpzetStand();
  const uitkomsten = useUitkomsten(rapport.taal);

  return (
    <Sectie
      id="berekeningen"
      titel={t("secties.berekeningen")}
      hoofdstuk="berekeningen"
      intro={t("berekeningen.intro")}
    >
      {exemplaren.length === 0 && <p className="rapport-hint">{t("berekeningen.geenBladen")}</p>}
      {exemplaren.length > 0 && <BeeldenInvoer id="berekeningen" />}
      {exemplaren.length > 0 && (
        <Vink
          label={t("berekeningen.bladenInInhoud")}
          pad="opmaak.bladenInInhoud"
          aan={rapport.opmaak.bladenInInhoud}
          hint={t("berekeningen.bladenInInhoudUitleg")}
        />
      )}
      {exemplaren.length > 0 && (
        <Vink
          label={t("berekeningen.bijlageParagrafen")}
          pad="opmaak.bijlageParagrafen"
          aan={rapport.opmaak.bijlageParagrafen !== false}
          hint={t("berekeningen.bijlageParagrafenUitleg")}
        />
      )}
      {exemplaren.map((ex) => {
        const uitkomst = uitkomsten.get(ex.id);
        const r = uitkomst?.resultaat;
        // Zonder UC, oordeel of eigen kop zegt de samenvatting niets meer dan de naam.
        const zegtIets = !!r && (r.titel !== ex.naam || r.uc !== null || r.voldoet !== null);
        const plaats = stand.blad(ex.id);
        const inHoofdstuk = staatInHoofdstuk(rapport, bladVoorOpzet(ex));
        const RapportKeuze = bladSoortVan(ex)?.RapportKeuze;
        const toelichting = rapport.toelichting[ex.id] ?? "";
        // Het exemplaar-id staat in het pad; ids van de vorm "ex-…" bevatten
        // geen punt, dus leesPad knipt ze niet in stukken.
        return (
          <div className="rapport-kaart" key={ex.id}>
            <div className="rapport-kaart-kop">
              {plaats?.nummer && <span className="rapport-nummer">{plaats.nummer}</span>}
              <span className="rapport-kaart-titel">{ex.naam}</span>
              {r && r.voldoet !== null && (
                <span className={`rapport-oordeel ${r.voldoet ? "goed" : "fout"}`}>
                  {t(r.voldoet ? "berekeningen.voldoet" : "berekeningen.voldoetNiet")}
                </span>
              )}
            </div>
            {/* De samenvatting is de tekst zoals hij in het rapport komt. */}
            {r && zegtIets && <p className="rapport-samenvatting">{samenvatting(r, rapport.taal)}</p>}
            {uitkomst?.fout && (
              <p className="rapport-hint">{t("berekeningen.nietDoorgerekend", { fout: uitkomst.fout })}</p>
            )}
            <GroeiVeld
              waarde={toelichting}
              onChange={(v) => zet(`toelichting.${ex.id}`, v)}
              placeholder={t("berekeningen.toelichtingVoorbeeld")}
            />
            {/* De afdruk maakt de toelichting op zoals de andere teksten, met subkoppen. */}
            <SubkopMelding tekst={toelichting} />
            <div className="rapport-kaart-voet">
              <label className="rapport-vink">
                <input
                  type="checkbox"
                  checked={inHoofdstuk}
                  onChange={(e) => zet(`inHoofdstuk.${ex.id}`, e.target.checked)}
                />
                {t("berekeningen.inHoofdstuk")}
              </label>
              <span className="rapport-hint">
                {inHoofdstuk
                  ? t("berekeningen.staatInHoofdstuk")
                  : t("berekeningen.staatInBijlage", { letter: plaats?.bijlage || "A" })}
              </span>
            </div>
            {RapportKeuze && <div className="rapport-kaart-voet"><RapportKeuze ex={ex} /></div>}
          </div>
        );
      })}
    </Sectie>
  );
}
