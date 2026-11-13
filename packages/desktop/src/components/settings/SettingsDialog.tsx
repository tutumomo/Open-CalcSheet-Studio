import { useState, useEffect, useRef, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { LANGUAGES, STANDAARD_TAAL, changeLanguage } from "../../i18n/config";
import { getSetting, setSetting } from "../../store";
import Modal from "../Modal";
import ThemedSelect from "../ThemedSelect";
import BureauTab from "../rapport/BureauTab";
import McpTab from "./McpTab";
import ErpnextTab, { type ErpnextConcept } from "./ErpnextTab";
import { useBureauStore } from "../../store/bureauProfiel";
import { leegBureau, type BureauProfiel } from "../../rapport/model";
import {
  ERPNEXT_STANDAARD,
  bewaarErpnextInstellingen,
  heeftErpnextGeheim,
  leesErpnextInstellingen,
  zetErpnextGeheim,
} from "../../tauri/erpnext";
import { geheimActies } from "../../tauri/erpnextGeheim";
import { version as pakketVersie } from "../../../package.json";
import "../ThemedSelect.css";
import "./SettingsDialog.css";
import { femStudioLicentie, femStudioStatus, type FemLicentie, type FemStatus } from "../../rekenen/femStudio";

const THEME_OPTIONS = [
  { value: "light",               labelKey: "appearance.light",             swatches: ["#F1EEEA", "#FFFFFF", "#D97706", "#2A2A32"] },
  { value: "dark",                labelKey: "appearance.dark",              swatches: ["#2A2A32", "#33333C", "#D97706", "#EDEBE8"] },
  { value: "blueprint",           labelKey: "appearance.blueprint",         swatches: ["#0A1320", "#0F1B2D", "#60A5FA", "#E0E7FF"] },
  { value: "high-contrast-dark",  labelKey: "appearance.highContrastDark",  swatches: ["#000000", "#000000", "#F59E0B", "#FFFFFF"] },
  { value: "high-contrast-light", labelKey: "appearance.highContrastLight", swatches: ["#FFFFFF", "#FFFFFF", "#92400E", "#000000"] },
];

/** Het 0.4-thema bij een opgeslagen waarde, ook voor de namen van eerdere versies. */
export function themeId(theme?: string): string {
  const eerder: Record<string, string> = { forge: "dark", openaec: "dark", contrast: "high-contrast-dark" };
  const id = eerder[theme ?? ""] ?? theme ?? "light";
  return THEME_OPTIONS.some((o) => o.value === id) ? id : "light";
}

/* ─── Tab configuratie ──────────────────────────────────────
   Pas deze array aan voor jouw project.
   Voeg domein-specifieke tabs toe, verwijder wat je niet nodig hebt.

   Voorbeeld met domein-tab:
     const TAB_IDS = ["general", "appearance", "calculation", "about"] as const;
   ─────────────────────────────────────────────────────────── */
// "mcp": API en AI-assistent (McpTab.tsx). Die tab werkt direct, niet via Opslaan.
// "erpnext": de koppeling met ERPNext (ErpnextTab.tsx), wel via Opslaan.
const TAB_IDS = ["general", "appearance", "units", "bureau", "mcp", "erpnext", "about"] as const;

const LEEG_ERPNEXT: ErpnextConcept = { instellingen: ERPNEXT_STANDAARD, geheim: "", wissen: false };

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Een waarschuwing in een venster van het systeem; mislukt dat, dan alleen in de console. */
async function toonMelding(tekst: string): Promise<void> {
  try {
    const { message } = await import("@tauri-apps/plugin-dialog");
    await message(tekst, { kind: "warning" });
  } catch (err) {
    console.warn("Melding niet getoond:", err);
  }
}

/** Persisted under the "units" settings key. Defaults match the calculation language. */
export interface UnitsSettings {
  angleMode: "deg" | "rad" | "gra";
  defaultLength: "mm" | "cm" | "m";
  defaultForce: "N" | "kN" | "MN";
  defaultStress: "Pa" | "kPa" | "MPa" | "GPa" | "N/mm^2";
  returnAngleUnits: boolean;
  /**
   * Het eenhedenstelsel voor een nieuw project (store/projectEenheden.ts). Het stelsel
   * zelf hoort bij het project; dit is alleen de standaard. defaultLength, defaultForce en
   * defaultStress blijven voor de API, maar het stelsel vervangt ze.
   */
  stelsel?: "blad" | "si-mm" | "si-m" | "us" | "tw-mks";
}

export const UNITS_DEFAULTS: UnitsSettings = {
  angleMode: "rad",
  defaultLength: "mm",
  defaultForce: "kN",
  defaultStress: "MPa",
  returnAngleUnits: false,
  stelsel: "blad",
};

export function applyTheme(theme?: string) {
  document.documentElement.setAttribute("data-oa-theme", themeId(theme));
}

/** Tekstgrootte van de Blueprint (`data-oa-text`): compact, standaard of groot. */
const TEXT_SIZES = ["compact", "standard", "large"] as const;

export function applyTextSize(size?: string) {
  const el = document.documentElement;
  if (size === "compact" || size === "large") el.setAttribute("data-oa-text", size);
  else el.removeAttribute("data-oa-text");
}

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  theme: string;
  onThemeChange: (theme: string) => void;
  /** De tab die bij openen voorop staat; standaard "general". */
  startTab?: string;
}

export default function SettingsDialog({
  open,
  onClose,
  theme,
  onThemeChange,
  startTab,
}: SettingsDialogProps) {
  const { t } = useTranslation("settings");
  const { t: tCommon } = useTranslation("common");
  const [activeTab, setActiveTab] = useState("general");

  // Draft state — only committed on Save
  const [draftTheme, setDraftTheme] = useState(theme);
  const [draftLang, setDraftLang] = useState(STANDAARD_TAAL);
  const [draftText, setDraftText] = useState("standard");
  const [draftUnits, setDraftUnits] = useState<UnitsSettings>(UNITS_DEFAULTS);
  const [draftBureau, setDraftBureau] = useState<BureauProfiel>(leegBureau);
  const [draftErpnext, setDraftErpnext] = useState<ErpnextConcept>(LEEG_ERPNEXT);
  const [heeftGeheim, setHeeftGeheim] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  // Snapshot of original values when dialog opens, for reverting on Cancel
  const originalTheme = useRef(theme);
  const originalLang = useRef("");
  const originalText = useRef("standard");
  const originalUnits = useRef<UnitsSettings>(UNITS_DEFAULTS);
  const originalBureau = useRef<BureauProfiel>(leegBureau());
  // Pas na het lezen bewaren: anders wist een snelle klik op Opslaan adres en sleutel.
  const erpnextGelezen = useRef(false);
  // Het bewaarde adres van het openen: Opslaan wist daarvan het geheim als de herkomst wisselt.
  const erpnextBewaardAdres = useRef("");
  // Wat Opslaan voor ERPNext nog doet. Openen wacht daarop, zodat het de bewaarde stand
  // en de juiste status van het geheim toont.
  const erpnextBezig = useRef<Promise<unknown>>(Promise.resolve());

  // Reset draft to current values when dialog opens
  useEffect(() => {
    if (open) {
      setActiveTab(startTab ?? "general");
      originalTheme.current = theme;
      setDraftTheme(theme);
      getSetting("language", STANDAARD_TAAL).then((lang) => {
        originalLang.current = lang;
        setDraftLang(lang);
      });
      getSetting("textSize", "standard").then((size) => {
        originalText.current = size;
        setDraftText(size);
      });
      getSetting<UnitsSettings>("units", UNITS_DEFAULTS).then((u) => {
        originalUnits.current = u;
        setDraftUnits(u);
      });
      // Het bureauprofiel staat al in het geheugen: store/bureauProfiel.ts leest
      // het bij het opstarten uit de instellingen. Hier dus geen getSetting.
      const profiel = useBureauStore.getState().profiel;
      originalBureau.current = profiel;
      setDraftBureau(profiel);
      // Het geheim zelf komt nooit terug uit de sleutelbos; alleen of het er is (hieronder).
      setDraftErpnext(LEEG_ERPNEXT);
      setHeeftGeheim(false);
      erpnextGelezen.current = false;
      erpnextBezig.current
        .then(leesErpnextInstellingen)
        .then((w) => {
          erpnextGelezen.current = true;
          erpnextBewaardAdres.current = w.adres;
          setDraftErpnext({ instellingen: w, geheim: "", wissen: false });
        });
    }
  }, [open, theme, startTab]);

  // Het geheim hoort bij het adres: na elke wijziging van het adres opnieuw vragen of er
  // een is, even na het typen, en alleen het laatste antwoord telt.
  const erpnextAdres = draftErpnext.instellingen.adres;
  useEffect(() => {
    if (!open) return;
    let actueel = true;
    const timer = window.setTimeout(() => {
      erpnextBezig.current
        .then(() => heeftErpnextGeheim(erpnextAdres))
        .then((ja) => {
          if (actueel) setHeeftGeheim(ja);
        });
    }, 300);
    return () => {
      actueel = false;
      window.clearTimeout(timer);
    };
  }, [open, erpnextAdres]);

  // Live theme preview — apply immediately when the user picks one in the dropdown.
  // Saved only on Save; reverted on Cancel.
  const handleThemePreview = (value: string) => {
    setDraftTheme(value);
    applyTheme(value);
  };

  // Tekstgrootte direct zichtbaar, net als het thema.
  const handleTextPreview = (value: string) => {
    setDraftText(value);
    applyTextSize(value);
  };

  // Live language preview — switch i18n immediately on selection.
  const handleLangPreview = (value: string) => {
    setDraftLang(value);
    changeLanguage(value);
  };

  // Cancel — discard all draft changes, revert live preview
  const handleCancel = () => {
    setDraftTheme(originalTheme.current);
    applyTheme(originalTheme.current);
    setDraftLang(originalLang.current);
    changeLanguage(originalLang.current);
    setDraftText(originalText.current);
    applyTextSize(originalText.current);
    setDraftUnits(originalUnits.current);
    setDraftBureau(originalBureau.current);
    // Een getypt geheim blijft niet in het geheugen staan.
    setDraftErpnext(LEEG_ERPNEXT);
    onClose();
  };

  // Save — commit all draft changes
  const handleSave = () => {
    onThemeChange(draftTheme);
    applyTheme(draftTheme);
    setSetting("theme", draftTheme);

    applyTextSize(draftText);
    setSetting("textSize", draftText);

    setSetting("language", draftLang);
    changeLanguage(draftLang);

    setSetting("units", draftUnits);
    window.dispatchEvent(new CustomEvent("units-changed", { detail: draftUnits }));

    // De store bewaart het profiel zelf in de instellingen. Een constructeursregel
    // zonder naam, telefoon en e-mail is een vergeten lege rij: die valt weg.
    useBureauStore.getState().zetProfiel({
      ...draftBureau,
      constructeurs: draftBureau.constructeurs.filter(
        (c) => c.naam.trim() !== "" || c.telefoon.trim() !== "" || c.email.trim() !== "",
      ),
    });

    // Adres, sleutel en veld gaan naar de instellingen; het geheim alleen naar de
    // sleutelbos, bij het adres van nu, en alleen als er een nieuw is getypt of Wissen is
    // gekozen. Een fout komt in een melding. Het volgende openen wacht op beide.
    const erpnext = draftErpnext;
    const geheim = erpnext.geheim.trim();
    const instellingenBewaard = erpnextGelezen.current
      ? bewaarErpnextInstellingen(erpnext.instellingen).catch((fout) => {
          void toonMelding(t("erpnext.bewarenMislukt", { fout: String(fout) }));
        })
      : Promise.resolve();
    const acties = geheimActies(erpnextBewaardAdres.current, erpnext.instellingen.adres, geheim, erpnext.wissen);
    const geheimFout = (fout: unknown) => {
      void toonMelding(t("erpnext.geheimMislukt", { fout: String(fout) }));
    };
    // Eerst het geheim van de oude herkomst wissen, dan het nieuwe bewaren.
    const geheimBewaard = isTauri()
      ? (async () => {
          if (acties.wisVoor !== undefined) await zetErpnextGeheim(acties.wisVoor, "");
          if (acties.bewaarVoor !== undefined) await zetErpnextGeheim(acties.bewaarVoor, geheim);
        })().catch(geheimFout)
      : Promise.resolve();
    erpnextBezig.current = Promise.all([instellingenBewaard, geheimBewaard]).then(() => {
      // De kaartkiezer leest instellingen en geheim opnieuw, ook als het paneel openstaat.
      window.dispatchEvent(new CustomEvent("erpnext-changed"));
    });
    setDraftErpnext(LEEG_ERPNEXT);

    onClose();
  };

  // Reset to defaults — resets draft values (still requires Save to apply)
  const handleReset = () => {
    setConfirmResetOpen(true);
  };

  const handleConfirmReset = () => {
    setDraftTheme("light");
    applyTheme("light");
    setDraftLang(STANDAARD_TAAL);
    changeLanguage("auto");
    setDraftText("standard");
    applyTextSize("standard");
    setDraftUnits(UNITS_DEFAULTS);
    // Het bureauprofiel blijft staan: dat zijn bureaugegevens, geen voorkeur.
    // Voor de huisstijl heeft de tab Bureau een eigen knop "Standaard huisstijl".
    // De ERPNext-koppeling blijft om dezelfde reden staan.
    setConfirmResetOpen(false);
  };

  const footer = (
    <>
      <button className="settings-btn settings-btn-secondary" onClick={handleReset}>
        {t("resetToDefaults")}
      </button>
      <div className="settings-footer-right">
        <button className="settings-btn settings-btn-secondary" onClick={handleCancel}>
          {tCommon("cancel")}
        </button>
        <button className="settings-btn settings-btn-primary" onClick={handleSave}>
          {tCommon("save")}
        </button>
      </div>
    </>
  );

  return (
    <>
    <Modal open={open} onClose={handleCancel} title={t("title")} width={680} height={560} className="settings-dialog" footer={footer}>
      <div className="settings-body">
        <div className="settings-sidebar">
          {TAB_IDS.map((id) => (
            <button
              key={id}
              className={`settings-tab${activeTab === id ? " active" : ""}`}
              onClick={() => setActiveTab(id)}
            >
              {t(`tabs.${id}`)}
            </button>
          ))}
        </div>

        <div className="settings-content">
          {activeTab === "general" && (
            <GeneralTabContent lang={draftLang} onLangChange={handleLangPreview} />
          )}
          {activeTab === "appearance" && (
            <AppearanceTabContent
              theme={draftTheme}
              onThemeSelect={handleThemePreview}
              textSize={draftText}
              onTextSizeSelect={handleTextPreview}
            />
          )}
          {activeTab === "units" && (
            <UnitsTabContent units={draftUnits} onChange={setDraftUnits} />
          )}
          {activeTab === "bureau" && (
            <BureauTab profiel={draftBureau} onChange={setDraftBureau} />
          )}
          {activeTab === "mcp" && <McpTab />}
          {activeTab === "erpnext" && (
            <ErpnextTab
              concept={draftErpnext}
              onChange={setDraftErpnext}
              heeftGeheim={heeftGeheim}
              desktop={isTauri()}
            />
          )}
          {activeTab === "about" && <AboutTabContent />}
        </div>
      </div>
    </Modal>

    <Modal
      open={confirmResetOpen}
      onClose={() => setConfirmResetOpen(false)}
      title={t("resetToDefaults")}
      width={340}
      footer={
        <>
          <button className="settings-btn settings-btn-secondary" onClick={() => setConfirmResetOpen(false)}>
            {tCommon("cancel")}
          </button>
          <button className="settings-btn settings-btn-primary" onClick={handleConfirmReset}>
            {t("resetToDefaults")}
          </button>
        </>
      }
    >
      <div style={{ padding: 12, fontSize: 12 }}>{t("resetConfirm")}</div>
    </Modal>
    </>
  );
}

/* ─── General Tab ───────────────────────────────────────────
   Taalselectie werkt out-of-the-box.
   Pas de overige secties aan of verwijder ze naar behoefte.
   ─────────────────────────────────────────────────────────── */
function GeneralTabContent({
  lang,
  onLangChange,
}: {
  lang: string;
  onLangChange: (value: string) => void;
}) {
  const { t } = useTranslation("settings");

  return (
    <div className="settings-section">
      <h3>{t("general.application")}</h3>
      <div className="settings-row">
        <span className="settings-label">{t("general.language")}</span>
        <ThemedSelect
          value={lang}
          options={LANGUAGES.map((l) => ({ value: l.code, label: l.name }))}
          onChange={onLangChange}
          style={{ width: 180 }}
        />
      </div>
    </div>
  );
}

/* ─── Appearance Tab ────────────────────────────────────────
   Themaselectie werkt out-of-the-box.
   ─────────────────────────────────────────────────────────── */
function AppearanceTabContent({
  theme,
  onThemeSelect,
  textSize,
  onTextSizeSelect,
}: {
  theme: string;
  onThemeSelect: (value: string) => void;
  textSize: string;
  onTextSizeSelect: (value: string) => void;
}) {
  const { t } = useTranslation("settings");
  return (
    <>
      <div className="settings-section">
        <h3>{t("appearance.theme")}</h3>
        <ThemeDropdown theme={theme} onThemeSelect={onThemeSelect} />
      </div>
      <div className="settings-section">
        <h3>{t("appearance.uiFontSize")}</h3>
        <div className="settings-row">
          <span className="settings-label">{t("appearance.textSize")}</span>
          <ThemedSelect
            value={textSize}
            options={TEXT_SIZES.map((v) => ({ value: v, label: t(`appearance.text.${v}`) }))}
            onChange={onTextSizeSelect}
            style={{ width: 180 }}
          />
        </div>
      </div>
    </>
  );
}

function ThemeDropdown({
  theme,
  onThemeSelect,
}: {
  theme: string;
  onThemeSelect: (value: string) => void;
}) {
  const { t } = useTranslation("settings");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const selected = THEME_OPTIONS.find((o) => o.value === theme) || THEME_OPTIONS[0];

  const swatchRow = (swatches: string[]) => (
    <div className="theme-dropdown-swatches">
      {swatches.map((color, i) => (
        <span key={i} className="theme-dropdown-swatch" style={{ backgroundColor: color } as CSSProperties} />
      ))}
    </div>
  );

  return (
    <div className="theme-dropdown" ref={ref}>
      <button className="theme-dropdown-trigger" onClick={() => setOpen(!open)}>
        {swatchRow(selected.swatches)}
        <span className="theme-dropdown-label">{t(selected.labelKey)}</span>
        <svg className="theme-dropdown-chevron" width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2.5 4L5 6.5L7.5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="theme-dropdown-menu">
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`theme-dropdown-item${theme === opt.value ? " active" : ""}`}
              onClick={() => { onThemeSelect(opt.value); setOpen(false); }}
            >
              {swatchRow(opt.swatches)}
              <span className="theme-dropdown-label">{t(opt.labelKey)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Units Tab ─────────────────────────────────────────────
   Mirrors the `#deg`/`#rad`/`#gra` switches of the language plus default display
   units. Saved values are picked up by the evaluator (angle mode) and
   shown in the preview.
   ─────────────────────────────────────────────────────────── */
function UnitsTabContent({
  units,
  onChange,
}: {
  units: UnitsSettings;
  onChange: (next: UnitsSettings) => void;
}) {
  const { t } = useTranslation("settings");
  const patch = (partial: Partial<UnitsSettings>) => onChange({ ...units, ...partial });
  return (
    <div className="settings-section">
      <h3>{t("units.angle")}</h3>
      <div className="settings-row">
        <span className="settings-label">{t("units.angleMode")}</span>
        <ThemedSelect
          value={units.angleMode}
          options={[
            { value: "deg", label: t("units.deg") },
            { value: "rad", label: t("units.rad") },
            { value: "gra", label: t("units.gra") },
          ]}
          onChange={(v) => patch({ angleMode: v as UnitsSettings["angleMode"] })}
          style={{ width: 180 }}
        />
      </div>
      <div className="settings-row">
        <span className="settings-label">{t("units.returnAngleUnits")}</span>
        <input
          type="checkbox"
          checked={units.returnAngleUnits}
          onChange={(e) => patch({ returnAngleUnits: e.target.checked })}
        />
      </div>

      <h3 style={{ marginTop: 16 }}>{t("units.defaults")}</h3>
      <div className="settings-row">
        <span className="settings-label">{t("units.stelsel")}</span>
        <ThemedSelect
          value={units.stelsel ?? "blad"}
          options={[
            { value: "blad", label: t("units.stelsels.blad") },
            { value: "si-mm", label: "SI (mm)" },
            { value: "si-m", label: "SI (m)" },
            { value: "us", label: "US customary" },
            { value: "tw-mks", label: "Taiwan MKS" },
          ]}
          onChange={(v) => patch({ stelsel: v as UnitsSettings["stelsel"] })}
          style={{ width: 200 }}
        />
      </div>
      <p className="settings-description">{t("units.stelselHint")}</p>
    </div>
  );
}

// ─── About Tab ───────────────────────────────────────────────
// Pas naam, versie en beschrijving aan via i18n keys
// in locales/{lang}/settings.json, sectie "about"
// ─────────────────────────────────────────────────────────────
function AboutTabContent() {
  const { t } = useTranslation("settings");
  const [versie, setVersie] = useState(pakketVersie);
  // FEM Studio pas vragen als deze tab opent: de vraag start de server.
  const [fem, setFem] = useState<FemStatus | null>(null);
  const [femLicentie, setFemLicentie] = useState<FemLicentie | null>(null);
  useEffect(() => {
    import("@tauri-apps/api/app")
      .then(({ getVersion }) => getVersion())
      .then(setVersie)
      .catch(() => {});
    let weg = false;
    femStudioStatus().then((s) => {
      if (!weg) setFem(s);
    });
    femStudioLicentie().then((l) => {
      if (!weg) setFemLicentie(l);
    });
    return () => {
      weg = true;
    };
  }, []);
  const femTekst = !fem
    ? t("about.femStudioBezig")
    : fem.beschikbaar
      ? fem.versie || "?"
      : t(`about.femStudioNiet.${fem.code ?? "startMislukt"}`);
  // De bron hoort bij één versie: alleen tonen bij de server die meegeleverd is.
  const femBron = fem?.beschikbaar && femLicentie?.adres && femLicentie.versie === fem.versie ? femLicentie.adres : null;
  const femBijlage = fem?.beschikbaar ? femLicentie?.licentie ?? null : null;
  const openBron = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!femBron) return;
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(femBron);
    } catch {
      window.open(femBron, "_blank", "noopener,noreferrer");
    }
  };
  const toonBijlage = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!femBijlage) return;
    try {
      const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
      await revealItemInDir(femBijlage);
    } catch {
      // Zonder de map blijft het pad in de tooltip staan.
    }
  };
  return (
    <div className="settings-section">
      <h3>{t("about.appName")}</h3>
      <div style={{ fontSize: "var(--oa-size-body)", lineHeight: 1.8 }}>
        <p><strong>{t("about.version")}:</strong> {versie}</p>
        <p title={fem?.reden ?? fem?.pad ?? undefined}><strong>{t("about.femStudio")}:</strong> {femTekst}</p>
        {fem?.beschikbaar && (
          <p>
            <strong>{t("about.femLicentie")}:</strong> {t("about.femLicentieTekst")}
            {femBron && (
              <>
                {" "}
                <a href={femBron} onClick={openBron} title={femLicentie?.bron ?? undefined}>{t("about.femBron")}</a>
              </>
            )}
            {femBijlage && (
              <>
                {" "}
                <a href="#" onClick={toonBijlage} title={femBijlage}>{t("about.femBijlagen")}</a>
              </>
            )}
          </p>
        )}
        <p><strong>{t("about.framework")}:</strong> Tauri + React + TypeScript</p>
        <p><strong>{t("about.license")}:</strong> LGPL-3.0</p>
        <p style={{ marginTop: 8, color: "var(--theme-dialog-content-secondary)" }}>
          {t("about.description")}
        </p>
      </div>
    </div>
  );
}
