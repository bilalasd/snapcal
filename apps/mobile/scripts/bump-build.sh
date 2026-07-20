#!/bin/bash
# Bump the iOS build number (and optionally the marketing version), commit,
# and tag v<version>-<build>. Usage, from apps/mobile:
#   scripts/bump-build.sh                 # buildNumber +1
#   scripts/bump-build.sh --version 0.2.0 # also set expo.version
set -euo pipefail
cd "$(dirname "$0")/.."

NEW_VERSION="${2:-}"
if [[ -n "${1:-}" ]]; then
  [[ "$1" == "--version" && -n "$NEW_VERSION" ]] || { echo "usage: bump-build.sh [--version X.Y.Z]" >&2; exit 1; }
fi

read -r VERSION BUILD < <(python3 - "$NEW_VERSION" <<'EOF'
import json, sys
new_version = sys.argv[1]
p = 'app.json'
d = json.load(open(p))
e = d['expo']
if new_version:
    e['version'] = new_version
e['ios']['buildNumber'] = str(int(e['ios']['buildNumber']) + 1)
open(p, 'w').write(json.dumps(d, indent=2) + "\n")
print(e['version'], e['ios']['buildNumber'])
EOF
)

TAG="v${VERSION}-${BUILD}"
git rev-parse "$TAG" >/dev/null 2>&1 && { echo "BLOCKED: tag $TAG already exists — build numbers are never reused." >&2; exit 1; }
git add app.json
git commit -m "release: ${TAG}"
git tag -a "$TAG" -m "Loggi ${VERSION} build ${BUILD}"
echo "Bumped to ${VERSION} (${BUILD}) and tagged ${TAG}. Push with: git push origin main ${TAG}"
