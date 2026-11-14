import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { getSetting } from "../store";

// English
import enCommon from "./locales/en/common.json";
import enRibbon from "./locales/en/ribbon.json";
import enBackstage from "./locales/en/backstage.json";
import enSettings from "./locales/en/settings.json";
import enFeedback from "./locales/en/feedback.json";
import enWerkruimte from "./locales/en/werkruimte.json";
import enRapport from "./locales/en/rapport.json";
import enRekentaal from "./locales/en/rekentaal.json";
import enBeelden from "./locales/en/beelden.json";
import enTekenen from "./locales/en/tekenen.json";
import enLibrary from "./locales/en/library.json";
import enGewichten from "./locales/en/gewichten.json";
import enAi from "./locales/en/ai.json";
// Dutch
import nlCommon from "./locales/nl/common.json";
import nlRibbon from "./locales/nl/ribbon.json";
import nlBackstage from "./locales/nl/backstage.json";
import nlSettings from "./locales/nl/settings.json";
import nlFeedback from "./locales/nl/feedback.json";
import nlWerkruimte from "./locales/nl/werkruimte.json";
import nlRapport from "./locales/nl/rapport.json";
import nlRekentaal from "./locales/nl/rekentaal.json";
import nlBeelden from "./locales/nl/beelden.json";
import nlTekenen from "./locales/nl/tekenen.json";
import nlLibrary from "./locales/nl/library.json";
import nlGewichten from "./locales/nl/gewichten.json";
import nlAi from "./locales/nl/ai.json";
// 台灣版（zh-TW）
import twCommon from "./locales/zh-TW/common.json";
import twRibbon from "./locales/zh-TW/ribbon.json";
import twBackstage from "./locales/zh-TW/backstage.json";
import twSettings from "./locales/zh-TW/settings.json";
import twFeedback from "./locales/zh-TW/feedback.json";
import twWerkruimte from "./locales/zh-TW/werkruimte.json";
import twRapport from "./locales/zh-TW/rapport.json";
import twRekentaal from "./locales/zh-TW/rekentaal.json";
import twBeelden from "./locales/zh-TW/beelden.json";
import twTekenen from "./locales/zh-TW/tekenen.json";
import twLibrary from "./locales/zh-TW/library.json";
import twGewichten from "./locales/zh-TW/gewichten.json";
import twAi from "./locales/zh-TW/ai.json";

export const LANGUAGES = [
  { code: "auto", name: "Auto-detect" },
  { code: "zh-TW", name: "繁體中文" },
  { code: "en", name: "English" },
  { code: "nl", name: "Nederlands" },
];

/**
 * 台灣版：預設語言直接為繁體中文（zh-TW）。
 * 若設定中選 "auto"，則自動跟隨系統語言。
 */
export const STANDAARD_TAAL = "zh-TW";

// Van de sjabloon: common, ribbon, backstage, settings, feedback. Van deze app:
// werkruimte (project, panelen, modulekiezer), rapport (het rapportpaneel),
// rekentaal (tab Rekentaal, taalreferentie, editor), beelden (parametrische beelden)
// tekenen (tab Tekenen, de tekeneditor), library (de Library in het projectpaneel) en
// gewichten (de gewichtenbibliotheek) en ai (de AI-zijbalk).
const ns = ["common", "ribbon", "backstage", "settings", "feedback", "werkruimte", "rapport", "rekentaal", "beelden", "tekenen", "library", "gewichten", "ai"];

i18next
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        common: enCommon, ribbon: enRibbon, backstage: enBackstage, settings: enSettings, feedback: enFeedback,
        werkruimte: enWerkruimte, rapport: enRapport, rekentaal: enRekentaal, beelden: enBeelden, tekenen: enTekenen, library: enLibrary,
        gewichten: enGewichten, ai: enAi,
      },
      nl: {
        common: nlCommon, ribbon: nlRibbon, backstage: nlBackstage, settings: nlSettings, feedback: nlFeedback,
        werkruimte: nlWerkruimte, rapport: nlRapport, rekentaal: nlRekentaal, beelden: nlBeelden, tekenen: nlTekenen, library: nlLibrary,
        gewichten: nlGewichten, ai: nlAi,
      },
      // 台灣版
      "zh-TW": {
        common: twCommon, ribbon: twRibbon, backstage: twBackstage, settings: twSettings, feedback: twFeedback,
        werkruimte: twWerkruimte, rapport: twRapport, rekentaal: twRekentaal, beelden: twBeelden, tekenen: twTekenen, library: twLibrary,
        gewichten: twGewichten, ai: twAi,
      },
    },
    ns,
    // Meteen in de standaardtaal beginnen; de bewaarde keuze volgt hieronder.
    lng: STANDAARD_TAAL,
    defaultNS: "common",
    fallbackLng: "zh-TW",
    interpolation: { escapeValue: false },
    detection: {
      order: ["navigator"],
      caches: [],
    },
  });

i18next.on("languageChanged", (lng) => {
  document.documentElement.setAttribute("lang", lng);
});

// Load saved language from Tauri store on startup
getSetting("language", STANDAARD_TAAL).then((lang) => {
  changeLanguage(lang);
});

export function changeLanguage(lang: string) {
  if (lang === "auto") {
    const raw = typeof navigator !== "undefined" ? (navigator.language || "zh-TW") : "zh-TW";
    const supported = Object.keys(i18next.options.resources || {});
    // 優先精確匹配（例如 zh-TW），次之依語系前綴（例如 zh 匹配 zh-TW）
    const matched =
      supported.find((s) => s.toLowerCase() === raw.toLowerCase()) ||
      (raw.startsWith("zh") ? supported.find((s) => s.startsWith("zh")) : undefined) ||
      supported.find((s) => s === raw.split("-")[0]);
    const finalLang = matched || STANDAARD_TAAL;
    return i18next.changeLanguage(finalLang);
  }
  return i18next.changeLanguage(lang);
}

export default i18next;
