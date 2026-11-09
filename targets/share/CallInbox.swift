import Foundation

/// App Group inbox shared by the Share Extension (writer) and the app's FlowSession module (reader).
/// Foundation-only so evals/swift compiles and checks it on macOS.
enum CallInbox {
  static let group = "group.com.example.businessflow"
  static let audioExt: Set<String> = ["m4a", "mp4", "aac", "wav", "mp3", "caf", "aiff", "aif", "mpeg", "webm", "ogg"]
  static let maxText = 2_000_000

  struct Item: Codable, Equatable {
    var id: String
    var kind: String // "audio" | "text"
    var name: String
    var file: String // file name inside the inbox directory
    var date: Double
  }

  static func directory(root: URL? = nil) -> URL? {
    guard let base = root ?? FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) else { return nil }
    let d = base.appendingPathComponent("CallInbox", isDirectory: true)
    try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
    return d
  }

  static func kind(forName name: String) -> String? {
    let ext = (name as NSString).pathExtension.lowercased()
    if audioExt.contains(ext) { return "audio" }
    if ["txt", "text", "md", "rtf"].contains(ext) { return "text" }
    return nil
  }

  /// Safe file name: no path components, keeps the extension.
  static func safeName(_ name: String) -> String {
    let base = (name as NSString).lastPathComponent
    let cleaned = base.components(separatedBy: CharacterSet(charactersIn: "/\\:\0")).joined(separator: "_")
    return cleaned.isEmpty ? "hivas" : String(cleaned.suffix(120))
  }

  @discardableResult
  static func addFile(_ src: URL, name: String? = nil, root: URL? = nil, now: Date = Date()) throws -> Item? {
    let n = safeName(name ?? src.lastPathComponent)
    guard let k = kind(forName: n), let dir = directory(root: root) else { return nil }
    let id = UUID().uuidString
    let file = "\(id)-\(n)"
    try FileManager.default.copyItem(at: src, to: dir.appendingPathComponent(file))
    return try writeManifest(Item(id: id, kind: k, name: n, file: file, date: now.timeIntervalSince1970), dir)
  }

  @discardableResult
  static func addText(_ text: String, root: URL? = nil, now: Date = Date()) throws -> Item? {
    let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !t.isEmpty, t.utf8.count <= maxText, let dir = directory(root: root) else { return nil }
    let id = UUID().uuidString
    let file = "\(id).txt"
    try t.data(using: .utf8)!.write(to: dir.appendingPathComponent(file))
    return try writeManifest(Item(id: id, kind: "text", name: "Leirat.txt", file: file, date: now.timeIntervalSince1970), dir)
  }

  private static func writeManifest(_ item: Item, _ dir: URL) throws -> Item {
    try JSONEncoder().encode(item).write(to: dir.appendingPathComponent("\(item.id).json"), options: .atomic)
    return item
  }

  static func list(root: URL? = nil) -> [Item] {
    guard let dir = directory(root: root), let names = try? FileManager.default.contentsOfDirectory(atPath: dir.path) else { return [] }
    return names.filter { $0.hasSuffix(".json") }
      .compactMap { try? JSONDecoder().decode(Item.self, from: Data(contentsOf: dir.appendingPathComponent($0))) }
      .filter { FileManager.default.fileExists(atPath: dir.appendingPathComponent($0.file).path) }
      .sorted { $0.date < $1.date }
  }

  /// Moves the item's file to `dest` (app sandbox) and removes it from the inbox. Returns the new file URL.
  static func take(_ id: String, to dest: URL, root: URL? = nil) throws -> URL? {
    guard let dir = directory(root: root), let item = list(root: root).first(where: { $0.id == id }) else { return nil }
    try FileManager.default.createDirectory(at: dest, withIntermediateDirectories: true)
    let target = dest.appendingPathComponent(item.file)
    try? FileManager.default.removeItem(at: target)
    try FileManager.default.moveItem(at: dir.appendingPathComponent(item.file), to: target)
    try? FileManager.default.removeItem(at: dir.appendingPathComponent("\(id).json"))
    return target
  }
}
