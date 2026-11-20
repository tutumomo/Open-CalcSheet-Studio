/**
 * Controle van de doorklikbare verwijzingen in de rapport-PDF
 * (packages/desktop/src/components/rapport/afdruk/drukvellen.ts): welk nummer een kop
 * draagt en wat in lopende tekst een verwijzing is.
 *
 *   node scripts/check-rapport-links.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { stripTypeScriptTypes } from "node:module";

let fouten = 0;
function meld(ok, wat, detail) {
  if (!ok) fouten++;
  console.log(`  ${ok ? "✓" : "✗"}  ${wat}${!ok && detail !== undefined ? `  -> ${detail}` : ""}`);
}
const gelijk = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// De zuivere functies uit drukvellen.ts, zonder de imports van de app eromheen. Met de
// regeleinden van Unix: een uitgecheckt bestand op Windows heeft er twee tekens voor.
const hier = dirname(fileURLToPath(import.meta.url));
const bron = readFileSync(join(hier, "../packages/desktop/src/components/rapport/afdruk/drukvellen.ts"), "utf8").replace(/\r\n/g, "\n");
const stuk = (begin, eind) => {
  const a = bron.indexOf(begin);
  return bron.slice(a, bron.indexOf(eind, a) + eind.length);
};
const code = [
  stuk("export function kopNiveau", "\n}\n"),
  stuk("export function kopNummer", "\n}\n"),
  stuk("const VERWIJZING_RE", ";\n"),
  stuk("export function verwijzingenIn", "\n}\n"),
].join("\n");
const { kopNiveau, kopNummer, verwijzingenIn } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(code)).toString("base64")}`);

console.log("\nHet nummer van een kop");
meld(kopNummer("5.2 Sneeuwbelastingen(Q)", "sneeuw") === "5.2", "een paragraaf: 5.2");
meld(kopNummer("6 Berekeningen", "berekeningen") === "6", "een hoofdstuk: 6");
meld(kopNummer("A.3Uitdraai spanten", "bijlage-blad-x") === "A.3" && kopNummer("A.12 Ligger", "x") === "A.12", "een blad in bijlage A, ook zonder spatie na het nummer");
meld(kopNummer("Bijlage A: Uitgebreide uitwerking", "bijlage-A") === "A" && kopNummer("Appendix B: Soil report", "bijlage-B") === "B", "de kop van een bijlage: zijn letter");
meld(kopNummer("1e verdieping", "kop-1") === null && kopNummer("Toelichting", "x") === null && kopNummer("2.5m overstek", "x") === null, "een kop zonder nummer, of met een getal dat geen nummer is");

console.log("\nHet niveau van een bladwijzer");
meld(kopNiveau("6", false) === 1 && kopNiveau("Bijlage A", false) === 1 && kopNiveau("Appendix B", false) === 1, "een hoofdstuk en een bijlage: 1");
meld(kopNiveau("6.3", false) === 2 && kopNiveau("A.12", false) === 2, "een paragraaf en een blad in bijlage A: 2");
meld(kopNiveau("Toelichting", true) === 3 && kopNiveau("6.1", true) === 3, "een kop uit een blad: 3");

console.log("\nVerwijzingen in lopende tekst");
const BEKEND = new Set(["4", "5.2", "6.3", "A", "A.3"]);
const links = (t) => verwijzingenIn(t, (n) => BEKEND.has(n)).filter((s) => s.nummer).map((s) => s.nummer);
const heel = (t) => verwijzingenIn(t, (n) => BEKEND.has(n)).map((s) => s.tekst).join("");
meld(gelijk(links("De sneeuw staat in paragraaf 5.2, zie 6.3 en bijlage A.3."), ["5.2", "6.3", "A.3"]), "zie, paragraaf en bijlage", links("De sneeuw staat in paragraaf 5.2, zie 6.3 en bijlage A.3.").join());
meld(gelijk(links("Zie ook 5.2. See also 6.3; chapter 4, appendix A and section 5.2."), ["5.2", "6.3", "4", "A", "5.2"]), "ook met een hoofdletter en in het Engels", links("Zie ook 5.2. See also 6.3; chapter 4, appendix A and section 5.2.").join());
meld(gelijk(links("Een overstek van 2.5 m en in 5.2 genoemd; zie 9.9 en bijlage C."), []), "een los getal en een nummer dat niet bestaat zijn geen verwijzing");
meld(gelijk(links("zie Aanzicht en bijlage Algemeen"), []), "een woord dat met een hoofdletter begint, is geen bijlageletter");
const zin = "Zie 5.2 voor de sneeuw (bijlage A.3).";
meld(heel(zin) === zin, "de tekst blijft dezelfde", heel(zin));
meld(gelijk(verwijzingenIn("zie 5.2", () => true), [{ tekst: "zie " }, { tekst: "5.2", nummer: "5.2" }]), "alleen het nummer is de link, het woord ervoor niet");

console.log(fouten === 0 ? "\nAlles klopt." : `\n${fouten} fout(en).`);
process.exit(fouten === 0 ? 0 : 1);
