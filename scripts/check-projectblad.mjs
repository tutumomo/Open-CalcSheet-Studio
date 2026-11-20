/**
 * De eigen elementen van de projectgegevens (store/projectBlad.ts): rekentekst op het
 * canvas onder het formulier, die vóór elk blad rekent. Een variabele die daar staat,
 * geldt in elk blad; een fout daarin breekt geen blad; een blad mag de naam
 * overschrijven.
 *
 * Draaien:  node scripts/check-projectblad.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { evalOptiesVan } from "../packages/desktop/src/store/projectEenheden.ts";
import { projectOpties, projectTekstVan, projectWaardenVan, PROJECTBLAD, PROJECTBLAD_WAARDEN } from "../packages/desktop/src/store/projectBlad.ts";
import { projectScope, legeGegevens } from "../packages/desktop/src/store/projectGegevens.ts";
import { schrijfEenheden } from "../packages/desktop/src/store/canvasBlad.ts";
import { rekenUitwerking } from "../packages/desktop/src/components/calc/canvasRekenen.ts";

let fouten = 0;
const meld = (ok, wat, detail = "") => {
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK  " : "FOUT"} ${wat}${ok || !detail ? "" : "  -> " + detail}`);
};
const tekst = (html) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

const bron = schrijfEenheden([
  { id: "e1", x: 0, y: 0, tekst: "h_verd = ?{3} m" },
  { id: "e2", x: 0, y: 20, tekst: "ψ_0 = 0.7" },
]);
const project = {
  ...legeGegevens(),
  [PROJECTBLAD]: bron,
  [PROJECTBLAD_WAARDEN]: JSON.stringify({ h_verd: "2.5" }),
};

console.log("Opslag in de projectgegevens");
meld(projectOpties(legeGegevens()) === undefined, "zonder eigen elementen geen projecttekst in de opties");
meld(projectTekstVan(legeGegevens()) === undefined && evalOptiesVan(legeGegevens()).project === undefined, "een oud project rekent zoals voorheen");
meld(projectOpties(project)?.waarden.h_verd === "2.5", "de invoer van het projectblad gaat mee", JSON.stringify(projectOpties(project)));
meld(Object.keys(projectWaardenVan({ [PROJECTBLAD_WAARDEN]: "{kapot" })).length === 0, "kapotte invoer geldt als leeg");
meld(!(PROJECTBLAD in projectScope(project)), "de rekentekst zelf is geen variabele in de bladen");

console.log("\nIn elk blad");
// De projecttekst gaat apart mee: de worker krijgt hem per verzoek, deze kant kent hem via zetProjectTekst.
const metProject = (g) => ({ ...evalOptiesVan(g), project: projectTekstVan(g) });
const opties = metProject(project);
const blad = rekenUitwerking("H = 4*h_verd\nM = ψ_0*10", {}, projectScope(project), {}, undefined, opties);
meld(/10\s*m\b/.test(tekst(blad.html)), "een invoer van het projectblad geldt in het blad: H = 4·2,5 m = 10 m", tekst(blad.html).slice(0, 200));
meld(/=\s*7\b/.test(tekst(blad.html)), "een waarde van het projectblad geldt in het blad: M = 0,7·10 = 7", tekst(blad.html).slice(0, 300));
const eigen = rekenUitwerking("ψ_0 = 0.5\nM = ψ_0*10", {}, projectScope(project), {}, undefined, opties);
meld(/=\s*5\b/.test(tekst(eigen.html)), "een blad dat de naam zelf toekent, overschrijft de projectwaarde", tekst(eigen.html).slice(0, 200));
const canvas = rekenUitwerking(schrijfEenheden([{ id: "e1", x: 0, y: 0, tekst: "H = 2*h_verd" }]), {}, projectScope(project), {}, undefined, opties);
meld(canvas.eenheden?.some((u) => /5\s*m\b/.test(tekst(u.html))), "ook een canvas-blad kent de projectvariabelen", JSON.stringify(canvas.eenheden?.map((u) => tekst(u.html))));
meld(!/data-prompt="h_verd"/.test(blad.html), "het invoerveld van het projectblad staat niet in de uitwerking van het blad", blad.html.slice(0, 200));

console.log("\nFouten");
const kapot = { ...project, [PROJECTBLAD]: schrijfEenheden([{ id: "e1", x: 0, y: 0, tekst: "a = (" }]) };
let breekt = false;
let html = "";
try {
  html = rekenUitwerking("b = 2", {}, projectScope(kapot), {}, undefined, metProject(kapot)).html;
} catch {
  breekt = true;
}
meld(!breekt && /2/.test(tekst(html)), "een fout op het projectblad breekt geen blad", tekst(html).slice(0, 120));

if (fouten > 0) {
  console.error(`\nProjectblad: ${fouten} afwijking(en).`);
  process.exit(1);
}
console.log("\nProjectblad: alles klopt.");
