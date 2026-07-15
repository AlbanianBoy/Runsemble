import Capacitor
import CoreLocation

///
/// RunRecorder — iOS Capacitor plugin.
///
/// Mirrors the Android RunRecorderPlugin surface exactly so that the JS layer
/// (`src/lib/run-recorder.ts`) works identically on both platforms.
/// The heavy lifting (location, disk I/O, notification) lives in RunRecorderService.
///
@objc(RunRecorderPlugin)
public class RunRecorderPlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier  = "RunRecorderPlugin"
    public let jsName      = "RunRecorder"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable",      returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startTracking",    returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopTracking",     returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getActiveSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getTrack",         returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearTrack",       returnType: CAPPluginReturnPromise),
        // requestPermissions is handled by CAPPlugin base — we just declare it
        // so the JS bridge knows it exists.
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise),
    ]

    private let service = RunRecorderService.shared

    // MARK: - Plugin methods

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": true])
    }

    @objc func startTracking(_ call: CAPPluginCall) {
        guard let runId = call.getString("runId"), !runId.isEmpty else {
            call.reject("runId required")
            return
        }
        // Path-traversal guard: same rule as Android (alphanumeric, dash, underscore, max 128).
        let safe = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_"))
        guard runId.unicodeScalars.allSatisfy({ safe.contains($0) }), runId.count <= 128 else {
            call.reject("invalid runId")
            return
        }
        service.startTracking(runId: runId)
        call.resolve()
    }

    @objc func stopTracking(_ call: CAPPluginCall) {
        service.stopTracking()
        call.resolve()
    }

    @objc func getActiveSession(_ call: CAPPluginCall) {
        if let session = service.readActive() {
            call.resolve([
                "active":     true,
                "runId":      session.runId,
                "startedAt":  session.startedAt,
                "updatedAt":  session.updatedAt,
                "count":      session.count,
            ])
        } else {
            call.resolve(["active": false])
        }
    }

    @objc func getTrack(_ call: CAPPluginCall) {
        guard let runId = call.getString("runId"), !runId.isEmpty else {
            call.reject("runId required")
            return
        }
        let safe = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_"))
        guard runId.unicodeScalars.allSatisfy({ safe.contains($0) }), runId.count <= 128 else {
            call.reject("invalid runId")
            return
        }
        let sinceIndex = call.getInt("sinceIndex") ?? 0
        let (points, nextIndex) = service.readTrack(runId: runId, sinceIndex: sinceIndex)
        call.resolve([
            "points":    points,
            "nextIndex": nextIndex,
        ])
    }

    @objc func clearTrack(_ call: CAPPluginCall) {
        guard let runId = call.getString("runId"), !runId.isEmpty else {
            service.clearActive()
            call.resolve()
            return
        }
        let safe = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_"))
        guard runId.unicodeScalars.allSatisfy({ safe.contains($0) }), runId.count <= 128 else {
            call.reject("invalid runId")
            return
        }
        service.clearTrack(runId: runId)
        service.clearActive()
        call.resolve()
    }

    // MARK: - Permissions
    //
    // CAPPlugin.requestPermissions() already handles routing; we override
    // checkPermissions / requestPermissions to map to CLLocationManager.

    public override func checkPermissions(_ call: CAPPluginCall) {
        let status = CLLocationManager.authorizationStatus()
        let location = locationState(status)
        let background = backgroundLocationState(status)
        call.resolve(["location": location, "backgroundLocation": background])
    }

    public override func requestPermissions(_ call: CAPPluginCall) {
        let permissions = call.getArray("permissions", String.self) ?? []
        if permissions.contains("backgroundLocation") {
            // iOS requires the app to already have "When in Use" before requesting
            // "Always". We request Always directly — iOS will downgrade to
            // "When in Use" first if not yet granted and the user can upgrade.
            service.locationManager.requestAlwaysAuthorization()
        } else {
            service.locationManager.requestWhenInUseAuthorization()
        }
        // Return current state immediately; the actual dialog is async.
        checkPermissions(call)
    }

    // MARK: - Helpers

    private func locationState(_ status: CLAuthorizationStatus) -> String {
        switch status {
        case .authorizedWhenInUse, .authorizedAlways: return "granted"
        case .denied, .restricted:                    return "denied"
        default:                                      return "prompt"
        }
    }

    private func backgroundLocationState(_ status: CLAuthorizationStatus) -> String {
        status == .authorizedAlways ? "granted" : "prompt"
    }
}
