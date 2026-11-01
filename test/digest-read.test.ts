import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { countNight } from '../src/digest/counts.js';
import { readNight } from '../src/digest/read.js';
import type { DigestRow } from '../src/digest/types.js';

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28');

  it('finds 5 jobs sorted by job and 1 bad line', () => {
    if (!night.found) throw new Error('night not found');
    expect(night.badLines).toBe(1);
    expect(night.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('folds each job into the real values', () => {
    if (!night.found) throw new Error('night not found');
    expect(night.rows).toEqual<DigestRow[]>([
      { job: 'digest/render', owner: null, runs: 1, retries: 0, lastStatus: 'ok', lastError: null,
        firstAt: '2026-10-29T05:41:09+01:00', lastAt: '2026-10-29T05:41:09+01:00' },
      { job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3, lastStatus: 'ok', lastError: null,
        firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00' },
      { job: 'lane/sync', owner: 'rook', runs: 8, retries: 1, lastStatus: 'ok', lastError: null,
        firstAt: '2026-10-28T23:00:06+01:00', lastAt: '2026-10-29T05:00:04+01:00' },
      { job: 'notes/backup', owner: 'lane-07', runs: 1, retries: 0, lastStatus: 'fail', lastError: 'quota exceeded',
        firstAt: '2026-10-29T04:00:01+01:00', lastAt: '2026-10-29T04:00:01+01:00' },
      { job: 'rig/rotate-logs', owner: 'lane-07', runs: 1, retries: 0, lastStatus: 'ok', lastError: null,
        firstAt: '2026-10-28T23:00:02+01:00', lastAt: '2026-10-28T23:00:02+01:00' },
    ]);
  });

  it('counts rows by last status', () => {
    if (!night.found) throw new Error('night not found');
    expect(countNight(night.rows)).toEqual({ ok: 4, retry: 0, fail: 1 });
  });
});

describe('readNight edge cases', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  const write = (night: string, lines: string[]) => writeFileSync(join(dir, `${night}.jsonl`), lines.join('\n'));

  it('missing night is not found', () => {
    expect(readNight(dir, '2026-01-01')).toEqual({ found: false, night: '2026-01-01' });
  });

  it('empty night is found with no rows', () => {
    write('2026-01-02', []);
    expect(readNight(dir, '2026-01-02')).toEqual({ found: true, night: '2026-01-02', rows: [], badLines: 0 });
  });

  it('keeps a row whose owner is null', () => {
    write('2026-01-03', ['{"at":"2026-01-03T01:00:00+01:00","job":"a","status":"ok","owner":null}']);
    const night = readNight(dir, '2026-01-03');
    if (!night.found) throw new Error('night not found');
    expect(night.rows).toHaveLength(1);
    expect(night.rows[0]?.owner).toBeNull();
  });

  it('rejects night names that are not YYYY-MM-DD', () => {
    write('2026-01-04', ['{"at":"x","job":"a","status":"ok","owner":"r"}']);
    for (const name of ['../runs/2026-10-28', '2026-1-4', '2026-01-04.jsonl', '', 'latest']) {
      expect(readNight(dir, name)).toEqual({ found: false, night: name });
    }
  });

  it('counts unparseable and invalid lines, skips blank ones', () => {
    write('2026-01-05', [
      '{"at":"t1","job":"a","status":"ok","owner":"r"}',
      '',
      '   ',
      'not json',
      '{"at":"t2","job":"a","status":"maybe","owner":"r"}',
      '{"at":"t3","job":"a","status":"ok"}',
      '{"job":"a","status":"ok","owner":"r"}',
      '[1,2]',
      '{"at":"t4","job":"a","status":"retry","owner":"s","error":"boom"}',
      '',
    ]);
    const night = readNight(dir, '2026-01-05');
    if (!night.found) throw new Error('night not found');
    expect(night.badLines).toBe(5);
    expect(night.rows).toEqual([
      { job: 'a', owner: 's', runs: 2, retries: 1, lastStatus: 'retry', lastError: 'boom', firstAt: 't1', lastAt: 't4' },
    ]);
  });
});

describe('countNight', () => {
  it('is all zeros for no rows', () => {
    expect(countNight([])).toEqual({ ok: 0, retry: 0, fail: 0 });
  });
});
