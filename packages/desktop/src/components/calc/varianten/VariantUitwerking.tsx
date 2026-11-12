import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useProjectStore, type Exemplaar } from "../../../store/projectStore";
import { ExemplaarContext } from "../../../store/actiefBlad";
import { projectScope } from "../../../store/projectGegevens";
import { evalOptiesVan } from "../../../store/projectEenheden";
import { variantInvoer, type Variant } from "../../../store/varianten";
import { metToetsingen } from "../../../rekenen/toetsCache";
import { useToetsVersie } from "../../../rekenen/femToetsing";
import { isCanvasBlad } from "../../../store/canvasBlad";
import { rekenBladDoor, zorgVoorKernstijlen } from "../bladDoorrekenen";
import { designerVoor } from "../designerKeuze";
import { UitwerkingHtml } from "../UitwerkingHtml";
import { CanvasVellen, Oordeel } from "../PrintBlad";
import { ucTekst } from "../bladLezen";

/**
 * De volledige uitwerking van één variant, alleen lezen: het parametrische beeld en de
 * uitwerking, zoals de afdruk ze rekent. Een ander id dan het blad, zodat de UC in de
 * projectboom die van het blad blijft.
 */
export default function VariantUitwerking({ ex, variant, onTerug }: { ex: Exemplaar; variant: Variant; onTerug: () => void }) {
  const { t, i18n } = useTranslation("werkruimte");
  const gegevens = useProjectStore((s) => s.gegevens);
  const exemplaren = useProjectStore((s) => s.exemplaren);
  const toetsV = useToetsVersie();
  useEffect(() => zorgVoorKernstijlen(), []);
  const virtueel = useMemo<Exemplaar>(() => {
    const { varianten, ...rest } = ex;
    return {
      ...rest,
      id: `${ex.id}~${variant.id}`,
      naam: `${ex.naam} – ${variant.naam}`,
      waarden: variantInvoer(ex.waarden, variant, varianten?.velden ?? []),
    };
  }, [ex, variant]);
  const blad = useMemo(
    () => rekenBladDoor(virtueel, projectScope(gegevens), i18n.language, metToetsingen(evalOptiesVan(gegevens), "lezen", i18n.language), exemplaren),
    // toetsV: een nieuw antwoord van FEM Studio
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [virtueel, gegevens, exemplaren, i18n.language, toetsV],
  );
  const beeld = designerVoor(ex.source);
  return (
    <div className="var-uitwerking">
      <div className="var-uitwerking-kop">
        <button className="var-knop" onClick={onTerug}>{t("varianten.terug")}</button>
        <b>{virtueel.naam}</b>
        <span className="var-uitwerking-oordeel">
          {blad.resultaat.uc !== null && <span>UC {ucTekst(blad.resultaat.uc, i18n.language)}</span>}
          <Oordeel r={blad.resultaat} />
        </span>
      </div>
      <div className="var-uitwerking-papier" data-oa-theme="light">
        {beeld && (
          <div className="print-beeld">
            <ExemplaarContext.Provider value={{ exemplaar: virtueel, alleenLezen: true }}>{beeld}</ExemplaarContext.Provider>
          </div>
        )}
        {isCanvasBlad(ex) && blad.eenheden ? <CanvasVellen eenheden={blad.eenheden} bladId={virtueel.id} /> : <UitwerkingHtml html={blad.html} bladId={virtueel.id} />}
      </div>
    </div>
  );
}
