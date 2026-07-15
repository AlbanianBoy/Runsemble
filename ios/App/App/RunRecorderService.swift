import Foundation
import CoreLocation
import UIKit

///
/// RunRecorderService — iOS background location + disk persistence.
///
/// Mirrors the Android RunRecorderService contract:
///   - Starts a CLLocationManager in background mode (allowsBackgroundLocationUpdates = true)
///   - Writes every fix as a JSONL line to <Documents>/runrecorder/<runId>.jsonl
///   - Keeps an "active" JSON file so a cold relaunch can reattach
///   - Shows a persistent local notification while tracking
///
/// Thread safety: all file I/O runs on a dedicated serial queue.
///
final class RunRecorderService: NSObject, CLLocationManagerDelegate {

    static let shared = RunRecorderService()

    // Exposed to RunRecorderPlugin so it can call requestWhenInUseAuthorization /
    // requestAlwaysAuthorization without creating a second CLLocationManager.
    let locationManager = CLLocationManager()

    private let fileQueue = DispatchQueue(label: "net.runsemble.runrecorder", qos: .utility)
    private var currentRunId: String? = nil
    private var fixCount: Int = 0
    private var startedAt: Int64 = 0

    private override init() {
        super.init()
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyBest
        locationManager.distanceFilter  = 5           // metres — matches Android
        locationManager.pausesLocationUpdatesAutomatically = false
        // Required for background updates; must also be declared in Info.plist
        // UIBackgroundModes: [location]
        if #available(iOS 9.0, *) {
            locationManager.allowsBackgroundLocationUpdates = true
        }
    }

    // MARK: - Control

    func startTracking(runId: String) {
        guard currentRunId == nil else { return } // already running
        currentRunId = runId
        fixCount     = 0
        startedAt    = Int64(Date().timeIntervalSince1970 * 1000)
        writeActive(runId: runId, startedAt: startedAt, updatedAt: startedAt, count: 0)
        showNotification()
        locationManager.startUpdatingLocation()
    }

    func stopTracking() {
        locationManager.stopUpdatingLocation()
        currentRunId = nil
        removeNotification()
    }

    // MARK: - CLLocationManagerDelegate

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let runId = currentRunId else { return }
        let now = Int64(Date().timeIntervalSince1970 * 1000)
        fileQueue.async { [weak self] in
            guard let self else { return }
            let url = self.trackFileURL(runId: runId)
            var lines = ""
            for loc in locations {
                let t      = Int64(loc.timestamp.timeIntervalSince1970 * 1000)
                let lat    = loc.coordinate.latitude
                let lng    = loc.coordinate.longitude
                let acc    = loc.horizontalAccuracy >= 0 ? loc.horizontalAccuracy : -1
                let line   = "{\"t\":\(t),\"lat\":\(lat),\"lng\":\(lng),\"acc\":\(acc),\"p\":\"cllocation\"}\n"
                lines += line
                self.fixCount += 1
            }
            self.appendToFile(url: url, text: lines)
            self.writeActive(runId: runId, startedAt: self.startedAt, updatedAt: now, count: self.fixCount)
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // Non-fatal — GPS may temporarily fail; keep the service running.
        print("[RunRecorderService] location error: \(error.localizedDescription)")
    }

    // MARK: - File helpers

    func readTrack(runId: String, sinceIndex: Int) -> ([[String: Any]], Int) {
        var points: [[String: Any]] = []
        fileQueue.sync {
            let url = trackFileURL(runId: runId)
            guard let text = try? String(contentsOf: url, encoding: .utf8) else { return }
            let lines = text.components(separatedBy: "\n").filter { !$0.isEmpty }
            let slice = lines.dropFirst(sinceIndex)
            for line in slice {
                guard
                    let data = line.data(using: .utf8),
                    let obj  = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
                else { continue }
                points.append(obj)
            }
        }
        return (points, sinceIndex + points.count)
    }

    func clearTrack(runId: String) {
        fileQueue.sync {
            let url = trackFileURL(runId: runId)
            try? FileManager.default.removeItem(at: url)
        }
    }

    // MARK: - Active session

    struct ActiveSession {
        let runId: String
        let startedAt: Int64
        let updatedAt: Int64
        let count: Int
    }

    func readActive() -> ActiveSession? {
        var result: ActiveSession? = nil
        fileQueue.sync {
            let url = activeFileURL()
            guard
                let data = try? Data(contentsOf: url),
                let obj  = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                let rid  = obj["runId"] as? String
            else { return }
            result = ActiveSession(
                runId:     rid,
                startedAt: obj["startedAt"] as? Int64 ?? 0,
                updatedAt: obj["updatedAt"] as? Int64 ?? 0,
                count:     obj["count"]     as? Int  ?? 0
            )
        }
        return result
    }

    func clearActive() {
        fileQueue.sync {
            try? FileManager.default.removeItem(at: activeFileURL())
        }
    }

    private func writeActive(runId: String, startedAt: Int64, updatedAt: Int64, count: Int) {
        fileQueue.async { [weak self] in
            guard let self else { return }
            let obj: [String: Any] = [
                "runId":     runId,
                "startedAt": startedAt,
                "updatedAt": updatedAt,
                "count":     count,
            ]
            guard let data = try? JSONSerialization.data(withJSONObject: obj) else { return }
            try? data.write(to: self.activeFileURL(), options: .atomic)
        }
    }

    // MARK: - Notification

    private let notifId = "net.runsemble.runrecorder.tracking"

    private func showNotification() {
        if #available(iOS 10.0, *) {
            let content  = UNMutableNotificationContent()
            content.title = "Runsemble is tracking your run"
            content.body  = "Tap to return to the app."
            content.sound = .none
            let request = UNNotificationRequest(
                identifier: notifId,
                content:    content,
                trigger:    nil
            )
            UNUserNotificationCenter.current().add(request, withCompletionHandler: nil)
        }
    }

    private func removeNotification() {
        if #available(iOS 10.0, *) {
            UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [notifId])
            UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: [notifId])
        }
    }

    // MARK: - Path helpers

    private func recordsDir() -> URL {
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        let dir  = docs.appendingPathComponent("runrecorder", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    func trackFileURL(runId: String) -> URL {
        recordsDir().appendingPathComponent("\(runId).jsonl")
    }

    private func activeFileURL() -> URL {
        recordsDir().appendingPathComponent("active.json")
    }

    private func appendToFile(url: URL, text: String) {
        guard let data = text.data(using: .utf8) else { return }
        if FileManager.default.fileExists(atPath: url.path) {
            if let fh = try? FileHandle(forWritingTo: url) {
                fh.seekToEndOfFile()
                fh.write(data)
                fh.closeFile()
            }
        } else {
            try? data.write(to: url, options: .atomic)
        }
    }
}
