import Foundation
import HealthKit

/// Apple Health weight sync. Ports lib/health.ts.
///
/// Two directions, both opt-in:
///  - READ: a weigh-in from a smart scale becomes a Loggi weigh-in
///  - WRITE: a weigh-in logged here shows up in Health
///
/// UNVERIFIED: HealthKit needs the entitlement and a real device. The
/// simulator has a Health store but no data and no scale writing to it, so
/// none of this has been exercised against real samples.
enum HealthService {
    private static let store = HKHealthStore()
    private static var bodyMass: HKQuantityType { HKQuantityType(.bodyMass) }

    static var isAvailable: Bool { HKHealthStore.isHealthDataAvailable() }

    @discardableResult
    static func requestAuthorization() async -> Bool {
        guard isAvailable else { return false }
        do {
            try await store.requestAuthorization(toShare: [bodyMass], read: [bodyMass])
            return true
        } catch {
            return false
        }
    }

    /// Most recent weight from Health, in kg.
    static func latestWeightKg() async -> (kg: Double, date: Date)? {
        guard isAvailable else { return nil }
        return await withCheckedContinuation { continuation in
            let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
            let query = HKSampleQuery(sampleType: bodyMass, predicate: nil,
                                      limit: 1, sortDescriptors: [sort]) { _, samples, _ in
                guard let sample = samples?.first as? HKQuantitySample else {
                    return continuation.resume(returning: nil)
                }
                let kg = sample.quantity.doubleValue(for: .gramUnit(with: .kilo))
                continuation.resume(returning: (kg, sample.endDate))
            }
            store.execute(query)
        }
    }

    /// Push a weigh-in to Health. Fire-and-forget by design: a Health write
    /// failing must never block logging the weight in Loggi itself.
    static func write(weightKg: Double, on date: Date = Date()) async {
        guard isAvailable else { return }
        let quantity = HKQuantity(unit: .gramUnit(with: .kilo), doubleValue: weightKg)
        let sample = HKQuantitySample(type: bodyMass, quantity: quantity, start: date, end: date)
        try? await store.save(sample)
    }

    /// Every weigh-in since a cutoff, oldest first — the bulk backfill path
    /// (/api/weights accepts a `weights` array for exactly this).
    static func weightsSince(_ start: Date) async -> [(kg: Double, date: Date)] {
        guard isAvailable else { return [] }
        return await withCheckedContinuation { continuation in
            let predicate = HKQuery.predicateForSamples(withStart: start, end: Date())
            let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: true)
            let query = HKSampleQuery(sampleType: bodyMass, predicate: predicate,
                                      limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { _, samples, _ in
                let rows = (samples as? [HKQuantitySample] ?? []).map {
                    ($0.quantity.doubleValue(for: .gramUnit(with: .kilo)), $0.endDate)
                }
                continuation.resume(returning: rows)
            }
            store.execute(query)
        }
    }
}
