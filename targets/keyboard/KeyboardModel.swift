import Foundation
import Combine
import SwiftUI
import UIKit

final class KeyboardModel: ObservableObject {
  struct Actions {
    var mic: () -> Void = {}, micHoldBegan: () -> Void = {}, micHoldEnded: () -> Void = {}
    var confirm: () -> Void = {}, cancel: () -> Void = {}, retry: () -> Void = {}, dismissError: () -> Void = {}
    var openApp: () -> Void = {}, openSettings: () -> Void = {}, cycleCategory: () -> Void = {}
    var space: () -> Void = {}, backspace: () -> Void = {}, newline: () -> Void = {}, nextKeyboard: () -> Void = {}
  }

  static let categories: [(id: String, label: String)] = [("personal", "Személyes"), ("work", "Munka"), ("email", "E-mail"), ("other", "Egyéb")]

  var actions = Actions()
  @Published var hasFullAccess = false
  @Published var showFullAccessHelp = false
  @Published var showGlobe = true
  @Published var sessionAlive = false
  @Published var level: Double = 0
  @Published var phase = "idle"
  @Published var errorText: String?
  @Published var category = "personal"
  @Published var hasKey = true
  var stateId: String?
  private var haptics = false
  /// When the current phase was entered (keyboard-side watchdog).
  private(set) var phaseSince = Date()
  private var lastStateTs: Double = 0
  private let local = UserDefaults.standard

  var pendingId: String? {
    get { local.string(forKey: "kb.pendingId") }
    set { local.set(newValue, forKey: "kb.pendingId") }
  }

  var categoryLabel: String { Self.categories.first { $0.id == category }?.label ?? "Személyes" }

  func loadPrefs() {
    let p = Bridge.prefs()
    haptics = p?.haptics ?? false
    hasKey = p?.hasKey ?? true
    if let c = local.string(forKey: "kb.category") { category = c } else if let c = p?.category { category = c }
  }

  func cycleCategory() {
    let i = Self.categories.firstIndex { $0.id == category } ?? 0
    category = Self.categories[(i + 1) % Self.categories.count].id
    local.set(category, forKey: "kb.category")
    haptic(.light)
  }

  func apply(_ st: Bridge.State) {
    guard st.ts >= lastStateTs else { return }
    lastStateTs = st.ts
    stateId = st.id
    let fresh = Date().timeIntervalSince1970 - st.ts < KeyboardLogic.freshS
    let mine = st.id == pendingId
    switch st.phase {
    case "recording", "starting", "processing":
      if fresh { set(st.phase) }
    case "error":
      if fresh && mine { errorText = st.error ?? "Hiba történt."; set("error") }
    default:
      if phase != "error" { set("idle") }
    }
  }

  private func set(_ p: String) {
    if phase != p { phaseSince = Date(); withAnimation(.bn()) { phase = p } }
  }

  /// Keyboard-side watchdog: the keyboard must never stay stuck if the app died, was suspended or never answered.
  /// Limits are slightly longer than the app's own watchdogs so the app's precise message normally wins.
  func watchdog(sessionAlive: Bool, now: Date = Date()) {
    if let msg = KeyboardLogic.watchdog(phase, now.timeIntervalSince(phaseSince), sessionAlive) { fail(msg) }
  }

  private func fail(_ msg: String) {
    errorText = msg
    set("error")
  }

  /// Optimistic local phase change (button press) — also restarts the watchdog clock.
  func optimistic(_ p: String) { set(p) }

  func dismissError() { errorText = nil; set("idle") }

  func shouldInsert(_ st: Bridge.State) -> Bool {
    KeyboardLogic.shouldInsert(st.id, st.phase, st.text, st.ts, Date().timeIntervalSince1970, pendingId, local.stringArray(forKey: "kb.inserted") ?? [])
  }

  func markInserted(_ id: String) {
    var done = local.stringArray(forKey: "kb.inserted") ?? []
    done.append(id)
    local.set(Array(done.suffix(20)), forKey: "kb.inserted")
    pendingId = nil
    set("idle")
  }

  enum Haptic { case light, success }
  func haptic(_ h: Haptic) {
    guard haptics, hasFullAccess else { return }
    switch h {
    case .light: UIImpactFeedbackGenerator(style: .light).impactOccurred()
    case .success: UINotificationFeedbackGenerator().notificationOccurred(.success)
    }
  }
}
