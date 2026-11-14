import { useRef } from "react";
import { useTranslation } from "react-i18next";
import DocumentSectie from "./paneel/DocumentSectie";
import HoofdstukTeksten from "./paneel/HoofdstukTeksten";
import UitgangspuntenSectie from "./paneel/UitgangspuntenSectie";
import BelastingenSectie from "./paneel/BelastingenSectie";
import BerekeningenSectie from "./paneel/BerekeningenSectie";
import BijlagenSectie from "./paneel/BijlagenSectie";
import BureauSectie from "./paneel/BureauSectie";
import RevisieSectie from "./paneel/RevisieSectie";
import TwSectie from "./paneel/TwSectie";
import { useProjectStore } from "../../store/projectStore";
import { OpzetBron } from "./paneel/velden";
import "./RapportPanel.css";

/**
 * Het rapportpaneel: één scrollend formulier met alles wat in het
 * constructierapport komt en niet al in de projectgegevens of de rekenbladen
 * staat.
 *
 * Wat je hier invult hoort bij het project: het gaat mee in het
 * projectbestand en in ongedaan maken. Grijze waarden volgen uit de
 * projectgegevens of de norm en worden pas bij het opmaken berekend, zodat
 * rapport en rekenbladen nooit uit de pas lopen. De tab Afdrukvoorbeeld
 * ernaast toont het hele rapport.
 */

/** De secties in volgorde, voor de sprongbalk bovenaan: id en sleutel van het label. */
const SECTIES: readonly [id: string, sleutel: string][] = [
  ["document", "secties.document"],
  ["revisies", "secties.revisies"],
  ["teksten", "secties.tekstenKort"],
  ["uitgangspunten", "secties.uitgangspunten"],
  ["belastingen", "secties.belastingen"],
  ["berekeningen", "secties.berekeningen"],
  ["bijlagen", "secties.bijlagen"],
  ["bureau", "secties.bureau"],
];

export default function RapportPanel() {
  const { t } = useTranslation("rapport");
  const paneelRef = useRef<HTMLDivElement>(null);
  // De Taiwanese kop- en voetgegevens horen bij een Taiwanees rapport; een
  // Europees rapport heeft ze niet en ziet de sectie dus niet.
  const taiwan = useProjectStore((s) => s.rapport.opzetSoort === "tw");
  const secties = taiwan ? [...SECTIES, ["tw", "secties.tw"] as const] : SECTIES;

  const naarSectie = (id: string) =>
    paneelRef.current
      ?.querySelector(`[data-sectie="${id}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="rapport-panel" ref={paneelRef}>
      <div className="rapport-kop">
        <h1>{t("paneel.titel")}</h1>
        <p>{t("paneel.intro")}</p>
      </div>

      <nav className="rapport-nav" aria-label={t("paneel.navLabel")}>
        {secties.map(([id, sleutel]) => (
          <button key={id} type="button" onClick={() => naarSectie(id)}>
            {t(sleutel)}
          </button>
        ))}
      </nav>

      <OpzetBron>
        <DocumentSectie />
        <RevisieSectie />
        <HoofdstukTeksten />
        <UitgangspuntenSectie />
        <BelastingenSectie />
        <BerekeningenSectie />
        <BijlagenSectie />
        {taiwan && <TwSectie />}
        <BureauSectie />
      </OpzetBron>

      <p className="rapport-voet">{t("paneel.voet")}</p>
    </div>
  );
}
