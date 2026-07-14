# Prompt training — gemini-3.5-flash, 11 images (usda-grounded)
Objective: minimize mean raw cal-error% (prompt's direct lever); usda tracked too.

| iter | change | raw err% | usda err% | kept? |
|------|--------|----------|-----------|-------|
| 0 | baseline (production prompt) | 29.8 | 31.3 | — (best) |
| 1 | +portion calibration, +Atwater consistency, +cooked-weight basis | 27.5 | 27.1 | ✅ kept (best) |
| 2 | grams-first WITH density examples | 29.5 | 30.1 | ❌ reverted |
| 3 | +visual-portion weight anchors (small/normal/large bands) | 22.1 | 23.6 | ✅ kept (best) |
| 4 | +hidden calorie-dense additions (oil/dressing/cheese/nuts) | 16.9 | 18.1 | ✅ kept (best) |
| 5 | per-component decomposition of mixed plates | 21.2 | 21.2 | ❌ reverted |
| 6 | lean-to-middle / avoid extremes | 22.0 | 22.2 | ❌ reverted |

**REPEAT=3 reality check (single-run was too noisy, ±5%):**
- True baseline (original prompt): raw 25.3 / usda 24.8
- Trained (iters 1+3+4 kept): raw 22.8 / usda 22.1  → real ~2.5pt improvement
- Continuing iters at REPEAT=3 (rigorous). Keep only ≥2pt clear wins.
| 7 | don't under-count dense starches (REPEAT=3) | 25.2 | 24.3 | ❌ reverted |
| 8 | watery/low-density components note (REPEAT=3) | 22.1 | 22.2 | ✅ kept (best raw) |

## Result
- Baseline (original prompt), REPEAT=3:  raw 25.3 / usda 24.8
- Trained (iters 1,3,4,8),   REPEAT=3:  raw 22.1 / usda 22.2
- Net: ~3pt raw / ~2.6pt usda lower error (~10-12% relative). Kept: portion
  calibration (plate reference), visual-portion weight anchors, hidden
  calorie-dense additions, watery-component note. Reverted: grams-first w/
  densities, decomposition, lean-to-middle, starch-boost.
- Stopped at 8: remaining error is portion-estimation variance + 2 dish-specific
  outliers; 11 images can't reliably resolve <2pt changes. More gains need a
  bigger/varied labeled set, not more prompt tweaks on this one.

## Expanded validation (41 images) — the real verdict
- Baseline prompt: raw 32.0 / usda 31.5
- Trained prompt:  raw 32.0 / usda 32.1
=> Trained prompt does NOT generalize — the 11-image gain was OVERFIT.
   Recommendation: do NOT promote it; keep the production prompt.

## Grounding A/B (41 images)
- Baseline: raw 32.0 vs usda 31.5  (grounding ~neutral, marginally helps)
- Trained:  raw 32.0 vs usda 32.1
=> USDA grounding is a wash (±0.5pt). Keep it (existing, harmless, slight help).

## Bottom line
Gemini-3.5-flash sits at ~30-32% mean cal-error on hard random plates — the
portion-estimation floor for 2D photos. Prompt tweaks on a small set buy
overfit, not real accuracy. Real gains need either depth/volume cues (LiDAR,
multi-angle) or a large train/validation split, not more prompt edits.
