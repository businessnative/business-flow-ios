import Foundation
import SwiftUI

/// businessnative-dark tokens (docs/tokens.json in bn-flow-mac) for the keyboard extension.
enum BN {
  static let base = Color(hex: 0x0A0A0B)
  static let lift = Color(hex: 0x121212)
  static let depth = Color(hex: 0x212122)
  static let text = Color(hex: 0xF6F3EC)
  static let textMedium = text.opacity(0.64)
  static let textSubtle = text.opacity(0.48)
  static let border = text.opacity(0.16)
  static let fill8 = text.opacity(0.08)
  static let accent = Color(hex: 0xC0C0E7)
  static let accentTools = Color(hex: 0xB9D5ED)
  static let error = Color(hex: 0xC94040)
  static let success = Color(hex: 0x2AD87F)
  static let radius: CGFloat = 8
  static let radiusLarge: CGFloat = 16

  static func font(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
    .system(size: size, weight: weight)
  }
  static func label(_ size: CGFloat = 10) -> Font {
    .system(size: size, weight: .regular, design: .monospaced)
  }
}

extension Color {
  init(hex: UInt32) {
    self.init(.sRGB, red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255, opacity: 1)
  }
}

/// Bezier from tokens: cubic-bezier(0.22,1,0.36,1).
extension Animation {
  static func bn(_ ms: Double = 350) -> Animation { .timingCurve(0.22, 1, 0.36, 1, duration: ms / 1000) }
}
