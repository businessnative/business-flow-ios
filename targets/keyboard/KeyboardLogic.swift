import Foundation

/// UIKit-free keyboard decisions, compiled and checked on macOS by evals/swift/main.swift (evals/PROTOCOL.md).
enum KeyboardLogic {
  enum MicAction: Equatable { case fullAccessHelp, startViaApp, start, stop, cancel, openSettings }

  /// Seconds a result stays insertable; older results never land in a newly focused field.
  static let freshS: Double = 120
  /// Hard ceiling for processing. The app's own, length-scaled watchdog (≤ ~110 s for 5 min audio) normally fires first.
  static let processingMaxS: Double = 150

  /// Keyboard-side watchdog: returns an error text when the keyboard would otherwise stay stuck.
  static func watchdog(_ phase: String, _ age: Double, _ sessionAlive: Bool) -> String? {
    switch phase {
    case "starting" where age > 8:
      return "A Business Flow app nem válaszolt. Koppints a mikrofonra újra, vagy nyisd meg az appot."
    case "recording" where !sessionAlive && age > 4, "processing" where !sessionAlive && age > 4:
      return "A Business Flow app leállt a háttérben. Nyisd meg az appot, majd próbáld újra."
    case "processing" where age > processingMaxS:
      return "Az átírás túl sokáig tartott. Koppints az Újra gombra."
    case "recording" where age > 320:
      return "A felvétel túl hosszú lett, leállítottam."
    default:
      return nil
    }
  }

  static func micAction(_ phase: String, _ hasFullAccess: Bool, _ sessionAlive: Bool, _ hasKey: Bool) -> MicAction {
    guard hasFullAccess else { return .fullAccessHelp }
    switch phase {
    case "recording", "starting": return .stop
    case "processing": return .cancel
    default:
      if !hasKey { return .openSettings }
      return sessionAlive ? .start : .startViaApp
    }
  }

  static func shouldInsert(_ id: String, _ phase: String, _ text: String?, _ ts: Double, _ now: Double, _ pendingId: String?, _ inserted: [String]) -> Bool {
    guard phase == "done", id == pendingId, !inserted.contains(id), let t = text, !t.isEmpty else { return false }
    return now - ts < freshS
  }
}
