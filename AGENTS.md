<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

# DESIGN.md tracks the app — keep it in sync

The shipped mobile app is the design source of truth, and `DESIGN.md` documents it. Whenever you make a design change (tokens, colors, typography, motion, components, screen layout/behavior), update the matching section of `DESIGN.md` in the same change.
<!-- END:nextjs-agent-rules -->

# UI changes go convention-first

DESIGN.md §2.4 (spacing) and §2.8 (motion) are exact specs, not guidelines.
When the user asks for a UI change:

1. **Convention first.** If the change touches spacing, motion, color, type,
   or shape, edit the matching DESIGN.md convention *before* touching
   components.
2. **Check the blast radius.** Grep the app for every other place the changed
   convention applies and list which screens/components would need to follow.
3. **Confirm before editing.** Present the convention diff + affected list and
   wait for the user's go-ahead, then apply everywhere it applies — a
   convention change never lands on just one screen.

One-off changes that fit the existing conventions (new screen, copy tweak,
bug fix) skip this — build them straight against the spec.
