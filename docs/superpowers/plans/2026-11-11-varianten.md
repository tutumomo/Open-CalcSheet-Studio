# Varianten — bouwplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bij elk rekenblad een tab Varianten: gekozen invoervelden variëren, alles in één keer doorrekenen, uitkomsten naast elkaar, per variant de kleinste waarde zoeken die voldoet, en de tabel desgewenst op papier.

**Architecture:** Varianten zijn een veld van het exemplaar (`Exemplaar.varianten`), dus ze gaan vanzelf mee in opslaan, ongedaan maken en versies. Het samenvoegen, doorrekenen en zoeken staat in zuivere modules (`store/varianten.ts`, `rekenen/varianten.ts`) die ook in Node laden; de app rekent ze in een eigen worker. In het bestand is het een nieuw bron-attribuut `ocss::blad::varianten`.

**Tech Stack:** TypeScript, React 19, zustand, Vite web worker, de rekenkern `@ifc-calc/core`, controles als `scripts/check-*.mjs` in Node 24.

**Spec:** `docs/superpowers/specs/2026-11-11-varianten-design.md`

## Global Constraints

- Nergens in de repo namen van externe rekensoftware, verwijzingen naar gesprekken met een assistent, of klant-, bureau- of projectnamen.
- Nooit een onterecht *voldoet*: een uitkomst komt uit een echte doorrekening; bij twijfel *niet getoetst*.
- Schermtekst in `packages/desktop/src/i18n/locales/{en,nl}/*.json`, Engels als bron; `node scripts/check-schermtekst.mjs` groen.
- Een nieuw `scripts/check-*.mjs` verhoogt de telling in `README.md` (`**N check scripts**`) en `README.nl.md` (`**N controlescripts**`).
- Een regel in `docs/CHANGELOG.md` onder "Nog niet uitgebracht" per PR.
- Modules die in Node laden importeren met `.ts`-extensie en zonder React of stores.
- Voor elke commit: `node scripts/check-alles.mjs` (via `npm run check`, op de achtergrond) en `cd packages/desktop && npx tsc --noEmit -p .` groen.
- Commits eindigen op `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; PR-teksten op `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Niet mergen, niet force-pushen.

## Review Focus

- **Rekentekst gewijzigd na het maken van varianten** (een veld verdwijnt via *Bijwerken*): de tabel slaat het veld over, de rest rekent door, niets valt om. Test in Task 1 (`variantInvoer` met een veld dat de tekst niet meer heeft).
- **Plakken van een blok met Nederlandse komma's, lege cellen en een afsluitende regel uit een werkmap**: lege cel = volgt het blad, komma blijft komma (de kern leest beide), geen lege variant door de laatste regelovergang. Test in Task 1 (`plakBlok`).
- **Optimaliseren waar niets voldoet, of waar het blad geen oordeel geeft**: geen waarde in de cel, wel de melding; nooit een cel met een waarde die niet voldoet. Test in Task 2 (`zoekKleinste`).
- **Een blad met `@toets` en varianten opslaan zonder FEM Studio**: de vastgelegde antwoorden van de varianten blijven in het bestand. Test in Task 2 (`variantToetsHashes` + `gebruikteToetsingen`).
- **Een oud projectbestand of een bestand met een kapot `ocss::blad::varianten`**: opent als blad zonder (of met de bruikbare) varianten. Test in Task 1 (`leesVarianten`).

---

## PR 1 — model, bestand en rekenen (tak `varianten`, basis `main`)

### Task 1: Het model en het bestand

**Files:**
- Create: `packages/desktop/src/store/varianten.ts`
- Modify: `packages/desktop/src/store/projectStore.ts` (veld + acties), `store/projectBestand.ts` (`normaliseerExemplaar`, `bouwProjectBestand`), `store/projectIfcx.ts` (`BladVoorIfc`, `bladVoorIfc`)
- Modify: `packages/core/src/ifc-generator.ts` (`IfcCalcSheet.varianten`), `packages/core/src/ifcx/namespace.ts` (`ATTR.varianten` + schema), `packages/core/src/ifcx/document.ts` (schrijven en lezen, `IfcxGelezenBlad.varianten`), `packages/core/src/index.ts` (type export)
- Test: `scripts/check-varianten.mjs` (nieuw)

**Interfaces:**
- Produces (in `store/varianten.ts`):
  - `interface Variant { id: string; naam: string; waarden: Record<string,string>; gezocht?: string[] }`
  - `interface Zoekopdracht { veld: string; van: string; tot: string; stap?: string; grens: number }`
  - `interface Varianten { velden: string[]; uitkomsten: string[]; lijst: Variant[]; opPapier?: boolean; zoek?: Zoekopdracht }`
  - `leesVarianten(x: unknown): Varianten | undefined` — alleen tekst-waarden, ids uniek, `undefined` als er geen `velden` en geen `lijst` overblijven.
  - `variantInvoer(waarden: Record<string,string>, v: Variant, velden: readonly string[]): Record<string,string>` — `{...waarden}` plus de eigen waarden van `v` voor velden in `velden`; een lege eigen waarde telt niet.
  - `nieuweVariant(bestaand: readonly Variant[], waarden?: Record<string,string>): Variant` — naam `V<n>` met het eerste vrije nummer, id `var-<tijd>-<teller>`.
  - `zetCel(vs: Varianten, variantId: string, veld: string, waarde: string): Varianten` — lege waarde wist de eigen waarde; wist `veld` uit `gezocht`.
  - `zetVelden(vs: Varianten, velden: string[]): Varianten` — wist eigen waarden en `gezocht` van velden die wegvallen.
  - `plakBlok(vs: Varianten, tekst: string, rij: number, kolom: number, zetOm?: (veld: string, w: string) => string | null): Varianten` — rijen = `vs.velden` vanaf `rij`, kolommen = `vs.lijst` vanaf `kolom` (0 = V1); tab-gescheiden, `\r\n` en een laatste lege regel genegeerd; een lege cel wist; varianten erbij als het blok verder loopt; `zetOm` geeft `null` bij een ongeldige waarde (die cel blijft zoals hij was).
  - `reeksWaarden(van: number, tot: number, stap: number, max = 50): number[]` — oplopend of aflopend, inclusief `tot` binnen 1e-9·stap, hoogstens `max`; `stap <= 0` of niet eindig → `[]`.
  - `VariantenGegevens` (kern): `{ velden: string[]; uitkomsten: string[]; opPapier?: boolean; zoek?: unknown; lijst: { id: string; naam: string; waarden: Record<string,string>; gezocht?: string[] }[] }` in `ifc-generator.ts`; in het bestand `lijst[].invoer` als paren `{naam, waarde}`.
- Produces (store): `zetVarianten(id: string, varianten: Varianten | undefined, sleutel?: string): void` (één stap; met sleutel samenvoegen als `zetWaarde`), `neemVariantOver(id: string, variantId: string): void` (één stap: `ex.waarden = variantInvoer(...)`), `variantAlsBlad(id: string, variantId: string): string | null` (kopie direct na het blad, naam `"<blad> – <variant>"`, zonder `varianten`, met de samengevoegde invoer; één stap; geeft het nieuwe id).

- [ ] **Step 1: Write the failing check `scripts/check-varianten.mjs`** met de secties *Model* en *Bestand*:
  - `variantInvoer({b:"75",h:"225"}, {id:"a",naam:"V1",waarden:{h:"250",x:"9"}}, ["h"])` → `{b:"75",h:"250"}`; met `waarden:{h:""}` → `h` blijft `"225"`.
  - `nieuweVariant([{naam:"V1"},{naam:"V3"}]).naam === "V2"`.
  - `zetCel` met `""` wist; `zetVelden(vs, ["L_1"])` wist `h` uit elke variant en uit `gezocht`.
  - `plakBlok(vs met velden [h, L_1] en 1 variant, "250\t275\t300\r\n4,5\t\t5\r\n", 0, 0)` → 3 varianten; V1 `{h:"250",L_1:"4,5"}`, V2 `{h:"275"}`, V3 `{h:"300",L_1:"5"}`.
  - `reeksWaarden(3, 4.5, 0.5)` → `[3,3.5,4,4.5]`; `reeksWaarden(0,1,0)` → `[]`; `reeksWaarden(0,100,1).length === 50`.
  - `leesVarianten(null) === undefined`; `leesVarianten({velden:["h",3],lijst:[{id:"a",naam:"V1",waarden:{h:250}}]})` houdt alleen tekst-velden en zet `250` → weggelaten (geen tekst); dubbele id's krijgen een nieuw id.
  - Opslaan en openen: een project met één blad met `varianten` via `bouwProjectBestand` → `leesProjectBestand` geeft dezelfde `varianten` terug (diepe gelijkheid), en `ocss::blad::varianten` staat in `schemas` van het document; een blad zonder varianten schrijft het attribuut niet.
- [ ] **Step 2: Run** `npm --prefix packages/core run build && node scripts/check-varianten.mjs` — Expected: FAIL (module bestaat niet).
- [ ] **Step 3: Implement** `store/varianten.ts`, het kern-attribuut (schema: `velden: lijst(TEKST)`, `uitkomsten: lijst(TEKST)`, `opPapier: opt(JANEE)`, `zoek: opt(VRIJ)`, `lijst: lijst(object({id: TEKST, naam: TEKST, invoer: lijst(object({naam: TEKST, waarde: TEKST})), gezocht: opt(lijst(TEKST))}))`), doorgeven in `bouwProjectBestand`/`bladVoorIfc`, inlezen in `normaliseerExemplaar` via `leesVarianten`, en de drie store-acties.
- [ ] **Step 4: Run** `npm --prefix packages/core run build && node scripts/check-varianten.mjs` en `node scripts/check-ifcx.mjs` en `node scripts/check-bestand-opslaan.mjs` — Expected: PASS.
- [ ] **Step 5: Commit** — "Varianten in het blad en het projectbestand".

### Task 2: Doorrekenen, zoeken en de toetsantwoorden

**Files:**
- Create: `packages/desktop/src/rekenen/varianten.ts`
- Modify: `packages/desktop/src/rekenen/toetsCache.ts` (`gebruikteToetsingen`), `store/projectIfcx.ts`, `store/projectBestand.ts`
- Test: `scripts/check-varianten.mjs` (secties *Rekenen*, *Optimaliseren*, *Toetsen*)

**Interfaces:**
- Consumes: Task 1 (`Varianten`, `variantInvoer`, `reeksWaarden`), `invoervelden`/`Invoerveld` uit `components/calc/bladVersie.ts`, `leesResultaat`/`leesGetallen`/`metRefNamen` uit `components/calc/bladLezen.ts`, `scopeMetVerwijzingen`/`verwezenBladen`, `metToetsingen`/`verzamelVerzoeken`/`toetsHashes`.
- Produces (in `rekenen/varianten.ts`):
  - `interface VariantUitkomst { resultaat: Resultaat; getallen: Record<string,number>; teksten: Record<string,string>; actief: string[]; verzoeken: ToetsVerzoek[]; toetsen: string[] }` — `teksten`: per benoemde uitkomst `result` met eenheid zoals de uitwerking hem toont; `actief`: namen van invoervelden die in de doorgerekende knopen staan (binnen gekozen takken).
  - `rekenVariant(source: string, waarden: Record<string,string>, scope: Record<string,unknown>, naam: string, opties?: { evalOpties?: EvalOpties; verwijzingen?: VerwijsBlad[]; toetsModus?: "vragen" | "lezen" }): VariantUitkomst` — werpt bij een fout.
  - `voldoetAan(r: Resultaat, grens: number): boolean` — `r.voldoet === true && !r.nietGetoetst && (r.uc === null ? grens >= 1 : r.uc <= grens)`.
  - `kandidaten(veld: Invoerveld, zoek: Zoekopdracht): string[]` — getallen uit `reeksWaarden` als tekst in de eenheid van het veld (oplopend gesorteerd), of bij een keuzelijst de `value`s van keuze `van` t/m `tot` in volgorde van het blad.
  - `zoekKleinste(kandidaten: readonly string[], beoordeel: (w: string) => Promise<Resultaat | null>, grens: number, afbreken?: () => boolean): Promise<{ waarde: string } | { geen: true } | { afgebroken: true }>` — loopt op, stopt bij de eerste die `voldoetAan`; `null` (fout) telt als niet voldoen.
  - `variantToetsHashes(ex: { source: string; waarden: Record<string,string>; varianten?: Varianten }, scope: Record<string,unknown>): string[]` — leeg zonder `@toets` in de tekst of zonder varianten; anders per variant `rekenVariant(..., {toetsModus:"lezen"}).toetsen`.
- Produces (toetsCache): `gebruikteToetsingen(toetsingen, blad, ook: readonly string[] = [])` — `ook` telt als gebruikt.

- [ ] **Step 1: Extend the failing check** met:
  - *Rekenen:* een kleine bladtekst `"b = ?{75}*(mm)\nh = ?{225}*(mm)\nM = 10 kN*m\nW = b*h^2/6 to mm^3\nsigma = M/W to N/mm^2\nUC_max = sigma/(24 N/mm^2)\n'Maatgevende UC = …"` (de slotzin met `voldoet`/`voldoet niet` via `#if`), en handberekening in het commentaar: h=225 → W=632812,5 mm³, σ=15,80 N/mm², UC=0,658; h=150 → W=281250, σ=35,56, UC=1,481. `rekenVariant` geeft die UC's (±0,001) en het oordeel.
  - *Actief:* met `@select materiaal` en `b` alleen in de tak hout: bij staal staat `b` niet in `actief`.
  - *Optimaliseren:* `kandidaten({soort:"invoer",eenheid:"mm",…}, {van:"150",tot:"300",stap:"25",grens:1})` → `["150","175",…,"300"]`; `zoekKleinste` met `beoordeel` via `rekenVariant` vindt `"200"` (h=200: W=500000, σ=20,00, UC=0,833 ≤ 1; h=175: W=382812,5, σ=26,12, UC=1,089); met `tot:"175"` → `{geen:true}`; een `beoordeel` die `{voldoet:null,uc:null,…}` geeft → `{geen:true}`; met grens 0,8 → `"225"`. Een keuzelijst van keuze `"2"` t/m `"4"` geeft `["2","3","4"]`.
  - *Toetsen:* met de fixture `scripts/fixtures/toets-staal.json` en de bladtekst uit `check-toets-vastleggen.mjs`: een blad met twee varianten met elk een andere invoer en drie vastgelegde antwoorden (blad + 2 varianten) → na `bladenVoorIfc` en `bouwProjectBestand` staan alle drie de hashes in het bestand; zonder varianten alleen die van het blad.
- [ ] **Step 2: Run** `node scripts/check-varianten.mjs` — Expected: FAIL.
- [ ] **Step 3: Implement** `rekenen/varianten.ts` (rekenroute zoals `mcp/rekenen.ts` `rekenDoor`, met `scopeMetVerwijzingen` vooraf als `verwijzingen` zijn meegegeven), `gebruikteToetsingen(…, ook)`, in `bladVoorIfc` `ook = variantToetsHashes(ex, projectScope(gegevens))`, en in `bouwProjectBestand` de toetsingen van het doorgerekende blad gebruiken als dat er is.
- [ ] **Step 4: Run** `node scripts/check-varianten.mjs`, `node scripts/check-toets-vastleggen.mjs` — Expected: PASS.
- [ ] **Step 5: Docs en afronding PR 1:** `docs/varianten.md` (wat, gegevens, rekenen, verhouding tot versies en verwijzingen), een rij in de tabel van `docs/projectmodel.md` (*Varianten van een blad | `ocss::blad::varianten` | bron*), de telling in beide README's, een regel in `docs/CHANGELOG.md`. `npm run check` op de achtergrond en `npx tsc --noEmit -p .` in `packages/desktop`. Commit, push, PR naar `main`.

## PR 2 — de tab Varianten (tak `varianten-tab`, gestapeld op `varianten`)

### Task 3: De worker en de doorrekening in de app

**Files:**
- Create: `packages/desktop/src/rekenen/variantWorker.ts`, `packages/desktop/src/rekenen/variantRekenen.ts`

**Interfaces:**
- Consumes: `rekenVariant` (Task 2), `vraagToetsingen`/`legToetsingenVast`/`useToetsVersie` (femToetsing), `verwezenBladen`, `evalOptiesVan`, `metToetsingen`.
- Produces:
  - Worker-bericht in: `{ sleutel: string; source; waarden; scope; naam; hoekmodus; taal?; evalOpties?; includes; imageUrls; verwijzingen?; uitkomsten: string[] }`; uit: `{ sleutel; uitkomst: VariantUitkomst | null; fout?: string }`. De worker rekent met `toetsModus: "vragen"`.
  - `useVariantUitkomsten(ex: Exemplaar): { perVariant: Map<string, VariantUitkomst | null | undefined>; blad: VariantUitkomst | null | undefined; klaar: number; totaal: number }` — `undefined` = nog bezig, `null` = fout; de kolom *Blad* rekent via dezelfde worker met `ex.waarden`.
  - `rekenEenmalig(ex: Exemplaar, waarden: Record<string,string>): Promise<VariantUitkomst | null>` — voor optimaliseren: zelfde wachtrij, met toetsrondes (bij `verzoeken`: `vraagToetsingen`, opnieuw rekenen, hoogstens 10 rondes).
  - Wachtrij: één bericht tegelijk, volgorde van de tabel, uitkomsten bewaard op sleutel (hoogstens 300), sleutel = `[hoekmodus, taal, opties+toetsversie, naam, scope, invoer, source, verwijzingen].join("\0")`. Na een antwoord met `toetsen`: `legToetsingenVast(ex.id, toetsen)`; met `verzoeken`: `vraagToetsingen`.

- [ ] **Step 1:** Implement beide bestanden (de rekenroute zelf is in Task 2 al gecontroleerd; deze laag is dun en wordt in Task 4 in de browser gecontroleerd).
- [ ] **Step 2: Run** `cd packages/desktop && npx tsc --noEmit -p .` — Expected: geen fouten.

### Task 4: Het paneel Varianten

**Files:**
- Create: `packages/desktop/src/components/calc/varianten/VariantenPaneel.tsx`, `VeldKeuze.tsx`, `VariantenTabel.tsx`, `ReeksDialoog.tsx`, `OptimaliseerDialoog.tsx`, `VariantUitwerking.tsx`, `Varianten.css`
- Modify: `packages/desktop/src/App.tsx` (tab *Varianten (n)* in `tabBalk` vóór *Afdrukvoorbeeld* voor rekenbladen en canvas; werkruimte toont `VariantenPaneel` als die tab gekozen is; terug naar de vorige weergave bij een ander blad), `i18n/locales/{en,nl}/werkruimte.json` (namespace-sleutels `varianten.*`)
- Test: `scripts/check-varianten.mjs` (sectie *Schermtekst*: elke `t("varianten.…")` in de nieuwe bestanden bestaat in `en` en `nl`), plus `node scripts/check-schermtekst.mjs`

**Interfaces:**
- Consumes: Task 1 (store-acties, `zetCel`, `zetVelden`, `plakBlok`, `nieuweVariant`, `reeksWaarden`), Task 2 (`kandidaten`, `zoekKleinste`, `voldoetAan`), Task 3 (`useVariantUitkomsten`, `rekenEenmalig`), `invoervelden(leesBlad(ex.source))`, `invoerNaarBron`, `ExemplaarContext`, `designerVoor`.
- Gedrag volgens de spec, *Wat de gebruiker ziet*. Celsleutel voor samenvoegen: `"var:" + ex.id + ":" + variantId + ":" + veld`. Optimaliseren schrijft per variant in één `zetVarianten`-stap (`gezocht` erbij) en toont de varianten zonder uitkomst onder de tabel; *Annuleren* tijdens zoeken breekt af.

- [ ] **Step 1: Write the failing check** (sectie *Schermtekst*) en run — Expected: FAIL (bestanden ontbreken).
- [ ] **Step 2: Implement** de onderdelen en de tab.
- [ ] **Step 3: Run** `node scripts/check-varianten.mjs`, `node scripts/check-schermtekst.mjs`, `npx tsc --noEmit -p .` — Expected: PASS.
- [ ] **Step 4: Browser** (preview `varianten-dev`, poort 3038): module Ligger invoegen → tab Varianten → velden h en L_1 kiezen → 5 waarden voor L_1 plakken → uitkomsten verschijnen → Optimaliseren h 150–400 stap 25 → elke variant krijgt een blauwe h met UC ≤ 1 → Overnemen in het blad → Ctrl+Z → Als nieuw blad. Schermafbeelding.
- [ ] **Step 5:** CHANGELOG, `npm run check` op de achtergrond, commit, push, PR (basis `varianten`).

## PR 3 — op papier (tak `varianten-papier`, gestapeld op `varianten-tab`)

### Task 5: De tabel in de afdruk en het rapport

**Files:**
- Create: `packages/desktop/src/components/calc/varianten/VariantenAfdruk.tsx`
- Modify: `rekenen/varianten.ts` (`papierTabellen`), `components/calc/PrintBlad.tsx` (na de uitwerking), `rekenen/femToetsing.ts` (`werkToetsingenBij`: ook de varianten van bladen met `opPapier`), `i18n/locales/{en,nl}/beelden.json` (`afdruk.varianten.*`), `scripts/lib/gemengd-project.mjs` (een blad met varianten en `opPapier`)
- Test: `scripts/check-varianten.mjs` (sectie *Papier*), `scripts/check-rapport-pdf.mjs`

**Interfaces:**
- Produces: `papierTabellen(velden: Invoerveld[], vs: Varianten, blad: Record<string,string>, perKolom: number): { kolommen: (Variant | null)[]; rijen: string[] }[]` — `null` = de kolom *Blad*, in elke tabel eerst; `rijen` = de velden waarin minstens één variant verschilt van het blad, in de volgorde van `vs.velden`; `perKolom` varianten per tabel (8).
- `VariantenAfdruk({ ex, taal })`: rekent direct (`rekenVariant`, `toetsModus: "lezen"`), rijen invoer + gekozen uitkomsten + maatgevende UC + oordeel; elke tabel een eigen blok voor de paginering; teksten via `usePapier()`/`useTranslation("beelden")`.

- [ ] **Step 1: Write the failing check** (sectie *Papier*): 11 varianten, `perKolom` 8 → 2 tabellen met 9 en 4 kolommen, beide beginnend met `null`; een veld dat in geen variant verschilt, staat niet in `rijen`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** `papierTabellen`, `VariantenAfdruk`, de aansluiting in `PrintBlad` (alleen bij `ex.varianten?.opPapier && lijst.length`), `werkToetsingenBij`, het gemengde project.
- [ ] **Step 4: Run** `node scripts/check-varianten.mjs`, `node scripts/check-rapport-pdf.mjs`, `node scripts/check-paginering.mjs` — Expected: PASS. Browser: afdrukvoorbeeld van een blad met vinkje aan, en het rapport.
- [ ] **Step 5:** CHANGELOG, `docs/varianten.md` bijwerken, `npm run check` op de achtergrond, commit, push, PR (basis `varianten-tab`).
