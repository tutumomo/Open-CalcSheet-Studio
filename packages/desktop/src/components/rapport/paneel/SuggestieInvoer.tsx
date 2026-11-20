import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import type { TwSuggestieOptie } from "../../../rapport/tw/materialen";

export interface SuggestieInvoerProps {
  waarde: string;
  opties: readonly TwSuggestieOptie[];
  onWijzig: (waarde: string) => void;
  placeholder?: string;
  className?: string;
  uitlijnen?: "links" | "rechts";
  knopTitel?: string;
}

/**
 * 可輸入亦可展開下拉清單的儲存格輸入元件：解決原生 <datalist> 在欄位已有文字時
 * 只篩選出單一項目的限制。點右側「▾」展開時顯示該材料／緊結件種類的完整選項；
 * 直接打字時依關鍵字與說明即時過濾，無符合項則自動隱藏，不阻礙自由輸入。
 */
export default function SuggestieInvoer({
  waarde,
  opties,
  onWijzig,
  placeholder,
  className,
  uitlijnen = "links",
  knopTitel,
}: SuggestieInvoerProps) {
  const [open, setOpen] = useState(false);
  const [toonAlle, setToonAlle] = useState(false);
  const [actief, setActief] = useState(-1);
  const houderRef = useRef<HTMLDivElement>(null);
  const invoerRef = useRef<HTMLInputElement>(null);
  const lijstRef = useRef<HTMLDivElement>(null);

  const zoek = waarde.trim().toLowerCase();
  const zichtbaar = toonAlle || zoek === ""
    ? opties
    : opties.filter(
        (o) =>
          o.waarde.toLowerCase().includes(zoek) ||
          (o.toelichting ?? "").toLowerCase().includes(zoek),
      );

  const kies = (nieuw: string) => {
    onWijzig(nieuw);
    setOpen(false);
    setActief(-1);
  };

  useEffect(() => {
    if (!open || actief < 0) return;
    const item = lijstRef.current?.children.item(actief) as HTMLElement | null;
    item?.scrollIntoView({ block: "nearest" });
  }, [open, actief]);

  const opBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setOpen(false);
      setActief(-1);
    }
  };

  const opKnopKlik = () => {
    invoerRef.current?.focus();
    if (open && toonAlle) {
      setOpen(false);
      setActief(-1);
      return;
    }
    const huidige = opties.findIndex((o) => o.waarde === waarde);
    setToonAlle(true);
    setOpen(true);
    setActief(huidige >= 0 ? huidige : 0);
  };

  const opToets = (e: KeyboardEvent<HTMLInputElement>) => {
    // 防止注音／中文輸入法組字選字時按 Enter 誤觸套用選項
    if (e.nativeEvent.isComposing) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        const huidige = opties.findIndex((o) => o.waarde === waarde);
        setToonAlle(true);
        setOpen(true);
        setActief(huidige >= 0 ? huidige : 0);
      } else if (zichtbaar.length > 0) {
        setActief((prev) => (prev + 1) % zichtbaar.length);
      }
    } else if (e.key === "ArrowUp") {
      if (open && zichtbaar.length > 0) {
        e.preventDefault();
        setActief((prev) => (prev <= 0 ? zichtbaar.length - 1 : prev - 1));
      }
    } else if (e.key === "Enter") {
      if (open && actief >= 0 && actief < zichtbaar.length) {
        e.preventDefault();
        kies(zichtbaar[actief].waarde);
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setActief(-1);
      }
    }
  };

  const menuZichtbaar = open && zichtbaar.length > 0;

  return (
    <div ref={houderRef} className="rapport-suggestie" onBlur={opBlur}>
      <input
        ref={invoerRef}
        type="text"
        value={waarde}
        placeholder={placeholder}
        className={className}
        role="combobox"
        aria-expanded={menuZichtbaar}
        aria-autocomplete="list"
        onChange={(e) => {
          onWijzig(e.target.value);
          setToonAlle(false);
          setOpen(true);
          setActief(-1);
        }}
        onKeyDown={opToets}
      />
      <button
        type="button"
        tabIndex={-1}
        className="rapport-suggestie-knop"
        title={knopTitel}
        aria-label={knopTitel}
        onMouseDown={(e) => e.preventDefault()}
        onClick={opKnopKlik}
      >
        ▾
      </button>
      {menuZichtbaar && (
        <div
          ref={lijstRef}
          role="listbox"
          className={`rapport-suggestie-lijst${uitlijnen === "rechts" ? " rapport-suggestie-rechts" : ""}`}
        >
          {zichtbaar.map((o, i) => {
            const geselecteerd = o.waarde === waarde;
            const isActief = i === actief;
            return (
              <button
                key={o.waarde}
                type="button"
                role="option"
                aria-selected={geselecteerd}
                className={`rapport-suggestie-item${isActief ? " is-actief" : ""}${geselecteerd ? " is-geselecteerd" : ""}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  kies(o.waarde);
                }}
              >
                <span className="rapport-suggestie-waarde">{o.waarde}</span>
                {o.toelichting && <span className="rapport-suggestie-uitleg">{o.toelichting}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
