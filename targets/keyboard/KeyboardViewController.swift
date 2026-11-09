import Combine
import Foundation
import SwiftUI
import UIKit

/// Business Flow keyboard. The keyboard cannot use the microphone (iOS rule), so — like Wispr Flow — it asks the
/// Business Flow app (running a background audio session) to record, then inserts the returned text via textDocumentProxy.
final class KeyboardViewController: UIInputViewController {
  private let model = KeyboardModel()
  private var host: UIHostingController<KeyboardView>?
  private var timer: Timer?

  override func viewDidLoad() {
    super.viewDidLoad()
    model.actions = .init(
      mic: { [weak self] in self?.micTapped() },
      micHoldBegan: { [weak self] in self?.holdBegan() },
      micHoldEnded: { [weak self] in self?.holdEnded() },
      confirm: { [weak self] in self?.stop() },
      cancel: { [weak self] in self?.cancel() },
      retry: { [weak self] in self?.retry() },
      dismissError: { [weak self] in self?.model.dismissError() },
      openApp: { [weak self] in self?.open("businessflow://hub") },
      openSettings: { [weak self] in self?.open(UIApplication.openSettingsURLString) },
      cycleCategory: { [weak self] in self?.model.cycleCategory() },
      space: { [weak self] in self?.textDocumentProxy.insertText(" ") },
      backspace: { [weak self] in self?.textDocumentProxy.deleteBackward() },
      newline: { [weak self] in self?.textDocumentProxy.insertText("\n") },
      nextKeyboard: { [weak self] in self?.advanceToNextInputMode() }
    )
    let v = KeyboardView(model: model)
    let h = UIHostingController(rootView: v)
    h.view.backgroundColor = .clear
    h.sizingOptions = [.intrinsicContentSize]
    addChild(h)
    view.addSubview(h.view)
    h.view.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      h.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      h.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      h.view.topAnchor.constraint(equalTo: view.topAnchor),
      h.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
      h.view.heightAnchor.constraint(equalToConstant: 248),
    ])
    h.didMove(toParent: self)
    host = h
    let center = CFNotificationCenterGetDarwinNotifyCenter()
    let me = Unmanaged.passUnretained(self).toOpaque()
    CFNotificationCenterAddObserver(center, me, { _, observer, _, _, _ in
      guard let observer else { return }
      let vc = Unmanaged<KeyboardViewController>.fromOpaque(observer).takeUnretainedValue()
      DispatchQueue.main.async { vc.poll() }
    }, Bridge.stateNote as CFString, nil, .deliverImmediately)
  }

  deinit {
    CFNotificationCenterRemoveEveryObserver(CFNotificationCenterGetDarwinNotifyCenter(), Unmanaged.passUnretained(self).toOpaque())
  }

  override func viewWillAppear(_ animated: Bool) {
    super.viewWillAppear(animated)
    // Number / phone pads: hand over to the system keyboard (same as Wispr Flow).
    switch textDocumentProxy.keyboardType {
    case .numberPad, .phonePad, .decimalPad, .asciiCapableNumberPad:
      advanceToNextInputMode()
      return
    default: break
    }
    model.hasFullAccess = hasFullAccess
    model.showGlobe = needsInputModeSwitchKey
    if hasFullAccess { Bridge.shared?.set(Date().timeIntervalSince1970, forKey: "flow.kb.fullAccessAt") }
    model.loadPrefs()
    poll()
    timer?.invalidate()
    timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in self?.poll() }
  }

  override func viewWillDisappear(_ animated: Bool) {
    super.viewWillDisappear(animated)
    timer?.invalidate(); timer = nil
  }

  private func poll() {
    model.sessionAlive = Bridge.sessionAlive
    model.level = Bridge.level
    model.watchdog(sessionAlive: model.sessionAlive)
    guard let st = Bridge.state() else { return }
    model.apply(st)
    if model.shouldInsert(st), let text = st.text {
      textDocumentProxy.insertText(text)
      model.markInserted(st.id)
      model.haptic(.success)
    }
  }

  private var before: String { String((textDocumentProxy.documentContextBeforeInput ?? "").suffix(600)) }
  private var after: String { String((textDocumentProxy.documentContextAfterInput ?? "").prefix(300)) }

  private func micTapped() {
    switch KeyboardLogic.micAction(model.phase, hasFullAccess, Bridge.sessionAlive, model.hasKey) {
    case .fullAccessHelp: model.showFullAccessHelp = true
    case .stop: stop()
    case .cancel: cancel()
    case .openSettings: open("businessflow://settings")
    case .start, .startViaApp: start(mode: "toggle")
    }
  }

  private var holdId: String?
  private func holdBegan() {
    guard hasFullAccess, model.hasKey, model.phase != "recording", model.phase != "processing" else { return }
    holdId = start(mode: "ptt")
  }

  private func holdEnded() {
    guard holdId != nil else { return }
    holdId = nil
    stop()
  }

  @discardableResult
  private func start(mode: String) -> String? {
    model.haptic(.light)
    let id = Bridge.send("start", category: model.category, before: before, after: after, mode: mode)
    model.pendingId = id
    if Bridge.sessionAlive {
      model.optimistic("starting")
    } else {
      // No session: open the app; it starts the session + recording, then the user swipes back.
      open("businessflow://dictate?id=\(id)")
    }
    return id
  }

  private func stop() {
    model.haptic(.light)
    // If the app is gone, don't wait for an answer that never comes.
    if !Bridge.sessionAlive && model.phase != "idle" {
      model.optimistic("idle")
    }
    Bridge.send("stop", id: model.stateId ?? UUID().uuidString, category: model.category, before: before, after: after)
  }

  private func cancel() {
    Bridge.send("cancel", id: model.stateId ?? UUID().uuidString, category: model.category, before: before, after: after)
    model.optimistic("idle")
  }

  private func retry() {
    let id = Bridge.send("retry", id: model.stateId ?? UUID().uuidString, category: model.category, before: before, after: after)
    model.pendingId = id
    if !Bridge.sessionAlive { open("businessflow://dictate?retry=1") }
  }

  /// No official openURL for keyboards; walk the responder chain to UIApplication (widely used pattern).
  private func open(_ s: String) {
    guard let url = URL(string: s) else { return }
    let sel = NSSelectorFromString("openURL:options:completionHandler:")
    var r: UIResponder? = self
    while let cur = r {
      if cur is UIApplication, cur.responds(to: sel), let m = cur.method(for: sel) {
        typealias Open = @convention(c) (AnyObject, Selector, URL, [UIApplication.OpenExternalURLOptionsKey: Any], ((Bool) -> Void)?) -> Void
        unsafeBitCast(m, to: Open.self)(cur, sel, url, [:], nil)
        return
      }
      r = cur.next
    }
    extensionContext?.open(url, completionHandler: nil)
  }
}
