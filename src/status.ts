import { readdirSync } from 'node:fs';
import type { RigConfig } from './config.js';
import { countNight } from './digest/counts.js';
import { readNight } from './digest/read.js';
import type { NightCounts } from './digest/types.js';
import { lastBeat, type Beat } from './heartbeat.js';

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: NightSummary[];
};

// counts is null when the night is not found: the board renders `—`.
export type NightSummary = { night: string; counts: NightCounts | null };

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

export function readStatus(config: RigConfig): Status {
  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights: nightsOnDisk(config.runsDir).map((night) => {
      const read = readNight(config.runsDir, night);
      return { night, counts: read.found ? countNight(read.rows) : null };
    }),
  };
}
