import { useTranslation } from "react-i18next";
import { useProjectStore } from "../store/projectStore";
import { usePrintStore } from "../store/printStore";
import { useAppVersie } from "../hooks/useAppVersie";
import McpStatusItem from "../mcp/McpStatusItem";
import "./StatusBar.css";

export default function StatusBar() {
  const { t } = useTranslation();
  // Eén bron voor het versienummer: de release-tag uit `app_kenmerken`.
  const { label: versieLabel } = useAppVersie();
  const aantalBladen = useProjectStore((s) => s.exemplaren.length);
  // Zonder printdialoog zie je hier dat de PDF wordt gemaakt, en waar hij is gebleven.
  const pdfPad = usePrintStore((s) => s.pdfPad);
  const pdfGeschreven = usePrintStore((s) => s.pdfGeschreven);
  const stand = pdfPad
    ? t("werkruimte:pdf.schrijven")
    : pdfGeschreven
      ? t("werkruimte:pdf.geschreven", { bestand: pdfGeschreven.split(/[\\/]/).pop() })
      : t("ready");

  return (
    <div className="status-bar">
      <div className="status-bar-left">
        <div className="status-item" title={pdfPad ?? pdfGeschreven ?? undefined}>
          <span className="status-item-label">{stand}</span>
        </div>
        <div className="status-separator" />
        <div className="status-item">
          <span className="status-item-label">{t("werkruimte:browser.bladen")}:</span>
          <span className="status-item-value">{aantalBladen}</span>
        </div>
      </div>

      <div className="status-bar-center">
        <span className="status-item-label" style={{ fontSize: "11px" }}>
          {t("appName")} v{versieLabel}
        </span>
      </div>

      <div className="status-bar-right">
        <McpStatusItem />
        <div className="status-separator" />
        <div className="status-item">
          <span className="status-item-label">{t("zoom")}:</span>
          <span className="status-item-value">100%</span>
        </div>
      </div>
    </div>
  );
}
