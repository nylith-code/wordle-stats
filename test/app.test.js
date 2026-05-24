// @ts-check

import { describe, expect, test } from 'bun:test';
import { addDays, buildStats, dateDiff, parseDailyResults } from '../src/app.js';

const oneEraText = `Wordle
APP
 — 5/5/26, 9:00 AM
Your group is on a 3 day streak! 🔥 Here are yesterday's results:
👑 3/6: @Ada @Ben
4/6: @Cy
3 solved games of Wordle
Wordle
APP
 — 5/4/26, 8:00 AM
Your group is on a 2 day streak! 🔥 Here are yesterday's results:
👑 2/6: @Ada
5/6: @Ben
2 solved games of Wordle
Wordle
APP
 — 5/3/26, 8:00 AM
Your group is on a 1 day streak! 🔥 Here are yesterday's results:
👑 4/6: @Ada
X/6: @Cy
1 solved and 1 unsolved games of Wordle`;

const resetText = `Wordle
APP
 — 5/6/26, 8:00 AM
Your group is on a 2 day streak! 🔥 Here are yesterday's results:
👑 2/6: @Ada
3/6: @Ben
2 solved games of Wordle
Wordle
APP
 — 5/5/26, 9:00 AM
Your group is on a 1 day streak! 🔥 Here are yesterday's results:
👑 3/6: @Ada
4/6: @Cy
2 solved games of Wordle
Wordle
APP
 — 5/4/26, 8:00 AM
Your group is on a 2 day streak! 🔥 Here are yesterday's results:
👑 2/6: @Ada
5/6: @Ben
2 solved games of Wordle
Wordle
APP
 — 5/3/26, 8:00 AM
Your group is on a 1 day streak! 🔥 Here are yesterday's results:
👑 4/6: @Ada
X/6: @Cy
1 solved and 1 unsolved games of Wordle`;

describe('parseDailyResults', () => {
  test('normalizes legacy escaped newlines from localStorage exports', () => {
    const results = parseDailyResults(oneEraText.replace(/\n/g, '\\n'));

    expect(results).toHaveLength(3);
    expect(results.map((result) => result.resultDate)).toEqual(['2026-05-02', '2026-05-03', '2026-05-04']);
  });

  test('dedupes repeated pasted days by resolved date, not by streak alone', () => {
    const results = parseDailyResults(`${oneEraText}\n${oneEraText}`);

    expect(results).toHaveLength(3);
    expect(results.map((result) => result.streak)).toEqual([1, 2, 3]);
  });

  test('preserves repeated streaks when a channel reset creates a new era', () => {
    const results = parseDailyResults(resetText);

    expect(results).toHaveLength(4);
    expect(results.map((result) => result.streak)).toEqual([1, 2, 1, 2]);
    expect(results.map((result) => result.resultDate)).toEqual(['2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05']);
  });
});

describe('stats helpers', () => {
  test('builds player stats from parsed results', () => {
    const stats = buildStats(parseDailyResults(oneEraText));

    expect(stats.get('Ada')).toMatchObject({ played: 3, wins: 3 });
    expect(stats.get('Cy')?.buckets.X).toBe(1);
  });

  test('date helpers use UTC calendar math', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(dateDiff('2026-02-28', '2026-03-02')).toBe(2);
  });
});
