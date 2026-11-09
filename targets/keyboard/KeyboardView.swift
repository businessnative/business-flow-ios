import UIKit
import Foundation
import Combine
import SwiftUI

struct KeyboardView: View {
  @ObservedObject var model: KeyboardModel

  var body: some View {
    VStack(spacing: 10) {
      topBar
      ZStack {
        if !model.hasFullAccess {
          fullAccessCard
        } else {
          FlowBar(model: model)
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      bottomRow
    }
    .padding(.horizontal, 8)
    .padding(.top, 8)
    .padding(.bottom, 6)
    .background(BN.base)
  }

  private var topBar: some View {
    HStack {
      Button(action: model.actions.cycleCategory) {
        HStack(spacing: 6) {
          Circle().fill(BN.accent).frame(width: 6, height: 6)
          Text(model.categoryLabel.uppercased()).font(BN.label(10)).tracking(0.75).foregroundStyle(BN.textMedium)
        }
        .padding(.horizontal, 10).frame(height: 26)
        .background(BN.fill8, in: RoundedRectangle(cornerRadius: BN.radius))
      }
      .accessibilityLabel("Stílus kategória: \(model.categoryLabel)")
      Spacer()
      Text(statusText).font(BN.label(10)).tracking(0.75).foregroundStyle(BN.textSubtle).lineLimit(1)
      Spacer()
      Button(action: model.actions.openApp) {
        Image(systemName: "square.grid.2x2").font(.system(size: 13)).foregroundStyle(BN.textMedium)
          .frame(width: 32, height: 26).background(BN.fill8, in: RoundedRectangle(cornerRadius: BN.radius))
      }
      .accessibilityLabel("Business Flow megnyitása")
    }
  }

  private var statusText: String {
    if !model.hasKey { return "NINCS API-KULCS" }
    switch model.phase {
    case "recording", "starting": return "FIGYELEK"
    case "processing": return "FELDOLGOZÁS"
    case "error": return "HIBA"
    default: return model.sessionAlive ? "FLOW BE" : "BUSINESS FLOW"
    }
  }

  private var fullAccessCard: some View {
    VStack(spacing: 8) {
      Text("Majdnem kész!").font(BN.font(17, .medium)).foregroundStyle(BN.text)
      Text("Kapcsold be a Teljes hozzáférést: Beállítások → Business Flow → Billentyűzetek → Teljes hozzáférés. Ez kell, hogy a billentyűzet szólhasson az appnak.")
        .font(BN.font(12)).foregroundStyle(BN.textMedium).multilineTextAlignment(.center).padding(.horizontal, 12)
      Button(action: model.actions.openSettings) {
        Text("Beállítások megnyitása").font(BN.font(14, .medium)).foregroundStyle(BN.base)
          .padding(.horizontal, 16).frame(height: 36).background(BN.text, in: RoundedRectangle(cornerRadius: BN.radius))
      }
    }
    .padding(12)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(BN.lift, in: RoundedRectangle(cornerRadius: BN.radiusLarge))
    .overlay(RoundedRectangle(cornerRadius: BN.radiusLarge).stroke(BN.border, lineWidth: 1))
  }

  private var bottomRow: some View {
    HStack(spacing: 6) {
      if model.showGlobe {
        KeyButton(systemImage: "globe", label: "Következő billentyűzet", action: model.actions.nextKeyboard).frame(width: 44)
      }
      KeyButton(text: "szóköz", label: "Szóköz", action: model.actions.space)
      RepeatKeyButton(systemImage: "delete.left", label: "Törlés", action: model.actions.backspace).frame(width: 52)
      KeyButton(systemImage: "return", label: "Új sor", action: model.actions.newline).frame(width: 52)
    }
    .frame(height: 42)
  }
}

/// The BN Flow bar, keyboard-sized: idle mic pill · recording waveform with ✕ / ✓ · processing ring · error.
struct FlowBar: View {
  @ObservedObject var model: KeyboardModel
  @State private var spin = false
  @State private var pressStart: Date?
  @State private var holding = false

  var body: some View {
    switch model.phase {
    case "recording", "starting": recording
    case "processing": processing
    case "error": error
    default: idle
    }
  }

  private var idle: some View {
    VStack(spacing: 8) {
      ZStack {
        RoundedRectangle(cornerRadius: BN.radiusLarge).fill(BN.lift)
        RoundedRectangle(cornerRadius: BN.radiusLarge).stroke(BN.border, lineWidth: 1)
        HStack(spacing: 10) {
          Image(systemName: "mic.fill").font(.system(size: 20, weight: .medium)).foregroundStyle(BN.text)
          Waveform(level: 0, color: BN.textSubtle)
        }
      }
      .frame(width: 168, height: 64)
      .contentShape(Rectangle())
      .gesture(pressGesture)
      .accessibilityLabel("Diktálás")
      .accessibilityAddTraits(.isButton)
      Text(model.sessionAlive ? "Koppints a diktáláshoz · tartsd nyomva: beszélj és engedd el" : "Koppints: a Business Flow elindítja a munkamenetet")
        .font(BN.font(11)).foregroundStyle(BN.textSubtle).multilineTextAlignment(.center)
    }
  }

  /// Tap = hands-free toggle; hold ≥ 0.35 s = push-to-talk (release stops).
  private var pressGesture: some Gesture {
    DragGesture(minimumDistance: 0)
      .onChanged { _ in
        if pressStart == nil {
          pressStart = Date()
          DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
            if pressStart != nil, !holding { holding = true; model.actions.micHoldBegan() }
          }
        }
      }
      .onEnded { _ in
        let wasHolding = holding
        pressStart = nil; holding = false
        if wasHolding { model.actions.micHoldEnded() } else { model.actions.mic() }
      }
  }

  private var recording: some View {
    HStack(spacing: 14) {
      CircleButton(systemImage: "xmark", filled: false, label: "Mégse", action: model.actions.cancel)
      ZStack {
        RoundedRectangle(cornerRadius: BN.radiusLarge).fill(BN.lift)
        RoundedRectangle(cornerRadius: BN.radiusLarge).stroke(BN.accent, lineWidth: 1)
        Waveform(level: model.phase == "starting" ? 0.05 : model.level, color: BN.accent).scaleEffect(1.6)
      }
      .frame(width: 150, height: 64)
      .contentShape(Rectangle())
      .gesture(pressGesture)
      CircleButton(systemImage: "checkmark", filled: true, label: "Kész, beillesztés", action: model.actions.confirm)
    }
  }

  private var processing: some View {
    Button(action: model.actions.cancel) {
      ZStack {
        RoundedRectangle(cornerRadius: BN.radiusLarge).fill(BN.lift)
        RoundedRectangle(cornerRadius: BN.radiusLarge)
          .stroke(AngularGradient(colors: [BN.accent, BN.text.opacity(0)], center: .center, angle: .degrees(spin ? 360 : 0)), lineWidth: 1.5)
        Text("FELDOLGOZÁS").font(BN.label(10)).tracking(0.75).foregroundStyle(BN.textMedium)
      }
      .frame(width: 168, height: 64)
    }
    .accessibilityLabel("Feldolgozás – koppints a megszakításhoz")
    .onAppear { withAnimation(.linear(duration: 1.6).repeatForever(autoreverses: false)) { spin = true } }
    .onDisappear { spin = false }
  }

  private var error: some View {
    VStack(spacing: 10) {
      HStack(spacing: 8) {
        Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(BN.error)
        Text(model.errorText ?? "Hiba történt.").font(BN.font(13)).foregroundStyle(BN.text).lineLimit(2)
      }
      .padding(.horizontal, 14).frame(minHeight: 44)
      .background(BN.lift, in: RoundedRectangle(cornerRadius: BN.radius))
      .overlay(RoundedRectangle(cornerRadius: BN.radius).stroke(BN.error, lineWidth: 1.5))
      HStack(spacing: 8) {
        SmallButton(text: "Bezár", primary: false, action: model.actions.dismissError)
        SmallButton(text: "Újra", primary: true, action: model.actions.retry)
      }
    }
  }
}

struct Waveform: View {
  var level: Double
  var color: Color
  private let weights: [Double] = [0.35, 0.6, 0.85, 1, 0.75, 0.9, 1, 0.7, 0.5, 0.3]

  var body: some View {
    HStack(spacing: 2) {
      ForEach(0..<10, id: \.self) { i in
        RoundedRectangle(cornerRadius: 1).fill(color)
          .frame(width: 2, height: max(3, CGFloat(18 * min(1, level * 1.3) * weights[i])))
      }
    }
    .frame(height: 18)
    .animation(.bn(120), value: level)
  }
}

struct CircleButton: View {
  var systemImage: String
  var filled: Bool
  var label: String
  var action: () -> Void
  var body: some View {
    Button(action: action) {
      Image(systemName: systemImage).font(.system(size: 16, weight: .semibold))
        .foregroundStyle(filled ? BN.base : BN.text)
        .frame(width: 48, height: 48)
        .background(filled ? BN.text : BN.fill8, in: Circle())
        .overlay(Circle().stroke(BN.border, lineWidth: filled ? 0 : 1))
    }
    .accessibilityLabel(label)
  }
}

struct SmallButton: View {
  var text: String
  var primary: Bool
  var action: () -> Void
  var body: some View {
    Button(action: action) {
      Text(text).font(BN.font(13, .medium)).foregroundStyle(primary ? BN.base : BN.text)
        .padding(.horizontal, 16).frame(height: 32)
        .background(primary ? BN.text : BN.fill8, in: RoundedRectangle(cornerRadius: BN.radius))
    }
  }
}

struct KeyButton: View {
  var systemImage: String? = nil
  var text: String? = nil
  var label: String
  var action: () -> Void
  var body: some View {
    Button(action: action) {
      Group {
        if let systemImage { Image(systemName: systemImage).font(.system(size: 16)) } else { Text(text ?? "").font(BN.font(14)) }
      }
      .foregroundStyle(BN.text)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(BN.depth, in: RoundedRectangle(cornerRadius: BN.radius))
    }
    .accessibilityLabel(label)
  }
}

/// Delete key with auto-repeat while held.
struct RepeatKeyButton: View {
  var systemImage: String
  var label: String
  var action: () -> Void
  @State private var timer: Timer?
  var body: some View {
    Image(systemName: systemImage).font(.system(size: 16)).foregroundStyle(BN.text)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(BN.depth, in: RoundedRectangle(cornerRadius: BN.radius))
      .contentShape(Rectangle())
      .gesture(DragGesture(minimumDistance: 0)
        .onChanged { _ in
          guard timer == nil else { return }
          action()
          var n = 0
          timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { _ in n += 1; if n > 4 { action() } }
        }
        .onEnded { _ in timer?.invalidate(); timer = nil })
      .accessibilityLabel(label)
      .accessibilityAddTraits(.isButton)
      .accessibilityAction { action() }
  }
}
