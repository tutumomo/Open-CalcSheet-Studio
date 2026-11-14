import { useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import { useEditorViewStore } from "../../store/editorViewStore";
import { useActieveBron, useZetActieveBron } from "../../store/actiefBlad";
import { useZoom } from "../../hooks/useZoom";
import { bronNaBewerking, codeInTaal } from "../../templates/vertalingen";
import type { CodeStand } from "./uitvoerTaal";
import { ifcCalcLang } from "./ifcCalcLanguage";
import "./Editor.css";

const BASE_FONT_PX = 13;

/*
 * De tab Code toont de rekentekst in de taal van de app. De tekst in het project blijft
 * de bron (zie uitvoerTaal.ts): de rekenversie en de beelden lezen die, dus alleen kijken
 * verandert niets. Typen gaat regel voor regel terug in de bron.
 */
export default function Editor() {
  const source = useActieveBron();
  const setSource = useZetActieveBron();
  const { i18n } = useTranslation();
  const taal = i18n.language;
  const { ref, zoom } = useZoom();

  // Wat er net getypt is. Blijft de bron daarbij horen, dan blijft ook de tekst in de editor
  // staan: opnieuw opbouwen zou de cursor verplaatsen.
  const getypt = useRef<(CodeStand & { taal: string }) | null>(null);
  // De stand voordat de bewerking begon: typen en weer weghalen geeft die bron terug.
  const schoon = useRef<(CodeStand & { taal: string }) | null>(null);
  const code = useMemo(() => {
    const g = getypt.current;
    // De editor kent alleen \n; anders zou elke keer opnieuw alles worden vervangen.
    return g && g.bron === source && g.taal === taal ? g.code : codeInTaal(source, taal).replace(/\r\n?/g, "\n");
  }, [source, taal]);
  if (getypt.current?.bron !== source || getypt.current.taal !== taal) {
    getypt.current = null;
    schoon.current = { bron: source, code, taal };
  }
  const stand = useRef<CodeStand>({ bron: source, code });
  stand.current = { bron: source, code };

  // Het lint voegt in op de cursor; daarvoor moet het deze editor kennen.
  const eigenView = useRef<EditorView | null>(null);
  const onCreateEditor = useCallback((view: EditorView) => {
    eigenView.current = view;
    useEditorViewStore.getState().setView(view);
  }, []);
  useEffect(() => () => {
    if (useEditorViewStore.getState().view === eigenView.current) {
      useEditorViewStore.getState().setView(null);
    }
  }, []);

  const onChange = useCallback(
    (value: string) => {
      const nu = stand.current;
      if (value === nu.code) return;
      const bron = bronNaBewerking(nu.bron, nu.code, value, schoon.current ?? undefined);
      getypt.current = { bron, code: value, taal };
      if (bron !== nu.bron) setSource(bron);
    },
    [setSource, taal],
  );

  return (
    <div
      className="calc-editor"
      ref={ref}
      style={{ ["--cm-font-size" as string]: `${BASE_FONT_PX * zoom}px` }}
    >
      <CodeMirror
        value={code}
        extensions={[ifcCalcLang(), EditorView.lineWrapping]}
        onChange={onChange}
        onCreateEditor={onCreateEditor}
        basicSetup={{
          // Geen eigen geschiedenis: ongedaan maken loopt via de projectstore,
          // zodat Ctrl+Z hetzelfde doet of je nu in de tekst typt, een maat in
          // het beeld versleept of een blad hernoemt. Twee stapels naast elkaar
          // geeft anders een onvoorspelbare volgorde.
          history: false,
          historyKeymap: false,
          lineNumbers: true,
          highlightActiveLineGutter: true,
          highlightActiveLine: true,
          foldGutter: true,
          bracketMatching: true,
        }}
      />
    </div>
  );
}
