import SwiftUI
import WidgetKit

/// Home / Lock Screen widget: one tap opens Business Flow and starts a dictation (businessflow://dictate?app=1).
/// Own implementation, BN design. Note: untestable on device until signed with an Apple Developer account.
struct FlowEntry: TimelineEntry { let date: Date }

struct FlowProvider: TimelineProvider {
  func placeholder(in context: Context) -> FlowEntry { FlowEntry(date: .now) }
  func getSnapshot(in context: Context, completion: @escaping (FlowEntry) -> Void) { completion(FlowEntry(date: .now)) }
  func getTimeline(in context: Context, completion: @escaping (Timeline<FlowEntry>) -> Void) {
    completion(Timeline(entries: [FlowEntry(date: .now)], policy: .never))
  }
}

private let bnBase = Color(red: 10 / 255, green: 10 / 255, blue: 11 / 255)
private let bnText = Color(red: 246 / 255, green: 243 / 255, blue: 236 / 255)
private let bnAccent = Color(red: 192 / 255, green: 192 / 255, blue: 231 / 255)

struct FlowWidgetView: View {
  @Environment(\.widgetFamily) var family
  var body: some View {
    Group {
      switch family {
      case .accessoryCircular:
        ZStack { AccessoryWidgetBackground(); Image(systemName: "mic.fill").font(.title3).accessibilityLabel("Diktálás") }
      case .accessoryRectangular:
        HStack(spacing: 6) { Image(systemName: "mic.fill").accessibilityHidden(true); Text("Diktálás").font(.headline) }
      default:
        VStack(alignment: .leading, spacing: 8) {
          Text("BUSINESS FLOW").font(.system(size: 10, weight: .medium, design: .monospaced)).foregroundStyle(bnText.opacity(0.48))
          Spacer()
          ZStack {
            RoundedRectangle(cornerRadius: 8).fill(bnAccent)
            Image(systemName: "mic.fill").font(.system(size: 22, weight: .semibold)).foregroundStyle(bnBase).accessibilityHidden(true)
          }.frame(width: 48, height: 48)
          Text("Diktálás").font(.system(size: 15, weight: .semibold)).foregroundStyle(bnText)
        }.frame(maxWidth: .infinity, alignment: .leading)
      }
    }
    .widgetURL(URL(string: "businessflow://dictate?app=1"))
    .containerBackground(for: .widget) { bnBase }
  }
}

@main
struct BusinessFlowWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "BusinessFlowDictate", provider: FlowProvider()) { _ in FlowWidgetView() }
      .configurationDisplayName("Diktálás")
      .description("Egy koppintás, és indul a diktálás.")
      .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryRectangular])
  }
}
