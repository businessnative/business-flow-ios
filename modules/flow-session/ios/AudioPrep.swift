// Copied from business-flow-mac Sources/BNFlowCore (AudioPrep.swift, WAV.swift) — same VAD / gain / trim on iOS.
import Foundation

public struct AudioStats: Sendable, Equatable {
    public var seconds: Double
    public var peak: Float
    /// Becsült beszéd-hossz (energia alapú hangaktivitás-felismerés).
    public var speechSeconds: Double
    public var noiseFloor: Float
    /// Az első és utolsó beszédkeret (mintában), ha volt beszéd.
    public var speechRange: Range<Int>?
}

/// Hang-előkészítés feltöltés előtt: hangaktivitás-felismerés, csend levágása, halk felvétel erősítése,
/// valamint az átirat „hallucinációinak” kiszűrése (csendre a modellek gyakran „Köszönöm a figyelmet”-et írnak).
public enum AudioPrep {
    static let frameSeconds = 0.02

    public static func analyze(_ samples: [Float], sampleRate: Int = 16_000) -> AudioStats {
        let n = samples.count
        let seconds = Double(n) / Double(max(1, sampleRate))
        let peak = samples.reduce(Float(0)) { max($0, abs($1)) }
        let frame = max(1, Int(Double(sampleRate) * frameSeconds))
        var rms: [Float] = []
        rms.reserveCapacity(n / frame + 1)
        var i = 0
        while i < n {
            let e = min(n, i + frame)
            var acc: Float = 0
            for j in i..<e { acc += samples[j] * samples[j] }
            rms.append((acc / Float(e - i)).squareRoot())
            i = e
        }
        guard !rms.isEmpty else { return AudioStats(seconds: 0, peak: 0, speechSeconds: 0, noiseFloor: 0, speechRange: nil) }
        let sorted = rms.sorted()
        let floor = sorted[min(sorted.count - 1, sorted.count / 10)]
        let loud = sorted[min(sorted.count - 1, sorted.count * 95 / 100)]
        // Küszöb: a zajszint fölött, de halk beszédnél is a beszéd alatt.
        let threshold = max(Float(0.0012), min(max(floor * 2.5, loud * 0.12), loud * 0.5))
        // Egyenletes háttérzaj (ventilátor, zúgás): nincs dinamika → nincs beszéd.
        let stationary = loud < floor * 1.8 && loud < 0.05
        var speechFrames = 0, first = -1, last = -1
        for (k, r) in rms.enumerated() where r > threshold && !stationary {
            speechFrames += 1
            if first < 0 { first = k }
            last = k
        }
        let range: Range<Int>? = first >= 0 ? (first * frame)..<min(n, (last + 1) * frame) : nil
        return AudioStats(seconds: seconds, peak: peak, speechSeconds: Double(speechFrames) * frameSeconds, noiseFloor: floor, speechRange: range)
    }

    /// Egypólusú felüláteresztő szűrő (~80 Hz): a zúgás és az egyenáramú eltolás eltávolítása. Suttogásnál a beszéd
    /// energiája a magas tartományban van, a mély zaj viszont elnyomná a normalizálást.
    public static func highPass(_ x: [Float], sampleRate: Int = 16_000, cutoff: Double = 80) -> [Float] {
        guard x.count > 1 else { return x }
        let rc = 1.0 / (2 * Double.pi * cutoff), dt = 1.0 / Double(sampleRate)
        let a = Float(rc / (rc + dt))
        var out = [Float](repeating: 0, count: x.count)
        var prevX = x[0], prevY: Float = 0
        for i in 0..<x.count {
            let y = a * (prevY + x[i] - prevX)
            out[i] = y; prevY = y; prevX = x[i]
        }
        return out
    }

    /// Suttogó/halk felvétel: a beszéd csúcsa alacsony, de a zajszinthez képest jól kiemelkedik.
    public static func isWhisper(_ st: AudioStats) -> Bool {
        st.speechSeconds >= 0.3 && st.peak < 0.08 && st.peak > max(0.002, st.noiseFloor * 6)
    }

    /// A normalizálás erősítése: halk felvételnél akár 40×, de a zajt legfeljebb kb. 0,02-ig emeljük (különben sziszegne).
    public static func gain(peak: Float, noiseFloor: Float) -> Float {
        guard peak > 0.0005, peak < 0.25 else { return 1 }
        var g = min(Float(40), 0.7 / peak)
        if noiseFloor > 0 { g = min(g, max(Float(4), 0.02 / noiseFloor)) }
        return max(1, g)
    }

    /// Csend levágása (margóval), zúgásszűrés és halk/suttogó felvétel normalizálása. A minták 16 kHz mono float-ok.
    public static func prepare(_ samples: [Float], sampleRate: Int = 16_000) -> [Float] {
        guard !samples.isEmpty else { return samples }
        let filtered = highPass(samples, sampleRate: sampleRate)
        let st = analyze(filtered, sampleRate: sampleRate)
        var out = filtered
        if let r = st.speechRange {
            let lead = Int(0.3 * Double(sampleRate)), trail = Int(0.4 * Double(sampleRate))
            let a = max(0, r.lowerBound - lead), b = min(filtered.count, r.upperBound + trail)
            if b - a >= Int(0.3 * Double(sampleRate)) { out = Array(filtered[a..<b]) }
        }
        let peak = out.reduce(Float(0)) { max($0, abs($1)) }
        let g = gain(peak: peak, noiseFloor: st.noiseFloor)
        if g > 1 {
            // Erős erősítésnél a beszédszünetek zaját halkítjuk (lágy kapu 20 ms-os keretekben), hogy ne sziszegjen.
            let frame = max(1, Int(Double(sampleRate) * frameSeconds))
            let gateLevel = max(st.noiseFloor * 3, peak * 0.06)
            var i = 0
            while i < out.count {
                let e = min(out.count, i + frame)
                var acc: Float = 0
                for j in i..<e { acc += out[j] * out[j] }
                let rms = (acc / Float(e - i)).squareRoot()
                let fg: Float = (g >= 6 && rms < gateLevel) ? g * 0.35 : g
                for j in i..<e { out[j] = max(-1, min(1, out[j] * fg)) }
                i = e
            }
        }
        return out
    }

    static let hallucinations = ["köszönöm a figyelmet", "köszönöm, hogy megnézted", "köszönöm szépen a figyelmet", "feliratok", "feliratozta",
                                 "a feliratot", "amara.org", "thanks for watching", "thank you for watching", "subtitles by", "subscribe",
                                 "iratkozz fel", "like-old", "www.", "transcribed by", "please subscribe"]

    /// Az átirat utószűrése: ismert csend-hallucinációk eltávolítása.
    public static func cleanTranscript(_ text: String, peak: Float, speechSeconds: Double? = nil) -> String {
        var t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let lower = t.lowercased()
        // Teljes egészében hallucináció (és nem volt érdemi beszéd) → üres.
        let bare = lower.trimmingCharacters(in: CharacterSet.punctuationCharacters.union(.whitespaces))
        for h in hallucinations where bare.hasPrefix(h) || bare.hasSuffix(h) {
            if let sp = speechSeconds, sp > 2.5, !(bare == h) {
                // Hosszabb beszéd végén: csak a hallucinált záró mondatot vágjuk le.
                if let r = t.range(of: h, options: [.caseInsensitive, .backwards]), lower.hasSuffix(h) || lower.hasSuffix(h + ".") || lower.hasSuffix(h + "!") {
                    t = String(t[..<r.lowerBound]).trimmingCharacters(in: CharacterSet.whitespaces.union(CharacterSet(charactersIn: ",")))
                }
                continue
            }
            if bare.count <= h.count + 30 { return "" }
        }
        if let sp = speechSeconds, sp < 0.5, ["köszönöm", "köszi", "thank you", "thanks", "you", "bye", "szia"].contains(bare) { return "" }
        return t
    }

    /// Túl rövid vagy néma felvétel: el sem küldjük.
    public static func isSilent(seconds: Double, peak: Float) -> Bool {
        seconds < 0.35 || peak < 0.003
    }

    public static func isSilent(_ st: AudioStats) -> Bool {
        // Suttogás: a csúcs a régi 0,003-as küszöb körül is lehet, de a zajszinthez képest egyértelmű beszéd.
        if st.seconds >= 0.35, isWhisper(st) { return false }
        return isSilent(seconds: st.seconds, peak: st.peak) || (st.speechSeconds < 0.15 && st.peak < 0.02)
    }
}



public enum WAV {
    /// 16 bites PCM mono WAV a megadott mintavételezéssel.
    public static func encode(samples: [Int16], sampleRate: Int = 16_000) -> Data {
        var d = Data()
        let dataBytes = samples.count * 2
        func u32(_ v: UInt32) { var x = v.littleEndian; withUnsafeBytes(of: &x) { d.append(contentsOf: $0) } }
        func u16(_ v: UInt16) { var x = v.littleEndian; withUnsafeBytes(of: &x) { d.append(contentsOf: $0) } }
        d.append(contentsOf: Array("RIFF".utf8)); u32(UInt32(36 + dataBytes)); d.append(contentsOf: Array("WAVE".utf8))
        d.append(contentsOf: Array("fmt ".utf8)); u32(16); u16(1); u16(1); u32(UInt32(sampleRate)); u32(UInt32(sampleRate * 2)); u16(2); u16(16)
        d.append(contentsOf: Array("data".utf8)); u32(UInt32(dataBytes))
        // One buffer, not one Data.append per sample. A 60 s clip is ~960_000 Int16s; appending two bytes
        // at a time sits on the stop → upload path (this function is called before the transcript request).
        if dataBytes > 0 {
            var pcm = Data(count: dataBytes)
            pcm.withUnsafeMutableBytes { raw in
                guard let base = raw.baseAddress else { return }
                samples.withUnsafeBufferPointer { src in
                    guard let sp = src.baseAddress else { return }
                    let dst = base.assumingMemoryBound(to: Int16.self)
                    if Int16(1).littleEndian == 1 {
                        dst.update(from: sp, count: src.count)
                    } else {
                        for i in 0..<src.count { dst[i] = src[i].littleEndian }
                    }
                }
            }
            d.append(pcm)
        }
        return d
    }

    public static func floatToInt16(_ f: [Float]) -> [Int16] {
        f.map { Int16(max(-1, min(1, $0)) * 32767) }
    }

    /// RMS 0…1 tartományban, a hullámformához.
    public static func level(_ f: UnsafeBufferPointer<Float>) -> Float {
        guard !f.isEmpty else { return 0 }
        var sum: Float = 0
        for v in f { sum += v * v }
        let rms = sqrt(sum / Float(f.count))
        // dB-szerű görbe: −50 dB → 0, −10 dB → 1
        let db = 20 * log10(max(rms, 1e-6))
        return max(0, min(1, (db + 50) / 40))
    }
}

