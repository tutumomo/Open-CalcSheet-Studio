import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { RAPPORT_ID, useProjectStore } from "../../store/projectStore";
import { useInhoudPaginas } from "../../store/inhoudPaginas";
import { inhoudVoorPaneel } from "../../rapport/opzet";
import { bladVoorOpzet } from "./bladSoorten";

/**
 * De inhoud van het rapport in het zijpaneel, zodat je tijdens het werken de nummers al ziet: de
 * hoofdstukken, paragrafen, bladen en bijlagen volgen elke wijziging meteen. Een klik opent het
 * blad of het rapport.
 *
 * Paginanummers ontstaan pas bij het verdelen over vellen, en dat kost te veel om bij elke
 * toetsaanslag te doen. Die komen dus uit het laatste afdrukvoorbeeld van het rapport.
 */
export default function InhoudLijst() {
  const { t } = useTranslation("werkruimte");
  const rapport = useProjectStore((s) => s.rapport);
  const exemplaren = useProjectStore((s) => s.exemplaren);
  const activeId = useProjectStore((s) => s.activeId);
  const selecteer = useProjectStore((s) => s.selecteer);
  const paginas = useInhoudPaginas((s) => s.paginas);
  const regels = useMemo(() => inhoudVoorPaneel(rapport, exemplaren.map((e) => bladVoorOpzet(e))), [rapport, exemplaren]);
  const heeftPaginas = regels.some((r) => paginas[r.anker] !== undefined);
  // De bladen staan onderaan de lijst: het blad waar je aan werkt, schuift in beeld.
  const gekozen = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    gekozen.current?.scrollIntoView({ block: "nearest" });
  }, [activeId]);
  return (
    <>
      {regels.map((r) => (
        <button
          key={r.anker}
          ref={r.bladId && r.bladId === activeId ? gekozen : undefined}
          type="button"
          className={`pb-rij pb-inhoud pb-inhoud-${r.niveau}${r.bladId && r.bladId === activeId ? " gekozen" : ""}`}
          title={`${r.nummer} ${r.titel}`}
          onClick={() => selecteer(r.bladId ?? RAPPORT_ID)}
        >
          <span className="pb-inhoud-nummer">{r.nummer}</span>
          <span className="pb-naam">{r.titel}</span>
          {paginas[r.anker] !== undefined && <span className="pb-teller">{paginas[r.anker]}</span>}
        </button>
      ))}
      {!heeftPaginas && <p className="pb-leeg">{t("browser.inhoudZonderPaginas")}</p>}
    </>
  );
}
