/**
 * Controle van de komma als decimaalteken op papier (packages/core/src/decimaalteken.ts).
 *
 *   npm --prefix packages/core run build && node scripts/check-decimaalteken.mjs
 */
import { parse, evaluate, render, metDecimaalKomma, taalMetKomma } from "../packages/core/dist/index.js";

let fouten = 0;
function meld(ok, wat, detail) {
  if (!ok) fouten++;
  console.log(`  ${ok ? "✓" : "✗"}  ${wat}${!ok && detail !== undefined ? `  -> ${detail}` : ""}`);
}

const BRON = [
  "# 5.4 Belasting",
  "Zie art. 6.4.3 en 2.5 keer",
  "a = 2.5 m",
  "b = a * 1.25",
  "@last q_1 lijn",
  '  3.2 kN/m^2; 7.40 m; "vloer"',
  "  Q: 1 kN/m^2; 7.40 m",
  "  5.25 kN/m; 1",
  "@end",
].join("\n");
const punt = render(evaluate(parse(BRON), {}, {}, {}));
const komma = metDecimaalKomma(punt);
/** Wat de lezer ziet: zonder de verborgen MathML van een formule en zonder tags. */
const zicht = (html) => html.replace(/<span class="katex-mathml">.*?<\/span>(?=<span class="katex-html)/g, "").replace(/<[^>]+>/g, "|");

console.log("\nDe komma op papier");
const z = zicht(komma);
meld(z.includes("|2,5|") && z.includes("|1,25|") && z.includes("|3,125|") && !/\|\d+\.\d+\|/.test(z), "een getal in een formule krijgt een komma: 2,5, 1,25 en 3,125", z);
meld(z.includes("5.4 Belasting") && z.includes("Zie art. 6.4.3 en 2.5 keer"), "een kop en lopende tekst blijven zoals getypt", z);
meld(z.includes("|23,68|") && z.includes("|3,2 kN/m²|") && z.includes("|5,25 kN/m|") && z.includes("|28,93|"), "in een getallencel ook een getal met zijn eenheid", z);
meld(komma.includes('<span class="vul">,0</span>') && !komma.includes('<span class="vul">.'), "de onzichtbare cijfers volgen: ,0", komma.match(/<span class="vul">[^<]*/g)?.join(" "));
meld(/<annotation[^>]*>[^<]*2\.5/.test(komma), "de bron van een formule (annotation) houdt de punt");
meld(komma.replace(/,/g, ".") === punt.replace(/,/g, "."), "verder verandert er niets aan de uitwerking");

console.log("\nEen ingevuld getal in een tekstregel");
{
  const tekst = render(evaluate(parse(["w = 0.87 m", "'De wand is 'w' m breed, zie 5.4.", "'<b title='w'>vet</b>"].join("\n")), {}, {}, {}));
  meld(tekst.includes('De wand is <span class="calc-waarde">0.87</span> m breed, zie 5.4.'), "het ingevulde getal staat in een calc-waarde", tekst);
  meld(metDecimaalKomma(tekst).includes('<span class="calc-waarde">0,87</span> m breed, zie 5.4.'), "op papier 0,87; de getypte 5.4 blijft");
  meld(tekst.includes('<b title=0.87>vet</b>') || tekst.includes("title=0.87"), "binnen een tag komt er geen span omheen", tekst.match(/<b[^>]*>/)?.[0]);
}

console.log("\nLosse gevallen");
meld(metDecimaalKomma('<p x="1.5">1.5</p><td class="getal">2 × 3.5 m</td><td>v1.2.3</td><td class="uc">0.94</td>') === '<p x="1.5">1,5</p><td class="getal">2 × 3,5 m</td><td>v1.2.3</td><td class="uc">0,94</td>', "een eigenschap blijft, een versienummer blijft, UC krijgt een komma");
meld(metDecimaalKomma("<text>-12.50</text><text>−0.5</text><text> 3.0 </text>") === "<text>-12,50</text><text>−0,5</text><text> 3,0 </text>", "een maat in een tekening, ook negatief en met witruimte");
meld(metDecimaalKomma("<script>1.5</script><style>.a{margin:1.5em}</style><b>1.5</b>") === "<script>1.5</script><style>.a{margin:1.5em}</style><b>1,5</b>", "script en style blijven ongemoeid");
meld(metDecimaalKomma('<td class="getal">1.2.3</td><b>1.000.000</b>') === '<td class="getal">1.2.3</td><b>1.000.000</b>', "een reeks met meer punten is geen getal");
meld(taalMetKomma("nl") && taalMetKomma("nl-NL") && !taalMetKomma("en") && !taalMetKomma(undefined), "Nederlands schrijft een komma, Engels niet");

console.log(fouten === 0 ? "\nAlles klopt." : `\n${fouten} fout(en).`);
process.exit(fouten === 0 ? 0 : 1);
