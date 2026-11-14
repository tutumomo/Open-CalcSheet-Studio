# REST-API

Naast de MCP-server (`POST /mcp`, zie [mcp.md](mcp.md)) heeft de desktop-app
een REST-API: dezelfde functies als JSON over HTTP, voor scripts en andere
programma's. Beide draaien op **dezelfde brug**: zelfde poort (standaard
3879), zelfde Bearer-token, alleen op 127.0.0.1, zelfde Origin-weigering en
zelfde alleen-lezen/pauze uit **Instellingen › API en AI-assistent**.

De **AI-zijbalk** in de app roept dezelfde tools aan, maar dan in-process:
geen HTTP, geen token. Wat hier staat, kan de assistent dus ook, en andersom
(zie [mcp.md](mcp.md) en [tw/AI助理.md](tw/AI助理.md)). Voor de REST-API is de
zijbalk zelf geen route.

- Basisadres: `http://127.0.0.1:3879/api/v1`
- OpenAPI 3.1: `http://127.0.0.1:3879/api/v1/openapi.json`
- Header: `Authorization: Bearer <token>` (het token staat op de tab)
- Zonder token: `GET /api/v1/health` (zie hieronder)

### `GET /api/v1/health` — editie en versie zonder token

Deze route is de enige naast `openapi.json` die **geen** Bearer-token vraagt,
zodat een client eerst kan vaststellen welke app er op de poort luistert
(bijvoorbeeld de TW-editie naast een upstream-installatie). Het antwoord bevat
geen sleutels of projectgegevens:

```json
{
  "status": "ok",
  "name": "Open CalcSheet Studio",
  "edition": "tw",
  "version": "2026.46.1",
  "tag": "2026.46.1-tw.1",
  "commit": "1bec4a3",
  "buildDate": "2026-11-14",
  "port": 3879,
  "api": "/api/v1"
}
```

Dezelfde kenmerken staan in het antwoord van de tool `app_info`
(`GET /api/v1/info`), naast de bestaande velden.

**Alle functies.** Elke REST-route en elke MCP-tool is dezelfde tool uit één
registry (`packages/desktop/src/mcp/tools.ts`), uitgevoerd via dezelfde code
(`uitvoeren.ts`). Een nieuwe tool komt daardoor vanzelf in MCP, REST,
`GET /api/v1/tools` en de OpenAPI-specificatie. Elke tool is ook aan te roepen
als `POST /api/v1/tools/{naam}` met de MCP-argumenten als body.

## Voorbeelden (curl)

In Windows PowerShell `curl.exe` in plaats van `curl`. `$T` is het token.

```sh
T=<token>
API=http://127.0.0.1:3879/api/v1

# Het open project: projectgegevens en bladen
curl -H "Authorization: Bearer $T" $API/project

# Gevolgklasse CC3 en windgebied I
curl -X PATCH -H "Authorization: Bearer $T" -H "Content-Type: application/json" \
  -d '{"values": {"CC": "CC3", "windgebied": "1"}}' $API/project/gegevens

# Een ligger toevoegen (201 met de id en de invoervelden)
curl -X POST -H "Authorization: Bearer $T" -H "Content-Type: application/json" \
  -d '{"templateId": "ligger", "name": "Ligger dak"}' $API/sheets

# Invoer zetten en doorrekenen
curl -X PATCH -H "Authorization: Bearer $T" -H "Content-Type: application/json" \
  -d '{"values": {"materiaal": "Staal"}}' $API/sheets/<id>/inputs
curl -X POST -H "Authorization: Bearer $T" -H "Content-Type: application/json" \
  -d '{"names": ["UC_max"]}' $API/sheets/<id>/evaluate

# Een losse berekening, zonder het project te raken
curl -X POST -H "Authorization: Bearer $T" -H "Content-Type: application/json" \
  -d '{"source": "q = 5 kN/m\nL = 6 m\nM = q*L^2/8"}' $API/evaluate

# Een formule uit de formulebibliotheek zoeken en in een blad zetten
curl -H "Authorization: Bearer $T" "$API/formulas?query=moment&includeCode=true"
curl -X POST -H "Authorization: Bearer $T" -H "Content-Type: application/json" \
  -d '{"formulaId": "<formule-id>", "position": "end"}' $API/sheets/<id>/formulas

# Een PDF-blad uit een bestand
curl -X POST -H "Authorization: Bearer $T" -H "Content-Type: application/json" \
  -d '{"path": "C:/projecten/hal/fem-rapport.pdf"}' $API/sheets/pdf

# Opslaan als, IFC exporteren
curl -X POST -H "Authorization: Bearer $T" -H "Content-Type: application/json" \
  -d '{"path": "C:/projecten/hal/hal"}' $API/project/save-as
curl -X POST -H "Authorization: Bearer $T" -H "Content-Type: application/json" \
  -d '{"format": "ifc", "path": "C:/projecten/hal/hal.ifc"}' $API/export/ifc

# Ongedaan maken
curl -X POST -H "Authorization: Bearer $T" $API/undo

# Een wegwerpwerkblad: rekenen zonder het open project aan te raken
curl -X POST -H "Authorization: Bearer $T" $API/session/new
curl -X POST -H "Authorization: Bearer $T" -H "Content-Type: application/json" \
  -d '{"force": "true"}' $API/session/new
curl -X POST -H "Authorization: Bearer $T" $API/session/close

# Elke tool generiek, en de lijst met schema's
curl -X POST -H "Authorization: Bearer $T" -H "Content-Type: application/json" \
  -d '{"id": "<id>", "evaluate": false}' $API/tools/sheet_get
curl -H "Authorization: Bearer $T" $API/tools

# De specificatie: zonder token
curl $API/openapi.json
```

## Routes

Paden onder `/api/v1`. **Vet** = verplicht. Padparameters (`{id}`) komen uit
het pad; bij GET en DELETE de overige argumenten uit de query (`?evaluate=true`,
lijsten komma-gescheiden), bij POST, PUT en PATCH uit de JSON-body. Soort:
*lezen*, *wijzigen* (project of app), *bestand* (schrijft een bestand) of
*beeld* (alleen wat er in beeld staat). Wijzigen en bestand zijn geblokkeerd in
de alleen-lezenstand.

| Route | Tool | Soort | Argumenten |
|---|---|---|---|
| `GET /info` | `app_info` | lezen | — |
| `GET /project` | `project_get` | lezen | evaluate |
| `POST /project/new` | `project_new` | wijzigen | force |
| `POST /session/new` | `session_new` | wijzigen | force |
| `POST /session/close` | `session_close` | wijzigen | — |
| `POST /project/open` | `project_open` | wijzigen | **path**, force |
| `POST /project/save` | `project_save` | bestand | path |
| `POST /project/save-as` | `project_save_as` | bestand | **path** |
| `GET /project/recent` | `recent_files` | lezen | — |
| `PUT /project/name` | `project_set_name` | wijzigen | **name** |
| `PATCH /project/data`<br>`PATCH /project/gegevens` | `project_set_data` | wijzigen | name, value, values |
| `PUT /project/visibility` | `project_set_visibility` | wijzigen | **part**, **visible** |
| `GET /report` | `report_get` | lezen | path |
| `PATCH /report` | `report_set` | wijzigen | path, value, values |

Een Taiwanees rapport heeft daarnaast `tw`: `tw.handtekening.{naam,vakgebied,nummer,instantie,bureau,datum,beeld,tonen}`
(het blok van de ondertekenende ingenieur op het voorblad), `tw.kopvoet.{kop,voet}` (doorlopende kop- en voettekst met
`{titel}`, `{projectnaam}`, `{kenmerk}`, `{datum}`, `{revisie}`) en `tw.nummering.tabellen` (表 4-1 boven de tabellen).
Leeg betekent: niets op papier, dus een bestaand rapport verandert niet.
| `POST /undo` | `undo` | wijzigen | — |
| `POST /redo` | `redo` | wijzigen | — |
| `GET /modules` | `modules_list` | lezen | — |
| `GET /modules/{templateId}/schema` | `module_schema` | lezen | **templateId** |
| `GET /sheets` | `sheets_list` | lezen | evaluate |
| `POST /sheets` | `sheet_add` | wijzigen | kind, templateId, name, source, text, code, graph, drawing, paper, orientation, path, base64, fileName, withCode, automatic |
| `POST /sheets/pdf` | `sheet_add_pdf` | wijzigen | path, base64, fileName, force, name |
| `GET /sheets/{id}` | `sheet_get` | lezen | id, evaluate, full |
| `PUT /sheets/{id}/source` | `sheet_set_source` | wijzigen | **id**, **source** |
| `PATCH /sheets/{id}/inputs` | `sheet_set_input` | wijzigen | **id**, name, value, values, design |
| `POST /sheets/{id}/inputs/reset` | `sheet_reset_input` | wijzigen | **id**, names |
| `PUT /sheets/{id}/pdf` | `sheet_set_pdf` | wijzigen | **id**, path, base64, fileName, force |
| `PUT /sheets/{id}/markdown` | `sheet_set_markdown` | wijzigen | **id**, **text**, fileName, headingsInToc |
| `PUT /sheets/{id}/graph` | `sheet_set_graph` | wijzigen | **id**, **graph** |
| `PUT /sheets/{id}/drawing` | `sheet_set_drawing` | wijzigen | **id**, drawing, paper, orientation |
| `PUT /sheets/{id}/spreadsheet` | `sheet_set_spreadsheet` | wijzigen | **id**, path, base64, fileName |
| `PUT /sheets/{id}/jupyter` | `sheet_set_jupyter` | wijzigen | **id**, path, base64, fileName, withCode, automatic |
| `PUT /sheets/{id}/marimo` | `sheet_set_marimo` | wijzigen | **id**, **code**, fileName, withCode, clearOutput |
| `PATCH /sheets/{id}` | `sheet_rename` | wijzigen | **id**, **name** |
| `POST /sheets/{id}/duplicate` | `sheet_duplicate` | wijzigen | **id**, name |
| `POST /sheets/{id}/move` | `sheet_move` | wijzigen | **id**, **direction**, steps |
| `DELETE /sheets/{id}` | `sheet_remove` | wijzigen | **id** |
| `POST /sheets/{id}/select` | `sheet_select` | beeld | **id** (ook `project`, `report`) |
| `POST /sheets/{id}/evaluate` | `sheet_evaluate` | lezen | id, numbers, names, lines, conventionalUnits, strict |
| `GET /sheets/{id}/content` | `sheet_read` | lezen | id, maxCells (markdown: ook `filled` en `references`) |
| `POST /sheets/{id}/run` | `sheet_run` | wijzigen | **id**, timeoutSeconds, maxCells |
| `GET /sheets/{id}/drawing` | `sheet_drawing` | lezen | **id**, format (svg/DXF), view, unit (mm/m) |
| `POST /sheets/{id}/formulas` | `sheet_insert_formula` | wijzigen | **id**, **formulaId**, position, language |
| `POST /evaluate` | `calc_evaluate` | lezen | **source**, values, useProjectData, maxLines, conventionalUnits, strict |
| `POST /evaluate/batch` | `calc_evaluate_batch` | lezen | **items** (elk de argumenten van `calc_evaluate`) |
| `POST /jobs` | `job_start` | lezen (201) | **items** |
| `GET /jobs/{jobId}` | `job_status` | lezen | **jobId**, results |
| `DELETE /jobs/{jobId}` | `job_cancel` | lezen | **jobId** |
| `GET /library` | `library_list` | lezen | refresh |
| `POST /library/{id}/install` | `library_install` | wijzigen | **id** |
| `DELETE /library/{id}` | `library_remove` | wijzigen | **id** |
| `GET /formulas` | `formulas_list` | lezen | query, group, includeCode |
| `GET /formulas/{id}` | `formula_get` | lezen | **id** |
| `GET /export/ifc` | `ifc_get` | lezen | **format** (`ifc`/`ifcx`), id |
| `POST /export/ifc` | `export_ifc` | bestand | **format**, **path**, id |
| `POST /export/pdf` | `export_pdf` | bestand | **path**, ids |
| `POST /print` | `print` | beeld | **what** (`report`/`sheets`), ids |
| `GET /view` | `view_get` | lezen | — |
| `PUT /view` | `view_set` | beeld | **view** |
| `GET /settings` | `settings_get` | lezen | — |
| `PATCH /settings` | `settings_set` | wijzigen | theme, language, textSize, units |

`units.stelsel` kiest het eenhedenstelsel voor een nieuw project: `blad`, `si-mm`, `si-m`,
`us` of `eigen`. Het stelsel van het open project is het projectgegeven `eenheden`
(`project_data_set`). Uitkomsten van `sheet_evaluate`, `calc_evaluate` en `sheet_get` blijven in de
eenheden van het blad; zie [projectmodel.md](projectmodel.md#eenheden).

Vaste routes: `GET /api/v1` (overzicht met alle routes), `GET /api/v1/tools`
(elke tool met JSON-schema en routes), `POST /api/v1/tools/{naam}`,
`GET /api/v1/openapi.json` en `GET /api/v1/health` (zonder token).

## Statussen

| Status | Wanneer |
|---|---|
| 200 / 201 | Gelukt; 201 bij iets nieuws (`POST /sheets`, `/sheets/pdf`, `…/duplicate`). |
| 400 | Ongeldige argumenten, onleesbare body (`VALIDATION`). |
| 401 | Geen of een verkeerd token (Rust). |
| 403 | Request met een `Origin`-header: browsers worden geweigerd (Rust). |
| 404 | Onbekende route, blad, module, formule, rapportpad of bestand (`NOT_FOUND`). |
| 405 | Bekende route, andere methode (met de toegestane in de melding). |
| 409 | Niet opgeslagen werk zou verloren gaan (`project_new`, `project_open`, `session_new`); geef `force: true` (`CONFLICT`). Ook: er staat al een wegwerpwerkblad open (`session_new`) of er staat er geen open (`session_close`). |
| 413 | Body groter dan 50 MiB (Rust). |
| 422 | Een berekening rekent niet door (`CALC_ERROR`), of `strict` staat aan en er is een eenheidswaarschuwing (`UNIT_WARNING`, met `warnings[]` in `data`). |
| 423 | Alleen-lezen staat aan (`READ_ONLY`). |
| 500 | Interne fout, met de melding (`INTERNAL`). |
| 501 | Niet beschikbaar: in de browser in plaats van de desktop-app, geen internet, of geen rapportengine (`NOT_AVAILABLE`). |
| 503 | De gebruiker heeft de API gepauzeerd (`PAUSED`). |
| 504 | Geen antwoord binnen 120 s (Rust). |

Een fout is altijd `{"error": {"code": "...", "message": "...", "data": ...}}`.

## De OpenAPI-specificatie zonder token

`GET /api/v1/openapi.json` is als enige route **zonder token** te lezen, zodat
een client de API kan ontdekken zonder eerst het token te hebben. Hij bevat
alleen de beschrijving van de routes, geen projectgegevens en geen token. De
Origin-weigering en de binding aan 127.0.0.1 gelden ook voor deze route.

## Wat er niet (helemaal) kan

- **PDF naar een pad.** Het volledige constructierapport met de tekeningen komt
  uit de webview. De knop Rapport in het lint schrijft het op Windows zelf weg:
  één klik plus een bestandsnaam, zonder printdialoog (WebView2 `PrintToPdf`, zie
  `src-tauri/src/rapport_pdf.rs`). Op een ander platform, of als dat mislukt, opent
  de printdialoog van het systeem. De API heeft die weg niet: `print` opent de
  printdialoog in de app (rapport of bladen), en de gebruiker kiest daar een
  PDF-printer en de plek. Ook losse bladen en Ctrl+P gaan via die dialoog.
  `export_pdf` schrijft wél zelf een PDF, maar alleen in een build met de
  rapportengine (`--features rapportengine`), en dan zonder tekeningen; zonder die
  engine geeft hij 501.
- **Dialogen en vragen.** De API vraagt nooit iets: waar de app een vraag stelt
  (wijzigingen weggooien, een PDF boven 20 MB) geeft de API 409 of 400 en
  verwacht hij `force: true`.
- **IFC.** `ifc_get` en `export_ifc` geven zonder `id` het hele project. `ifcx` is
  hetzelfde zuivere IFCX-document als het projectbestand, `ifc` de STEP
  (IFC4X3_ADD2) die daaruit volgt; zie [ifc-export.md](ifc-export.md). Met `id`
  staat alleen dat blad erin, zonder het rapport. Een blad dat niet doorrekent
  blijft in het document, met `status: "niet_doorgerekend"` en de fout.
- **Weergave.** `view_set` kiest code/visueel/uitwerking, afdrukvoorbeeld of IFC
  in de werkruimte; het lint springt daarbij niet mee naar de tab IFC.
- **Bureauprofiel en sneltoetsen** zijn (nog) niet via de API te zetten.
