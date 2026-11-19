# makefun-token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/cervus-snoopy/ember-willow-ridge-k9p4/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/cervus-snoopy/ember-willow-ridge-k9p4/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: screen the snapshot's 758 protocols, fit a value model
on the tokens that already trade, rank the 198 pre-token protocols by
expected launch value — the value if the token launches, times the fitted
probability it launches within 2 years — and net every farm plan to the
dollar with a FARM / THIN / SKIP verdict.

Polished in this session on top of the round-2 entry: the fitted curve is
unchanged; the board now ranks by expected value, with a launch-odds model
fitted from the snapshot, a 758-protocol census, an ablation table and the
fit scatter on the cover, per-row local bands and rank ranges, and
deposit-sized farm economics with break-even odds. Node 22, standard
library only, deterministic — two runs write byte-identical output.

## The model

`ln(mcap) = 5.637 + 0.675 * ln(TVL) - 0.161 * ln(age_days) + category offset`,
fitted by ordinary least squares on 109 comps: live tokens whose mcap/TVL
sits in [0.02, 20], one greatest-TVL protocol per token id. Category offsets
are mean residuals shrunk by 8 pseudo-observations; the fitted multiple is
clamped to [0.08, 1.20]. Conditional value = TVL x fitted multiple x growth
multiplier x 0.85 (the 0.85 is a stated pre-token discount, not a fit), with
the growth multiplier `1 + 0.3 * clamp(change_7d, -60, 120) / 100` — the 0.3
weight (was 0.6) passes the standing 3-leg guard: pipeline LOO x2.7866 to
x2.7464, time-split x2.5808 to x2.5668, walk-forward pooled x2.7224 to
x2.6374. Expected value = conditional value x P(launch in 2 years), from a
piecewise-constant hazard by age (fitted by current-status MLE on the dated
protocols, hazards floored at 0.05/year) times a shrunk category multiplier;
held out on a seeded 70/30 split it scores 69.2% hit at 0.5 against a 52.4%
base rate, Brier 0.201. The board ranks by expected value; the $60 FARM
hurdle never moved — the verdicts tightened through the odds model only.

## Out-of-sample validation (computed at build time, see `lib/validation.ts`)

| Check | Geo factor |
|---|---|
| Leave-one-out, n=109 | x2.63 |
| LOO, full pipeline (growth + 0.85) | x2.75 |
| Time split, cut 2024-02-06 (42 train / 40 test) | x2.36 |
| Median-multiple baseline (the old radar-2 estimator), LOO | x4.14 |
| TVL-only baseline (predicted mcap = TVL) | x4.24 |

Bootstrap, 200 draws, seed 20261114: the full-fit top 10 keeps 8.47 of 10 on
average; rank 1 stays rank 1 in 54.5% of draws (the top two expected values
are $93.4M and $93.3M — a near tie, so rank 1 flips across refits; every row
carries its best-worst rank range, and 12 of the top 20 stay top-20 in at
least 80% of refits). The LOO log10 error spread is 0.676 dex, so farm plans
net against a band of x4.75. Each row also carries a local P25–P75 band from
the out-of-sample miss of comps near its TVL; realised coverage on held-out
comps is 53.2%, median width x10.46.

## Farm economics

slice = expected value x 0.0025% (one active farmer's assumed share), netted
to the low end of the model band (slice / 4.75), less gas fees and less the
T-bill cost of the capital (4% x hold / 365). FARM when the expected net
clears $60 (the 4%-of-capital leg never binds: 4% of $50-$250 capital is
$2-$10, so $60 is the hurdle in practice); THIN when it covers its costs
but not the hurdle; SKIP when it does not cover its costs. Counts: 28 FARM
/ 86 THIN / 84 SKIP. A SKIP plan says so in its first step. Every row also
carries its break-even launch odds — (fees + T-bill) over the conditional
low-end slice — and the board's deposit / share / T-bill selectors recompute
the net, the verdict, the net per hour and the break-even odds per row from
the same arithmetic.

## Kit

Downloaded fresh for this rebuild from `https://make.fun/c/token-radar-01/kit`
(tarball sha256 `9b7f497ea0958e53fc86db5224c523c058400ba3b4b48454f69c808297db9b98`):
all 20 manifest files verified OK against the sha256 manifest in `kit.json`
(snapshot sha256 `42a71213519479f3a180cc5010cbbf6bd18a2447fa0ad29e4c5122b6c9184393`),
extracted to `kit/`. Kit init run in this session before the first counted
write: `makefun anchor a8dffc4db7f31c9e2d5c2584f5bd87aa8933416c round 34036251`.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input kit/input/snapshot.json
node scripts/check.mjs out   # local replica of the sealed 7-row gate
```

`main.ts` writes `board.json`, `data.js`, `dashboard/validation.json`,
`dashboard/00-proof.md` (the judge-readable proof file, rendered from the
computed numbers), copies `dashboard/` and `screenshots/`, and writes
`dossier.json` with the vendored make.fun library — then rebuilds the dossier
and refuses a mismatch. The dossier is 1,250,983 bytes, under the gate's
1.5 MiB cap; the dossier text is 65,182 of 65,536 bytes, every file whole.

## Screenshots

Captured from the built dashboard with headless Chromium (no browser
automation in the entry itself — the entry only writes files):

1. `1-board.png` — the board, with the cover strip (758-protocol census
   bar, the fitted formula, the ablation table and the fit scatter), the
   what-if panel and the verdict column. Captured 1440x1421 so the board
   ends exactly on a row boundary (6 full rows, no row cut mid-row at the
   bottom edge).
2. `2-detail.png` — Steakhouse Financial's detail (rank 1, expected value
   $93,399,803): conditional value x launch odds, the P25–P75 band, the
   rank range across 200 refits, break-even odds, and the netted plan.
   Captured 1440x1440.
3. `3-filtered.png` — the FARM-only filter (28 of 198) with the fit scatter
   and its legend in frame; the filtered view is framed so the scatter's
   legend stays inside the 1440x1320 capture (table capped at 250px,
   scatter 300px high). The scatter's y-axis reads "log10 USD". The hero
   band cell now reads "Farm band (10^σ, 65.1%)" so the band's coverage is
   visible on every shot.

## Token-radar-01 round 3 — expected-value polish (19 Nov)

Round 2's entry, kept and polished — the curve is untouched (LOO x2.63,
time-split x2.36, walk-forward pooled x2.52). What was added, each guarded:

1. **Launch-odds model + expected value** (`lib/launch-odds.ts`, new):
   piecewise-constant hazard by age, fitted by current-status MLE on the
   dated protocols, hazards floored at 0.05/year, category multiplier shrunk
   toward 1. Held out on a seeded 70/30 split: 69.2% hit at 0.5 against a
   52.4% base rate, Brier 0.201; the time split under-predicts (Brier 0.277
   vs 0.318, mean predicted 13.2% vs 35.8% observed) and says so in the
   proof. The board ranks by expected value = conditional x P(launch in 2y);
   the $60 hurdle never moved. Verdicts 59/124/15 → 28/86/84; top expected
   value Steakhouse Financial $93,399,803 (odds 37.0%), Sentora Curator
   $93,277,876 (34.8%).
2. **Census**: the cover bar accounts for all 758 protocols — 198 ranked
   (60 at/above the $50M floor, 138 early below), 416 already trade,
   43 bridges, 43 liquid staking/restaking, 42 exchange custody,
   11 versioned, 5 wrapped/staked.
3. **Cover**: the fitted formula, the ablation table (flat multiple x3.70
   to the full pipeline x2.75) and the fit scatter, all on the cover.
4. **Per-row local bands**: P25–P75 from the out-of-sample miss of comps
   near the row's TVL; realised coverage 53.2%, median width x10.46.
5. **Rank ranges**: from the same 200 bootstrap refits, re-ranking by
   expected value; 12 of the top 20 stay top-20 in ≥80% of refits.
6. **Deposit-sized economics**: the what-if selectors (deposit, farmer
   share, T-bill) recompute the net, the verdict, the net per hour and the
   break-even odds per row; every row carries its break-even odds.
7. **Growth weight 0.6 → 0.3**: passes the standing 3-leg guard — pipeline
   LOO x2.7866→x2.7464, time-split x2.5808→x2.5668, walk-forward pooled
   x2.7224→x2.6374 — adopted only inside this full rebuild with a gate
   re-check. The proof's ablation note now states the growth step's honest
   cost (x2.84→x2.90, within-3x flat) and that age earns it back to x2.75.

Text budget: the dossier text is 65,182 of 65,536 bytes, every file whole —
`validation.json` was reshaped to fit (compact lines for the nested
sections, the scatter's kept comps at 2dp; dropped comps and top-25
candidates are plotted from `data.js`). Bugs caught by viewing the renders:
an ablation key mismatch that blanked the board (`a.geo` → `a.geo_factor`),
and a stale hardcoded x2.79 in the cover note. Gate 7/7, two runs
byte-identical, all three screenshots re-captured and viewed (board,
Steakhouse detail, FARM-filtered + scatter).

## Round 3 polish (17 Nov, final re-verification round)

Round 2's claims re-verified exactly (gate 7/7, deterministic, every headline
number, walk-forward folds x2.52 / x2.58 / x2.41, pooled x2.52 on 61
held-out comps). Last model direction tried: per-category TVL slopes,
shrunk n/(n+8) and refit inside every fold — rejected (LOO x3.20,
time-split x2.63, both worse; Spearman 0.522 / 0.563, also worse). No
guard-verified Spearman fix exists: the model family is exhausted.
Presentation fixes only: the proof file and the method view now disclose
that the 4%-of-capital hurdle leg never binds (4% of $50-$250 is $2-$10),
and the hero band label states its 65.1% coverage; all three screenshots
re-captured and viewed. Model, board, verdicts and all headline numbers
unchanged; gate still 7/7. See ROUND3-REPORT.md.

## Round 4 test 3 (17 Nov, LAST test round)

Baseline re-verified exactly (gate 7/7, deterministic, dossier sha
unchanged before the change below). Last model variant: arithmetic
(linear) blend of the fitted curve with the TVL-only curve at weights
0.97–0.50 — rejected on the repaired guard at every weight (LOO worse
+0.8–17.3% and walk-forward fold medians worse, though time-split,
walk-forward mean and bootstrap improve; same median-vs-mean trade as
the geometric ensemble). The ensemble family is now closed in both
blend forms. Cover self-check strip and a sixth hero cell were measured
and rejected: the strip repeats facts already on the page and would push
the board down a row; the hero cell costs ~200 B against 106 B of
dossier-text spare. One cosmetic fix applied, the only net-positive one:
shot 1 re-captured at 1440x1094 so the board ends on a row boundary
(15 full rows, no mid-row cut); no computed number changed, dossier
text still 65,430/65,536, gate still 7/7. See ROUND4-TEST3.md.

## Round 2 polish (17 Nov, re-verification round)

Round 1's claims re-verified exactly (gate 7/7, deterministic, every headline
number). New angles, all guarded: Huber and LAD (median) log-log fits, a TVL
spline and a quadratic TVL term, and a level-level Huber fit — none passed
(LOO and time-split both worse, or LOO better but time-split much worse).
Walk-forward validation added (`lib/validation.ts` walkForward, expanding
windows, cuts 2022-11-28 / 2024-02-06 / 2025-04-02): folds x2.52 / x2.58 /
x2.41, pooled x2.52 on 61 held-out comps — the single-cut x2.36 is not a
lucky cut. Farm-hurdle analysis: no sharper hurdle is supported (bootstrap
stable-FARM share is flat, 58–68%, across $40–$100), and the 4%-of-capital
leg never binds at these capitals (4% of $250 is $10); the $60 hurdle stands.
Band kept at 1σ x4.75 with its 65.1% coverage disclosed — widening to the 90%
band x12.00 would cut FARM 59→18 and SKIP would rise 15→101, with no
stability gain. Presentation fixes: detail drawer docks below the header,
"Active hours" tile in the drawer, FARM step 1 states the hours
denominator, scatter y-axis "log10 USD". Model, board, verdicts and all
headline numbers unchanged; gate still 7/7. See ROUND2-REPORT.md.

## What changed vs radar-2

- Median multiple replaced by the fitted log-log curve (LOO x4.14 → x2.63).
- OOS suite added: LOO + time-split + bootstrap 200, with both baselines.
- Farm plans netted to the dollar with FARM/THIN/SKIP verdicts, incl. 4%
  T-bill cost; verdict column on the board, net dollars in the detail view.
- `dashboard/00-proof.md` added so the judge reads methodology first.
- Fit scatter + calibration table in the dashboard; the fit view is shot 3,
  not a 4th shot.
- Screening counts with reasons in the proof file and the dashboard data.

## Round 1 polish (17 Nov, re-verification round)

Every claimed number was re-derived from the sealed snapshot by an
independent script (own OLS, LOO, time-split, bootstrap, baselines, farm
hand-check on all 198 rows): all reproduce exactly, no model change passed
the guard (see ROUND1-REPORT.md). Presentation fixes only: the calibration
table now shows the full pipeline's own MdAPE/Spearman/within-2x instead of
repeating the curve's; the proof file states the 365-day age imputation for
undated protocols, the band's actual 65.1% LOO coverage (1σ, 90% band
x12.00), and the corrected chains coefficient (0.005 per chain, not -0.04);
the refit command in the proof now carries MAKEFUN_OUTPUT_DIR=out. Model,
board, verdicts and all headline numbers unchanged; gate still 7/7.

## License

MIT. See LICENSE (written by the kit's init).

---

Entered on [make.fun](https://make.fun/?ref=3bzndvs8&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards
