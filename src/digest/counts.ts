import type { DigestRow, NightCounts } from './types.js';

// Plan morning-digest § 2c. A night's rows counted by last status, for the status board.
export function countNight(rows: DigestRow[]): NightCounts {
  const counts: NightCounts = { ok: 0, retry: 0, fail: 0 };
  for (const row of rows) counts[row.lastStatus]++;
  return counts;
}
