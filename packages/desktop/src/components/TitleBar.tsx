import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAfdrukken } from "../store/printStore";
import { useProjectStore } from "../store/projectStore";
import { useBestandActies } from "../hooks/useBestandActies";
import Icoon from "./Icoon";
import "./TitleBar.css";

interface TitleBarProps {
  onSettingsClick?: () => void;
  onFeedbackClick?: () => void;
  /** De AI-zijbalk openen of sluiten (store/aiStore.ts). */
  onAiClick?: () => void;
  aiOpen?: boolean;
}

function TitleBar({ onSettingsClick, onFeedbackClick, onAiClick, aiOpen = false }: TitleBarProps) {
  const { t } = useTranslation();
  const { t: tw } = useTranslation("werkruimte");
  const { t: tai } = useTranslation("ai");
  const afdrukken = useAfdrukken();
  const { opslaan } = useBestandActies();
  const ongedaan = useProjectStore((s) => s.ongedaan);
  const opnieuw = useProjectStore((s) => s.opnieuw);
  const kanOngedaan = useProjectStore((s) => s.verleden.length > 0);
  const kanOpnieuw = useProjectStore((s) => s.toekomst.length > 0);
  const projectNaam = useProjectStore((s) => s.projectNaam);
  const [isMaximized, setIsMaximized] = useState(false);
  const [appVersion, setAppVersion] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const appWindowRef = useRef<any>(null);

  const getWindow = useCallback(async () => {
    if (!appWindowRef.current) {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      appWindowRef.current = getCurrentWindow();
    }
    return appWindowRef.current;
  }, []);

  useEffect(() => {
    import("@tauri-apps/api/app")
      .then(({ getVersion }) => getVersion())
      .then(setAppVersion)
      .catch(() => setAppVersion(""));
  }, []);

  const updateMaximizedState = useCallback(async () => {
    try {
      const win = await getWindow();
      const maximized = await win.isMaximized();
      setIsMaximized(maximized);
    } catch { /* not in Tauri */ }
  }, [getWindow]);

  useEffect(() => {
    updateMaximizedState();

    let cleanup: (() => void) | undefined;
    getWindow()
      .then((win) => win.onResized(() => updateMaximizedState()))
      .then((unlisten) => { cleanup = unlisten; })
      .catch(() => {});

    return () => { cleanup?.(); };
  }, [updateMaximizedState, getWindow]);

  const handleMinimize = async () => (await getWindow()).minimize();
  const handleMaximize = async () => (await getWindow()).toggleMaximize();
  const handleClose = async () => (await getWindow()).close();

  const handleDoubleClick = async (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".titlebar-button")) return;
    (await getWindow()).toggleMaximize();
  };

  return (
    <div className="titlebar" onDoubleClick={handleDoubleClick}>
      <div className="titlebar-drag" data-tauri-drag-region />

      <div className="titlebar-left">
        <div className="titlebar-icon" aria-label="Open CalcSheet Studio">
          <svg width="20" height="20" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
            <rect x="2" y="2" width="60" height="60" rx="12" fill="var(--theme-bg-lighter, #36363E)" />
            <rect x="2" y="2" width="60" height="3" rx="1.5" fill="var(--theme-accent, #D97706)" />
            {/* Isometric open building block — echoes OpenAEC parent brand */}
            <g stroke="var(--theme-accent, #D97706)" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" fill="none">
              <path d="M14 22 L14 46 L26 52 L26 28 Z" opacity="0.95" />
              <path d="M14 22 L24 18 L36 24 L26 28" opacity="0.55" />
            </g>
            {/* Sigma (Σ) as triangulated truss — calculation summation */}
            <g stroke="#F59E0B" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" fill="none">
              <path d="M34 22 L50 22 L40 33 L50 44 L34 44" />
            </g>
            {/* Truss joint nodes */}
            <g fill="#FAFAF9">
              <circle cx="34" cy="22" r="1.4" />
              <circle cx="50" cy="22" r="1.4" />
              <circle cx="40" cy="33" r="1.4" />
              <circle cx="50" cy="44" r="1.4" />
              <circle cx="34" cy="44" r="1.4" />
            </g>
            <line x1="14" y1="54" x2="50" y2="54" stroke="#FAFAF9" strokeWidth="0.9" opacity="0.45" />
            <text x="50" y="60" fontFamily="JetBrains Mono, monospace" fontSize="6.5" fontWeight="500" fill="#FAFAF9" opacity="0.85" textAnchor="end" letterSpacing="0.05em">= Σ</text>
          </svg>
        </div>

        <div className="titlebar-quick-access">
          <button className="titlebar-quick-btn" title={`${t("save")} (Ctrl+S)`} aria-label={t("save")} tabIndex={-1} onClick={() => void opslaan()}>
            <Icoon id="file.save" />
          </button>
          <button className="titlebar-quick-btn" title={`${t("undo")} (Ctrl+Z)`} aria-label={t("undo")} tabIndex={-1} disabled={!kanOngedaan} onClick={ongedaan}>
            <Icoon id="edit.undo" />
          </button>
          <button className="titlebar-quick-btn" title={`${t("redo")} (Ctrl+Y)`} aria-label={t("redo")} tabIndex={-1} disabled={!kanOpnieuw} onClick={opnieuw}>
            <Icoon id="edit.redo" />
          </button>
          <button className="titlebar-quick-btn" title={`${t("print")} (Ctrl+P)`} aria-label={t("print")} tabIndex={-1} onClick={afdrukken}>
            <Icoon id="file.print" />
          </button>
          {/* De AI-zijbalk heeft geen eigen icoon in de Blueprint-sprites; het woord
              "AI" is hier duidelijker dan een algemeen icoon. */}
          <button
            className={`titlebar-quick-btn titlebar-ai-btn${aiOpen ? " actief" : ""}`}
            title={tai("knop")}
            aria-label={tai("knop")}
            aria-pressed={aiOpen}
            tabIndex={-1}
            onClick={() => onAiClick?.()}
          >
            {tai("knopKort")}
          </button>
          <button className="titlebar-quick-btn" title={t("preferences")} aria-label={t("preferences")} tabIndex={-1} onClick={() => onSettingsClick?.()}>
            <Icoon id="ui.settings" />
          </button>
        </div>
      </div>

      {/* Het projectbestand en het programma, zoals in de Blueprint-schil. Of
          het bestand is opgeslagen, staat in de documentbalk. */}
      <span className="titlebar-title" data-tauri-drag-region>
        {`${projectNaam || tw("bestand.naamloos")}.ifccalculation — ${t("appName")}`}
        {appVersion && <span className="titlebar-version">v{appVersion}</span>}
      </span>

      <div className="titlebar-controls">
        <button className="send-feedback-btn" onClick={() => onFeedbackClick?.()} tabIndex={-1}>
          {t("sendFeedback")}
        </button>
        <button className="titlebar-button titlebar-minimize" onClick={handleMinimize} aria-label={t("minimize")} tabIndex={-1}>
          <Icoon id="window.minimize" />
        </button>
        <button
          className="titlebar-button titlebar-maximize"
          onClick={handleMaximize}
          aria-label={isMaximized ? t("restore") : t("maximize")}
          tabIndex={-1}
        >
          <Icoon id={isMaximized ? "window.restore" : "window.maximize"} />
        </button>
        <button className="titlebar-button titlebar-close" onClick={handleClose} aria-label={t("close")} tabIndex={-1}>
          <Icoon id="window.close" />
        </button>
      </div>
    </div>
  );
}

export default TitleBar;
