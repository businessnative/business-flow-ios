import UIKit
import UniformTypeIdentifiers

/// "Megosztás → Business Flow": saves shared call recordings (audio) or Notes transcripts (text) into the App Group inbox.
/// Processing (transcription, speakers, summary) happens in the app with the user's own keys — never in the extension.
final class ShareViewController: UIViewController {
  private let label = UILabel()

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = UIColor(red: 0.04, green: 0.04, blue: 0.045, alpha: 1)
    label.textColor = .white
    label.numberOfLines = 0
    label.textAlignment = .center
    label.font = .preferredFont(forTextStyle: .headline)
    label.adjustsFontForContentSizeCategory = true
    label.text = "Mentés a Hívás-jegyzetekbe…"
    label.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(label)
    NSLayoutConstraint.activate([
      label.centerYAnchor.constraint(equalTo: view.centerYAnchor),
      label.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),
      label.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24),
    ])
    Task { await handle() }
  }

  private func handle() async {
    let providers = (extensionContext?.inputItems as? [NSExtensionItem] ?? []).flatMap { $0.attachments ?? [] }
    var saved = 0
    for p in providers {
      if let url = await loadFile(p, type: .audio) ?? await loadFile(p, type: .audiovisualContent) {
        if (try? CallInbox.addFile(url, name: p.suggestedName.map { $0 + "." + url.pathExtension } ?? url.lastPathComponent)) != nil { saved += 1 }
      } else if let url = await loadFile(p, type: .plainText) ?? await loadFile(p, type: .rtf) {
        if let t = try? String(contentsOf: url, encoding: .utf8), (try? CallInbox.addText(t)) != nil { saved += 1 }
      } else if p.hasItemConformingToTypeIdentifier(UTType.text.identifier), let t = try? await p.loadItem(forTypeIdentifier: UTType.text.identifier) as? String {
        if (try? CallInbox.addText(t)) != nil { saved += 1 }
      }
    }
    await MainActor.run {
      label.text = saved > 0
        ? "Mentve. Nyisd meg a Business Flow-t: a Hívás-jegyzetek között feldolgozza (átírás, beszélők, összefoglaló)."
        : "Ezt nem tudom importálni. Hangfelvételt (m4a) vagy szöveges leiratot ossz meg."
    }
    if saved > 0 { openApp() }
    try? await Task.sleep(nanoseconds: saved > 0 ? 1_400_000_000 : 2_200_000_000)
    extensionContext?.completeRequest(returningItems: nil)
  }

  /// Copies the provided file into our temp dir (the provider's URL is only valid inside the callback).
  private func loadFile(_ p: NSItemProvider, type: UTType) async -> URL? {
    guard p.hasItemConformingToTypeIdentifier(type.identifier) else { return nil }
    return await withCheckedContinuation { cont in
      _ = p.loadFileRepresentation(forTypeIdentifier: type.identifier) { url, _ in
        guard let url else { return cont.resume(returning: nil) }
        let tmp = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + "-" + url.lastPathComponent)
        cont.resume(returning: (try? FileManager.default.copyItem(at: url, to: tmp)) != nil ? tmp : nil)
      }
    }
  }

  /// Best effort: extensions have no official openURL; walk the responder chain (same pattern as the keyboard).
  private func openApp() {
    guard let url = URL(string: "businessflow://calls?inbox=1") else { return }
    var r: UIResponder? = self
    let sel = NSSelectorFromString("openURL:options:completionHandler:")
    while let x = r {
      if let app = x as? UIApplication, app.responds(to: sel) { app.open(url, options: [:], completionHandler: nil); return }
      r = x.next
    }
  }
}
