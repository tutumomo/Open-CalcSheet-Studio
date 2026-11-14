/**
 * De registry: alle tools van de app, voor MCP en REST tegelijk.
 *
 * Elke tool staat hier één keer. MCP (dispatcher.ts) toont ze in tools/list;
 * REST (rest.ts) maakt van de `rest`-routes van elke tool een route onder
 * /api/v1 en biedt elke tool ook aan als POST /api/v1/tools/{naam}. Beide
 * draaien de tool via voerToolUit (uitvoeren.ts). Een nieuwe tool komt dus
 * vanzelf in MCP, REST, GET /api/v1/tools en de OpenAPI-specificatie.
 *
 * Indeling: tools/project.ts (project, bestanden, rapport, ongedaan maken),
 * tools/bladen.ts (modules, bladen, doorrekenen), tools/overig.ts
 * (modulebibliotheek, formules, export, afdrukken, weergave, instellingen),
 * tools/taken.ts (batch en achtergrondjobs).
 */
import type { McpToolDef } from "./contracts.ts";
import { PROJECTTOOLS } from "./tools/project.ts";
import { BLADTOOLS } from "./tools/bladen.ts";
import { OVERIGE_TOOLS } from "./tools/overig.ts";
import { TAAKTOOLS } from "./tools/taken.ts";
import { INHOUDTOOLS } from "./tools/inhoud.ts";

export { vergeetUitkomsten } from "./tools/hulp.ts";

export const MCP_TOOLS: McpToolDef[] = [...PROJECTTOOLS, ...BLADTOOLS, ...INHOUDTOOLS, ...TAAKTOOLS, ...OVERIGE_TOOLS];
