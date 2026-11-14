# MCP-server: de app bedienen met een AI-assistent

De desktop-app heeft een ingebouwde MCP-server (Model Context Protocol). Een
AI-assistent, bijvoorbeeld Claude Code, kan daarmee met het open project
werken: alles wat de gebruiker in de app kan, van project openen en opslaan tot
bladen toevoegen, invoer zetten, doorrekenen, exporteren en afdrukken. Op
dezelfde brug draait een REST-API met precies dezelfde functies: zie
[api.md](api.md).

## Aanzetten en vinden

De server staat **standaard aan** en start vanzelf met de app. Alles staat in
**Instellingen › API en AI-assistent**:

| Instelling | Standaard | Toelichting |
|---|---|---|
| Server aan (MCP en REST-API) | aan | Uit = de app luistert op geen enkele poort. |
| Poort | **3879** | Vaste, hoge poort (Open Planner Studio gebruikt 3877). Na een wijziging de client opnieuw instellen. |
| Adres | `http://127.0.0.1:3879/mcp` | Alleen op deze computer bereikbaar. |
| Token | bij de eerste start gemaakt | 64 hextekens. Tonen, kopiëren en "Nieuw token" (verbreekt bestaande koppelingen). |
| Alleen lezen | uit | Lezen en doorrekenen mag; project, instellingen en bestanden wijzigen niet. |
| Pauzeren | uit | Tijdelijk (tot de app sluit): elke tool geeft een melding in plaats van een antwoord. |
| REST-API | — | Basisadres `http://127.0.0.1:3879/api/v1`, OpenAPI en een curl-voorbeeld om te kopiëren. |

De tab werkt direct, buiten Opslaan en Annuleren om. De statusbalk toont de
toestand klein rechtsonder: `MCP: live`, `uit`, `poort bezet`, `fout`, met
"gepauzeerd" of "alleen lezen" erachter als dat zo staat. In een gewone
browser (`npm run dev` zonder Tauri) bestaat de server niet; de app toont dan
"alleen desktop".

De instellingen staan in `preferences.json` in de app-gegevensmap
(`%APPDATA%\studio.openstructuralcalculation.app\` op Windows) onder
`mcpAan`, `mcpPoort`, `mcpToken` en `mcpAlleenLezen`.

## Verbinden

Op de tab staan beide regels kant-en-klaar, met het juiste token en de juiste
poort, en een knop Kopiëren.

**Claude Code** (de header moet achteraan: `--header` neemt meerdere waarden):

```
claude mcp add --transport http --scope user open-calcsheet-studio http://127.0.0.1:3879/mcp --header "Authorization: Bearer <token>"
```

**JSON** voor clients die een `mcpServers`-blok lezen:

```json
{
  "mcpServers": {
    "open-calcsheet-studio": {
      "type": "http",
      "url": "http://127.0.0.1:3879/mcp",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}
```

De app moet draaien om bereikbaar te zijn. Het token staat in deze regels in
leesbare tekst: deel ze niet.

## Tools

56 tools; beschrijvingen en veldnamen zijn Engels (de client vertaalt zelf).
De volledige lijst met argumenten en de bijbehorende REST-routes staat in
[api.md](api.md#routes). In het kort:

| Onderwerp | Tools |
|---|---|
| App | `app_info` |
| Project | `project_get`, `project_new`, `project_open`, `project_save`, `project_save_as`, `recent_files`, `project_set_name`, `project_set_data`, `project_set_visibility`, `session_new`, `session_close` |
| Rapport | `report_get`, `report_set` |
| Geschiedenis | `undo`, `redo` |
| Modules | `modules_list`, `module_schema`, `library_list`, `library_install`, `library_remove` |
| Bladen | `sheets_list`, `sheet_add`, `sheet_add_pdf`, `sheet_get`, `sheet_set_source`, `sheet_set_input`, `sheet_set_pdf`, `sheet_set_markdown`, `sheet_set_graph`, `sheet_set_drawing`, `sheet_set_spreadsheet`, `sheet_set_jupyter`, `sheet_set_marimo`, `sheet_rename`, `sheet_duplicate`, `sheet_move`, `sheet_remove`, `sheet_select`, `sheet_evaluate`, `sheet_insert_formula` |
| Rekenen | `calc_evaluate`, `calc_evaluate_batch`, `job_start`, `job_status`, `job_cancel` |
| Formules | `formulas_list`, `formula_get` |
| Export en afdrukken | `ifc_get`, `export_ifc`, `export_pdf`, `print` |
| Weergave en instellingen | `view_get`, `view_set`, `settings_get`, `settings_set` |

`id` is een blad-id uit `project_get` of `sheets_list`. Elke wijziging van het
project loopt via de bestaande acties van de projectstore: ze staat in de
geschiedenis (Ctrl+Z, of `undo`) en zet het project op "niet opgeslagen".
Opslaan blijft een aparte stap (`project_save`). Waar de app een vraag stelt
(wijzigingen weggooien bij nieuw of openen) weigert de tool met `CONFLICT`,
tenzij `force: true`.

`sheet_add` maakt elke soort blad: `kind` kiest `calculation` (standaard),
`markdown` (`text`), `graph` (`graph`), `drawing` (`paper`, `orientation`),
`spreadsheet` (XLSX als `path` of `base64`), `jupyter` (ZIP-werkmap) of
`marimo` (`code`, een `.py` met `marimo.App()`). `sheet_get` geeft van elke
soort de inhoud; `full: true` geeft bij een tekenblad het hele vel met de
vormen en bij Marimo de bewaarde uitvoer per cel. De `sheet_set_*`-tools
vervangen die inhoud en lopen net als de rest via de geschiedenis.

Doorrekenen gaat synchroon via dezelfde route als de afdruk (inlezen met de
includes, `evaluate` met de invoer van het blad en de projectgegevens als
scope, `leesResultaat`/`leesGetallen`), niet via de rekenworker van de
werkruimte. Een UC in `project_get` is "bekend" als het blad via deze server is
doorgerekend en de invoer sindsdien niet veranderde.

Een fout komt terug als toolresultaat met `isError: true` en een code:
`VALIDATION`, `NOT_FOUND`, `CONFLICT`, `READ_ONLY`, `PAUSED`, `CALC_ERROR`,
`UNIT_WARNING`, `NOT_AVAILABLE` of `INTERNAL`. Een PDF schrijven naar een pad kan alleen met de
rapportengine; anders opent `print` de printdialoog (zie
[api.md](api.md#wat-er-niet-helemaal-kan)).

Elke regel uit `calc_evaluate` (en uit `sheet_evaluate` met `lines: true`) is
machineleesbaar: `name`, `expr`, `value`, `unit`, `si_value`/`si_unit`, `clause`
(het normartikel dat de bron op die regel noemt), en `check` met `pass`, `fail`
of `unchecked`, plus `uc` bij een UC. Een `@toets`- of `@fem`-blok zonder
antwoord is altijd `unchecked`, nooit `pass`. `conventionalUnits: true` geeft
daarnaast de gebruikelijke eenheid waar die bestaat (`kN/mm^2` → `MPa`,
`tf/m^2` → `kPa`). Een gebroken exponent in de dimensie (`R^(2/3)` → `m^0.667`)
geeft een waarschuwing in `warnings[]` met code, regel en naam; met `strict:
true` is zo'n waarschuwing een fout (`UNIT_WARNING`).

`module_schema` geeft van een module de invoervelden (naam, label, eenheid,
standaard, keuzes), de normen en artikelen die de tekst noemt, en per veld de
regels die het vergelijken (`guards`). De rekentaal kent geen vaste min/max;
de tool verzint ze dus niet.

Een begrensde lus: `#while voorwaarde max=N` stopt na N rondes, en
`#iterate x tol=… max=…` (standaard `tol=1e-9`, `max=100`) herhaalt tot
|x_k − x_(k−1)| ≤ tol (in SI). Haalt de lus zijn grens zonder klaar te zijn,
dan staat er een regel met `code: "NOT_CONVERGED"` (met `iterations`, `max`,
`condition` of `name`/`tol`/`residual`), komt hij in `notConverged[]` en is
het oordeel `check: "unchecked"`. `#while` zonder `max=` werkt als voorheen.

`calc_evaluate_batch` rekent meerdere teksten in één verzoek (elk item zoals
`calc_evaluate`, fouten per item). Voor werk langer dan de time-out van de brug
(120 s): `job_start` geeft meteen een `jobId`, `job_status` de voortgang en
antwoorden, `job_cancel` stopt na het lopende item. Jobs staan alleen in het
geheugen van de app.

## Hoe het werkt

```
AI-client ──POST /mcp──────▶ Rust-brug (127.0.0.1:3879) ──event mcp://request──▶ webview
script    ──/api/v1/…──────▶                            ◀─event mcp://response──  src/mcp/
```

- **Rust** (`packages/desktop/src-tauri/src/mcp_bridge.rs`): een dun
  `tiny_http`-doorgeefluik zonder MCP-kennis. Bindt uitsluitend op 127.0.0.1,
  controleert het Bearer-token in constante tijd (401), weigert elk request met
  een `Origin`-header (403, tegen DNS-rebinding vanuit een browser), alleen
  `POST /mcp` en `/api/v1/…` (GET/POST/PUT/PATCH/DELETE; anders 405/404),
  body hooguit 50 MiB (413), requests strikt na elkaar, time-out 120 s (504).
  Een REST-request gaat met `kind: "rest"`, methode en pad naar de webview; de
  status die de webview kiest gaat terug. Alleen `GET /api/v1/openapi.json` mag
  zonder token. Elk antwoord met `Connection: close`. Commando's
  `mcp_bridge_start` / `mcp_bridge_stop`, status-event `mcp://status`.
- **TypeScript** (`packages/desktop/src/mcp/`):
  - `requestHandler.ts` — sessies volgens MCP streamable HTTP
    (`Mcp-Session-Id`: `initialize` geeft er een, zonder sessie 400, onbekend
    404) en een wachtrij;
  - `dispatcher.ts` — JSON-RPC (`initialize`, `ping`, `tools/list`,
    `tools/call`, notificaties); `rest.ts` — de REST-routes;
    `openapi.ts` — de OpenAPI-specificatie;
  - `uitvoeren.ts` — één tool uitvoeren (schema, pauze, alleen-lezen), voor
    MCP en REST;
  - `tools.ts` — de registry (`tools/project.ts`, `tools/bladen.ts`,
    `tools/overig.ts`), op een `McpOmgeving` (`omgeving.ts` koppelt die aan de
    stores en de Tauri-plugins); `rekenen.ts` — het synchrone doorrekenen;
  - `appKoppeling.ts` — weergave en thema uit de state van App, voor
    `view_get`/`view_set`/`settings_set`;
  - `brug.ts` — instellingen, starten/stoppen, de events; `useMcpBrug.ts` —
    de hook in `App.tsx` die de brug bij het opstarten start;
  - `koppeling.ts` — standaardpoort, adres, token, client-configuratie;
  - `status.ts` + `McpStatusItem.tsx` — de toestand en de statusbalk.
  - De instellingentab: `components/settings/McpTab.tsx`.

Herkomst: de Rust-brug en de opzet van de TS-laag komen uit Open Planner Studio
(OpenAEC Foundation, LGPL-3.0-or-later), ingekort tot wat deze app nodig heeft.

## Controle

- `node scripts/check-mcp.mjs` en `node scripts/check-api.mjs` (ook in
  `npm run check`): koppeling, dispatcher, schema, sessies, de REST-routes en
  statussen, de OpenAPI-specificatie, alle tools op een nagebouwde app
  (`scripts/lib/mcpproef.mjs`), MCP en REST gelijk, pauze en alleen-lezen —
  zonder webview.
- `cargo test --lib mcp_bridge` in `packages/desktop/src-tauri`: token
  (constante tijd), Origin, loopback-adres, sessie-id, antwoorden, welke paden
  REST zijn, de openbare specificatie, REST-statussen.
  Op Windows start een Tauri-testbinary zonder common-controls-manifest niet
  (`STATUS_ENTRYPOINT_NOT_FOUND`); zet dan een extern manifest met
  `Microsoft.Windows.Common-Controls` 6.0 naast een kopie van de testbinary.
