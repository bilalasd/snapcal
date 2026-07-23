import Foundation
import Speech
import AVFoundation

/// Live, on-device dictation using iOS 26's SpeechAnalyzer / SpeechTranscriber
/// (the successor to SFSpeechRecognizer). Mirrors the RN speak flow: start
/// listening, stream partial ("volatile") text live, then hand the final
/// transcript to the same `/api/analyze` pipeline the Describe tab uses.
///
/// Device-only in practice — the simulator has no real mic feed and may lack
/// the on-device speech model, so this is verified on the phone (same rule as
/// the camera). It compiles and no-ops gracefully where unsupported.
@MainActor
@Observable
final class DictationService {
    /// The live transcript: finalized text plus the current volatile tail.
    private(set) var transcript = ""
    private(set) var isListening = false
    private(set) var errorMessage: String?

    private let audioEngine = AVAudioEngine()
    private var analyzer: SpeechAnalyzer?
    private var transcriber: SpeechTranscriber?
    private var inputBuilder: AsyncStream<AnalyzerInput>.Continuation?
    private var analyzerFormat: AVAudioFormat?
    private var converter: AVAudioConverter?
    private var resultsTask: Task<Void, Never>?

    private var finalized = ""
    private var volatile = ""

    /// Mic + speech authorization. On-device transcription still needs the
    /// record permission; requesting speech auth too is harmless and covers
    /// the `NSSpeechRecognitionUsageDescription` path.
    func requestPermission() async -> Bool {
        let speech = await withCheckedContinuation { (cont: CheckedContinuation<Bool, Never>) in
            SFSpeechRecognizer.requestAuthorization { cont.resume(returning: $0 == .authorized) }
        }
        let mic = await AVAudioApplication.requestRecordPermission()
        return speech && mic
    }

    /// True when the device has (or can get) an on-device model for the locale.
    static func isSupported(_ locale: Locale = .current) async -> Bool {
        await SpeechTranscriber.supportedLocales.contains { $0.identifier(.bcp47) == locale.identifier(.bcp47) }
    }

    func start() async {
        guard !isListening else { return }
        transcript = ""; finalized = ""; volatile = ""; errorMessage = nil

        let locale = Locale.current
        let transcriber = SpeechTranscriber(
            locale: locale,
            transcriptionOptions: [],
            reportingOptions: [.volatileResults],
            attributeOptions: [])
        self.transcriber = transcriber

        do {
            try await ensureModel(transcriber, locale: locale)

            let analyzer = SpeechAnalyzer(modules: [transcriber])
            self.analyzer = analyzer
            analyzerFormat = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [transcriber])

            let (stream, builder) = AsyncStream<AnalyzerInput>.makeStream()
            inputBuilder = builder

            // Consume results: volatile results replace the live tail; a final
            // result commits and clears it — RN's finalRef / interimRef split.
            resultsTask = Task { [weak self] in
                guard let transcriber = await self?.transcriber else { return }
                do {
                    for try await result in transcriber.results {
                        let text = String(result.text.characters)
                        await self?.apply(text, isFinal: result.isFinal)
                    }
                } catch {
                    await self?.fail(error)
                }
            }

            try configureSession()
            try startEngine()
            try await analyzer.start(inputSequence: stream)
            isListening = true
        } catch {
            fail(error)
            await teardown()
        }
    }

    /// Stops, finalizes, and returns the full transcript (trimmed).
    @discardableResult
    func stop() async -> String {
        guard isListening else { return transcript.trimmingCharacters(in: .whitespacesAndNewlines) }
        inputBuilder?.finish()
        try? await analyzer?.finalizeAndFinishThroughEndOfInput()
        await teardown()
        let text = ([finalized, volatile].filter { !$0.isEmpty }.joined(separator: " "))
            .trimmingCharacters(in: .whitespacesAndNewlines)
        transcript = text
        return text
    }

    /// Aborts and discards — sliding off the mic mid-gesture.
    func cancel() {
        guard isListening else { return }
        Task { await teardown() }
        transcript = ""; finalized = ""; volatile = ""
    }

    // MARK: - Internals

    private func apply(_ text: String, isFinal: Bool) {
        if isFinal {
            finalized = [finalized, text].filter { !$0.isEmpty }.joined(separator: " ")
            volatile = ""
        } else {
            volatile = text
        }
        transcript = [finalized, volatile].filter { !$0.isEmpty }.joined(separator: " ")
    }

    private func fail(_ error: Error) {
        errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
    }

    private func ensureModel(_ transcriber: SpeechTranscriber, locale: Locale) async throws {
        let installed = await SpeechTranscriber.installedLocales
        if installed.contains(where: { $0.identifier(.bcp47) == locale.identifier(.bcp47) }) { return }
        if let request = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
            try await request.downloadAndInstall()
        }
    }

    private func configureSession() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.record, mode: .measurement, options: [.duckOthers])
        try session.setActive(true, options: .notifyOthersOnDeactivation)
    }

    private func startEngine() throws {
        let input = audioEngine.inputNode
        let inputFormat = input.outputFormat(forBus: 0)
        let target = analyzerFormat
        // Capture Sendable locals; the whole tap runs on the audio thread, so
        // the non-Sendable buffer/converter never cross an isolation boundary
        // (the earlier MainActor hop is what tripped Swift 6's data-race check).
        let conv = (target != nil && inputFormat != target) ? AVAudioConverter(from: inputFormat, to: target!) : nil
        converter = conv
        let builder = inputBuilder
        input.installTap(onBus: 0, bufferSize: 4096, format: inputFormat) { buffer, _ in
            guard let builder else { return }
            guard let target, let conv else {
                builder.yield(AnalyzerInput(buffer: buffer))
                return
            }
            let ratio = target.sampleRate / buffer.format.sampleRate
            let capacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 1024
            guard let out = AVAudioPCMBuffer(pcmFormat: target, frameCapacity: capacity) else { return }
            var supplied = false
            let status = conv.convert(to: out, error: nil) { _, inStatus in
                if supplied { inStatus.pointee = .noDataNow; return nil }
                supplied = true; inStatus.pointee = .haveData; return buffer
            }
            if status != .error, out.frameLength > 0 { builder.yield(AnalyzerInput(buffer: out)) }
        }
        audioEngine.prepare()
        try audioEngine.start()
    }

    private func teardown() async {
        if audioEngine.isRunning {
            audioEngine.stop()
            audioEngine.inputNode.removeTap(onBus: 0)
        }
        resultsTask?.cancel(); resultsTask = nil
        try? await analyzer?.cancelAndFinishNow()
        analyzer = nil; transcriber = nil
        inputBuilder?.finish(); inputBuilder = nil
        converter = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        isListening = false
    }
}
