import { Fragment, type ReactNode } from "react";
import type { Belastingklasse, Opbouw } from "../../../rapport/model";
import { inTaal } from "../../../rapport/meertalig";
import {
  categorie,
  dakQk,
  getal,
  klasse,
  PSI_WIND,
  sneeuwPlatDak,
  windLabel,
  windQp,
} from "../../../rapport/normwaarden";
import { gevelOpbouw, vlakOpbouw, vullingTekst } from "../../../rapport/opbouw";
import type { RapportWeergave } from "./useRapportWeergave";
import { Bijschrift, Cel, Eenheid, Leeg, Rij, Tekst, Vlak } from "./raster";
import { bijschriftSleutel } from "../../../rapport/tw/nummering";

/*
 * Hoofdstuk 5, Belastingen. Kolom 1 is kolom 2 van het vel (de inhoud springt
 * in); kolommen en lijnen volgen de referentie-PDF. Tekst in de tabellen
 * staat in de tabeltekstkleur, ingevulde waarden in de invoerkleur.
 */

/** 5.1 Sneeuw op een plat dak, s = μ1·Ce·Ct·sk; de tekst eronder. */
export function Sneeuw({ w }: { w: RapportWeergave }) {
  const tekst = w.rapport.teksten.sneeuw ?? "";
  return (
    <>
      <Rij>
        <Cel k={1} o>{w.t("afdruk.belastingen.platDak")}</Cel>
        <Cel k={2} o>{w.fe(sneeuwPlatDak(), "kN/m2", 2)}</Cel>
        <Cel k={3} o><Eenheid e="kN/m2" /></Cel>
      </Rij>
      {tekst.trim() && (
        <>
          <Leeg />
          <Tekst tekst={tekst} invul={w.invul} subkoppen={w.rapport.opmaak.subkoppen} />
        </>
      )}
    </>
  );
}

/**
 * 5.2 Windbelastingen. Links het gebied, de hoogte en q_p (dezelfde keten als
 * de gordingmodule); rechts per coëfficiënt P_rep = c · q_p en daaronder de
 * ψ-factoren voor wind. Zonder gebouwhoogte geen q_p en geen P_rep.
 */
export function Wind({ w }: { w: RapportWeergave }) {
  const { wind } = w.rapport.belastingen;
  const bijschrift = w.bijschriften.get(bijschriftSleutel.wind);
  const wg = klasse(w.gegevens.windgebied, 2);
  const tc = klasse(w.gegevens.terreincategorie, 2);
  const z = getal(wind.gebouwhoogte);
  const geldig = Number.isFinite(z) && z > 0;
  // z₀, z_min en v_b,0 hangen niet van de hoogte af; q_p wel.
  const u = windQp(wg, tc, geldig ? z : 0);
  const qp = geldig ? u.qp : NaN;
  const { t, f, n, fe, ne } = w;

  const links: ReactNode[] = [
    <Cel k={1} n={2}>{t("afdruk.belastingen.windgebied")}</Cel>,
    <>
      <Cel k={1} n={2} o>{t("afdruk.belastingen.terreincategorie")}</Cel>
      <Cel k={3} n={2} o>{windLabel(wg, tc, w.taal)}</Cel>
    </>,
    <>
      <Cel k={1} n={2} o>{t("afdruk.belastingen.gebouwhoogte")}</Cel>
      <Cel k={3} o>{ne(wind.gebouwhoogte, "m")}</Cel>
      <Cel k={4} o><Eenheid e="m" /></Cel>
    </>,
    <>
      <Cel k={2} o>z<sub>0</sub></Cel>
      <Cel k={3} o>{fe(u.z0, "m", 3, true)}</Cel>
      {/* Zonder eenheid zoals de referentie; omgerekend wel, anders is ft niet van m te onderscheiden. */}
      <Cel k={4} o>{w.eenheden.doel("m") && <Eenheid e="m" />}</Cel>
    </>,
    <>
      <Cel k={2} o>z<sub>min</sub></Cel>
      <Cel k={3} o>{fe(u.zmin, "m", 0)}</Cel>
      <Cel k={4} o>{w.eenheden.doel("m") && <Eenheid e="m" />}</Cel>
    </>,
    <>
      <Cel k={2} o>c<sub>s</sub>*c<sub>d</sub></Cel>
      <Cel k={3} o>{n(wind.cscd)}</Cel>
      <Cel k={4} o />
    </>,
    <>
      <Cel k={2} o>q<sub>p</sub></Cel>
      <Cel k={3} o>{fe(qp, "kN/m2", 2)}</Cel>
      <Cel k={4} o><Eenheid e="kN/m2" /></Cel>
    </>,
    <>
      <Cel k={2} o>v<sub>b,0</sub></Cel>
      <Cel k={3} o>{f(u.vb0, 1)}</Cel>
    </>,
  ];

  const rechts: ReactNode[] = [];
  rechts[0] = (
    <>
      <Cel k={6} o klasse="rpa-vet">c</Cel>
      <Cel k={7} o klasse="rpa-vet">P<sub>rep</sub></Cel>
    </>
  );
  wind.coefficienten.forEach((c, i) => {
    rechts[1 + i] = (
      <>
        <Cel k={6} o>{n(c.c)}</Cel>
        <Cel k={7} o>{fe(getal(c.c) * qp, "kN/m2", 2)}</Cel>
        <Cel k={8} o><Eenheid e="kN/m2" /></Cel>
        {c.omschrijving && <Cel k={9}>{c.omschrijving}</Cel>}
      </>
    );
  });
  // Eén lege regel tussen de coëfficiënten en de ψ-factoren.
  const psiVanaf = wind.coefficienten.length + 2;
  PSI_WIND.forEach((psi, i) => {
    rechts[psiVanaf + i] = (
      <>
        <Cel k={6} o>ψ<sub>{i}</sub></Cel>
        <Cel k={7} o>{f(psi, 1)}</Cel>
      </>
    );
  });

  const aantal = Math.max(links.length, rechts.length);
  return (
    <>
      <Bijschrift tekst={bijschrift} />
      {Array.from({ length: aantal }, (_, i) => (
        <Rij key={i} klasse="rpa-tt">
          {links[i]}
          {rechts[i]}
        </Rij>
      ))}
    </>
  );
}

/**
 * Eén belastingklasse van 5.4: vloer of dak, met rechts de ψ-factoren. Boven
 * de eerste klasse staat de normverwijzing, in de lege regel onder de kop.
 */
function KlasseRijen({ bk, eerste, w }: { bk: Belastingklasse; eerste: boolean; w: RapportWeergave }) {
  const cat = categorie(bk.categorie);
  const { t, f, n, fe, ne } = w;
  const algemeen = t("afdruk.belastingen.algemeen");
  const dakPlat = t("afdruk.belastingen.dakPlat");
  const rijen: ReactNode[] = [
    <>
      <Cel k={1} n={2} o>{t("afdruk.belastingen.klasse")}</Cel>
      <Cel k={3} n={3} o klasse="rpa-invoer">{cat ? inTaal(cat.label, w.taal) : bk.categorie}</Cel>
    </>,
  ];
  if (!cat || cat.soort === "vloer") {
    rijen.push(
      <>
        <Cel k={1} n={2} o>{algemeen} q<sub>k</sub></Cel>
        <Cel k={3} o klasse="rpa-invoer">{cat ? fe(cat.qk, "kN/m2", 2) : ""}</Cel>
        <Cel k={4} o><Eenheid e="kN/m2" /></Cel>
      </>,
    );
    if (bk.lichteScheidingswanden.trim()) {
      const ls = getal(bk.lichteScheidingswanden);
      rijen.push(
        <>
          <Cel k={1} n={2} o>{t("afdruk.belastingen.ls")}</Cel>
          <Cel k={3} o klasse="rpa-invoer">{ne(bk.lichteScheidingswanden, "kN/m2")}</Cel>
          <Cel k={4} o><Eenheid e="kN/m2" /></Cel>
        </>,
        <>
          <Cel k={1} n={2} o>{algemeen} q<sub>k</sub>+{t("afdruk.belastingen.ls")}</Cel>
          <Cel k={3} o>{cat ? fe(cat.qk + ls, "kN/m2", 2) : ""}</Cel>
          <Cel k={4} o><Eenheid e="kN/m2" /></Cel>
        </>,
      );
    }
    rijen.push(
      <>
        <Cel k={1} n={2} o>{algemeen} Q<sub>k</sub></Cel>
        <Cel k={3} o klasse="rpa-invoer">{cat ? fe(cat.Qk, "kN", 2) : ""}</Cel>
        <Cel k={4} o><Eenheid e="kN" /></Cel>
      </>,
    );
  } else {
    const alfa = getal(bk.dakhelling);
    rijen.push(
      <>
        <Cel k={1} n={2} o>{dakPlat} q<sub>k</sub></Cel>
        <Cel k={3} o klasse="rpa-invoer">{fe(cat.qk, "kN/m2", 1)}</Cel>
        <Cel k={4} o><Eenheid e="kN/m2" /></Cel>
      </>,
      <>
        <Cel k={1} n={2} o>{dakPlat} Q<sub>k</sub></Cel>
        <Cel k={3} o klasse="rpa-invoer">{fe(cat.Qk, "kN", 1)}</Cel>
        <Cel k={4} o><Eenheid e="kN" /></Cel>
      </>,
      <>
        <Cel k={1} n={2} o>{t("afdruk.belastingen.dakSchuin")}</Cel>
        <Cel k={3} o>{Number.isFinite(alfa) ? fe(dakQk(alfa), "kN/m2", 1) : ""}</Cel>
        <Cel k={4} o><Eenheid e="kN/m2" /></Cel>
      </>,
      <>
        <Cel k={1} n={2} o>{t("afdruk.belastingen.dakQlast")}</Cel>
        <Cel k={3} o>{ne(bk.qlast, "kN/m1")}</Cel>
        <Cel k={4} o><Eenheid e="kN/m1" /></Cel>
      </>,
      <>
        <Cel k={1} n={2} o>α</Cel>
        <Cel k={3} o klasse="rpa-invoer">{n(bk.dakhelling)}</Cel>
        <Cel k={4} o>°</Cel>
      </>,
    );
  }
  return (
    <>
      {!eerste && <Leeg />}
      {rijen.map((inhoud, i) => (
        <Rij key={i} klasse={i === 0 && eerste ? "rpa-tt rpa-draagt" : "rpa-tt"}>
          {inhoud}
          {cat && i < 3 && (
            <>
              <Cel k={8} o>ψ<sub>{i}</sub></Cel>
              <Cel k={9} o>{f(cat.psi[i], 1)}</Cel>
            </>
          )}
          {i === 0 && eerste && <span className="rpa-boven rpa-norm">6.3.1.2 NEN-EN 1991-1-1</span>}
        </Rij>
      ))}
    </>
  );
}

/** 5.4 Overige veranderlijke belastingen: de belastingklassen onder elkaar, met een lege regel ertussen. */
export function Veranderlijk({ w }: { w: RapportWeergave }) {
  return (
    <>
      {w.rapport.belastingen.klassen.map((bk, i) => (
        <KlasseRijen key={i} bk={bk} eerste={i === 0} w={w} />
      ))}
    </>
  );
}

/**
 * Een vlakopbouw: per laag d × ρ, of de ingevulde p; de som in kN/m². d, ρ en
 * een ingevulde p staan er zoals ze zijn ingevuld, een berekende p met twee
 * decimalen. Op de onderste laag het plusteken en de optellijn.
 */
function VlakTabel({ opbouw, w }: { opbouw: Extract<Opbouw, { soort: "vlak" }>; w: RapportWeergave }) {
  const { regels, som } = vlakOpbouw(opbouw.lagen);
  const { fe, ne } = w;
  const laatste = opbouw.lagen.length - 1;
  return (
    <>
      <Rij klasse="rpa-vet" houd>
        <Cel k={1} n={2} b o l klasse="rpa-kop-licht">{opbouw.naam}</Cel>
        <Cel k={3} b o klasse="rpa-kop-licht">d<Eenheid e="m" /></Cel>
        <Cel k={4} b o klasse="rpa-kop-licht">ρ<Eenheid e="kN/m3" /></Cel>
        <Cel k={5} n={2} b o r klasse="rpa-kop-licht">p<sub>rep</sub></Cel>
      </Rij>
      {opbouw.lagen.map((laag, i) => {
        const onderste = i === laatste;
        const p = laag.p.trim() ? ne(laag.p, "kN/m2") : fe(regels[i]?.p ?? 0, "kN/m2", 2);
        return (
          <Rij key={i}>
            <Cel k={1} n={2}>{laag.naam}</Cel>
            <Cel k={3}>{ne(laag.d, "m")}</Cel>
            <Cel k={4}>{ne(laag.rho, "kN/m3")}</Cel>
            <Cel k={5} o={onderste}>{p}</Cel>
            <Cel k={6} o={onderste}><Eenheid e="kN/m2" /></Cel>
            {onderste && <Cel k={7} o>+</Cel>}
          </Rij>
        );
      })}
      <Rij>
        <Cel k={5}>{fe(som, "kN/m2", 2)}</Cel>
        <Cel k={6}><Eenheid e="kN/m2" /></Cel>
      </Rij>
    </>
  );
}

/**
 * Een gevelopbouw: per laag q = p × h × vulling, de som in kN/m¹. p en h zoals
 * ingevuld, de vulling als percentage, q en de som met twee decimalen.
 */
function GevelTabel({ opbouw, w }: { opbouw: Extract<Opbouw, { soort: "gevel" }>; w: RapportWeergave }) {
  const { regels, som } = gevelOpbouw(opbouw.lagen);
  const { n, fe, ne } = w;
  const laatste = opbouw.lagen.length - 1;
  return (
    <>
      <Rij klasse="rpa-vet" houd>
        <Cel k={1} b o l klasse="rpa-kop-licht">{opbouw.naam}</Cel>
        <Cel k={2} b o klasse="rpa-kop-licht">p<sub>rep</sub>{w.eenheden.doel("kN/m2") && <Eenheid e="kN/m2" />}</Cel>
        <Cel k={3} b o klasse="rpa-kop-licht">h<Eenheid e="m" /></Cel>
        <Cel k={4} b o klasse="rpa-kop-licht">{w.t("afdruk.belastingen.vulling")}</Cel>
        <Cel k={5} n={2} b o r klasse="rpa-kop-licht">q<sub>rep</sub></Cel>
      </Rij>
      {opbouw.lagen.map((laag, i) => {
        const onderste = i === laatste;
        const regel = regels[i];
        return (
          <Rij key={i}>
            <Cel k={1}>{laag.naam}</Cel>
            <Cel k={2} klasse="rpa-midden">{ne(laag.p, "kN/m2")}</Cel>
            <Cel k={3}>{ne(laag.h, "m")}</Cel>
            <Cel k={4}>{n(regel ? vullingTekst(regel.vulling) : laag.vulling)}</Cel>
            <Cel k={5} o={onderste}>{regel ? fe(regel.q, "kN/m1", 2) : ""}</Cel>
            <Cel k={6} o={onderste}><Eenheid e="kN/m1" /></Cel>
            {onderste && <Cel k={7} o>+</Cel>}
          </Rij>
        );
      })}
      <Rij>
        <Cel k={5}>{fe(som, "kN/m1", 2)}</Cel>
        <Cel k={6}><Eenheid e="kN/m1" /></Cel>
      </Rij>
    </>
  );
}

/**
 * Een groep van 5.5 (VLOER, DAKEN of WANDEN): een donkere kop met een lijn
 * over de volle breedte erboven, dan de opbouwen met telkens een lege regel
 * ertussen. `direct`: de kop staat direct onder de paragraafkop en krijgt dan
 * geen extra lege regel boven zich.
 */
export function Groep({ titel, opbouwen, direct, inspringen, w }: {
  titel: string; opbouwen: Opbouw[]; direct: boolean; inspringen: 0 | 1; w: RapportWeergave;
}) {
  const tabellen = opbouwen.map((o, i) => (
    <Fragment key={i}>
      {i > 0 && <Leeg />}
      <Bijschrift tekst={w.bijschriften.get(bijschriftSleutel.opbouw(o.naam))} />
      {o.soort === "vlak" ? <VlakTabel opbouw={o} w={w} /> : <GevelTabel opbouw={o} w={w} />}
    </Fragment>
  ));
  return (
    <>
      <Rij klasse={direct ? "rpa-groep rpa-direct" : "rpa-groep"} houd>
        <Cel k={1 + inspringen} n={2} klasse="rpa-kop-donker">{titel}</Cel>
      </Rij>
      {inspringen ? <Vlak klasse="rpa-in">{tabellen}</Vlak> : tabellen}
    </>
  );
}
