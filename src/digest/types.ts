// Plan morning-digest § 1. The contract between the run log reader (src/digest/read.ts) and
// everything that shows a night: the page, the JSON, the board link. Code against this file.
//
// Input: runs/<night>.jsonl, one JSON object per line:
//   { "at": "2026-10-29T01:30:00+01:00", "job": "fixtures/refresh", "status": "retry",
//     "owner": "rook", "error": "upstream 503" }   // `error` optional, `owner` may be null

/** A run's outcome, as written in the log. */
export type RunStatus = 'ok' | 'retry' | 'fail';

/** One job's night, folded from all of its log lines. */
export type DigestRow = {
  /** Job name as logged, e.g. "lane/sync". Unique within a night. */
  job: string;
  /** Owner of the job's last line. `null` stays `null`; views render it as `—`. */
  owner: string | null;
  /** Number of log lines for this job (every line counts, whatever its status). */
  runs: number;
  /** Number of those lines with status `retry`. Views mark 3 or more. */
  retries: number;
  /** Status of the job's last line. Views mark `fail`. */
  lastStatus: RunStatus;
  /** `error` of the job's last line, `null` if it had none. Views render `null` as `—`. */
  lastError: string | null;
  /** `at` of the job's first line, verbatim: keeps the log's offset, never converted to UTC. */
  firstAt: string;
  /** `at` of the job's last line, verbatim, same rule as `firstAt`. */
  lastAt: string;
};

/** What readNight returns. Check `found` first. */
export type Night =
  /** No runs/<night>.jsonl on disk: routes answer 404. */
  | { found: false; night: string }
  /**
   * The file exists. `rows` sorted by job (ascending); an empty `rows` means the night is
   * empty and renders "nothing ran". `badLines` counts non-blank lines that did not parse
   * into a run; they are skipped, never thrown, and the night still renders.
   */
  | { found: true; night: string; rows: DigestRow[]; badLines: number };

/** A found night's rows counted by last status, for the status board (§ 2c). */
export type NightCounts = Record<RunStatus, number>;
