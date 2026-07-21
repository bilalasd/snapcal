import XCTest
import SwiftUI
@testable import Loggi

/// Enforces the spec's §3 colour rules against the SHIPPED Theme2 values.
/// scripts/validate-palette.mjs checks the same maths on transcribed values;
/// this checks what the app actually renders, so the two can't drift apart.
final class PaletteTests: XCTestCase {

    // MARK: - Colour maths (WCAG 2.x relative luminance; CIELAB; Vienot CVD)

    private func rgb(_ color: Color, dark: Bool) -> (r: Double, g: Double, b: Double) {
        let traits = UITraitCollection(userInterfaceStyle: dark ? .dark : .light)
        let resolved = UIColor(color).resolvedColor(with: traits)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        resolved.getRed(&r, green: &g, blue: &b, alpha: &a)
        return (Double(r), Double(g), Double(b))
    }
    private func lin(_ c: Double) -> Double {
        c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4)
    }
    private func luminance(_ c: (r: Double, g: Double, b: Double)) -> Double {
        0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)
    }
    private func contrast(_ a: Color, _ b: Color, dark: Bool) -> Double {
        let l1 = luminance(rgb(a, dark: dark)), l2 = luminance(rgb(b, dark: dark))
        return (max(l1, l2) + 0.05) / (min(l1, l2) + 0.05)
    }
    private func lab(_ c: (r: Double, g: Double, b: Double)) -> (L: Double, a: Double, b: Double) {
        let r = lin(c.r), g = lin(c.g), bl = lin(c.b)
        var x = (0.4124 * r + 0.3576 * g + 0.1805 * bl) / 0.95047
        var y = 0.2126 * r + 0.7152 * g + 0.0722 * bl
        var z = (0.0193 * r + 0.1192 * g + 0.9505 * bl) / 1.08883
        func f(_ t: Double) -> Double { t > 0.008856 ? cbrt(t) : 7.787 * t + 16.0 / 116.0 }
        x = f(x); y = f(y); z = f(z)
        return (116 * y - 16, 500 * (x - y), 200 * (y - z))
    }
    private func deltaE(_ c1: (r: Double, g: Double, b: Double), _ c2: (r: Double, g: Double, b: Double)) -> Double {
        let a = lab(c1), b = lab(c2)
        return sqrt(pow(a.L - b.L, 2) + pow(a.a - b.a, 2) + pow(a.b - b.b, 2))
    }
    private func lightnessDelta(_ c1: (r: Double, g: Double, b: Double), _ c2: (r: Double, g: Double, b: Double)) -> Double {
        abs(lab(c1).L - lab(c2).L)
    }
    /// Vienot/Brettel dichromat projection in LMS space.
    private func simulate(_ c: (r: Double, g: Double, b: Double), _ type: String) -> (r: Double, g: Double, b: Double) {
        let r = lin(c.r), g = lin(c.g), b = lin(c.b)
        let L = 0.31399 * r + 0.63951 * g + 0.04649 * b
        let M = 0.15537 * r + 0.75789 * g + 0.08670 * b
        let S = 0.01775 * r + 0.10945 * g + 0.87262 * b
        var l = L, m = M, s = S
        switch type {
        case "deuter": m = 0.9513092 * L + 0.04866992 * S
        case "protan": l = 1.05118294 * M - 0.05116099 * S
        case "tritan": s = -0.86744736 * L + 1.86727089 * M
        default: break
        }
        func unlin(_ v: Double) -> Double {
            let c = max(0, min(1, v))
            return c <= 0.0031308 ? c * 12.92 : 1.055 * pow(c, 1 / 2.4) - 0.055
        }
        return (unlin(5.47221206 * l - 4.6419601 * m + 0.16963708 * s),
                unlin(-1.1252419 * l + 2.29317094 * m - 0.1678952 * s),
                unlin(0.02980165 * l - 0.19318073 * m + 1.16364789 * s))
    }
    private let visions = ["normal", "deuter", "protan", "tritan"]
    private func sim(_ color: Color, dark: Bool, _ vision: String) -> (r: Double, g: Double, b: Double) {
        let base = rgb(color, dark: dark)
        return vision == "normal" ? base : simulate(base, vision)
    }

    private var dataColors: [(String, Color)] {
        [("protein", Theme2.macroProtein), ("carbs", Theme2.macroCarbs), ("fat", Theme2.macroFat),
         ("onTarget", Theme2.statusOnTarget), ("over", Theme2.statusOver)]
    }

    // MARK: - Spec §3.0: every data colour clears 3:1 on BOTH grounds

    func testDataColorsClearBothGrounds() {
        for dark in [false, true] {
            for (name, color) in dataColors {
                let onCanvas = contrast(color, Theme2.canvas, dark: dark)
                let onSurface = contrast(color, Theme2.surface, dark: dark)
                let worst = min(onCanvas, onSurface)
                XCTAssertGreaterThanOrEqual(
                    worst, 3.0,
                    "\(name) in \(dark ? "dark" : "light") is \(String(format: "%.2f", worst)):1 — " +
                    "below the 3:1 graphic minimum. The RAISED SURFACE is usually the tighter " +
                    "constraint; validating only against the canvas is how this silently fails on cards.")
            }
        }
    }

    /// Spec §3.1: fat is graphic-only by design. This pins the intent so
    /// nobody "fixes" it into text use without confronting the spec.
    func testFatIsGraphicOnlyNotTextSafe() {
        for dark in [false, true] {
            let worst = min(contrast(Theme2.macroFat, Theme2.canvas, dark: dark),
                            contrast(Theme2.macroFat, Theme2.surface, dark: dark))
            XCTAssertGreaterThanOrEqual(worst, 3.0, "fat must still clear the graphic minimum")
            XCTAssertLessThan(worst, 4.5,
                "fat now clears 4.5:1. That's not a failure — but the spec documents it as " +
                "GRAPHIC-ONLY and components rely on that. Update spec §3.1 before relaxing this.")
        }
    }

    // MARK: - Spec §3.1: the ramp separates by LIGHTNESS under every CVD type

    func testMacroRampSeparatesByLightnessUnderAllCVD() {
        let ramp: [(String, Color)] = [
            ("protein", Theme2.macroProtein), ("carbs", Theme2.macroCarbs), ("fat", Theme2.macroFat),
        ]
        for dark in [false, true] {
            for vision in visions {
                for i in 0..<ramp.count {
                    for j in (i + 1)..<ramp.count {
                        let d = lightnessDelta(sim(ramp[i].1, dark: dark, vision),
                                               sim(ramp[j].1, dark: dark, vision))
                        XCTAssertGreaterThanOrEqual(
                            d, 12.0,
                            "\(ramp[i].0)/\(ramp[j].0) differ by only ΔL \(String(format: "%.1f", d)) " +
                            "under \(vision) (\(dark ? "dark" : "light")). The ramp encodes macros by " +
                            "LIGHTNESS precisely because hue collapses under CVD — keep the steps apart.")
                    }
                }
            }
        }
    }

    // MARK: - Spec §3.4: nothing is confusable with reserved vermilion

    func testNoDataColorIsConfusableWithVermilion() {
        for dark in [false, true] {
            for (name, color) in dataColors {
                for vision in visions {
                    let d = deltaE(sim(color, dark: dark, vision), sim(Theme2.accentLog, dark: dark, vision))
                    XCTAssertGreaterThanOrEqual(
                        d, 20.0,
                        "\(name) is ΔE \(String(format: "%.1f", d)) from vermilion under \(vision) " +
                        "(\(dark ? "dark" : "light")). Vermilion means 'log something' and is co-visible " +
                        "on every screen — no data colour may be mistakable for it.")
                }
            }
        }
    }

    /// Spec §3.3a, documented as a REQUIREMENT rather than a bug: on-target
    /// and over-target genuinely cannot be told apart by colour under CVD.
    /// This test asserts that fact so the redundant symbol/text channel in
    /// StatusBadge is never "optimised away" as belt-and-braces.
    func testStatusPairRequiresNonColorChannel() {
        var worst = Double.infinity
        for dark in [false, true] {
            for vision in visions {
                worst = min(worst, deltaE(sim(Theme2.statusOnTarget, dark: dark, vision),
                                          sim(Theme2.statusOver, dark: dark, vision)))
            }
        }
        XCTAssertLessThan(
            worst, 25.0,
            "on-target and over-target now separate by ΔE \(String(format: "%.1f", worst)) under CVD. " +
            "If that is intentional, update spec §3.3a — but StatusBadge's symbol+text is still " +
            "required by WCAG 1.4.1 regardless.")
    }
}
