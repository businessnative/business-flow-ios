// Swift eval harness (evals/PROTOCOL.md): compiles the UIKit-free keyboard logic + AudioPrep on macOS and checks them.
// Built by evals/run.mjs:  swiftc targets/keyboard/KeyboardLogic.swift modules/flow-session/ios/AudioPrep.swift evals/swift/main.swift
import Foundation

var failures: [String: [String]] = [:]
var seen: [String] = []
func check(_ id: String, _ ok: Bool, _ what: String) {
  if !seen.contains(id) { seen.append(id) }
  if !ok { failures[id, default: []].append(what) }
}

// E-KB-01 keyboard watchdog never leaves the keyboard stuck
let W = KeyboardLogic.watchdog
check("E-KB-01", W("starting", 9, true) != nil, "starting > 8 s fails")
check("E-KB-01", W("starting", 3, true) == nil, "starting 3 s ok")
check("E-KB-01", W("recording", 5, false) != nil, "recording with dead app fails after 4 s")
check("E-KB-01", W("recording", 60, true) == nil, "recording 60 s with live app ok")
check("E-KB-01", W("recording", 321, true) != nil, "recording > 320 s fails")
check("E-KB-01", W("processing", 5, false) != nil, "processing with dead app fails")
check("E-KB-01", W("idle", 9999, false) == nil, "idle never fires")
// E-KB-02 long recording: the app's own (length-scaled) processing watchdog must win while the app is alive
check("E-KB-02", W("processing", 90, true) == nil, "processing 90 s with live app (5-min audio) is not cut by the keyboard")
check("E-KB-02", W("processing", 200, true) != nil, "processing > 150 s always fails")

// E-KB-03 mic tap decisions: full access off, host app not running, no key, phase toggles
let M = KeyboardLogic.micAction
check("E-KB-03", M("idle", false, true, true) == .fullAccessHelp, "no full access → help sheet")
check("E-KB-03", M("idle", true, false, true) == .startViaApp, "app not running → open app with start")
check("E-KB-03", M("idle", true, true, true) == .start, "app running → start in place")
check("E-KB-03", M("recording", true, true, true) == .stop, "recording → stop")
check("E-KB-03", M("starting", true, true, true) == .stop, "starting → stop")
check("E-KB-03", M("processing", true, true, true) == .cancel, "processing → cancel")
check("E-KB-03", M("error", true, true, true) == .start, "error → new start")
check("E-KB-03", M("idle", true, true, false) == .openSettings, "no API key → open app settings, not a doomed recording")

// E-KB-04 insertion: once, only for my request, only while fresh
let I = KeyboardLogic.shouldInsert
let now = 1_000_000.0
check("E-KB-04", I("a", "done", "Szia", now - 2, now, "a", []), "fresh done for my id inserts")
check("E-KB-04", !I("a", "done", "Szia", now - 2, now, "a", ["a"]), "never inserts twice")
check("E-KB-04", !I("a", "done", "Szia", now - 2, now, "b", []), "other request's text not inserted")
check("E-KB-04", !I("a", "done", "", now - 2, now, "a", []), "empty text not inserted")
check("E-KB-04", !I("a", "done", "Szia", now - 600, now, "a", []), "stale (10 min) result is not inserted into a new field")
check("E-KB-04", !I("a", "processing", "Szia", now - 2, now, "a", []), "only done inserts")

// E-AUD-01 silence detection / VAD (same code as the app's native module)
let sr = 16_000
let silence = [Float](repeating: 0, count: sr * 2)
let tone = (0..<(sr * 2)).map { Float(0.3 * sin(2 * Double.pi * 220 * Double($0) / Double(sr))) }
check("E-AUD-01", AudioPrep.isSilent(AudioPrep.analyze(silence)), "digital silence is silent")
check("E-AUD-01", !AudioPrep.isSilent(AudioPrep.analyze(tone)), "a 220 Hz tone at -10 dBFS is not silent")
let wav = WAV.encode(samples: WAV.floatToInt16(tone))
check("E-AUD-01", wav.count == 44 + sr * 2 * 2, "WAV = 44-byte header + 16-bit mono PCM")
let le = [UInt8](WAV.encode(samples: [0x1234, -2]))
check("E-AUD-01", le.count == 48 && le[44] == 0x34 && le[45] == 0x12 && le[46] == 0xfe && le[47] == 0xff, "PCM is little-endian int16")
// E-AUD-02 hallucination filter (Swift side, matches the TS cleanTranscript)
check("E-AUD-02", AudioPrep.cleanTranscript("Köszönöm a figyelmet!", peak: 0.01, speechSeconds: 0.2).isEmpty, "pure hallucination dropped")
check("E-AUD-02", AudioPrep.cleanTranscript("Holnap tízkor találkozunk.", peak: 0.3, speechSeconds: 2).contains("tízkor"), "real speech kept")

// E-CALL-07 call-notes App Group inbox (Share Extension writer ↔ app reader), on a temp root
do {
  let fm = FileManager.default
  let root = fm.temporaryDirectory.appendingPathComponent("bf-inbox-\(UUID().uuidString)")
  let src = fm.temporaryDirectory.appendingPathComponent("Hívás \(UUID().uuidString).m4a")
  try Data([1, 2, 3]).write(to: src)
  let a = try CallInbox.addFile(src, name: "../../etc/Hívás.m4a", root: root, now: Date(timeIntervalSince1970: 1))
  let t = try CallInbox.addText("  A: Szia\nB: Helló  ", root: root, now: Date(timeIntervalSince1970: 2))
  let none = try CallInbox.addFile(src, name: "doc.pdf", root: root)
  let empty = try CallInbox.addText("   ", root: root)
  check("E-CALL-07", a?.kind == "audio" && a?.name == "Hívás.m4a", "audio saved with safe name")
  check("E-CALL-07", t?.kind == "text", "text saved")
  check("E-CALL-07", none == nil && empty == nil, "pdf / empty text rejected")
  let l = CallInbox.list(root: root)
  check("E-CALL-07", l.map { $0.kind } == ["audio", "text"], "list sorted by date")
  let dest = root.appendingPathComponent("app-docs")
  let moved = try CallInbox.take(a!.id, to: dest, root: root)
  check("E-CALL-07", moved != nil && fm.fileExists(atPath: moved!.path) && moved!.path.hasPrefix(dest.path), "take moves into app dir")
  check("E-CALL-07", CallInbox.list(root: root).count == 1, "taken item leaves the inbox")
  check("E-CALL-07", (try CallInbox.take(a!.id, to: dest, root: root)) == nil, "second take is a no-op")
  let txt = try String(contentsOf: try CallInbox.take(t!.id, to: dest, root: root)!, encoding: .utf8)
  check("E-CALL-07", txt == "A: Szia\nB: Helló", "text trimmed + intact")
  try? fm.removeItem(at: root); try? fm.removeItem(at: src)
} catch { check("E-CALL-07", false, "threw \(error)") }

for id in seen { print(failures[id] == nil ? "PASS [\(id)]" : "FAIL [\(id)] " + failures[id]!.joined(separator: "; ")) }
