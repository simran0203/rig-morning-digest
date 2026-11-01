import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, Night, RunStatus } from './types.js';

// Plan morning-digest § 1. Reads runs/<night>.jsonl (night = YYYY-MM-DD) into one DigestRow
// per job. Sync, like src/status.ts. See types.ts for the contract.

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES: readonly RunStatus[] = ['ok', 'retry', 'fail'];

type Run = { at: string; job: string; status: RunStatus; owner: string | null; error: string | null };

function isStatus(v: unknown): v is RunStatus {
  return typeof v === 'string' && (STATUSES as readonly string[]).includes(v);
}

/** Parses one log line into a run, or `null` if it is not valid JSON or a field is missing/invalid. */
export function parseLine(line: string): Run | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  if (typeof o.at !== 'string' || o.at === '') return null;
  if (typeof o.job !== 'string' || o.job === '') return null;
  if (!isStatus(o.status)) return null;
  if (!('owner' in o) || (o.owner !== null && typeof o.owner !== 'string')) return null;
  if (o.error !== undefined && o.error !== null && typeof o.error !== 'string') return null;
  return {
    at: o.at,
    job: o.job,
    status: o.status,
    owner: o.owner,
    error: typeof o.error === 'string' ? o.error : null,
  };
}

export function readNight(runsDir: string, night: string): Night {
  if (!NIGHT.test(night)) return { found: false, night };
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { found: false, night };
    throw err;
  }

  const byJob = new Map<string, DigestRow>();
  let badLines = 0;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '') continue;
    const run = parseLine(line);
    if (run === null) {
      badLines++;
      continue;
    }
    const row = byJob.get(run.job);
    if (row === undefined) {
      byJob.set(run.job, {
        job: run.job,
        owner: run.owner,
        runs: 1,
        retries: run.status === 'retry' ? 1 : 0,
        lastStatus: run.status,
        lastError: run.error,
        firstAt: run.at,
        lastAt: run.at,
      });
    } else {
      row.owner = run.owner;
      row.runs++;
      if (run.status === 'retry') row.retries++;
      row.lastStatus = run.status;
      row.lastError = run.error;
      row.lastAt = run.at;
    }
  }

  const rows = [...byJob.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { found: true, night, rows, badLines };
}
