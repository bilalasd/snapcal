#!/bin/bash
# Mechanical release gates — the failure classes Loggi has actually shipped.
# Usage, from apps/mobile:  scripts/release-check.sh [--production]
set -uo pipefail
cd "$(dirname "$0")/.."
FAIL=0
flag() { echo "FAIL: $1" >&2; FAIL=1; }

SRC=(app components lib)

# 1. Text below the 11pt HIG floor.
if grep -rnE 'text-\[(10|[0-9])px\]' "${SRC[@]}"; then flag "text below 11px (HIG floor)"; fi
if grep -rnE 'fontSize: ?(10|[0-9])\b' "${SRC[@]}"; then flag "fontSize below 11 (HIG floor)"; fi

# 2. Icon-only controls without an accessibility label: any size="icon"
#    element must carry accessibilityLabel within the same JSX tag.
python3 - <<'EOF' || FAIL=1
import re, pathlib, sys
bad = []
for d in ('app', 'components'):
    for f in pathlib.Path(d).rglob('*.tsx'):
        src = f.read_text()
        for m in re.finditer(r'<(Button|Pressable)[^>]*size="icon"[^>]*?>', src, re.S):
            if 'accessibilityLabel' not in m.group(0):
                line = src[:m.start()].count('\n') + 1
                bad.append(f"{f}:{line}")
if bad:
    print("FAIL: icon-only control without accessibilityLabel:", *bad, sep="\n  ", file=sys.stderr)
    sys.exit(1)
EOF

# 3. console.log left in app code (error/warn are allowed).
if grep -rn 'console\.log' "${SRC[@]}"; then flag "console.log in app code"; fi

# 4. Hardcoded hex ink regression: count must not exceed the audited baseline
#    (fixed pastel surfaces legitimately use black/white ink — see DESIGN.md).
BASELINE=$(grep -c '^' scripts/ink-baseline.txt 2>/dev/null || echo 0)
CURRENT=$(grep -rhoE 'color="#[0-9a-fA-F]{3,8}"' "${SRC[@]}" | wc -l | tr -d ' ')
if [ "$CURRENT" -gt "$BASELINE" ]; then
  flag "hardcoded hex inks grew: $CURRENT > baseline $BASELINE (audit new ones, then regenerate scripts/ink-baseline.txt)"
fi

# 5. Build number must be ahead of the last release tag.
BUILD=$(python3 -c "import json; print(json.load(open('app.json'))['expo']['ios']['buildNumber'])")
LAST_TAG_BUILD=$(git tag -l 'v*' | sed 's/.*-//' | sort -n | tail -1)
if [ -n "$LAST_TAG_BUILD" ] && [ "$BUILD" -le "$LAST_TAG_BUILD" ]; then
  flag "buildNumber $BUILD not bumped past last tag's build $LAST_TAG_BUILD (run scripts/bump-build.sh)"
fi

# 6. CHANGELOG has content under [Unreleased] or a section for the current version.
VERSION=$(python3 -c "import json; print(json.load(open('app.json'))['expo']['version'])")
if ! grep -q "## \[$VERSION\]" ../../CHANGELOG.md; then
  flag "CHANGELOG.md has no section for $VERSION — write the release notes first"
fi

# 7. Production-only: no test keys anywhere in the release path.
if [ "${1:-}" = "--production" ]; then
  if grep -rn "pk_test" .env.production eas.json 2>/dev/null; then
    flag "pk_test key in release config (need pk_live)"
  fi
fi

[ $FAIL -eq 0 ] && echo "release-check: all gates passed"
exit $FAIL
