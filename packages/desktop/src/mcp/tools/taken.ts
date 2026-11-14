/**
 * Lange en meervoudige rekenopdrachten (docs/OCSS_TW_開發需求規格.md, P1-10).
 *
 * De brug neemt één verzoek tegelijk en geeft na 120 s op. Twee wegen eromheen:
 *
 * - `calc_evaluate_batch`: meerdere teksten in één verzoek, elk met het antwoord dat
 *   calc_evaluate zou geven (of zijn fout), in dezelfde volgorde.
 * - `job_start` / `job_status` / `job_cancel`: dezelfde lijst op de achtergrond. Na elke
 *   tekst geeft de job de gebeurtenislus vrij (`setTimeout`), zodat de brug intussen
 *   andere verzoeken (job_status) kan afhandelen. Jobs staan alleen in het geheugen
 *   van de app; een herstart wist ze.
 *
 * Alles hier leest alleen: het project verandert niet.
 */
import type { JsonSchema, McpContext, McpToolDef, McpToolResultaat } from "../contracts.ts";
import { BLADTOOLS, rekenTekstUit } from "./bladen.ts";
import { LEZEN, fout, objectSchema, ok } from "./hulp.ts";

/** Hoogstens zoveel teksten in één batch of job. */
export const MAX_TEKSTEN = 200;
/** Zoveel afgelopen jobs blijven bewaard; de oudste gaat eerst weg. */
const MAX_BEWAARD = 20;

const calcSchema = BLADTOOLS.find((t) => t.name === "calc_evaluate")?.inputSchema as JsonSchema;

const itemsSchema: JsonSchema = {
  type: "array",
  description: `The texts to compute, each with the arguments of calc_evaluate (source, values, useProjectData, maxLines, conventionalUnits, strict). At most ${MAX_TEKSTEN}.`,
  items: calcSchema,
};

/** Eén antwoord in een batch: wat calc_evaluate gaf, of de fout in dezelfde vorm als REST. */
function itemAntwoord(index: number, r: McpToolResultaat): Record<string, unknown> {
  if (r.ok) return { index, ok: true, ...r.data };
  return { index, ok: false, error: { code: r.code, message: r.error, ...(r.data ? { data: r.data } : {}) } };
}

function rekenItem(item: unknown, ctx: McpContext): McpToolResultaat {
  try {
    return rekenTekstUit(item as Record<string, unknown>, ctx);
  } catch (e) {
    return { ok: false, code: "INTERNAL", error: `Internal error: ${e instanceof Error ? e.message : String(e)}` };
  }
}

function telling(resultaten: Record<string, unknown>[]): { succeeded: number; failed: number } {
  const succeeded = resultaten.filter((r) => r.ok === true).length;
  return { succeeded, failed: resultaten.length - succeeded };
}

// ── Jobs ────────────────────────────────────────────────────────────────────

type JobStaat = "running" | "done" | "cancelled";

interface Job {
  id: string;
  staat: JobStaat;
  totaal: number;
  resultaten: Record<string, unknown>[];
  gestart: number;
  klaar: number | null;
  stop: boolean;
}

const jobs = new Map<string, Job>();
let volgnummer = 0;

const slaap = () => new Promise<void>((klaar) => setTimeout(klaar, 0));

async function draai(job: Job, items: unknown[], ctx: McpContext): Promise<void> {
  for (let i = 0; i < items.length; i++) {
    // Eerst vrijgeven: zo komt job_start meteen terug en kan job_status tussendoor.
    await slaap();
    if (job.stop) {
      job.staat = "cancelled";
      job.klaar = Date.now();
      return;
    }
    job.resultaten.push(itemAntwoord(i, rekenItem(items[i], ctx)));
  }
  job.staat = "done";
  job.klaar = Date.now();
}

function ruimOp(): void {
  const af = [...jobs.values()].filter((j) => j.staat !== "running").sort((a, b) => (a.klaar ?? 0) - (b.klaar ?? 0));
  while (af.length > MAX_BEWAARD) jobs.delete(af.shift()!.id);
}

function jobJson(job: Job, metResultaten: boolean): Record<string, unknown> {
  return {
    jobId: job.id,
    state: job.staat,
    total: job.totaal,
    done: job.resultaten.length,
    ...telling(job.resultaten),
    startedAt: new Date(job.gestart).toISOString(),
    finishedAt: job.klaar === null ? null : new Date(job.klaar).toISOString(),
    ...(metResultaten ? { results: job.resultaten } : {}),
  };
}

const jobId = { type: "string", minLength: 1, description: "The job id from job_start." } as const;

function zoekJob(id: unknown): Job | McpToolResultaat {
  const job = jobs.get(String(id));
  return job ?? fout("NOT_FOUND", `Unknown job "${String(id)}". Jobs live only in memory until the app restarts.`);
}

/** Voor de controle: alle jobs weg. */
export function wisJobs(): void {
  jobs.clear();
}

export const TAAKTOOLS: McpToolDef[] = [
  {
    name: "calc_evaluate_batch",
    kind: "read",
    description:
      `Compute several calculation texts in one request without changing the project. Each item takes the arguments of calc_evaluate and gets the same answer calc_evaluate would give, or its error ({index, ok:false, error:{code, message, data}}), in the order of the items. At most ${MAX_TEKSTEN} items. ` +
      "For work that may take longer than the bridge timeout (120 s), use job_start.",
    inputSchema: objectSchema({ items: itemsSchema }, ["items"]),
    annotations: LEZEN,
    rest: [{ method: "POST", path: "/evaluate/batch" }],
    handler: (args, ctx) => {
      const items = args.items as unknown[];
      if (items.length > MAX_TEKSTEN) return fout("VALIDATION", `At most ${MAX_TEKSTEN} items per batch; got ${items.length}.`);
      const resultaten = items.map((item, i) => itemAntwoord(i, rekenItem(item, ctx)));
      return ok({ total: items.length, ...telling(resultaten), results: resultaten });
    },
  },

  {
    name: "job_start",
    kind: "read",
    description:
      `Start computing several calculation texts in the background (the items of calc_evaluate_batch) and return a jobId at once. Poll job_status for progress and results; job_cancel stops it. Does not change the project. Jobs live in memory only (the last ${MAX_BEWAARD} finished jobs are kept).`,
    inputSchema: objectSchema({ items: itemsSchema }, ["items"]),
    annotations: { ...LEZEN, readOnlyHint: false, idempotentHint: false },
    rest: [{ method: "POST", path: "/jobs", status: 201 }],
    handler: (args, ctx) => {
      const items = args.items as unknown[];
      if (items.length > MAX_TEKSTEN) return fout("VALIDATION", `At most ${MAX_TEKSTEN} items per job; got ${items.length}.`);
      volgnummer += 1;
      const job: Job = {
        id: `job-${Date.now().toString(36)}-${volgnummer}`,
        staat: "running",
        totaal: items.length,
        resultaten: [],
        gestart: Date.now(),
        klaar: null,
        stop: false,
      };
      jobs.set(job.id, job);
      ruimOp();
      void draai(job, items, ctx);
      return ok(jobJson(job, false));
    },
  },

  {
    name: "job_status",
    kind: "read",
    description:
      "The state of a background job: running, done or cancelled; how many items are done; and with results=true (default) the answers so far, each as in calc_evaluate_batch.",
    inputSchema: objectSchema(
      {
        jobId,
        results: { type: "boolean", description: "Include the answers so far. Default true." },
      },
      ["jobId"],
    ),
    annotations: LEZEN,
    rest: [{ method: "GET", path: "/jobs/{jobId}" }],
    handler: (args) => {
      const job = zoekJob(args.jobId);
      if (!("staat" in job)) return job;
      return ok(jobJson(job, args.results !== false));
    },
  },

  {
    name: "job_cancel",
    kind: "read",
    description:
      "Stop a background job after the item it is computing now. The answers so far stay available through job_status. A job that has finished is left as it is.",
    inputSchema: objectSchema({ jobId }, ["jobId"]),
    annotations: { ...LEZEN, readOnlyHint: false },
    rest: [{ method: "DELETE", path: "/jobs/{jobId}" }],
    handler: (args) => {
      const job = zoekJob(args.jobId);
      if (!("staat" in job)) return job;
      if (job.staat === "running") job.stop = true;
      return ok(jobJson(job, false));
    },
  },
];
