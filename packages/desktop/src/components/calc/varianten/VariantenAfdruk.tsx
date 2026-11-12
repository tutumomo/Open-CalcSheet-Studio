import { Fragment, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useProjectStore, type Exemplaar } from "../../../store/projectStore";
import { projectScope } from "../../../store/projectGegevens";
import { evalOptiesVan } from "../../../store/projectEenheden";
import { variantInvoer } from "../../../store/varianten";
import { oordeelVan, papierTabellen, rekenVariant, type VariantUitkomst } from "../../../rekenen/varianten";
import { metToetsingen } from "../../../rekenen/toetsCache";
import { verwezenBladen } from "../../../rekenen/verwijzingen";
import { useToetsVersie } from "../../../rekenen/femToetsing";
import { ucTekst } from "../bladLezen";
import { leesBlad } from "../bladResultaat";
import { variantVelden } from "./velden";
import { bladTekst } from "./VariantenTabel";
import "./VariantenAfdruk.css";

/** Zoveel varianten naast de kolom Blad passen leesbaar op A4 staand. */
const PER_TABEL = 8;

/**
 * De varianten van een blad op papier, onder zijn uitwerking (PrintBlad.tsx): beknopt,
 * met alleen de velden die verschillen, de gekozen uitkomsten, de maatgevende UC en het
 * oordeel. Meer varianten dan er naast elkaar passen: een tweede tabel eronder. Elke
 * tabel is een eigen blok voor de verdeling over vellen (`print-varianten` is een
 * wikkel in paginering.ts).
 *
 * Rekent direct, zoals de afdruk elk blad direct rekent, met de vastgelegde antwoorden
 * van FEM Studio: op papier wordt niets gevraagd.
 */
export default function VariantenAfdruk({ ex }: { ex: Exemplaar }) {
  const { t, i18n } = useTranslation("beelden");
  const taal = i18n.language;
  const gegevens = useProjectStore((s) => s.gegevens);
  const exemplaren = useProjectStore((s) => s.exemplaren);
  const toetsV = useToetsVersie();
  const vs = ex.varianten;
  const velden = useMemo(() => {
    try {
      return variantVelden(leesBlad(ex.source));
    } catch {
      return [];
    }
  }, [ex.source]);
  const uitkomsten = useMemo(() => {
    const kaart = new Map<string, VariantUitkomst | null>();
    if (!vs?.opPapier) return kaart;
    const scope = projectScope(gegevens);
    const evalOpties = metToetsingen(evalOptiesVan(gegevens), "lezen", taal);
    const reken = (id: string, waarden: Record<string, string>) => {
      try {
        kaart.set(id, rekenVariant(ex.source, waarden, scope, ex.naam, { evalOpties, verwijzingen: verwezenBladen(ex.source, waarden, exemplaren) }));
      } catch {
        kaart.set(id, null);
      }
    };
    reken("", ex.waarden);
    for (const v of vs.lijst) reken(v.id, variantInvoer(ex.waarden, v, vs.velden));
    return kaart;
    // toetsV: een nieuw vastgelegd antwoord van FEM Studio
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ex, vs, gegevens, exemplaren, taal, toetsV]);
  if (!vs?.opPapier || vs.lijst.length === 0) return null;

  const tabellen = papierTabellen(velden, vs, ex.waarden, PER_TABEL);
  const veldNaam = (naam: string) => {
    const v = velden.find((x) => x.naam === naam);
    if (!v) return naam;
    if (v.soort === "keuze") return v.label || v.naam;
    return v.eenheid ? `${v.naam} [${v.eenheid}]` : v.naam;
  };
  const invoer = (naam: string, id: string) => {
    const veld = velden.find((x) => x.naam === naam)!;
    const u = uitkomsten.get(id);
    if (u && !u.actief.includes(naam)) return "—";
    const v = vs.lijst.find((x) => x.id === id);
    return bladTekst(veld, v ? variantInvoer(ex.waarden, v, vs.velden) : ex.waarden);
  };
  // Een regel met een fout is nooit "voldoet" (oordeelVan): dan niet getoetst.
  const oordeel = (u: VariantUitkomst | null | undefined) => {
    const o = oordeelVan(u);
    if (o === "nietGetoetst") return t("kit.nietGetoetst");
    if (o === "geen") return "—";
    return t(o === "voldoet" ? "afdruk.voldoet" : "afdruk.voldoetNiet");
  };

  return (
    <div className="print-varianten">
      <h3 className="print-varianten-kop">{t("afdruk.varianten.kop")}</h3>
      {tabellen.map((tabel, i) => (
        <table key={i} className="print-varianten-tabel">
          {i === 0 && <caption>{t("afdruk.varianten.uitleg", { naam: ex.naam })}</caption>}
          <thead>
            <tr>
              <th />
              {tabel.kolommen.map((v) => <th key={v?.id ?? "blad"}>{v ? v.naam : t("afdruk.varianten.blad")}</th>)}
            </tr>
          </thead>
          <tbody>
            {tabel.rijen.map((naam) => (
              <tr key={naam}>
                <th>{veldNaam(naam)}</th>
                {tabel.kolommen.map((v) => <td key={v?.id ?? "blad"}>{invoer(naam, v?.id ?? "")}</td>)}
              </tr>
            ))}
            {vs.uitkomsten.map((naam, j) => (
              <tr key={`u-${naam}`} className={j === 0 ? "print-varianten-scheiding" : undefined}>
                <th>{naam}</th>
                {tabel.kolommen.map((v) => <td key={v?.id ?? "blad"}>{uitkomsten.get(v?.id ?? "")?.teksten[naam] ?? "—"}</td>)}
              </tr>
            ))}
            <tr className={vs.uitkomsten.length ? "print-varianten-sterk" : "print-varianten-sterk print-varianten-scheiding"}>
              <th>{t("afdruk.varianten.uc")}</th>
              {tabel.kolommen.map((v) => {
                const uc = uitkomsten.get(v?.id ?? "")?.resultaat.uc;
                return <td key={v?.id ?? "blad"}>{uc === null || uc === undefined ? "—" : ucTekst(uc, taal)}</td>;
              })}
            </tr>
            <tr className="print-varianten-oordeel">
              <th>{t("afdruk.varianten.oordeel")}</th>
              {tabel.kolommen.map((v) => (
                <Fragment key={v?.id ?? "blad"}>
                  <td>{oordeel(uitkomsten.get(v?.id ?? ""))}</td>
                </Fragment>
              ))}
            </tr>
          </tbody>
        </table>
      ))}
    </div>
  );
}
