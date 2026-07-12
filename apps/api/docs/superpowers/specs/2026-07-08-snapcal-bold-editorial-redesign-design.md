# SnapCal bold editorial redesign

## Approved direction

Use direction C: a bold editorial calorie journal. The app should feel like a sharp food-and-body logbook: dark canvas, warm paper surfaces, high-contrast typography, yellow editorial accents, angled food imagery, and chart-heavy confidence. The remembered moment should be: "SnapCal feels like a daily nutrition magazine spread, not a generic tracker."

## Scope

This is a visual and interaction-polish pass over the existing product. It keeps the current authentication, meal analysis, multi-photo upload, USDA matching, quick-question re-analysis, logging, history, weight trends, settings, onboarding, and API behavior intact.

## UI system

- Replace the calm green theme with an editorial palette: ink, paper, brass/yellow, restrained red for destructive states, and semantic chart tokens.
- Add small global utility classes for editorial surfaces, loud headings, rules, grain, photo frames, and entrance motion.
- Keep shadcn semantic tokens as the source of truth so existing components inherit the new look.
- Fix the theme hydration warning by following the current Next guidance: the inline theme script may mutate the root element before hydration, so the root element explicitly suppresses that unavoidable mismatch.

## Screen treatment

- App shell: compact masthead, stronger bottom navigation, central log button as a brass editorial stamp.
- Login: cover-style entry screen with the passcode form as a private desk card.
- Today: daily statement page with calories as the lead number, ring as supporting evidence, macro rows as editorial rules, and meal list as a photo-led journal.
- Add meal: camera-first composition, favorites as clippings, analysis/review as an AI tasting-note stage, and the existing quick question/re-analysis flow made prominent.
- History: chart presented as a weekly plate index, with day groups as expandable journal entries.
- Weight: analytic spread with the trend chart as the hero and rate/maintenance/verdict cards as supporting callouts.
- Settings: publication-index grouping around plan, targets, units, profile, theme, health, and sign out.
- Onboarding: preserve the wizard and calculations while giving choices sharper editorial cards and a stronger cover sequence.

## Constraints

- Do not change database schema or API contracts.
- Do not add new runtime dependencies.
- Preserve all recently added AI-analysis behavior, especially multi-photo meals and clarifying questions.
- Keep the app mobile-first and PWA-friendly.

## Verification

- Run lint and build after implementation.
- Smoke-check the main flows: login, today, add/review/re-analyze affordance, history expand, weight chart, settings, onboarding.
