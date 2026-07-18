#!/usr/bin/env python3
"""Re-apply both @bacons/apple-targets 4.0.7 patches after a yarn install.
Patch 1: with-xcode-changes.js — target-update path crashes (buildConfigurationList
         resolves undefined after its configs' references are removed).
Patch 2: target.js — ExtensionKit targets (app-intent) never recognized, so every
         prebuild duplicates LoggiIntents.
Idempotent: skips files already carrying the ponytail marker.
"""
import glob, sys

ROOT = "/Users/muhammadbalagamwala/Documents/Projects/2026/SnapCal"
ok = True

def patch(path_glob, old, new, label):
    global ok
    hits = glob.glob(path_glob)
    if not hits:
        print(f"MISSING: {label}: no file matches {path_glob}")
        ok = False
        return
    for p in hits:
        src = open(p).read()
        if "ponytail" in src:
            print(f"already patched: {p}")
            continue
        if old not in src:
            print(f"ANCHOR NOT FOUND ({label}): {p} — bacons version changed? Inspect manually.")
            ok = False
            continue
        open(p, "w").write(src.replace(old, new, 1))
        print(f"patched ({label}): {p}")

OLD1 = """    if (targetToUpdate) {
        // Remove existing build phases
        targetToUpdate.props.buildConfigurationList.props.buildConfigurations.forEach((config) => {
            config.getReferrers().forEach((ref) => {
                ref.removeReference(config.uuid);
            });
            config.removeFromProject();
        });
        // Remove existing build configuration list
        targetToUpdate.props.buildConfigurationList
            .getReferrers()
            .forEach((ref) => {
            ref.removeReference(targetToUpdate.props.buildConfigurationList.uuid);
        });
        targetToUpdate.props.buildConfigurationList.removeFromProject();"""
NEW1 = """    if (targetToUpdate) {
        // ponytail: patched locally — 4.0.7 crashes here (buildConfigurationList
        // resolves to undefined after its configs' references are removed).
        // Reverts on yarn install; re-run repatch-bacons.py.
        const existingConfigList = targetToUpdate.props.buildConfigurationList;
        // Remove existing build phases
        (existingConfigList?.props.buildConfigurations ?? []).forEach((config) => {
            config.getReferrers().forEach((ref) => {
                ref.removeReference(config.uuid);
            });
            config.removeFromProject();
        });
        // Remove existing build configuration list
        existingConfigList
            ?.getReferrers()
            .forEach((ref) => {
            ref.removeReference(existingConfigList.uuid);
        });
        existingConfigList?.removeFromProject();"""

OLD2 = """    if (target.props.productType !== "com.apple.product-type.app-extension") {
        return false;
    }"""
NEW2 = """    // ponytail: patched locally — 4.0.7 never recognizes ExtensionKit targets
    // (app-intent), so every prebuild duplicated the target. Reverts on yarn install.
    const registryEntry = exports.TARGET_REGISTRY[type];
    if ((registryEntry === null || registryEntry === void 0 ? void 0 : registryEntry.productType) === "com.apple.product-type.extensionkit-extension") {
        if (target.props.productType !== registryEntry.productType)
            return false;
        const ekInfoPlist = target.getDefaultConfiguration().getInfoPlist();
        var _ek;
        return ((_ek = ekInfoPlist === null || ekInfoPlist === void 0 ? void 0 : ekInfoPlist.EXAppExtensionAttributes) === null || _ek === void 0 ? void 0 : _ek.EXExtensionPointIdentifier) === registryEntry.extensionPointIdentifier;
    }
""" + OLD2

for base in (f"{ROOT}/apps/mobile/node_modules", f"{ROOT}/node_modules"):
    patch(f"{base}/@bacons/apple-targets/build/with-xcode-changes.js", OLD1, NEW1, "update-crash")
    patch(f"{base}/@bacons/apple-targets/build/target.js", OLD2, NEW2, "extensionkit-detect")

sys.exit(0 if ok else 1)
