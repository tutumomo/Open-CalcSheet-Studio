import { Fragment, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import type { Exemplaar } from "../../../store/projectStore";
import { plakBlok, zetCel, zetVelden, type Variant, type Varianten } from "../../../store/varianten";
import type { Kolom, VariantenUitkomst } from "../../../rekenen/variantRekenen";
import { isUcNaam } from "../bladVersie";
import { ucTekst } from "../bladLezen";
import { DUBBELZINNIG, type VariantVeld } from "./velden";
import { oordeelVan } from "../../../rekenen/varianten";

/** Wat een getypte waarde wordt in de eenheid van het blad, of waarom niet. */
export type LeesCel = (veld: VariantVeld, tekst: string) => { waarde: string } | { fout: string };

export type VariantActie = "bekijk" | "overnemen" | "alsBlad" | "kopie" | "hernoem" | "verwijder";

interface Props {
  ex: Exemplaar;
  vs: Varianten;
  velden: VariantVeld[];
  uitkomsten: VariantenUitkomst;
  /** De gekozen cel: rij (index in velden) en kolom (index in de lijst varianten). */
  gekozen: { rij: number; kolom: number } | null;
  kies: (rij: number, kolom: number) => void;
  zet: (vs: Varianten | undefined, sleutel?: string) => void;
  lees: LeesCel;
  actie: (actie: VariantActie, v: Variant) => void;
}

/** De waarde van een veld zoals het blad hem heeft, zoals de gebruiker hem kent. */
export function bladTekst(veld: VariantVeld, waarden: Record<string, string>): string {
  const w = waarden[veld.naam];
  const waarde = w !== undefined && w.trim() !== "" ? w : veld.beginwaarde;
  return veld.soort === "keuze" ? (veld.keuzes.find((k) => k.value === waarde)?.text ?? waarde) : waarde;
}

/** De tabel: invoer bovenaan, uitkomst onderaan, het blad en de varianten naast elkaar. */
export default function VariantenTabel({ ex, vs, velden, uitkomsten, gekozen, kies, zet, lees, actie }: Props) {
  const { t, i18n } = useTranslation("werkruimte");
  const [concept, setConcept] = useState<{ cel: string; tekst: string; fout?: string } | null>(null);
  // Het menu van een variant staat vast op het scherm: de tabel schuift opzij en zou het afsnijden.
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [hernoem, setHernoem] = useState<{ id: string; naam: string } | null>(null);
  const tabel = useRef<HTMLTableElement>(null);

  const kolommen: { v: Variant | null; k: Kolom }[] = [
    { v: null, k: uitkomsten.blad },
    ...vs.lijst.map((v) => ({ v, k: uitkomsten.perVariant.get(v.id) ?? { bezig: true } })),
  ];
  // De losse UC's van het blad, in de volgorde van het blad; de maatgevende staat er al.
  const ucNamen = useMemo(() => {
    const uit: string[] = [];
    for (const { k } of kolommen) {
      for (const n of Object.keys(k.uitkomst?.getallen ?? {})) if (isUcNaam(n) && n !== "UC_max" && !uit.includes(n)) uit.push(n);
    }
    return uit;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uitkomsten]);

  const naarCel = (rij: number, kolom: number) => {
    const el = tabel.current?.querySelector<HTMLElement>(`[data-rij="${rij}"][data-kolom="${kolom}"]`);
    el?.focus();
    if (el instanceof HTMLInputElement) el.select();
  };
  const toets = (e: KeyboardEvent, rij: number, kolom: number) => {
    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault();
      naarCel(e.shiftKey && e.key === "Enter" ? rij - 1 : rij + 1, kolom);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      naarCel(rij - 1, kolom);
    }
  };
  const typ = (v: Variant, veld: VariantVeld, tekst: string) => {
    const cel = `${v.id}:${veld.naam}`;
    const r = tekst.trim() === "" ? { waarde: "" } : lees(veld, tekst);
    if ("fout" in r) {
      setConcept({ cel, tekst, fout: r.fout === DUBBELZINNIG ? t("varianten.dubbelzinnig") : r.fout });
      return;
    }
    setConcept({ cel, tekst });
    zet(zetCel(vs, v.id, veld.naam, r.waarde), cel);
  };
  const plak = (tekst: string, rij: number, kolom: number) =>
    zet(plakBlok(vs, tekst, rij, kolom, (naam, w) => {
      const veld = velden.find((x) => x.naam === naam);
      if (!veld) return null;
      const r = lees(veld, w);
      return "fout" in r ? null : r.waarde;
    }, velden.map((v) => v.naam)));

  const ucCel = (k: Kolom) => {
    if (k.uitkomst === undefined) return <td className="var-uit bezig">…</td>;
    if (k.uitkomst === null) return <td className="var-uit fout" title={k.fout}>{t("varianten.fout")}</td>;
    const { uc, voldoet } = k.uitkomst.resultaat;
    const tekst = uc === null ? "—" : ucTekst(uc, i18n.language);
    const rood = voldoet === false || (uc !== null && uc > 1);
    return (
      <td className={`var-uit sterk${rood ? " rood" : ""}${k.bezig ? " verouderd" : ""}`} title={k.uitkomst.fout}>
        {k.uitkomst.fout && <span className="var-let">⚠ </span>}
        {tekst}
      </td>
    );
  };
  const oordeelCel = (k: Kolom) => {
    if (!k.uitkomst) return <td className="var-uit">{k.uitkomst === undefined ? "…" : "—"}</td>;
    // Een regel met een fout is nooit "voldoet" (oordeelVan): dan niet getoetst, met de fout erbij.
    const oordeel = oordeelVan(k.uitkomst);
    const klasse = oordeel === "voldoet" ? "groen" : oordeel === "voldoetNiet" ? "rood" : "";
    return (
      <td className={`var-uit sterk ${klasse}${k.bezig ? " verouderd" : ""}`} title={k.uitkomst.fout}>
        {k.uitkomst.fout && <span className="var-let">⚠ </span>}
        {t(`varianten.oordeel.${oordeel}`)}
      </td>
    );
  };
  const getalCel = (k: Kolom, naam: string, uc: boolean) => {
    const u = k.uitkomst;
    if (!u) return <td className="var-uit">{u === undefined ? "…" : "—"}</td>;
    const n = u.getallen[naam];
    const tekst = uc ? (n === undefined ? "—" : ucTekst(n, i18n.language)) : (u.teksten[naam] ?? "—");
    return <td className={`var-uit${uc && n > 1 ? " rood" : ""}${k.bezig ? " verouderd" : ""}`}>{tekst}</td>;
  };

  return (
    <div className="var-tabel-wikkel">
      {menu && <div className="var-menu-achter" onClick={() => setMenu(null)} />}
      <table className="var-tabel" ref={tabel}>
        <thead>
          <tr>
            <th className="var-hoek">{ex.naam}</th>
            <th className="var-kop">{t("varianten.blad")}</th>
            {vs.lijst.map((v, i) => (
              <th key={v.id} className={`var-kop${gekozen?.kolom === i ? " gekozen" : ""}`}>
                {hernoem?.id === v.id ? (
                  <input
                    className="var-hernoem"
                    autoFocus
                    value={hernoem.naam}
                    onChange={(e) => setHernoem({ id: v.id, naam: e.target.value })}
                    onBlur={() => {
                      if (hernoem.naam.trim()) actie("hernoem", { ...v, naam: hernoem.naam.trim() });
                      setHernoem(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      if (e.key === "Escape") setHernoem(null);
                    }}
                  />
                ) : (
                  <button
                    className="var-kop-knop"
                    onClick={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      setMenu(menu?.id === v.id ? null : { id: v.id, x: r.right, y: r.bottom });
                    }}
                    onDoubleClick={() => setHernoem({ id: v.id, naam: v.naam })}
                  >
                    {v.naam} ▾
                  </button>
                )}
                {menu?.id === v.id && (
                  <div className="var-menu" role="menu" style={{ top: menu.y, left: Math.max(8, menu.x - 210) }}>
                    {(["bekijk", "overnemen", "alsBlad", "kopie", "hernoem", "verwijder"] as const).map((a) => (
                      <button
                        key={a}
                        role="menuitem"
                        className={a === "verwijder" ? "gevaar" : undefined}
                        onClick={() => {
                          setMenu(null);
                          if (a === "hernoem") setHernoem({ id: v.id, naam: v.naam });
                          else actie(a, v);
                        }}
                      >
                        {t(`varianten.menu.${a}`)}
                      </button>
                    ))}
                  </div>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="var-sectie"><td colSpan={vs.lijst.length + 2}>{t("varianten.invoer")}</td></tr>
          {velden.map((veld, rij) => (
            <tr key={veld.naam}>
              <th className="var-rij-kop">
                <span className="var-naam">{veld.naam}</span>
                {veld.label && <span className="var-label"> — {veld.label}</span>}
                {veld.eenheid && <span className="var-eenheid"> [{veld.eenheid}]</span>}
                <button className="var-weg" title={t("varianten.veldWeg")} onClick={() => zet(zetVelden(vs, vs.velden.filter((n) => n !== veld.naam)))}>×</button>
              </th>
              <td className="var-blad">{bladTekst(veld, ex.waarden)}</td>
              {vs.lijst.map((v, kolom) => {
                const k = uitkomsten.perVariant.get(v.id);
                const doetMee = !k?.uitkomst || k.uitkomst.actief.includes(veld.naam);
                const eigen = v.waarden[veld.naam] ?? "";
                const cel = `${v.id}:${veld.naam}`;
                const klassen = [
                  "var-cel",
                  eigen ? "eigen" : "volgt",
                  v.gezocht?.includes(veld.naam) ? "gezocht" : "",
                  doetMee ? "" : "nvt",
                  concept?.cel === cel && concept.fout ? "fout" : "",
                  gekozen?.kolom === kolom ? "gekozen" : "",
                ].filter(Boolean).join(" ");
                const plaats = doetMee ? bladTekst(veld, ex.waarden) : "—";
                return (
                  <td key={v.id} className={klassen} title={concept?.cel === cel ? concept.fout : undefined}>
                    {veld.soort === "keuze" ? (
                      <select
                        data-rij={rij}
                        data-kolom={kolom}
                        value={eigen}
                        onFocus={() => kies(rij, kolom)}
                        onKeyDown={(e) => toets(e, rij, kolom)}
                        onChange={(e) => zet(zetCel(vs, v.id, veld.naam, e.target.value))}
                      >
                        <option value="">{plaats}</option>
                        {veld.keuzes.map((o) => (
                          <option key={o.value} value={o.value}>{o.text}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        data-rij={rij}
                        data-kolom={kolom}
                        value={concept?.cel === cel ? concept.tekst : eigen}
                        placeholder={plaats}
                        spellCheck={false}
                        onFocus={() => kies(rij, kolom)}
                        onBlur={() => setConcept(null)}
                        onKeyDown={(e) => toets(e, rij, kolom)}
                        onChange={(e) => typ(v, veld, e.target.value)}
                        onPaste={(e) => {
                          const tekst = e.clipboardData.getData("text/plain");
                          if (!/[\t\n]/.test(tekst.trim())) return;
                          e.preventDefault();
                          plak(tekst, rij, kolom);
                        }}
                      />
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
          <tr className="var-sectie"><td colSpan={vs.lijst.length + 2}>{t("varianten.uitkomst")}</td></tr>
          <tr>
            <th className="var-rij-kop sterk">{t("varianten.maatgevendeUc")}</th>
            {kolommen.map(({ v, k }) => <Fragment key={v?.id ?? "blad"}>{ucCel(k)}</Fragment>)}
          </tr>
          <tr>
            <th className="var-rij-kop sterk">{t("varianten.oordeel.kop")}</th>
            {kolommen.map(({ v, k }) => <Fragment key={v?.id ?? "blad"}>{oordeelCel(k)}</Fragment>)}
          </tr>
          {ucNamen.map((naam) => (
            <tr key={naam}>
              <th className="var-rij-kop"><span className="var-naam">{naam}</span></th>
              {kolommen.map(({ v, k }) => <Fragment key={v?.id ?? "blad"}>{getalCel(k, naam, true)}</Fragment>)}
            </tr>
          ))}
          {vs.uitkomsten.map((naam) => (
            <tr key={`u-${naam}`}>
              <th className="var-rij-kop">
                <span className="var-naam">{naam}</span>
                <button className="var-weg" title={t("varianten.uitkomstWeg")} onClick={() => zet({ ...vs, uitkomsten: vs.uitkomsten.filter((n) => n !== naam) })}>×</button>
              </th>
              {kolommen.map(({ v, k }) => <Fragment key={v?.id ?? "blad"}>{getalCel(k, naam, false)}</Fragment>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
