import AVFoundation
import SwiftUI

/// Camera capture with live barcode detection, ported from
/// components/camera-capture.tsx.
///
/// One `AVCaptureSession` drives both: a photo output for the shutter and a
/// metadata output for barcodes. RN got both from one expo-camera view; doing
/// it as two sessions here would fight over the device.
///
/// UNVERIFIED ON DEVICE: the simulator has no camera, so this is compile- and
/// logic-checked only. `session.startRunning()` returns without frames there,
/// which is why the view shows an explicit unavailable state instead of a
/// black rectangle that looks like a hang.
@MainActor
@Observable
final class CameraModel: NSObject {
    let session = AVCaptureSession()
    private let photoOutput = AVCapturePhotoOutput()
    private let metadataOutput = AVCaptureMetadataOutput()
    private var configured = false

    var permission: AVAuthorizationStatus = AVCaptureDevice.authorizationStatus(for: .video)
    var barcode: String?
    var captureError: String?
    /// Set when a shutter photo is ready; the host view consumes and clears it.
    var captured: UIImage?

    /// True when there is genuinely no camera — the simulator, or a device
    /// that denied access. Distinguishing this from "still starting up"
    /// matters: a black preview is indistinguishable from a crash.
    var unavailable: Bool {
        #if targetEnvironment(simulator)
        return true
        #else
        return permission == .denied || permission == .restricted
        #endif
    }

    func requestAccess() async {
        if permission == .notDetermined {
            _ = await AVCaptureDevice.requestAccess(for: .video)
            permission = AVCaptureDevice.authorizationStatus(for: .video)
        }
    }

    /// AVCaptureSession isn't Sendable, so it can't be captured by a detached
    /// task under Swift 6. A dedicated serial queue is the sanctioned way to
    /// keep the blocking start/stop calls off the main thread.
    private let sessionQueue = DispatchQueue(label: "com.loggi.camera.session")

    func start() async {
        await requestAccess()
        guard !unavailable else { return }
        configureIfNeeded()
        guard !session.isRunning else { return }
        sessionQueue.async { [session] in session.startRunning() }
    }

    func stop() {
        guard session.isRunning else { return }
        sessionQueue.async { [session] in session.stopRunning() }
    }

    private func configureIfNeeded() {
        guard !configured else { return }
        configured = true
        session.beginConfiguration()
        session.sessionPreset = .photo

        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
              let input = try? AVCaptureDeviceInput(device: device),
              session.canAddInput(input) else {
            captureError = "No camera available"
            session.commitConfiguration()
            return
        }
        session.addInput(input)

        if session.canAddOutput(photoOutput) { session.addOutput(photoOutput) }

        // Barcode detection shares the session. Types match RN's scanner
        // config: the formats actually found on packaged food.
        if session.canAddOutput(metadataOutput) {
            session.addOutput(metadataOutput)
            metadataOutput.setMetadataObjectsDelegate(self, queue: .main)
            let wanted: [AVMetadataObject.ObjectType] = [.ean13, .ean8, .upce, .code128]
            metadataOutput.metadataObjectTypes = wanted.filter {
                metadataOutput.availableMetadataObjectTypes.contains($0)
            }
        }
        session.commitConfiguration()
    }

    func capture() {
        guard !unavailable else {
            captureError = "Camera unavailable in the simulator"
            return
        }
        let settings = AVCapturePhotoSettings()
        photoOutput.capturePhoto(with: settings, delegate: self)
    }
}

extension CameraModel: AVCapturePhotoCaptureDelegate {
    nonisolated func photoOutput(_ output: AVCapturePhotoOutput,
                                 didFinishProcessingPhoto photo: AVCapturePhoto,
                                 error: Error?) {
        guard let data = photo.fileDataRepresentation(),
              let image = UIImage(data: data) else { return }
        Task { @MainActor in self.captured = image }
    }
}

extension CameraModel: AVCaptureMetadataOutputObjectsDelegate {
    nonisolated func metadataOutput(_ output: AVCaptureMetadataOutput,
                                    didOutput metadataObjects: [AVMetadataObject],
                                    from connection: AVCaptureConnection) {
        guard let object = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
              let value = object.stringValue else { return }
        Task { @MainActor in
            // Only surface a barcode once — re-firing on every frame would
            // spam the lookup endpoint.
            if self.barcode != value { self.barcode = value }
        }
    }
}

/// UIKit preview layer bridged into SwiftUI. `AVCaptureVideoPreviewLayer`
/// has no SwiftUI equivalent.
struct CameraPreview: UIViewRepresentable {
    let session: AVCaptureSession

    final class PreviewView: UIView {
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
        var previewLayer: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
    }

    func makeUIView(context: Context) -> PreviewView {
        let view = PreviewView()
        view.previewLayer.session = session
        view.previewLayer.videoGravity = .resizeAspectFill
        return view
    }
    func updateUIView(_ uiView: PreviewView, context: Context) {}
}
