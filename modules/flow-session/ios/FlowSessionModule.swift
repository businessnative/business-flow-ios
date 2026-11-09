import AVFoundation
import ExpoModulesCore
import UIKit

/// Business Flow session: keeps an audio session alive in the background (like Wispr's "Flow is on"),
/// records 16 kHz mono on request, and bridges to the keyboard extension through the App Group
/// (UserDefaults suite + Darwin notifications). The keyboard can't use the microphone itself.
public class FlowSessionModule: Module {
  static let appGroup = "group.com.example.businessflow"
  static let cmdNote = "com.example.businessflow.cmd"
  static let stateNote = "com.example.businessflow.state"

  let shared = UserDefaults(suiteName: FlowSessionModule.appGroup)
  let engine = AVAudioEngine()
  var converter: AVAudioConverter?
  let target = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 16_000, channels: 1, interleaved: false)!
  let lock = NSLock()
  var samples: [Float] = []
  var recording = false
  var sessionActive = false
  var heartbeat: Timer?
  var lastLevelWrite = Date.distantPast
  var observersInstalled = false
  var lastBufferAt = Date.distantPast
  var cuePlayer: AVAudioPlayer?

  public func definition() -> ModuleDefinition {
    Name("FlowSession")

    Events("onCommand", "onLevel", "onInterruption")

    Constants(["appGroup": FlowSessionModule.appGroup])

    OnCreate {
      self.installObservers()
    }

    OnDestroy {
      self.stopSessionInternal()
    }

    // MARK: App Group shared storage

    Function("getShared") { (key: String) -> String? in
      self.shared?.string(forKey: key)
    }

    Function("setShared") { (key: String, value: String?) in
      if let value { self.shared?.set(value, forKey: key) } else { self.shared?.removeObject(forKey: key) }
    }

    /// Writes the state the keyboard renders and wakes it with a Darwin notification.
    Function("publishState") { (json: String) in
      self.shared?.set(json, forKey: "flow.state")
      FlowSessionModule.post(FlowSessionModule.stateNote)
    }

    // MARK: Permissions / setup

    Function("micPermission") { () -> String in
      switch AVAudioApplication.shared.recordPermission {
      case .granted: return "granted"
      case .denied: return "denied"
      default: return "undetermined"
      }
    }

    AsyncFunction("requestMicPermission") { (promise: Promise) in
      AVAudioApplication.requestRecordPermission { ok in promise.resolve(ok) }
    }

    /// Whether the Business Flow keyboard has been added in Settings (AppleKeyboards lists active keyboards).
    Function("isKeyboardEnabled") { () -> Bool in
      let id = (Bundle.main.bundleIdentifier ?? "com.example.businessflow") + ".keyboard"
      let list = UserDefaults.standard.object(forKey: "AppleKeyboards") as? [String] ?? []
      return list.contains(id)
    }

    /// The keyboard writes a timestamp here whenever it runs with Full Access (App Group writes need it).
    Function("keyboardFullAccessSeenAt") { () -> Double in
      self.shared?.double(forKey: "flow.kb.fullAccessAt") ?? 0
    }

    // MARK: Session

    AsyncFunction("startSession") { () throws in
      try self.startSessionInternal()
    }.runOnQueue(.main)

    AsyncFunction("stopSession") {
      self.stopSessionInternal()
    }.runOnQueue(.main)

    Function("isSessionActive") { () -> Bool in self.sessionActive }

    AsyncFunction("startRecording") { () throws in
      if !self.sessionActive || !self.engine.isRunning { self.stopSessionInternal(); try self.startSessionInternal() }
      self.lock.lock()
      self.samples.removeAll(keepingCapacity: false)
      self.samples.reserveCapacity(16_000 * 60) // one minute of 16 kHz mono; grows if the take is longer
      self.recording = true
      self.lastBufferAt = Date()
      self.lock.unlock()
    }.runOnQueue(.main)

    /// Stops capture, runs AudioPrep (high-pass, VAD trim, whisper gain) and writes a 16 kHz WAV.
    AsyncFunction("stopRecording") { () -> [String: Any] in
      self.lock.lock(); self.recording = false; let raw = self.samples; self.samples = []; self.lock.unlock()
      self.shared?.set(0.0, forKey: "flow.level")
      let st = AudioPrep.analyze(raw)
      let silent = AudioPrep.isSilent(st)
      let prepared = silent ? raw : AudioPrep.prepare(raw)
      let data = WAV.encode(samples: WAV.floatToInt16(prepared))
      let url = FileManager.default.temporaryDirectory.appendingPathComponent("flow-\(UUID().uuidString).wav")
      try data.write(to: url)
      return [
        "uri": url.absoluteString,
        "seconds": st.seconds,
        "peak": Double(st.peak),
        "speechSeconds": st.speechSeconds,
        "silent": silent,
        "whisper": AudioPrep.isWhisper(st),
      ]
    }

    Function("cancelRecording") {
      self.lock.lock(); self.recording = false; self.samples = []; self.lock.unlock()
      self.shared?.set(0.0, forKey: "flow.level")
    }

    Function("isRecording") { () -> Bool in
      self.lock.lock(); defer { self.lock.unlock() }; return self.recording
    }

    /// Reads a recorded WAV as base64 (used only for upload).
    AsyncFunction("readFileBase64") { (uri: String) -> String in
      guard let url = URL(string: uri) else { throw Exception(name: "BadURI", description: "Invalid file URI") }
      return try Data(contentsOf: url).base64EncodedString()
    }

    Function("bufferAgeMs") { () -> Double in
      self.lock.lock(); let rec = self.recording; let at = self.lastBufferAt; self.lock.unlock()
      return rec ? Date().timeIntervalSince(at) * 1000 : -1
    }

    /// Stall / route recovery: rebuild the engine for the current input, keep samples + recording flag.
    AsyncFunction("restartEngine") { () throws in
      try self.restartEngineKeepingSamples()
    }.runOnQueue(.main)

    Function("playCue") { (kind: String, volume: Double) in
      self.playCue(kind, volume: volume)
    }

    Function("deleteFile") { (uri: String) in
      if let url = URL(string: uri) { try? FileManager.default.removeItem(at: url) }
    }

    // Call notes: items saved by the Share Extension into the App Group inbox (JSON array of manifests).
    Function("callInbox") { () -> String in
      let data = (try? JSONEncoder().encode(CallInbox.list())) ?? Data("[]".utf8)
      return String(data: data, encoding: .utf8) ?? "[]"
    }

    /// Moves an inbox item into the app's Documents/calls and returns its file:// URI (nil if gone).
    Function("takeCallInboxItem") { (id: String) -> String? in
      guard let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else { return nil }
      return (try? CallInbox.take(id, to: docs.appendingPathComponent("calls", isDirectory: true)))?.absoluteString
    }
  }

  // MARK: - Internals

  func startSessionInternal() throws {
    guard !sessionActive else { return }
    let s = AVAudioSession.sharedInstance()
    try s.setCategory(.playAndRecord, mode: .default, options: [.mixWithOthers, .allowBluetooth, .defaultToSpeaker])
    try s.setActive(true)
    let input = engine.inputNode
    let fmt = input.outputFormat(forBus: 0)
    guard fmt.sampleRate > 0 else { throw Exception(name: "NoInput", description: "Nincs elérhető mikrofon.") }
    converter = AVAudioConverter(from: fmt, to: target)
    input.removeTap(onBus: 0)
    input.installTap(onBus: 0, bufferSize: 2048, format: fmt) { [weak self] buf, _ in self?.handle(buf) }
    engine.prepare()
    try engine.start()
    sessionActive = true
    beat()
    heartbeat?.invalidate()
    heartbeat = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in self?.beat() }
  }

  func stopSessionInternal() {
    heartbeat?.invalidate(); heartbeat = nil
    if engine.isRunning { engine.stop() }
    engine.inputNode.removeTap(onBus: 0)
    lock.lock(); recording = false; samples = []; lock.unlock()
    sessionActive = false
    shared?.set(0.0, forKey: "flow.heartbeat")
    shared?.set(0.0, forKey: "flow.level")
    try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
  }

  func restartEngineKeepingSamples() throws {
    if engine.isRunning { engine.stop() }
    engine.inputNode.removeTap(onBus: 0)
    engine.reset()
    let s = AVAudioSession.sharedInstance()
    try s.setActive(true)
    let input = engine.inputNode
    let fmt = input.outputFormat(forBus: 0)
    guard fmt.sampleRate > 0 else { throw Exception(name: "NoInput", description: "Nincs elérhető mikrofon.") }
    converter = AVAudioConverter(from: fmt, to: target)
    input.installTap(onBus: 0, bufferSize: 2048, format: fmt) { [weak self] buf, _ in self?.handle(buf) }
    engine.prepare()
    try engine.start()
    sessionActive = true
    lock.lock(); lastBufferAt = Date(); lock.unlock()
  }

  /// Own soft cue: a short sine "blip" with a smooth attack/decay envelope, synthesized at runtime (no bundled assets).
  func playCue(_ kind: String, volume: Double) {
    let v = Float(min(1, max(0, volume)))
    guard v > 0 else { return }
    let freq: Double = kind == "start" ? 660 : kind == "stop" ? 520 : 330
    let dur = 0.09, rate = 16_000.0
    let n = Int(dur * rate)
    var pcm = [Float](repeating: 0, count: n)
    for i in 0..<n {
      let t = Double(i) / rate
      let env = sin(Double.pi * t / dur) // half-sine envelope: no click
      pcm[i] = Float(sin(2 * Double.pi * freq * t) * env * 0.35)
    }
    let data = WAV.encode(samples: WAV.floatToInt16(pcm))
    if let p = try? AVAudioPlayer(data: data) {
      p.volume = v
      p.prepareToPlay()
      p.play()
      cuePlayer = p
    }
  }

  func beat() {
    shared?.set(Date().timeIntervalSince1970, forKey: "flow.heartbeat")
  }

  func handle(_ buf: AVAudioPCMBuffer) {
    lock.lock(); let rec = recording; lock.unlock()
    guard rec, let converter else { return }
    let ratio = target.sampleRate / buf.format.sampleRate
    let cap = AVAudioFrameCount(Double(buf.frameLength) * ratio + 32)
    guard let out = AVAudioPCMBuffer(pcmFormat: target, frameCapacity: cap) else { return }
    var fed = false
    var err: NSError?
    converter.convert(to: out, error: &err) { _, status in
      if fed { status.pointee = .noDataNow; return nil }
      fed = true; status.pointee = .haveData; return buf
    }
    guard err == nil, let ch = out.floatChannelData else { return }
    let n = Int(out.frameLength)
    let ptr = UnsafeBufferPointer(start: ch[0], count: n)
    lock.lock(); samples.append(contentsOf: ptr); lastBufferAt = Date(); lock.unlock()
    let now = Date()
    if now.timeIntervalSince(lastLevelWrite) > 0.08 {
      lastLevelWrite = now
      let lvl = WAV.level(ptr)
      shared?.set(Double(lvl), forKey: "flow.level")
      sendEvent("onLevel", ["level": lvl])
    }
  }

  func installObservers() {
    guard !observersInstalled else { return }
    observersInstalled = true
    FlowSessionModule.current = self
    let center = CFNotificationCenterGetDarwinNotifyCenter()
    CFNotificationCenterAddObserver(center, nil, { _, _, _, _, _ in
      DispatchQueue.main.async { FlowSessionModule.current?.commandArrived() }
    }, FlowSessionModule.cmdNote as CFString, nil, .deliverImmediately)

    NotificationCenter.default.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] n in
      guard let self, let raw = n.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
            let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
      if type == .began {
        // Phone call / Siri: the engine is stopped by iOS. Keep the samples (JS salvages them via stopRecording).
        if self.engine.isRunning { self.engine.pause() }
        self.sessionActive = false
        self.sendEvent("onInterruption", ["reason": "interrupted"])
      } else {
        // Interruption ended: bring the warm session back so the keyboard works again without opening the app.
        self.lock.lock(); self.recording = false; self.lock.unlock()
        self.stopSessionInternal()
        try? self.startSessionInternal()
        self.sendEvent("onInterruption", ["reason": "ended"])
      }
    }
    NotificationCenter.default.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { [weak self] n in
      guard let self, let raw = n.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
            let reason = AVAudioSession.RouteChangeReason(rawValue: raw) else { return }
      if reason == .oldDeviceUnavailable || reason == .newDeviceAvailable || reason == .override {
        // AirPods / headset change: the input format changes. Rebuild the engine but keep recording + samples.
        guard self.sessionActive else { return }
        do { try self.restartEngineKeepingSamples() } catch {
          self.sendEvent("onInterruption", ["reason": "reset"])
          return
        }
        self.sendEvent("onInterruption", ["reason": "route"])
      }
    }
    NotificationCenter.default.addObserver(forName: AVAudioSession.mediaServicesWereResetNotification, object: nil, queue: .main) { [weak self] _ in
      guard let self else { return }
      let wasActive = self.sessionActive
      self.stopSessionInternal()
      if wasActive { try? self.startSessionInternal() }
      self.sendEvent("onInterruption", ["reason": "reset"])
    }
  }

  nonisolated(unsafe) static weak var current: FlowSessionModule?

  func commandArrived() {
    guard let json = shared?.string(forKey: "flow.cmd") else { return }
    sendEvent("onCommand", ["json": json])
  }

  static func post(_ name: String) {
    CFNotificationCenterPostNotification(CFNotificationCenterGetDarwinNotifyCenter(), CFNotificationName(name as CFString), nil, nil, true)
  }
}
