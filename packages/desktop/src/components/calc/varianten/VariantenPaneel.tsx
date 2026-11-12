import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Modal from "../../Modal";
import { useProjectStore, type Exemplaar } from "../../../store/projectStore";
import { nieuweVariant, plakBlok, zetVelden, type Variant, type Varianten } from "../../../store/varianten";
import { useVariantUitkomsten } from "../../../rekenen/variantRekenen";
import { leesBlad } from "../bladResultaat";
import { leesCel, variantVelden, type VariantVeld } from "./velden";
import VeldKeuze from "./VeldKeuze";
import VariantenTabel, { type VariantActie } from "./VariantenTabel";
import ReeksDialoog from "./ReeksDialoog";
import OptimaliseerDialoog from "./OptimaliseerDialoog";
import VariantUitwerking from "./VariantUitwerking";
import "./Varianten.css";

type Dialoog = null | "velden" | "reeks" | "optimaliseren" | "uitkomst";

/** De tab Varianten van een blad (docs/varianten.md). */
export default function VariantenPaneel({ ex }: { ex: Exemplaar }) {
  const { t } = useTranslation("werkruimte");
  const zetVarianten = useProjectStore((s) => s.zetVarianten);
  const neemVariantOver = useProjectStore((s) => s.neemVariantOver);
  const variantAlsBlad = useProjectStore((s) => s.variantAlsBlad);
  const ast = useMemo(() => {
    try {
      return leesBlad(ex.source);
    } catch {
      return [];
    }
  }, [ex.source]);
  const alleVelden = useMemo(() => variantVelden(ast), [ast]);
  const uitkomsten = useVariantUitkomsten(ex);
  const [dialoog, setDialoog] = useState<Dialoog>(null);
  const [bekijk, setBekijk] = useState<string | null>(null);
  const [gekozen, setGekozen] = useState<{ rij: number; kolom: number } | null>(null);
  const [meldingen, setMeldingen] = useState<string[]>([]);
  const zet = (nieuw: Varianten | undefined, sleutel?: string) => zetVarianten(ex.id, nieuw, sleutel);
  const vs = ex.varianten;

  if (!vs || vs.velden.length === 0) {
    return (
      <div className="var-paneel">
        <VeldKeuze
          eerste
          velden={alleVelden}
          waarden={ex.waarden}
          gekozen={[]}
          onKlaar={(velden) => zet(vs ? zetVelden({ ...vs, lijst: vs.lijst.length ? vs.lijst : [nieuweVariant([])] }, velden) : { velden, uitkomsten: [], lijst: [nieuweVariant([])] })}
        />
      </div>
    );
  }

  // Een veld dat het blad niet meer heeft (na bijwerken), valt uit de tabel tot het terugkomt.
  const velden = vs.velden.map((n) => alleVelden.find((v) => v.naam === n)).filter((v): v is VariantVeld => !!v);
  const bekeken = bekijk ? vs.lijst.find((v) => v.id === bekijk) : undefined;
  const voegToe = (na: number, v: Variant) => zet({ ...vs, lijst: [...vs.lijst.slice(0, na + 1), v, ...vs.lijst.slice(na + 1)] });
  const actie = (a: VariantActie, v: Variant) => {
    const i = vs.lijst.findIndex((x) => x.id === v.id);
    if (a === "bekijk") setBekijk(v.id);
    else if (a === "overnemen") neemVariantOver(ex.id, v.id);
    else if (a === "alsBlad") variantAlsBlad(ex.id, v.id);
    else if (a === "kopie") voegToe(i, nieuweVariant(vs.lijst, v.waarden));
    else if (a === "hernoem") zet({ ...vs, lijst: vs.lijst.map((x) => (x.id === v.id ? { ...x, naam: v.naam } : x)) });
    else if (a === "verwijder") {
      zet({ ...vs, lijst: vs.lijst.filter((x) => x.id !== v.id) });
      setGekozen(null);
    }
  };
  const plakKnop = async () => {
    try {
      const tekst = await navigator.clipboard.readText();
      zet(plakBlok(vs, tekst, gekozen?.rij ?? 0, gekozen?.kolom ?? vs.lijst.length, (naam, w) => {
        const veld = velden.find((x) => x.naam === naam);
        const r = veld ? leesCel(veld, w) : { fout: w };
        return "fout" in r ? null : r.waarde;
      }, velden.map((v) => v.naam)));
    } catch {
      setMeldingen([t("varianten.plakkenMislukt")]);
    }
  };
  const stand = uitkomsten.klaar === uitkomsten.totaal
    ? t("varianten.stand.klaar")
    : t("varianten.stand.bezig", { klaar: uitkomsten.klaar, totaal: uitkomsten.totaal });
  const beschikbaar = Object.keys(uitkomsten.blad.uitkomst?.teksten ?? {}).filter((n) => !vs.uitkomsten.includes(n));

  if (bekeken) return <div className="var-paneel"><VariantUitwerking ex={ex} variant={bekeken} onTerug={() => setBekijk(null)} /></div>;
  return (
    <div className="var-paneel">
      <div className="var-balk">
        <button className="var-knop" onClick={() => zet({ ...vs, lijst: [...vs.lijst, nieuweVariant(vs.lijst)] })}>{t("varianten.nieuw")}</button>
        <button className="var-knop" disabled={!gekozen || !vs.lijst[gekozen.kolom]} onClick={() => gekozen && actie("kopie", vs.lijst[gekozen.kolom])}>{t("varianten.kopie")}</button>
        <button className="var-knop" onClick={() => void plakKnop()}>{t("varianten.plakken")}</button>
        <button className="var-knop" onClick={() => setDialoog("reeks")}>{t("varianten.reeks")}</button>
        <button className="var-knop" disabled={vs.lijst.length === 0} onClick={() => setDialoog("optimaliseren")}>{t("varianten.optimaliseren")}</button>
        <button className="var-knop" onClick={() => setDialoog("velden")}>{t("varianten.invoerveld")}</button>
        <button className="var-knop" disabled={beschikbaar.length === 0} onClick={() => setDialoog("uitkomst")}>{t("varianten.uitkomstKnop")}</button>
        <label className="var-vink">
          <input type="checkbox" checked={!!vs.opPapier} onChange={(e) => zet({ ...vs, opPapier: e.target.checked || undefined })} />
          {t("varianten.opPapier")}
        </label>
        <span className="var-stand">{stand}</span>
      </div>
      <VariantenTabel
        ex={ex}
        vs={vs}
        velden={velden}
        uitkomsten={uitkomsten}
        gekozen={gekozen}
        kies={(rij, kolom) => setGekozen({ rij, kolom })}
        zet={zet}
        lees={leesCel}
        actie={actie}
      />
      <p className="var-uitleg">{t("varianten.legenda")}</p>
      {meldingen.length > 0 && (
        <div className="var-meldingen">
          {meldingen.map((m, i) => <p key={i}>{m}</p>)}
          <button className="var-knop" onClick={() => setMeldingen([])}>{t("varianten.sluiten")}</button>
        </div>
      )}
      <div className="var-onder">
        <button className="var-knop zacht" onClick={() => zet(undefined)}>{t("varianten.allesWeg")}</button>
      </div>

      {dialoog === "velden" && (
        <Modal open onClose={() => setDialoog(null)} title={t("varianten.veldenTitel")} width={620} height="80vh">
          <VeldKeuze
            velden={alleVelden}
            waarden={ex.waarden}
            gekozen={vs.velden}
            onKlaar={(n) => {
              zet(zetVelden(vs, n));
              setDialoog(null);
            }}
            onAnnuleer={() => setDialoog(null)}
          />
        </Modal>
      )}
      {dialoog === "reeks" && (
        <ReeksDialoog vs={vs} velden={velden} onSluit={() => setDialoog(null)} onKlaar={(n) => { zet(n); setDialoog(null); }} />
      )}
      {dialoog === "optimaliseren" && (
        <OptimaliseerDialoog
          ex={ex}
          vs={vs}
          velden={velden}
          onSluit={() => setDialoog(null)}
          onKlaar={(n, m) => {
            zet(n);
            setMeldingen(m);
            setDialoog(null);
          }}
        />
      )}
      {dialoog === "uitkomst" && (
        <UitkomstKeuze
          namen={beschikbaar}
          teksten={uitkomsten.blad.uitkomst?.teksten ?? {}}
          onKies={(naam) => {
            zet({ ...vs, uitkomsten: [...vs.uitkomsten, naam] });
            setDialoog(null);
          }}
          onSluit={() => setDialoog(null)}
        />
      )}
    </div>
  );
}

/** Een uitkomst erbij: elke benoemde waarde uit de uitwerking van het blad, met zijn waarde. */
function UitkomstKeuze({ namen, teksten, onKies, onSluit }: {
  namen: string[];
  teksten: Record<string, string>;
  onKies: (naam: string) => void;
  onSluit: () => void;
}) {
  const { t } = useTranslation("werkruimte");
  const [zoek, setZoek] = useState("");
  const z = zoek.trim().toLowerCase();
  return (
    <Modal open onClose={onSluit} title={t("varianten.uitkomstTitel")} width={460} height="70vh">
      <div className="var-dialoog">
        <input className="var-zoek" autoFocus placeholder={t("varianten.zoekUitkomst")} value={zoek} onChange={(e) => setZoek(e.target.value)} />
        <div className="var-uitkomsten">
          {namen.filter((n) => !z || n.toLowerCase().includes(z)).map((n) => (
            <button key={n} className="var-uitkomst-keuze" onClick={() => onKies(n)}>
              <span className="var-naam">{n}</span>
              <span className="var-huidig">{teksten[n]}</span>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
