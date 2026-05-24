// @ts-check

/**
 * @typedef {'1' | '2' | '3' | '4' | '5' | '6' | 'X'} ScoreBucket
 * @typedef {'all' | 'current' | 'last'} Timeframe
 * @typedef {Record<string, ScoreBucket>} ScoreMap
 * @typedef {Record<ScoreBucket, number>} ScoreBuckets
 * @typedef {{ played: number, wins: number, buckets: ScoreBuckets }} PlayerStat
 * @typedef {[string, PlayerStat]} RankedPlayer
 * @typedef {{ start: string, end: string }} Period
 * @typedef {{ offset: -2 | -1 | 0, weight: number }} ResultDateCandidate
 * @typedef {{ result: DailyResult, resultDate: string, weight: number }} EraLink
 * @typedef {{ base: string, links: EraLink[] }} EraCandidate
 * @typedef {{ base: string, score: number, support: number, links: EraLink[] }} SelectedEra
 * @typedef {{ sourceDistance: number, dateDistance: number }} NeighborDistance
 * @typedef {{ serverName: string, timeframe: Timeframe, excludedDates: string, rawText: string, aliases: Record<string, string>, flaggedUsers: string[] }} AppState
 * @typedef {{ streak: number, timestampLine: string | null, postedDate: string | null, postedHour: number | null, scores: ScoreMap, resultDate: string | null, eraBase: string | null, sourceIndex: number | null }} DailyResult
 * @typedef {{ serverName: HTMLInputElement, timeframe: HTMLSelectElement, excludedDates: HTMLInputElement, pasteBox: HTMLTextAreaElement, channelInstruction: HTMLElement, searchTerm: HTMLElement, notice: HTMLElement, reportFrame: HTMLElement, reportStatus: HTMLElement, generatedActions: HTMLElement, generateReport: HTMLButtonElement, copyPng: HTMLButtonElement, downloadPng: HTMLButtonElement, aliasRoster: HTMLElement, appVersion: HTMLElement }} Elements
 */

// Release: keep APP_VERSION in sync with the index.html module query string.
export const APP_VERSION = '1.7.0';

const STORE_KEY = 'wordleReport.v1';
/** @type {ScoreBucket[]} */
const SCORE_ORDER = ['1', '2', '3', '4', '5', '6', 'X'];
/** @type {ScoreBuckets} */
const SCORE_VALUE = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, X: 7 };
/** @type {ResultDateCandidate[]} */
const RESULT_DATE_CANDIDATES = [
  { offset: -1, weight: 1 },
  { offset: -2, weight: 0.45 },
  { offset: 0, weight: 0.15 },
];
const MIN_ERA_SUPPORT = 3;
const MIN_ERA_SCORE = 3;
const MAX_POSTED_DATE_DISTANCE = 4;
// Anchor for the official NYT Wordle number, in puzzle-date form. Two known
// bot messages cross-check this: 2026-05-08 message → "Wordle No 1784" (about
// puzzle 2026-05-07), and 2026-04-04 message → "1750" (about puzzle 2026-04-03).
const WORDLE_ANCHOR = { puzzleDate: '2026-05-07', number: 1784 };
/** @type {AppState} */
const DEFAULT_STATE = {
  serverName: 'My Discord',
  timeframe: 'all',
  excludedDates: '',
  rawText: '',
  aliases: {},
  flaggedUsers: [],
};

/** @type {Elements | null} */
let els = null;

/** @type {AppState} */
let state = { ...DEFAULT_STATE, aliases: {}, flaggedUsers: [] };
/** @type {HTMLElement | null} */
let lastRenderedReport = null;
let lastRenderedFileName = 'wordle-report.png';
/** @type {Blob | null} */
let lastRenderedBlob = null;
/** @type {string | null} */
let lastRenderedUrl = null;
let reportGenerated = false;
/** @type {ReturnType<typeof setTimeout> | undefined} */
let noticeTimer;

if (typeof document !== 'undefined') init();

function init() {
  els = getElements();
  state = loadState();
  setVersionText();
  bindEvents();
  bindAliasEvents();
  syncInputsFromState();
  refreshStatus();
  renderAliasRoster();
  markReportStale();
}

/** @param {string} id */
function $(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element;
}

function getElements() {
  return {
    serverName: /** @type {HTMLInputElement} */ ($('serverName')),
    timeframe: /** @type {HTMLSelectElement} */ ($('timeframe')),
    excludedDates: /** @type {HTMLInputElement} */ ($('excludedDates')),
    pasteBox: /** @type {HTMLTextAreaElement} */ ($('pasteBox')),
    channelInstruction: $('channelInstruction'),
    searchTerm: $('searchTerm'),
    notice: $('notice'),
    reportFrame: $('reportFrame'),
    reportStatus: $('reportStatus'),
    generatedActions: $('generatedActions'),
    generateReport: /** @type {HTMLButtonElement} */ ($('generateReport')),
    copyPng: /** @type {HTMLButtonElement} */ ($('copyPng')),
    downloadPng: /** @type {HTMLButtonElement} */ ($('downloadPng')),
    aliasRoster: $('aliasRoster'),
    appVersion: $('appVersion'),
  };
}

function setVersionText() {
  assertEls().appVersion.textContent = `v${APP_VERSION}`;
}

function assertEls() {
  if (!els) throw new Error('App has not initialized.');
  return els;
}

function bindEvents() {
  /** @type {Array<keyof Pick<Elements, 'serverName' | 'timeframe' | 'excludedDates'>>} */
  const syncedInputs = ['serverName', 'timeframe', 'excludedDates'];
  syncedInputs.forEach((key) => {
    assertEls()[key].addEventListener('input', () => {
      const input = assertEls()[key];
      if (key === 'timeframe') state.timeframe = /** @type {Timeframe} */ (input.value);
      else state[key] = input.value;
      saveState();
      refreshStatus();
      markReportStale();
    });
  });

  $('copySearch').addEventListener('click', () => copyText(assertEls().searchTerm.textContent || ''));
  $('appendData').addEventListener('click', appendData);
  $('clearDataTop').addEventListener('click', clearData);
  $('generateReport').addEventListener('click', renderReport);
  $('copyPng').addEventListener('click', copyPng);
  $('downloadPng').addEventListener('click', downloadPng);
}

/** @returns {AppState} */
function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    return {
      ...DEFAULT_STATE,
      ...saved,
      timeframe: /** @type {Timeframe} */ (saved.timeframe || DEFAULT_STATE.timeframe),
      aliases: { ...(saved.aliases || {}) },
      flaggedUsers: Array.isArray(saved.flaggedUsers) ? saved.flaggedUsers : [],
    };
  } catch {
    return { ...DEFAULT_STATE, aliases: {}, flaggedUsers: [] };
  }
}

function saveState() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

function syncInputsFromState() {
  assertEls().serverName.value = state.serverName || DEFAULT_STATE.serverName;
  assertEls().timeframe.value = state.timeframe || DEFAULT_STATE.timeframe;
  assertEls().excludedDates.value = state.excludedDates || '';
}

function appendData() {
  const incoming = assertEls().pasteBox.value.trim();
  if (!incoming) return showNotice('Paste some Discord search results first.');
  state.rawText = [state.rawText.trim(), incoming].filter(Boolean).join('\n\n');
  assertEls().pasteBox.value = '';
  saveState();
  refreshStatus();
  renderAliasRoster();
  markReportStale();
  showNotice('Wordle stats recorded!', 'success');
}

function clearData() {
  if (!confirm('Clear all stored Wordle bot text, aliases, and flags from this browser?')) return;
  state.rawText = '';
  state.aliases = {};
  state.flaggedUsers = [];
  saveState();
  refreshStatus();
  renderAliasRoster();
  markReportStale();
  showNotice('Stored data cleared.');
}

function refreshStatus() {
  const results = parseDailyResults(state.rawText || '');
  const dated = results
    .map((r) => r.resultDate)
    .filter(Boolean)
    .sort();
  const latest = dated.at(-1) || null;
  const search = latest ? `after: ${latest} "Your group is on"` : '"Your group is on"';
  assertEls().channelInstruction.innerHTML = latest
    ? `You last generated stats from <strong>${formatDate(latest)}</strong> using <strong>${results.length}</strong> days of stored data. To update the stats, search each Discord channel where this community has played Wordle. Press <strong>Ctrl+F</strong> in a channel so Discord starts a channel-limited search, then append this search text.`
    : 'Open each Discord channel where this community has played Wordle. Press <strong>Ctrl+F</strong> in a channel so Discord starts a channel-limited search, then append this search text.';
  assertEls().searchTerm.textContent = search;
}

/**
 * Parse copied Discord search results into dated Wordle bot result records.
 *
 * @param {string} text
 * @returns {DailyResult[]}
 */
export function parseDailyResults(text) {
  const lines = normalizeRawText(text).split(/\r?\n/);
  /** @type {DailyResult[]} */
  const results = [];
  let sawWordle = false;
  let sawApp = false;
  /** @type {string | null} */
  let timestampLine = null;
  /** @type {DailyResult | null} */
  let current = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (current) {
      const scoreMatch = line.match(/^(?:\S+\s+)?([1-6X])\/6:\s*(.*)$/u);
      if (scoreMatch) {
        const bucket = /** @type {ScoreBucket} */ (scoreMatch[1]);
        for (const user of parseMentions(scoreMatch[2])) current.scores[user] = bucket;
        continue;
      }
      if (/\d+ solved(?: and \d+ unsolved)? games? of Wordle/.test(line)) {
        results.push(current);
        current = null;
        sawWordle = false;
        sawApp = false;
        timestampLine = null;
        continue;
      }
      if (line === 'Wordle') {
        results.push(current);
        current = null;
        sawWordle = true;
        sawApp = false;
        timestampLine = null;
        continue;
      }
      if (line.startsWith('Your group is on')) {
        const streakMatch = line.match(/Your group is on (?:a|an) (\d+) day streak/);
        if (streakMatch) {
          results.push(current);
          current = newResult(streakMatch[1], timestampLine);
          continue;
        }
      }
      continue;
    }

    if (line === 'Wordle') {
      sawWordle = true;
      sawApp = false;
      timestampLine = null;
      continue;
    }
    if (sawWordle && line === 'APP') {
      sawApp = true;
      continue;
    }
    if (!sawApp) continue;
    if (line.includes('—') && timestampLine === null) {
      timestampLine = line;
      continue;
    }
    if (line.startsWith('Your group is on')) {
      const streakMatch = line.match(/Your group is on (?:a|an) (\d+) day streak/);
      if (streakMatch) current = newResult(streakMatch[1], timestampLine);
    }
  }

  results.forEach((result, index) => {
    result.sourceIndex = index;
  });
  return dedupeResults(inferResultDates(results));
}

/** @param {string} text */
function normalizeRawText(text) {
  return String(text || '').replace(/\\r\\n|\\n/g, '\n');
}

/**
 * @param {string | number} streak
 * @param {string | null} timestampLine
 * @returns {DailyResult}
 */
function newResult(streak, timestampLine) {
  return {
    streak: Number(streak),
    timestampLine,
    postedDate: parseTimestampDate(timestampLine),
    postedHour: parseTimestampHour(timestampLine),
    scores: /** @type {ScoreMap} */ ({}),
    resultDate: null,
    eraBase: null,
    sourceIndex: null,
  };
}

/**
 * @param {string} blob
 * @returns {string[]}
 */
function parseMentions(blob) {
  const users = [];
  const re = /@(.+?)(?=\s@|$)/gu;
  let match = re.exec(blob);
  while (match !== null) {
    const user = (match[1] || '').trim();
    if (user) users.push(user);
    match = re.exec(blob);
  }
  return users;
}

/**
 * @param {DailyResult[]} results
 * @returns {DailyResult[]}
 */
function dedupeResults(results) {
  /** @type {Map<string, DailyResult>} */
  const byDate = new Map();
  /** @type {DailyResult[]} */
  const undated = [];
  for (const result of results) {
    if (!result.resultDate) {
      undated.push(result);
      continue;
    }
    const existing = byDate.get(result.resultDate);
    byDate.set(result.resultDate, existing ? mergeResults(existing, result) : result);
  }
  return [...byDate.values(), ...dedupeUndatedResults(undated)].sort(compareResults);
}

/**
 * @param {DailyResult} a
 * @param {DailyResult} b
 * @returns {DailyResult}
 */
function mergeResults(a, b) {
  const scores = { ...a.scores };
  for (const [user, score] of Object.entries(b.scores)) {
    const existing = scores[user];
    if (!existing || SCORE_VALUE[score] < SCORE_VALUE[existing]) scores[user] = score;
  }
  return Object.keys(b.scores).length > Object.keys(a.scores).length ? { ...b, scores } : { ...a, scores };
}

/**
 * @param {DailyResult[]} results
 * @returns {DailyResult[]}
 */
function dedupeUndatedResults(results) {
  /** @type {Map<number, DailyResult>} */
  const byStreak = new Map();
  for (const result of results) {
    const existing = byStreak.get(result.streak);
    if (!existing || Object.keys(result.scores).length > Object.keys(existing.scores).length) byStreak.set(result.streak, result);
  }
  return [...byStreak.values()];
}

/**
 * @param {DailyResult} a
 * @param {DailyResult} b
 */
function compareResults(a, b) {
  if (a.resultDate && b.resultDate) return a.resultDate.localeCompare(b.resultDate);
  if (a.resultDate) return -1;
  if (b.resultDate) return 1;
  return a.streak - b.streak;
}

/**
 * Resolve Wordle result dates while allowing multiple streak eras.
 *
 * @param {DailyResult[]} results
 * @returns {DailyResult[]}
 */
export function inferResultDates(results) {
  const selectedBases = selectEraBases(results);
  if (!selectedBases.length) return results;
  for (const result of results) if (result.postedDate) assignResultDate(result, selectedBases, results);
  for (const result of results) if (!result.resultDate) assignResultDate(result, selectedBases, results);
  return results;
}

/**
 * @param {DailyResult[]} results
 * @returns {string[]}
 */
function selectEraBases(results) {
  /** @type {Map<string, EraCandidate>} */
  const candidates = new Map();
  for (const result of results) {
    if (!result.postedDate) continue;
    for (const candidate of RESULT_DATE_CANDIDATES) {
      const resultDate = addDays(result.postedDate, candidate.offset);
      const base = addDays(resultDate, -result.streak + 1);
      const record = candidates.get(base) || { base, links: [] };
      record.links.push({ result, resultDate, weight: candidateWeight(result, candidate) });
      candidates.set(base, record);
    }
  }

  /** @type {string[]} */
  const selected = [];
  /** @type {Set<DailyResult>} */
  const covered = new Set();
  while (true) {
    /** @type {SelectedEra | null} */
    let best = null;
    for (const candidate of candidates.values()) {
      const fresh = candidate.links.filter((link) => !covered.has(link.result));
      const support = new Set(fresh.map((link) => link.result)).size;
      const score = fresh.reduce((sum, link) => sum + link.weight, 0);
      if (support < MIN_ERA_SUPPORT || score < MIN_ERA_SCORE) continue;
      if (!best || score > best.score || (score === best.score && support > best.support)) {
        best = { base: candidate.base, score, support, links: fresh };
      }
    }
    if (!best) break;
    selected.push(best.base);
    for (const link of best.links) covered.add(link.result);
  }

  while (selected.length) {
    const unresolved = new Set(results.filter((result) => result.postedDate && !fitsEraBases(result, selected)));
    if (!unresolved.size) return selected;
    if (unresolved.size < 2) return selected;
    const fallback = bestFallbackEra(candidates, unresolved);
    if (!fallback) return selected;
    selected.push(fallback);
  }

  if (!candidates.size) return selected;

  const fallback = bestFallbackEra(candidates, new Set(results.filter((result) => result.postedDate)));
  if (!fallback) return selected;
  selected.push(fallback);

  while (selected.length) {
    const unresolved = new Set(results.filter((result) => result.postedDate && !fitsEraBases(result, selected)));
    if (!unresolved.size) return selected;
    const nextFallback = bestFallbackEra(candidates, unresolved);
    if (!nextFallback) return selected;
    selected.push(nextFallback);
  }

  return selected;
}

/**
 * @param {Map<string, EraCandidate>} candidates
 * @param {Set<DailyResult>} unresolved
 * @returns {string | null}
 */
function bestFallbackEra(candidates, unresolved) {
  /** @type {{ base: string, score: number, support: number } | null} */
  let fallback = null;
  for (const candidate of candidates.values()) {
    const fresh = candidate.links.filter((link) => unresolved.has(link.result));
    if (!fresh.length) continue;
    const support = new Set(fresh.map((link) => link.result)).size;
    const score = fresh.reduce((sum, link) => sum + link.weight, 0);
    if (!fallback || score > fallback.score || (score === fallback.score && support > fallback.support)) fallback = { base: candidate.base, score, support };
  }
  return fallback?.base || null;
}

/**
 * @param {DailyResult} result
 * @param {string[]} eraBases
 */
function fitsEraBases(result, eraBases) {
  if (!result.postedDate) return false;
  for (const base of eraBases) {
    const resultDate = addDays(base, result.streak - 1);
    const offset = dateDiff(result.postedDate, resultDate);
    if (RESULT_DATE_CANDIDATES.some((candidate) => candidate.offset === offset)) return true;
  }
  return false;
}

/**
 * @param {DailyResult} result
 * @param {ResultDateCandidate} candidate
 */
function candidateWeight(result, candidate) {
  let weight = candidate.weight;
  if (candidate.offset === 0 && result.postedHour !== null && result.postedHour >= 4 && result.postedHour <= 22) weight *= 0.5;
  return weight;
}

/**
 * @param {DailyResult} result
 * @param {string[]} eraBases
 * @param {DailyResult[]} allResults
 */
function assignResultDate(result, eraBases, allResults) {
  /** @type {{ base: string, resultDate: string, score: number } | null} */
  let best = null;
  for (const base of eraBases) {
    const resultDate = addDays(base, result.streak - 1);
    const distance = result.postedDate ? Math.abs(dateDiff(resultDate, result.postedDate)) : nearestNeighborDateDistance(resultDate, result, allResults);
    if (result.postedDate && distance > MAX_POSTED_DATE_DISTANCE) continue;
    const offset = result.postedDate ? dateDiff(result.postedDate, resultDate) : null;
    const exactCandidate = RESULT_DATE_CANDIDATES.find((candidate) => candidate.offset === offset);
    const score = result.postedDate && exactCandidate ? candidateWeight(result, exactCandidate) : -distance;
    if (!best || score > best.score) best = { base, resultDate, score };
  }
  if (!best) return;
  result.eraBase = best.base;
  result.resultDate = best.resultDate;
}

/**
 * @param {string} resultDate
 * @param {DailyResult} target
 * @param {DailyResult[]} results
 */
function nearestNeighborDateDistance(resultDate, target, results) {
  /** @type {NeighborDistance[]} */
  const neighbors = results
    .flatMap((result) => {
      if (result === target || !result.resultDate || result.sourceIndex === null || target.sourceIndex === null) return [];
      return [{ sourceDistance: Math.abs(result.sourceIndex - target.sourceIndex), dateDistance: Math.abs(dateDiff(resultDate, result.resultDate)) }];
    })
    .sort((a, b) => a.sourceDistance - b.sourceDistance || a.dateDistance - b.dateDistance)
    .slice(0, 4);
  if (!neighbors.length) return 0;
  return Math.min(...neighbors.map((neighbor) => neighbor.dateDistance));
}

/**
 * @param {string} a
 * @param {string} b
 */
export function dateDiff(a, b) {
  const [ay, am, ad] = isoParts(a);
  const [by, bm, bd] = isoParts(b);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

/**
 * @param {string} iso
 * @returns {[number, number, number]}
 */
function isoParts(iso) {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error(`Invalid ISO date: ${iso}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** @param {string | null} line */
function parseTimestampDate(line) {
  if (!line) return null;
  const match = line.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!match) return null;
  let [, month, day, year] = match.map(Number);
  if (year < 100) year += 2000;
  return isoDate(year, month, day);
}

/** @param {string | null} line */
function parseTimestampHour(line) {
  if (!line) return null;
  const match = line.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const ampm = match[3].toUpperCase();
  if (ampm === 'PM' && hour < 12) hour += 12;
  else if (ampm === 'AM' && hour === 12) hour = 0;
  return hour;
}

/**
 * @param {DailyResult[]} results
 * @param {Timeframe} timeframe
 * @param {Set<string>} excludedDates
 * @returns {DailyResult[]}
 */
export function filterResults(results, timeframe, excludedDates) {
  const period = getPeriod(timeframe);
  return results.filter((result) => {
    if (result.resultDate && excludedDates.has(result.resultDate)) return false;
    if (!period) return true;
    return result.resultDate && result.resultDate >= period.start && result.resultDate <= period.end;
  });
}

/**
 * @param {DailyResult[]} results
 * @returns {Map<string, PlayerStat>}
 */
export function buildStats(results) {
  /** @type {Map<string, PlayerStat>} */
  const stats = new Map();
  for (const result of results) {
    const solvedValues = Object.values(result.scores)
      .filter((s) => s !== 'X')
      .map((s) => SCORE_VALUE[/** @type {ScoreBucket} */ (s)]);
    const bestScore = solvedValues.length ? Math.min(...solvedValues) : null;
    for (const [user, score] of Object.entries(result.scores)) {
      const stat = ensureStat(stats, user);
      stat.played += 1;
      stat.buckets[score] += 1;
      if (bestScore !== null && SCORE_VALUE[score] === bestScore) stat.wins += 1;
    }
  }
  return stats;
}

/**
 * @param {Map<string, PlayerStat>} stats
 * @param {string} user
 * @returns {PlayerStat}
 */
function ensureStat(stats, user) {
  if (!stats.has(user)) stats.set(user, { played: 0, wins: 0, buckets: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, X: 0 } });
  return /** @type {PlayerStat} */ (stats.get(user));
}

/** @param {PlayerStat} stat */
export function averageScore(stat) {
  return SCORE_ORDER.reduce((sum, score) => sum + SCORE_VALUE[score] * stat.buckets[score], 0) / (stat.played || 1);
}

/** @param {PlayerStat} stat */
export function solveRate(stat) {
  return stat.played ? (stat.played - stat.buckets.X) / stat.played : 0;
}

/**
 * @param {Map<string, PlayerStat>} stats
 * @param {number} minGames
 * @returns {RankedPlayer[]}
 */
export function qualifiedRows(stats, minGames) {
  return [...stats.entries()]
    .filter(([, stat]) => stat.played >= minGames)
    .sort((a, b) => averageScore(a[1]) - averageScore(b[1]) || b[1].played - a[1].played || a[0].localeCompare(b[0], undefined, { sensitivity: 'base' }));
}

function renderReport() {
  const allResults = parseDailyResults(state.rawText || '');
  const excludedDates = parseExcludedDates(state.excludedDates || '');
  const filtered = filterResults(allResults, state.timeframe || 'all', excludedDates);
  const results = applyAliases(filtered, state.aliases || {});
  const stats = buildStats(results);
  const minGames = Math.floor(results.length / 4);
  const rows = qualifiedRows(stats, minGames);

  if (!allResults.length) {
    assertEls().reportFrame.innerHTML = '';
    lastRenderedReport = null;
    reportGenerated = false;
    updateReportControls();
    showNotice('Paste Discord Wordle bot results before generating a report.');
    return;
  }

  const leaders = rows.length ? rows.filter((row) => averageScore(row[1]) === averageScore(rows[0][1])) : [];
  const totalEntries = results.reduce((sum, result) => sum + Object.keys(result.scores).length, 0);
  const avgPlayers = results.length ? totalEntries / results.length : 0;
  const bestDay = maxBy(results, (result) => Object.keys(result.scores).length);
  const hardestDay = maxBy(results, dailyAverage);
  const crownLeader = maxBy(rows, (row) => row[1].wins);
  const cleanest = maxBy(rows, (row) => solveRate(row[1]) * 100000 + row[1].played);
  const period = periodLabel(results, state.timeframe || 'all');
  const community = (state.serverName || 'My Discord').trim() || 'My Discord';
  const excludedText = excludedDates.size ? [...excludedDates].sort().map(formatDate).join(', ') : 'none';
  const flaggedUsers = flaggedUserSet(state.aliases || {});

  const rowHtml = rows.map(([user, stat], index) => playerRow(index + 1, user, stat, flaggedUsers)).join('');
  const winnerNames = leaders.length ? leaders.map(([user]) => playerNameHtml(user, flaggedUsers)).join(', ') : 'No qualifier';
  const winnerScore = leaders.length ? `${averageScore(leaders[0][1]).toFixed(3)} average score` : '-';
  const bestDayText = bestDay?.resultDate
    ? `${formatShortDate(bestDay.resultDate)} (Wordle #${wordleNumber(bestDay.resultDate)}): ${Object.keys(bestDay.scores).length} players`
    : '-';
  const hardestDayText = hardestDay?.resultDate
    ? `${formatShortDate(hardestDay.resultDate)} (Wordle #${wordleNumber(hardestDay.resultDate)}): ${dailyAverage(hardestDay).toFixed(2)} avg`
    : '-';
  const crownText = crownLeader ? `${playerNameHtml(crownLeader[0], flaggedUsers)}: ${crownLeader[1].wins} crowns` : '-';
  const cleanText = cleanest ? `${playerNameHtml(cleanest[0], flaggedUsers)}: ${(solveRate(cleanest[1]) * 100).toFixed(0)}% solved` : '-';

  assertEls().reportFrame.innerHTML = `<main class="wordle-report" id="shareReport">
    <section class="hero">
      <div class="panel headline">
        <div class="eyebrow">${escapeHtml(community)} Wordle</div>
        <h1>Wordle Standings</h1>
        <div class="sub">${escapeHtml(period)} · minimum ${minGames} games</div>
      </div>
      <div class="panel winner">
        <div class="label">Winner</div>
        <div class="name">${winnerNames}</div>
        <div class="score">${winnerScore}</div>
      </div>
    </section>
    <section class="stats">
      <div class="stat"><div class="num">${results.length}</div><div class="cap">counted days</div></div>
      <div class="stat"><div class="num">${avgPlayers.toFixed(1)}</div><div class="cap">avg players/day</div></div>
      <div class="stat"><div class="num tight">${crownText}</div><div class="cap">most daily crowns</div></div>
      <div class="stat"><div class="num tight">${cleanText}</div><div class="cap">cleanest solver</div></div>
    </section>
    <section class="panel board">
      <div class="row head"><div>#</div><div>Player</div><div>Avg</div><div>Games</div><div>Crowns</div><div>1/6</div><div>2/6</div><div>3/6</div><div>4/6</div><div>5/6</div><div>6/6</div><div>Miss</div></div>
      ${rowHtml || '<div class="row"><div></div><div class="user">No qualified players</div></div>'}
    </section>
    <div class="footer">Biggest turnout: ${escapeHtml(bestDayText)} · Hardest day: ${escapeHtml(hardestDayText)} · Misses count as 7 for averages</div>
    <div class="footer">Excluded dates: ${escapeHtml(excludedText)}</div>
  </main>`;
  lastRenderedReport = $('shareReport');
  lastRenderedFileName = fileNameForReport(state.timeframe || 'all');
  reportGenerated = true;
  lastRenderedBlob = null;
  if (lastRenderedUrl) URL.revokeObjectURL(lastRenderedUrl);
  lastRenderedUrl = null;
  updateReportControls();
  refreshStatus();
}

function markReportStale() {
  reportGenerated = false;
  lastRenderedReport = null;
  lastRenderedBlob = null;
  if (lastRenderedUrl) URL.revokeObjectURL(lastRenderedUrl);
  lastRenderedUrl = null;
  assertEls().reportFrame.innerHTML = '';
  updateReportControls();
}

function updateReportControls() {
  assertEls().reportStatus.textContent = reportGenerated ? 'Report generated.' : '';
  assertEls().generateReport.hidden = reportGenerated;
  assertEls().generatedActions.hidden = !reportGenerated;
}

/**
 * @param {Record<string, string>} aliases
 * @returns {Set<string>}
 */
function flaggedUserSet(aliases) {
  return new Set((state.flaggedUsers || []).map((user) => resolveAlias(user, aliases)));
}

/**
 * @param {string} user
 * @param {Set<string>} flaggedUsers
 */
function playerNameHtml(user, flaggedUsers) {
  if (!flaggedUsers.has(user)) return escapeHtml(user);
  const tooltip = 'History of Unsportsmanlike-Conduct';
  return `<span class="flagged-name"><span class="flag" title="${tooltip}" aria-label="${tooltip}">🚩</span><span class="player-label">${escapeHtml(user)}</span></span>`;
}

/**
 * @param {number} rank
 * @param {string} user
 * @param {PlayerStat} stat
 * @param {Set<string>} flaggedUsers
 */
function playerRow(rank, user, stat, flaggedUsers) {
  const b = stat.buckets;
  return `<div class="row">
    <div class="rank">${rank}</div>
    <div class="user">${playerNameHtml(user, flaggedUsers)}</div>
    <div class="metric">${averageScore(stat).toFixed(3)}</div>
    <div class="metric">${stat.played}</div>
    <div class="metric">${stat.wins}</div>
    <div class="metric score-count">${b['1']}</div>
    <div class="metric score-count">${b['2']}</div>
    <div class="metric score-count">${b['3']}</div>
    <div class="metric score-count">${b['4']}</div>
    <div class="metric score-count">${b['5']}</div>
    <div class="metric score-count">${b['6']}</div>
    <div class="metric miss">${b.X}</div>
  </div>`;
}

async function copyPng() {
  assertEls().reportStatus.textContent = 'Preparing image...';
  const blob = lastRenderedBlob || (await reportBlob());
  if (!blob) {
    assertEls().reportStatus.textContent = 'Report generated.';
    return;
  }
  lastRenderedBlob = blob;
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    assertEls().reportStatus.textContent = 'Image copied.';
  } catch (error) {
    assertEls().reportStatus.textContent = 'Report generated.';
    showNotice(`Clipboard copy was blocked by the browser. Use Download image instead. (${error instanceof Error ? error.message : String(error)})`);
  }
}

async function downloadPng() {
  assertEls().reportStatus.textContent = 'Preparing image...';
  const blob = lastRenderedBlob || (await reportBlob());
  if (!blob) {
    assertEls().reportStatus.textContent = 'Report generated.';
    return;
  }
  lastRenderedBlob = blob;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = lastRenderedFileName;
  a.click();
  URL.revokeObjectURL(url);
  assertEls().reportStatus.textContent = 'Image downloaded.';
}

/** @returns {Promise<Blob | null>} */
async function reportBlob() {
  if (!lastRenderedReport) {
    showNotice('Generate a report first.');
    return null;
  }
  const canvas = await renderNodeToCanvas(lastRenderedReport);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

/**
 * @param {HTMLElement} node
 * @returns {Promise<HTMLCanvasElement>}
 */
async function renderNodeToCanvas(node) {
  const scale = 2;
  const width = Math.ceil(node.offsetWidth);
  const height = Math.ceil(node.offsetHeight);
  const style = $('report-style').textContent;
  const xhtml = `<div xmlns="http://www.w3.org/1999/xhtml"><style>${style}</style>${node.outerHTML}</div>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width * scale}" height="${height * scale}" viewBox="0 0 ${width} ${height}"><foreignObject width="100%" height="100%">${xhtml}</foreignObject></svg>`;
  // Chromium taints the canvas when an <img> loads an SVG-foreignObject from a blob: URL
  // even on same origin, so we serialize to a data: URL which renders without tainting.
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const img = new Image();
  img.decoding = 'async';
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error('SVG image failed to load'));
    img.src = url;
  });
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas rendering is unavailable.');
  ctx.fillStyle = '#111318';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * @param {string} name
 * @param {Record<string, string>} aliases
 */
function resolveAlias(name, aliases) {
  const seen = new Set();
  let current = name;
  while (aliases[current] && !seen.has(current)) {
    seen.add(current);
    current = aliases[current] || current;
  }
  return current;
}

/**
 * @param {DailyResult[]} results
 * @param {Record<string, string>} aliases
 * @returns {DailyResult[]}
 */
export function applyAliases(results, aliases) {
  if (!aliases || !Object.keys(aliases).length) return results;
  return results.map((result) => {
    /** @type {ScoreMap} */
    const merged = {};
    for (const [user, score] of Object.entries(result.scores)) {
      const canonical = resolveAlias(user, aliases);
      const existing = merged[canonical];
      if (!existing || SCORE_VALUE[score] < SCORE_VALUE[existing]) merged[canonical] = score;
    }
    return { ...result, scores: merged };
  });
}

/** @returns {Set<string>} */
function detectedUsers() {
  const all = parseDailyResults(state.rawText || '');
  /** @type {Set<string>} */
  const set = new Set();
  for (const r of all) for (const u of Object.keys(r.scores)) set.add(u);
  return set;
}

function renderAliasRoster() {
  const detected = detectedUsers();
  const aliases = state.aliases || {};
  const aliasKeys = new Set(Object.keys(aliases));
  const flaggedUsers = flaggedUserSet(aliases);

  const primaries = new Set();
  for (const u of detected) if (!aliasKeys.has(u)) primaries.add(u);
  for (const p of Object.values(aliases)) primaries.add(p);

  if (!primaries.size) {
    assertEls().aliasRoster.innerHTML = '<div class="alias-empty">Player names will appear here once you add Discord data above.</div>';
    return;
  }

  /** @type {Map<string, string[]>} */
  const groupMap = new Map();
  for (const p of primaries) groupMap.set(p, []);
  for (const [a, p] of Object.entries(aliases)) {
    if (!groupMap.has(p)) groupMap.set(p, []);
    groupMap.get(p)?.push(a);
  }

  /** @type {(a: string, b: string) => number} */
  const sortNames = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' });
  const sortedPrimaries = [...primaries].sort(sortNames);

  const eligible = new Set();
  for (const u of detected) if (!aliasKeys.has(u)) eligible.add(u);
  for (const p of Object.values(aliases)) eligible.add(p);
  const datalistHtml = [...eligible]
    .sort(sortNames)
    .map((u) => `<option value="${escapeHtml(u)}"></option>`)
    .join('');

  const rowsHtml = sortedPrimaries
    .map((primary) => {
      const groupAliases = (groupMap.get(primary) || []).slice().sort(sortNames);
      const chipsHtml = groupAliases
        .map(
          (a) =>
            `<span class="alias-chip"><span>${escapeHtml(a)}</span><button type="button" data-remove-alias="${escapeHtml(a)}" aria-label="Remove ${escapeHtml(a)}">×</button></span>`,
        )
        .join('');
      const flagged = flaggedUsers.has(primary);
      return `<div class="alias-row">
      <div class="alias-primary">${escapeHtml(primary)}</div>
      <div class="alias-chips">${chipsHtml}<span class="alias-add"><input type="text" list="aliasDatalist" placeholder="Old name…" data-add-for="${escapeHtml(primary)}" autocomplete="off" spellcheck="false"></span></div>
      <button type="button" class="flag-toggle${flagged ? ' active' : ''}" data-toggle-flag="${escapeHtml(primary)}" aria-pressed="${flagged}" title="History of Unsportsmanlike-Conduct">🚩 ${flagged ? 'Flagged' : 'Flag'}</button>
    </div>`;
    })
    .join('');

  assertEls().aliasRoster.innerHTML = `<datalist id="aliasDatalist">${datalistHtml}</datalist><div class="alias-roster-list">${rowsHtml}</div>`;
}

/**
 * @param {string} primary
 * @param {string} alias
 */
function addAlias(primary, alias) {
  if (!primary || !alias) return;
  if (alias === primary) {
    showNotice('A player cannot be their own alias.');
    return;
  }
  state.aliases = state.aliases || {};
  if (state.aliases[alias] === primary) return;
  if (state.aliases[alias]) {
    showNotice(`${alias} is already merged into ${state.aliases[alias]}. Remove that first.`);
    return;
  }
  for (const [a, p] of Object.entries(state.aliases)) {
    if (p === alias) state.aliases[a] = primary;
  }
  state.aliases[alias] = primary;
  saveState();
  renderAliasRoster();
  markReportStale();
  showNotice(`Merged ${alias} → ${primary}.`, 'success');
}

/** @param {string} alias */
function removeAlias(alias) {
  if (!state.aliases || !(alias in state.aliases)) return;
  const primary = state.aliases[alias];
  delete state.aliases[alias];
  saveState();
  renderAliasRoster();
  markReportStale();
  showNotice(`Unmerged ${alias} from ${primary}.`);
}

/** @param {string} user */
function toggleFlag(user) {
  const aliases = state.aliases || {};
  const canonical = resolveAlias(user, aliases);
  const current = state.flaggedUsers || [];
  const alreadyFlagged = current.some((flaggedUser) => resolveAlias(flaggedUser, aliases) === canonical);
  state.flaggedUsers = alreadyFlagged ? current.filter((flaggedUser) => resolveAlias(flaggedUser, aliases) !== canonical) : [...current, canonical];
  saveState();
  renderAliasRoster();
  markReportStale();
  showNotice(`${canonical} ${alreadyFlagged ? 'unflagged' : 'flagged'}.`, alreadyFlagged ? undefined : 'success');
}

function bindAliasEvents() {
  assertEls().aliasRoster.addEventListener('click', (e) => {
    const target = /** @type {Element | null} */ (e.target instanceof Element ? e.target : null);
    const flagBtn = target?.closest('[data-toggle-flag]');
    if (flagBtn) {
      const user = flagBtn.getAttribute('data-toggle-flag');
      if (user) toggleFlag(user);
      return;
    }
    const btn = target?.closest('[data-remove-alias]');
    if (!btn) return;
    const alias = btn.getAttribute('data-remove-alias');
    if (alias) removeAlias(alias);
  });
  assertEls().aliasRoster.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const input = e.target instanceof HTMLInputElement ? e.target : null;
    if (!input?.matches('input[data-add-for]')) return;
    e.preventDefault();
    commitAddAlias(input);
  });
  assertEls().aliasRoster.addEventListener('change', (e) => {
    const input = e.target instanceof HTMLInputElement ? e.target : null;
    if (!input?.matches('input[data-add-for]')) return;
    commitAddAlias(input);
  });
}

/** @param {HTMLInputElement} input */
function commitAddAlias(input) {
  const primary = input.getAttribute('data-add-for');
  const alias = input.value.trim();
  if (!primary || !alias) return;
  addAlias(primary, alias);
}

/**
 * @param {string} value
 * @returns {Set<string>}
 */
export function parseExcludedDates(value) {
  return new Set(
    (value || '')
      .split(/[\s,]+/)
      .map((v) => v.trim())
      .filter((v) => /^\d{4}-\d{2}-\d{2}$/.test(v)),
  );
}

/**
 * @param {Timeframe} timeframe
 * @returns {Period | null}
 */
function getPeriod(timeframe) {
  if (timeframe === 'all') return null;
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  if (timeframe === 'current') {
    return { start: isoDate(year, month, 1), end: isoDate(year, month + 1, 0) };
  }
  if (timeframe === 'last') {
    return { start: isoDate(year, month - 1, 1), end: isoDate(year, month, 0) };
  }
  return null;
}

/**
 * @param {DailyResult[]} results
 * @param {Timeframe} timeframe
 */
function periodLabel(results, timeframe) {
  const dates = results.flatMap((r) => (r.resultDate ? [r.resultDate] : [])).sort();
  if (timeframe === 'current') return monthLabel(new Date());
  if (timeframe === 'last') {
    const now = new Date();
    return monthLabel(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  }
  if (!dates.length) return 'All Time';
  const first = dates[0];
  const last = dates.at(-1);
  return first && last ? `${formatDate(first)} to ${formatDate(last)}` : 'All Time';
}

/** @param {Date} d */
function monthLabel(d) {
  return d.toLocaleString(undefined, { month: 'long', year: 'numeric' });
}

/** @param {DailyResult} result */
export function dailyAverage(result) {
  const scores = Object.values(result.scores);
  return scores.length ? scores.reduce((sum, score) => sum + SCORE_VALUE[score], 0) / scores.length : 0;
}

/**
 * @template T
 * @param {T[]} items
 * @param {(item: T) => number} key
 * @returns {T | null}
 */
function maxBy(items, key) {
  /** @type {T | null} */
  let best = null;
  let bestValue = -Infinity;
  for (const item of items) {
    const value = key(item);
    if (value > bestValue) {
      best = item;
      bestValue = value;
    }
  }
  return best;
}

/**
 * @param {number} year
 * @param {number} month
 * @param {number} day
 */
function isoDate(year, month, day) {
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.toISOString().slice(0, 10);
}

/**
 * @param {string} iso
 * @param {number} days
 */
export function addDays(iso, days) {
  const [year, month, day] = isoParts(iso);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return d.toISOString().slice(0, 10);
}

/** @param {string | null} puzzleDate */
export function wordleNumber(puzzleDate) {
  if (!puzzleDate) return null;
  const [ay, am, ad] = isoParts(WORDLE_ANCHOR.puzzleDate);
  const [y, m, d] = isoParts(puzzleDate);
  const days = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ay, am - 1, ad)) / 86400000);
  return WORDLE_ANCHOR.number + days;
}

/** @param {string} iso */
function formatDate(iso) {
  const [year, month, day] = isoParts(iso);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/** @param {string} iso */
function formatShortDate(iso) {
  const [year, month, day] = isoParts(iso);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** @param {unknown} value */
function escapeHtml(value) {
  const entities = /** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' });
  return String(value).replace(/[&<>'"]/g, (ch) => entities[ch] || ch);
}

/** @param {Timeframe} timeframe */
function fileNameForReport(timeframe) {
  const prefix =
    (state.serverName || 'wordle')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'wordle';
  return `${prefix}-${timeframe}-wordle.png`;
}

/** @param {string} value */
async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    showNotice('Search text copied.');
  } catch {
    showNotice('Could not copy automatically. Select the search text and copy it manually.');
  }
}

/**
 * @param {string} message
 * @param {'success'} [variant]
 */
function showNotice(message, variant) {
  assertEls().notice.textContent = message;
  assertEls().notice.classList.remove('success');
  if (variant) assertEls().notice.classList.add(variant);
  assertEls().notice.classList.add('show');
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => assertEls().notice.classList.remove('show'), 5200);
}
