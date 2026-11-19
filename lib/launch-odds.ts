// Token Radar's launch-odds model (radar-3 polish): P(launch within 2 years),
// fitted from the sealed snapshot alone — each protocol's listed_at plus
// whether it records a token yet. No winner numbers are used anywhere: every
// constant below is fitted here, from this snapshot.
//
// Construction (current-status survival): a protocol listed a years ago either
// records a token now (it launched at some unknown time inside [0, a]) or it
// does not (right-censored at a). The launch hazard is piecewise constant in
// five age buckets — [0,1), [1,2), [2,3), [3,5), [5,inf) years — fitted by
// maximum likelihood on the dated protocols. The cumulative hazard Lambda(a)
// is the sum of hazard x overlap over the buckets; F(a) = 1 - exp(-Lambda(a))
// is the chance a protocol has launched by age a. A protocol with no token
// at age a launches inside the next two years with probability
// 1 - exp(-(Lambda(a+2) - Lambda(a))).
//
// Two regularisations, both stated, not hidden:
//   - each hazard is floored at 0.05/year. The [5,inf) bucket holds 8 dated
//     protocols; without the floor its fitted hazard collapses to zero and
//     every old protocol gets P = 0.000 — a degenerate zero from a thin
//     bucket, not a finding. The floor costs 0.8 nats of log-likelihood.
//   - each category multiplies the hazard by m, shrunk toward 1 with 2
//     pseudo-observations: m = (launched + 2) / (expected + 2), expected
//     under the age-only hazards. A category with no dated protocols gets 1.
//     Undated protocols are fitted at 365 days of age, the same imputation
//     the value model uses.
//
// Hold-out (the guard this model must pass before its column ships): a
// seeded 70/30 split by slug hash — both sides span all ages — scored on
// hit rate at 0.5, Brier score and calibration by age bucket, against the
// base rate; plus a time split (fit on listings up to the median listed_at,
// test on newer listings) scored on Brier and mean calibration. The time
// split's test set is all under a year old, so no protocol there can score
// P > 0.5 and its hit rate equals the majority rate by construction — the
// informative numbers there are Brier and the mean prediction, and they are
// reported as such, not dressed up as a hit rate. A Weibull hazard is fitted
// as a cross-check and its log-likelihood reported beside the piecewise one.

import { MODEL, ageDays, type Snapshot, type SnapshotProtocol } from './model.ts';

/** Age buckets, in years, for the piecewise launch hazard. */
export const ODDS_EDGES_YEARS = [0, 1, 2, 3, 5, Infinity];
/** The launch window the odds price: two years from the snapshot date. */
export const ODDS_WINDOW_YEARS = 2;
/** Floor on each fitted hazard, per year: keeps thin buckets from collapsing to zero. */
export const ODDS_HAZARD_FLOOR = 0.05;
/** Cap on each fitted hazard, per year. */
export const ODDS_HAZARD_CAP = 5;
/** Pseudo-observations shrinking each category multiplier toward 1. */
export const ODDS_CATEGORY_SHRINK = 2;
/** The seeded 70/30 hold-out: slugs hashing below this go to the test side. */
export const ODDS_HOLDOUT_FRACTION = 0.3;

const YEAR_DAYS = 365.25;

/** Round to 4 decimal places, for the evaluation numbers. */
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The fitted launch-odds model: hazards, category multipliers, and counts. */
export interface LaunchOddsModel {
  /** Fitted hazard per year, one per age bucket. */
  hazards: number[];
  /** Age bucket edges in years. */
  edges: number[];
  /** Category multiplier per category (missing categories get 1). */
  multipliers: Map<string, number>;
  /** Log-likelihood of the fitted hazards on the dated protocols. */
  loglik: number;
  /** Dated protocols fitted, and how many of them record a token. */
  n_dated: number;
  n_token: number;
  /** Weibull cross-check: shape, scale, log-likelihood. */
  weibull: { k: number; theta: number; loglik: number };
}

/** One hold-out score: hit rate, Brier, mean prediction vs observed rate. */
export interface OddsHoldout {
  n_train: number;
  n_test: number;
  base_rate: number;
  majority_rate: number;
  hit_rate: number;
  brier: number;
  /** Brier of the constant train-base-rate predictor on the same test side. */
  base_brier: number;
  mean_predicted: number;
  observed: number;
  /** Calibration by age bucket on the test side: n, mean predicted, observed rate. */
  calibration: { lo: number; hi: number; n: number; predicted: number; observed: number }[];
  cut?: string;
}

/** The hold-out evaluation of the launch-odds model. */
export interface OddsEvaluation {
  random: OddsHoldout;
  time: OddsHoldout;
}

/** A dated protocol with its age in years and whether it records a token. */
interface DatedRow {
  protocol: SnapshotProtocol;
  ageY: number;
  token: boolean;
}

/** FNV-1a hash of a slug, in [0, 1): the deterministic hold-out split. */
function slugHash(slug: string): number {
  let h = 2166136261;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/** The dated protocols: listed_at present, age in years from the snapshot date. */
function datedRows(snapshot: Snapshot): DatedRow[] {
  const rows: DatedRow[] = [];
  for (const p of snapshot.protocols) {
    if (p.listed_at === null) continue;
    const age = ageDays(snapshot.as_of, p.listed_at);
    if (age === null) continue;
    rows.push({
      protocol: p,
      ageY: age / YEAR_DAYS,
      token: p.mcap_usd !== null || p.gecko_id !== null || p.symbol !== null,
    });
  }
  return rows;
}

/** Cumulative hazard at age a (years) under piecewise-constant hazards. */
export function cumHaz(ageY: number, hazards: number[], edges: number[] = ODDS_EDGES_YEARS): number {
  let h = 0;
  for (let j = 0; j < hazards.length; j++) {
    h += hazards[j]! * Math.max(0, Math.min(ageY, edges[j + 1]!) - edges[j]!);
  }
  return h;
}

/** Current-status log-likelihood of hazards on dated rows. */
function loglik(rows: DatedRow[], hazards: number[]): number {
  let ll = 0;
  for (const r of rows) {
    const h = cumHaz(r.ageY, hazards);
    ll += r.token ? Math.log(Math.max(1 - Math.exp(-h), 1e-12)) : -h;
  }
  return ll;
}

/**
 * Fit the piecewise hazards by coordinate ascent on the log-likelihood:
 * each hazard is tried at x1.2, x1.1, x1.05, x0.95, x0.9, x0.8 until no move
 * improves it. Deterministic: same rows, same hazards.
 */
export function fitHazards(rows: DatedRow[], start = 0.3): { hazards: number[]; loglik: number } {
  let hazards = ODDS_EDGES_YEARS.slice(0, -1).map(() => start);
  let ll = loglik(rows, hazards);
  for (let iter = 0; iter < 400; iter++) {
    let improved = false;
    for (let j = 0; j < hazards.length; j++) {
      for (const f of [1.2, 1.1, 1.05, 0.95, 0.9, 0.8]) {
        const trial = [...hazards];
        trial[j] = Math.max(ODDS_HAZARD_FLOOR, Math.min(ODDS_HAZARD_CAP, trial[j]! * f));
        const v = loglik(rows, trial);
        if (v > ll + 1e-9) {
          hazards = trial;
          ll = v;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return { hazards, loglik: ll };
}

/** Weibull fit by grid search (shape 0.3..3, scale 0.5..10): the cross-check. */
function fitWeibull(rows: DatedRow[]): { k: number; theta: number; loglik: number } {
  let best = { k: 1, theta: 1, loglik: -Infinity };
  for (let k = 0.3; k <= 3.001; k += 0.05) {
    for (let theta = 0.5; theta <= 10.001; theta += 0.1) {
      let ll = 0;
      for (const r of rows) {
        const h = (r.ageY / theta) ** k;
        ll += r.token ? Math.log(Math.max(1 - Math.exp(-h), 1e-12)) : -h;
      }
      if (ll > best.loglik) best = { k, theta, loglik: ll };
    }
  }
  return best;
}

/** Category multipliers from dated rows under age-only hazards, shrunk toward 1. */
function categoryMultipliers(rows: DatedRow[], hazards: number[]): Map<string, number> {
  const byCat = new Map<string, DatedRow[]>();
  for (const r of rows) {
    const key = r.protocol.category ?? '__null';
    const list = byCat.get(key) ?? [];
    list.push(r);
    byCat.set(key, list);
  }
  const out = new Map<string, number>();
  for (const [cat, rs] of byCat) {
    const events = rs.filter((r) => r.token).length;
    const expected = rs.reduce((s, r) => s + (1 - Math.exp(-cumHaz(r.ageY, hazards))), 0);
    out.set(cat, (events + ODDS_CATEGORY_SHRINK) / (expected + ODDS_CATEGORY_SHRINK));
  }
  return out;
}

/** Fit the launch-odds model on the snapshot's dated protocols. */
export function fitLaunchOdds(snapshot: Snapshot): LaunchOddsModel {
  const rows = datedRows(snapshot);
  const { hazards, loglik: ll } = fitHazards(rows);
  return {
    hazards,
    edges: [...ODDS_EDGES_YEARS],
    multipliers: categoryMultipliers(rows, hazards),
    loglik: ll,
    n_dated: rows.length,
    n_token: rows.filter((r) => r.token).length,
    weibull: fitWeibull(rows),
  };
}

/** The category multiplier for a protocol: 1 when its category has no dated rows. */
export function categoryMultiplier(model: LaunchOddsModel, category: string | null): number {
  return model.multipliers.get(category ?? '__null') ?? 1;
}

/** P(a protocol of this age has launched by now), under the fitted model. */
export function pTokenNow(model: LaunchOddsModel, ageY: number, category: string | null): number {
  const m = categoryMultiplier(model, category);
  return 1 - Math.exp(-m * cumHaz(ageY, model.hazards, model.edges));
}

/**
 * P(a protocol with no token at its current age launches inside the next two
 * years): the hazard mass over [age, age + 2], times its category multiplier.
 * Undated protocols are fitted at 365 days, the value model's imputation.
 */
export function launchOdds(model: LaunchOddsModel, protocol: SnapshotProtocol, asOf: string): number {
  const age = ageDays(asOf, protocol.listed_at) ?? MODEL.unknown_age_days;
  const ageY = age / YEAR_DAYS;
  const m = categoryMultiplier(model, protocol.category);
  const mass = cumHaz(ageY + ODDS_WINDOW_YEARS, model.hazards, model.edges) - cumHaz(ageY, model.hazards, model.edges);
  return 1 - Math.exp(-m * mass);
}

/** Age buckets for the calibration table, in years. */
const CAL_BUCKETS: Array<[number, number]> = [
  [0, 0.5],
  [0.5, 1],
  [1, 2],
  [2, 3],
  [3, 5],
  [5, Infinity],
];

/** Score one hold-out: fit on train, predict P(token by now) on test. */
function scoreHoldout(train: DatedRow[], test: DatedRow[], cut?: string): OddsHoldout {
  const { hazards } = fitHazards(train);
  const mult = categoryMultipliers(train, hazards);
  const predict = (r: DatedRow): number => {
    const m = mult.get(r.protocol.category ?? '__null') ?? 1;
    return 1 - Math.exp(-m * cumHaz(r.ageY, hazards));
  };
  let hit = 0;
  let brier = 0;
  let baseBrier = 0;
  let meanPred = 0;
  const base = test.filter((r) => r.token).length / Math.max(test.length, 1);
  const trainBase = train.filter((r) => r.token).length / Math.max(train.length, 1);
  for (const r of test) {
    const pr = Math.min(0.999, Math.max(0.001, predict(r)));
    if ((pr >= 0.5) === r.token) hit++;
    brier += (pr - (r.token ? 1 : 0)) ** 2;
    baseBrier += (trainBase - (r.token ? 1 : 0)) ** 2;
    meanPred += pr;
  }
  const calibration = CAL_BUCKETS.map(([lo, hi]) => {
    const inB = test.filter((r) => r.ageY >= lo && r.ageY < hi);
    if (inB.length === 0) return { lo, hi, n: 0, predicted: 0, observed: 0 };
    return {
      lo,
      hi,
      n: inB.length,
      predicted: round4(inB.reduce((s, r) => s + predict(r), 0) / inB.length),
      observed: round4(inB.filter((r) => r.token).length / inB.length),
    };
  });
  return {
    n_train: train.length,
    n_test: test.length,
    base_rate: round4(base),
    majority_rate: round4(Math.max(base, 1 - base)),
    hit_rate: test.length === 0 ? 0 : round4(hit / test.length),
    brier: test.length === 0 ? 0 : round4(brier / test.length),
    base_brier: test.length === 0 ? 0 : round4(baseBrier / test.length),
    mean_predicted: test.length === 0 ? 0 : round4(meanPred / test.length),
    observed: round4(base),
    calibration,
    cut,
  };
}

/**
 * The hold-out evaluation: a seeded 70/30 split by slug hash (both sides
 * span all ages), and a time split at the median listed_at (fit on older
 * listings, test on newer ones).
 */
export function evaluateLaunchOdds(snapshot: Snapshot): OddsEvaluation {
  const rows = datedRows(snapshot);
  const randomTest = rows.filter((r) => slugHash(r.protocol.slug) < ODDS_HOLDOUT_FRACTION);
  const randomTrain = rows.filter((r) => slugHash(r.protocol.slug) >= ODDS_HOLDOUT_FRACTION);
  const sorted = [...rows].sort((a, b) => (a.protocol.listed_at! < b.protocol.listed_at! ? -1 : 1));
  const cut = sorted[Math.floor(sorted.length / 2)]!.protocol.listed_at!;
  const timeTrain = rows.filter((r) => r.protocol.listed_at! <= cut);
  const timeTest = rows.filter((r) => r.protocol.listed_at! > cut);
  return {
    random: scoreHoldout(randomTrain, randomTest),
    time: scoreHoldout(timeTrain, timeTest, cut),
  };
}
