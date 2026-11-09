import UIKit
import Foundation

/// App Group protocol shared with the app (modules/flow-session + src/session/protocol.ts).
enum Bridge {
  static let appGroup = "group.com.example.businessflow"
  static let cmdNote = "com.example.businessflow.cmd"
  static let stateNote = "com.example.businessflow.state"
  static var shared: UserDefaults? { UserDefaults(suiteName: appGroup) }

  struct State: Decodable, Equatable {
    var id: String
    var phase: String // idle | starting | recording | processing | done | error
    var text: String?
    var error: String?
    var ts: Double
  }

  struct KeyboardPrefs: Decodable {
    var haptics: Bool?
    var category: String?
    var hasKey: Bool?
  }

  static var heartbeat: Double { shared?.double(forKey: "flow.heartbeat") ?? 0 }
  static var sessionAlive: Bool { Date().timeIntervalSince1970 - heartbeat < 3.5 }
  static var level: Double { shared?.double(forKey: "flow.level") ?? 0 }

  static func state() -> State? {
    guard let s = shared?.string(forKey: "flow.state"), let d = s.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode(State.self, from: d)
  }

  static func prefs() -> KeyboardPrefs? {
    guard let s = shared?.string(forKey: "flow.kb.prefs"), let d = s.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode(KeyboardPrefs.self, from: d)
  }

  @discardableResult
  static func send(_ action: String, id: String = UUID().uuidString, category: String, before: String, after: String, mode: String = "toggle") -> String {
    let body: [String: Any] = ["id": id, "action": action, "category": category, "before": before, "after": after,
                               "mode": mode, "ts": Date().timeIntervalSince1970]
    if let d = try? JSONSerialization.data(withJSONObject: body), let s = String(data: d, encoding: .utf8) {
      shared?.set(s, forKey: "flow.cmd")
    }
    CFNotificationCenterPostNotification(CFNotificationCenterGetDarwinNotifyCenter(), CFNotificationName(cmdNote as CFString), nil, nil, true)
    return id
  }
}
