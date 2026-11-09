# Wijzigingen

Wat er per versie voor de gebruiker veranderd is. Zet een wijziging onder
"Nog niet uitgebracht"; `node scripts/versie.mjs zet JJJJ.W.N` maakt daar bij het
uitbrengen de sectie van die versie van. De release-tekst neemt die sectie over,
en de website van OpenAEC telt en toont de opsommingen daaruit.

## Nog niet uitgebracht

- 台灣版（結構計算書報告架構）：新增符合台灣工程實務之七章結構計算書報告架構（設計概要、設計規範、材料強度、載重、分析、檢核、附錄）；報告模型新增 `opzetSoort: "eurocode" | "tw"`（RAPPORT_VERSIE 提升至 6），缺此欄位或版本小於 6 之既有專案自動相容預設 "eurocode" 並維持逐字元完全相同輸出，新建立之繁中報告預設 "tw"；整合已驗證規範載重組合（rc112 表 5.3.1）、屋頂活載重（構造編第 26 條）、耐震用途係數（第 43-1 條）與材料體積重量（第 11 條）、地板面與牆壁重量（第 14、15 條）；樓地板活載重表因官方附表尚未入庫而維持空表並明確標示「待補：建築技術規則建築構造編第 17 條附表」，停車場、公共走廊樓梯、屋頂露臺與活動隔牆依第 17、21 條官方條文列入；檢核章節實作 worst-case 決策原則與自動彙整去重引用規範清單
- 台灣版（rc112 混凝土結構）：新增「鋼筋混凝土矩形梁設計與檢核」計算模組（`tw-rc-beam`），依內政部《建築物混凝土結構設計規範》（112年8月10日版）提供單筋與雙筋梁之完整計算與檢核；涵蓋 β1 應力塊係數、閉合解中性軸求解、εt 鋼筋拉應變與延展性判定、強度折減係數 ϕ、標稱與設計抗彎強度 ϕMn、最小受拉鋼筋量 As,min（9.6.1.2）、混凝土剪力強度 Vc（詳細法 a）、鋼筋剪力強度 Vs、斷面剪力上限 Vs,max（22.5.1.2）、最小剪力筋量 (Av/s)min（9.6.3.3）、雙分支箍筋最大間距 s,max（表 9.7.6.2.2）、裂縫控制受拉鋼筋最大間距 s,crack（24.3.2）、免算撓度梁深下限 h,min（表 9.3.1.1）以及 Bischoff 有效慣性矩 Ie（24.2.3.5）與長期總撓度檢核；模組目錄新增「台灣規範 — 混凝土」分類、專屬縮圖及相容報告標頭之「控制 UC」判定
- 台灣版（zh-TW）：新增繁體中文介面在地化，涵蓋全部 12 個命名空間共 3,023 個詞條，依台灣工程慣用術語翻譯；預設介面語言改為繁體中文（zh-TW）；介面上的日期與數字格式採台灣慣例（西元年、小數點為點、千分位為逗號）；設定對話方塊「重設為預設值」支援預設繁體中文
- De antwoorden van Open FEM Studio op `@toets`-blokken gaan mee in het projectbestand, met de datum en de versie waarmee getoetst is. Een geopend blad toont zijn uitkomst zonder opnieuw te toetsen, ook op een computer zonder FEM Studio. Vóór het afdrukken worden blokken zonder antwoord eerst getoetst. Heeft CalcSheet een andere versie van FEM Studio dan waarmee getoetst is, dan meldt het blad dat en biedt het "Opnieuw toetsen" aan; dat gebeurt nooit vanzelf
- Rekentaal: met `@toets naam = tool … @end` laat een blad een normtoets doen door Open FEM Studio, bijvoorbeeld `check_steel_beam`. Het blok staat als tabel met per toets het artikel, de UC en het oordeel, en daarna rekent het blad verder met `naam.uc_max` en `naam.voldoet`. Eenheden worden omgerekend naar wat FEM Studio vraagt. Een blok zonder antwoord staat op papier als niet getoetst, nooit als voldoet
- CalcSheet kan de server van Open FEM Studio meeleveren en headless starten, als begin van de normtoetsing uit één bron. Instellingen › Over toont de versie van FEM Studio, of dat hij niet is meegeleverd; de toetsing in de rekenbladen volgt in een volgende versie
- Bij de locatie neemt de knop "Overnemen uit ERPNext" het adres of de coördinaten over uit een veld van het ERPNext-project met het projectnummer (standaard `custom_location`; de veldnaam staat in de instellingen). Het API-geheim staat per ERPNext-adres in de sleutelbos van het besturingssysteem, en HTTPS gebruikt de certificaten van het besturingssysteem (op Linux moet het pakket ca-certificates aanwezig zijn)
- Bij de locatie meet de knop "Afstand tot open water meten" de afstand tot het dichtstbijzijnde open water binnen 10 km (OpenStreetMap): de omgevingskaart krijgt een streeplijn erheen, ligt het water buiten de kaart dan eindigt de lijn in een pijl aan de rand, en op de pagina Situatie staat de afstand met de naam, of dat er geen open water binnen 10 km ligt
- Het rapport krijgt na het voorblad een pagina Situatie met drie kaarten van OpenStreetMap (gebied, omgeving, locatie), het adres, de coördinaten en de terreincategorie; in het rapportpaneel (Document) zet je de pagina aan of uit
- In de projectgegevens kies je de locatie van het project op een kaart: zoek een adres waar ook ter wereld, klik op de kaart of sleep de speld
- Via de API en MCP kies je ook het eenhedenstelsel voor een nieuw project (`units.stelsel` in `settings_set`); het stelsel van het open project is het projectgegeven `eenheden`
- Het rapport volgt het eenhedenstelsel van het project: de belastingen en de laagopbouw op papier en in het rapportpaneel, met hun eenheden ([psf], [ft], [pcf]). Wat je in het paneel typt, wordt opgeslagen in de eenheid van het rapport; een getal met een andere eenheid erachter (12 m) geldt in die eenheid
- De parametrische beelden volgen het eenhedenstelsel van het project: maten, lasten, momenten en spanningen in de tekeningen van de ligger, de balklaag, de tweepaalspoer en de doorsnede, en hun invoervelden. Een maat die je in een tekening typt, gaat terug in de eenheid van het blad
- Eenhedenstelsel per project, bij de projectgegevens: SI (mm), SI (m), US customary of per grootheid een eigen keuze. Uitkomsten, ingevulde formules, invoervelden, het afdrukvoorbeeld en het rapport staan in die eenheden; de berekening en de unity checks blijven gelijk. Eigen eenheden voor het hele project (kipf = 1000 lbf). Instellingen, tab Units, kiest het stelsel voor een nieuw project
- In een invoerveld kun je een eenheid meetypen: 5 m in een veld in mm wordt 5000 mm, en een eenheid die niet past krijgt een rode rand
- Amerikaanse eenheden voor constructies: ksi, psf, ksf, plf, klf en pcf, naast in, ft, lbf, kip en psi. Een getal in psi staat in een formule niet meer als de Griekse letter ψ, en in een moment staat de lengte achteraan (kip ft)
- Eigen eenheden in een blad met `.naam = uitdrukking`, zoals `.kipf = 1000 lbf` of `.EUR = 1`, ook in `.cpd`-bestanden (#22)
- Inhoud met paginanummers: op het voorblad van de losse bladen staat bij elk blad de pagina waar het begint, en een lange inhoud loopt door op het volgende vel in plaats van eraf te vallen. In het afdrukvoorbeeld springt een klik op een regel naar dat blad, ook in de inhoudsopgave van het rapport; in de PDF is elk paginanummer een link
- Afdrukvoorbeeld veel sneller bij een groot project: een PDF-pagina, werkmap of 3D-afbeelding die klaar is, komt los op zijn vel in plaats van dat het hele voorbeeld opnieuw wordt opgebouwd, en alleen de vellen in beeld worden opgemaakt. Bij een project van 33 bladen is alles klaar na 8 in plaats van 18 seconden, zonder het haperen daarna
- Gewichtenbibliotheek: ruim 2300 eigen gewichten met bron, van materialen en grond tot kanaalplaten, metselwerk, dakpannen en gevelplaten per leverancier. Zoeken, filteren en met één klik invoegen in een opbouw; een eigen bibliotheek openen, aanvullen, samenvoegen en delen als `.weightlibrary`-bestand
- Het rapport heeft een eigen taal, te kiezen bij Document: koppen, vaste woorden, standaardteksten en rekenbladen staan in die taal, ook als de app een andere taal heeft. Een nieuw rapport neemt de taal van de app over; een bestaand rapport blijft Nederlands en ziet er hetzelfde uit
- De tab Code toont de rekentekst in de taal van de app, ook de uitleg in de verborgen regels. De rekenversie en de bestaande bladen veranderen daardoor niet; wat je typt, staat op die regel in het blad
- Een nieuw blad krijgt zijn naam in de taal van de app, ook via de API
- De laatste vaste Nederlandse teksten op het scherm en in meldingen staan nu in de vertaalbestanden, en getallen in de app volgen de notatie van de taal
- Canvas: zoomen met Ctrl en scrollen, rond het punt onder de muis
- Nieuw blad Spanningen in een doorsnede: kies een vorm, stel de normaalkracht, de momenten en de dwarskrachten in twee richtingen in, en zie het spanningsverloop in de doorsnede
- PDF-blad: zoomen, schuiven en aantekenen met pen, markeerstift, pijl, kader, wolk en tekst. De aantekeningen gaan mee in het project en, als je dat kiest, op papier
- Zijpaneel: de inhoud van het rapport met alle nummers terwijl je werkt, en de paginanummers uit het laatste afdrukvoorbeeld
- Eurocode 3, moment I-profiel: lineair-elastische toets met de spanning in de doorsnede, en de tekening toont het profiel met zijn afrondingen
- Formulebibliotheek: parametrische tekeningen bij de doorsnede-eigenschappen, en momentenlijnen bij de standaardgevallen van liggers

## v2026.45.2 — 2026-11-04

- Tweepaalspoer: een draaibaar 3D-studiemodel met de poer, de palen, de kolom en de wapeningskorf. Het volgt elke wijziging in de invoer en gaat mee in het projectbestand en de IFC-uitvoer, met elke staaf als `IfcReinforcingBar`.
- Tweepaalspoer: dwarsstaven op de lijn van de diagonaal, ook in de tekening en het 3D-model. Zonder dwarsstaven rekent de diagonaal zonder spreiding.
- Tweepaalspoer: boven een diagonaal van 55° verlaagt een hogere poer de trekkracht niet meer, k₂ = 0,85 vraagt twee haarspelden per paal en de staalspanning wordt ook bij de karakteristieke last getoetst.
- Tweepaalspoer: invoer en model staan samen in beeld in het venster waarmee de app opent, en de tekening valt in een smal paneel niet meer buiten beeld.
- Library: de buigwapening geeft boven M_lim een waarschuwing in plaats van een keuze en toetst of de staven in één laag passen.
- Library: de beugels rekenen binnen cot θ van 1 tot en met 2,5, toetsen s_l,max en ρ_w,min en rekenen de extra trekkracht ΔF_td uit.
- Module toevoegen: elke tegel heeft een eigen beeld, en Marimo staat naast Jupyter onder Notebooks.
- Formulebibliotheek: de bron volgt de taal van de app.
- Vensters vallen niet meer achter het lint.

## v2026.45.1 — 2026-11-04

- Marimo als nieuwe bladsoort: een reactief Python-notebook in dezelfde afgeschermde omgeving als een Jupyter-blad. De code en per cel de laatste uitvoer staan in het project.
- Jupyter: automatisch uitvoeren, per blad te kiezen en standaard uit. Na een wijziging in de code rekenen alle cellen opnieuw; bij het openen draait er niets.
- Grafblad: 75 soorten nodes erbij voor rekenen met eenheden, logica, lijsten, tekst en geometrie, en grafbestanden zijn in te lezen. Er draait niets uit zo'n bestand.
- Bureauhuisstijl op al het papier: kleuren en lettertype gelden ook voor losse bladen, het logo staat in de kop van elke pagina en in de titelhoek van een tekening.
- Losse bladen afdrukken gaat via de vellen van het afdrukvoorbeeld, zodat de kop en de voet niet meer midden op de pagina staan.
- Eén knop Add sheet in het projectpaneel, met daarachter alle bladsoorten: nieuw of uit een bestand.
- Formulebibliotheek: elk van de 137 formules heeft een eigen schets.
- Library: de app haalt de voorbeelden bij het opstarten uit de repository, zodat een fout hersteld is zonder nieuwe release. De laatste complete stand blijft bewaard voor als er geen verbinding is.
- Jupyter: de uitvoer houdt het nummer van zijn cel.

## v2026.45.0 — 2026-11-03

- Eerste release onder de naam Open CalcSheet Studio, vanuit de openbare repository en op OpenAEC Blueprint.
- Nieuwe bladsoorten naast het rekenblad: spreadsheet, canvas, grafblad, tekenblad, Markdown en Jupyter-notebook.
- Nieuwe modules: Tweepaalspoer, een gewapendbetonnen poer op twee palen, en Ligger van hout of staal.
- Knop Rapport: één klik plus een bestandsnaam levert een PDF, met alle bladsoorten en met paginanummers in de inhoudsopgave.
- Rekenkern: een los stuk rekentekst met ingangen en uitgangen, en de graaf gaat mee in IFCX.
- De uitvoer volgt de taal van de app, en de Library met voorbeelden is erbij.
- Feedbackvenster in de titelbalk.
- Installers zijn ondertekend, met één versienummer overal.
- Beveiliging: `@js`-blokken zijn afgeschermd en het WebRTC-lek daarin is gedicht.
