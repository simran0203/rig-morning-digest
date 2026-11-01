import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestRow } from '../src/digest/types.js';

const NORMAL = '2026-01-10';
const EMPTY = '2026-01-11';
const BAD = '2026-01-12';
const MISSING = '2026-01-13';

type Line = { at: string; job: string; status: 'ok' | 'retry' | 'fail'; owner: string | null; error?: string };

const normalLines: Line[] = [
  { at: '2026-01-10T01:00:00+01:00', job: 'lane/sync', status: 'ok', owner: 'rook' },
  { at: '2026-01-10T01:10:00+01:00', job: 'fixtures/refresh', status: 'retry', owner: 'rook', error: 'upstream 503' },
  { at: '2026-01-10T01:20:00+01:00', job: 'fixtures/refresh', status: 'retry', owner: 'rook', error: 'upstream 503' },
  { at: '2026-01-10T01:30:00+01:00', job: 'fixtures/refresh', status: 'retry', owner: 'rook', error: 'upstream 503' },
  { at: '2026-01-10T01:40:00+01:00', job: 'fixtures/refresh', status: 'ok', owner: 'rook' },
  { at: '2026-01-10T02:00:00+01:00', job: 'export/csv', status: 'fail', owner: 'ana', error: 'disk full' },
  { at: '2026-01-10T03:00:00+01:00', job: 'cache/warm', status: 'ok', owner: null },
];

const jsonl = (lines: Line[]) => lines.map((l) => JSON.stringify(l)).join('\n') + '\n';

let dir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  writeFileSync(join(dir, `${NORMAL}.jsonl`), jsonl(normalLines));
  writeFileSync(join(dir, `${EMPTY}.jsonl`), '');
  writeFileSync(
    join(dir, `${BAD}.jsonl`),
    jsonl(normalLines.slice(0, 1)) + 'this is not json\n' + jsonl(normalLines.slice(5, 6)),
  );
  app = createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir: dir,
  });
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

type ApiBody = { night: string; rows: DigestRow[]; badLines: number };

async function api(night: string) {
  const res = await app.request(`/api/digest/${night}`);
  return { res, body: (await res.json()) as ApiBody };
}

/** The <tr> elements of the page's body rows (header row has <th> only). */
function pageRows(html: string): string[] {
  return (html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? []).filter((tr) => tr.includes('<td'));
}

function firstCell(tr: string): string {
  const m = /<td[^>]*>([\s\S]*?)<\/td>/.exec(tr);
  return (m?.[1] ?? '').replace(/<[^>]+>/g, '').trim();
}

describe('GET /digest/:night', () => {
  it('renders the normal night with the lane banner', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const res = await app.request(`/digest/${NORMAL}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    expect(html).toContain('lane-07');
    expect(html).toContain('lane/sync');
  });

  it('answers 404 with the layout for a night with no file', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const res = await app.request(`/digest/${MISSING}`);
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('TEST-MARKER');
  });

  it('says "nothing ran" for the empty night', async () => {
    const res = await app.request(`/digest/${EMPTY}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
    expect(pageRows(html)).toEqual([]);
  });

  it('still renders a night with a bad line and reports it', async () => {
    const res = await app.request(`/digest/${BAD}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('lane/sync');
    expect(html).toContain('export/csv');
    expect(html).toContain('1 line did not parse');
  });

  it('marks 3-retry and fail rows with warn, and only those', async () => {
    const html = await (await app.request(`/digest/${NORMAL}`)).text();
    const byJob = new Map(pageRows(html).map((tr) => [firstCell(tr), tr]));
    expect(byJob.get('fixtures/refresh')).toMatch(/^<tr[^>]*class="[^"]*\bwarn\b/);
    expect(byJob.get('export/csv')).toMatch(/^<tr[^>]*class="[^"]*\bwarn\b/);
    expect(byJob.get('lane/sync')).not.toMatch(/\bwarn\b/);
    expect(byJob.get('cache/warm')).not.toMatch(/\bwarn\b/);
  });

  it('renders a null owner as a dash', async () => {
    const html = await (await app.request(`/digest/${NORMAL}`)).text();
    const row = pageRows(html).find((tr) => firstCell(tr) === 'cache/warm');
    expect(row).toBeDefined();
    expect(row).toContain('—');
  });
});

describe('GET /api/digest/:night', () => {
  it('returns the normal night, sorted by job', async () => {
    const { res, body } = await api(NORMAL);
    expect(res.status).toBe(200);
    expect(body.night).toBe(NORMAL);
    expect(body.badLines).toBe(0);
    const jobs = body.rows.map((r) => r.job);
    expect(jobs).toEqual(['cache/warm', 'export/csv', 'fixtures/refresh', 'lane/sync']);
    const flaky = body.rows.find((r) => r.job === 'fixtures/refresh');
    expect(flaky).toMatchObject({ runs: 4, retries: 3, lastStatus: 'ok', lastError: null });
    expect(body.rows.find((r) => r.job === 'cache/warm')?.owner).toBeNull();
  });

  it('answers 404 with an error body for a night with no file', async () => {
    const { res, body } = await api(MISSING);
    expect(res.status).toBe(404);
    expect(body).toEqual({ error: 'no such night', night: MISSING });
  });

  it('returns no rows for the empty night', async () => {
    const { res, body } = await api(EMPTY);
    expect(res.status).toBe(200);
    expect(body.rows).toEqual([]);
    expect(body.badLines).toBe(0);
  });

  it('counts the bad line and still answers 200', async () => {
    const { res, body } = await api(BAD);
    expect(res.status).toBe(200);
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['export/csv', 'lane/sync']);
  });
});

describe('page and JSON agree', () => {
  it('list the same jobs in the same order', async () => {
    const html = await (await app.request(`/digest/${NORMAL}`)).text();
    const { body } = await api(NORMAL);
    expect(pageRows(html).map(firstCell)).toEqual(body.rows.map((r) => r.job));
  });
});
