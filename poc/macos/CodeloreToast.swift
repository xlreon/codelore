import AppKit
import Foundation

/// Non-activating floating toast with ×. Does not steal focus.
/// A11y: WCAG-ish contrast (light text on near-opaque dark), tier as text (not color-only),
/// VoiceOver labels on card + dismiss control.

final class ToastController: NSObject {
  private var window: NSPanel!
  private var progressTimer: Timer?
  private var progressLayer: CALayer!
  private var timeout: TimeInterval = 12
  private var remaining: TimeInterval = 12
  private var paused = false
  private var lastTick: Date?
  private var width: CGFloat = 360
  private var accent = NSColor.systemTeal

  func show(title: String, message: String, subtitle: String?, timeout: TimeInterval, tier: String) {
    self.timeout = timeout
    self.remaining = timeout

    let width: CGFloat = 360
    self.width = width
    let padding: CGFloat = 16
    let hasSub = !(subtitle ?? "").isEmpty
    let tierKey = tier.lowercased()
    let tierWord = Self.tierDisplayName(tierKey)

    // High-contrast palette (fixed dark surface — readable regardless of system light/dark)
    // Body ≈ white on ~#121212 → contrast ≫ 7:1
    let bgColor = NSColor(srgbRed: 0.07, green: 0.07, blue: 0.08, alpha: 0.98)
    let bodyColor = NSColor.white
    let titleColor = NSColor(srgbRed: 0.95, green: 0.95, blue: 0.96, alpha: 1) // ~#F2F2F5
    let subColor = NSColor(srgbRed: 0.82, green: 0.82, blue: 0.84, alpha: 1) // ~#D1D1D6, ≥4.5:1 on bg
    let borderColor = NSColor(srgbRed: 1, green: 1, blue: 1, alpha: 0.22)

    // Tier accent — used for edge/badge, but label always has text
    let (accentColor, badgeFg, badgeBg) = Self.tierColors(tierKey)
    accent = accentColor

    let msgFont = NSFont.systemFont(ofSize: 15, weight: .medium)
    let msgWidth = width - padding * 2 - 40
    let msgHeight = measureHeight(message, font: msgFont, width: msgWidth, maxLines: 2)
    let titleH: CGFloat = 20
    let subH: CGFloat = hasSub ? 18 : 0
    let gap: CGFloat = 6
    let progressH: CGFloat = 3
    let height = padding + titleH + gap + msgHeight + (hasSub ? gap + subH : 0) + padding + progressH
    let clampedHeight = max(96, min(height, 148))

    let panel = NSPanel(
      contentRect: NSRect(x: 0, y: 0, width: width, height: clampedHeight),
      styleMask: [.borderless, .nonactivatingPanel],
      backing: .buffered,
      defer: false
    )
    panel.isFloatingPanel = true
    panel.level = .floating
    panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
    panel.isOpaque = false
    panel.backgroundColor = .clear
    panel.hasShadow = true
    panel.hidesOnDeactivate = false
    panel.becomesKeyOnlyIfNeeded = true
    panel.isMovableByWindowBackground = true
    panel.worksWhenModal = true
    panel.alphaValue = 0
    // VoiceOver: announce as a notification-like status
    panel.setAccessibilityRole(.window)
    panel.setAccessibilityLabel("CodeLore tip")
    panel.setAccessibilityRoleDescription("tip notification")

    let root = ClickView(frame: NSRect(x: 0, y: 0, width: width, height: clampedHeight))
    root.wantsLayer = true
    root.onClick = { [weak self] in self?.closeClicked() }
    root.setAccessibilityElement(true)
    root.setAccessibilityRole(.group)
    let a11yBits = [
      "CodeLore tip",
      tierWord,
      title,
      message,
      subtitle ?? "",
      "Press dismiss to close",
    ].filter { !$0.isEmpty }
    root.setAccessibilityLabel(a11yBits.joined(separator: ". "))

    let bg = CALayer()
    bg.frame = root.bounds
    bg.cornerRadius = 12
    bg.backgroundColor = bgColor.cgColor
    bg.borderWidth = 1
    bg.borderColor = borderColor.cgColor
    bg.shadowColor = NSColor.black.cgColor
    bg.shadowOpacity = 0.4
    bg.shadowRadius = 12
    bg.shadowOffset = CGSize(width: 0, height: -3)
    root.layer = bg

    // Left edge (color cue) + always-visible text tier badge (not color-only)
    let bar = NSView(frame: NSRect(x: 0, y: 0, width: 4, height: clampedHeight))
    bar.wantsLayer = true
    bar.layer?.backgroundColor = accent.cgColor
    bar.layer?.cornerRadius = 2
    bar.layer?.maskedCorners = [.layerMinXMinYCorner, .layerMinXMaxYCorner]
    bar.setAccessibilityElement(false)
    root.addSubview(bar)

    let badge = tierBadge(
      word: tierWord,
      fg: badgeFg,
      bg: badgeBg,
      origin: NSPoint(x: padding + 4, y: clampedHeight - padding - 18 - progressH)
    )
    root.addSubview(badge)

    let titleX = badge.frame.maxX + 8
    let titleLabel = makeLabel(
      title,
      font: NSFont.systemFont(ofSize: 13, weight: .semibold),
      color: titleColor,
      frame: NSRect(
        x: titleX,
        y: clampedHeight - padding - titleH - progressH,
        width: max(40, width - titleX - 40),
        height: titleH
      )
    )
    titleLabel.setAccessibilityLabel("Project: \(title)")
    root.addSubview(titleLabel)

    let msgY = padding + progressH + (hasSub ? subH + gap : 0)
    let msgLabel = makeLabel(
      message,
      font: msgFont,
      color: bodyColor,
      frame: NSRect(x: padding + 4, y: msgY, width: msgWidth, height: msgHeight),
      maxLines: 2
    )
    msgLabel.setAccessibilityLabel("Tip: \(message)")
    root.addSubview(msgLabel)

    if let sub = subtitle, !sub.isEmpty {
      let subLabel = makeLabel(
        sub,
        font: NSFont.systemFont(ofSize: 12, weight: .regular),
        color: subColor,
        frame: NSRect(x: padding + 4, y: padding + progressH, width: msgWidth, height: subH)
      )
      subLabel.setAccessibilityLabel(sub)
      root.addSubview(subLabel)
    }

    // × close — higher contrast
    let closeSize: CGFloat = 28
    let close = NSButton(
      frame: NSRect(
        x: width - padding - closeSize + 2,
        y: clampedHeight - padding - closeSize - progressH + 4,
        width: closeSize,
        height: closeSize
      )
    )
    close.title = "×"
    close.font = NSFont.systemFont(ofSize: 18, weight: .semibold)
    close.isBordered = false
    close.wantsLayer = true
    close.layer?.cornerRadius = closeSize / 2
    close.layer?.backgroundColor = NSColor(srgbRed: 1, green: 1, blue: 1, alpha: 0.14).cgColor
    close.contentTintColor = NSColor.white
    close.target = self
    close.action = #selector(closeClicked)
    close.focusRingType = .exterior
    close.toolTip = "Dismiss tip"
    close.setAccessibilityLabel("Dismiss tip")
    close.setAccessibilityRole(.button)
    root.addSubview(close)

    // Progress track + fill (color is secondary; motion encodes time)
    let track = CALayer()
    track.frame = CGRect(x: 4, y: 0, width: width - 4, height: progressH)
    track.backgroundColor = NSColor(srgbRed: 1, green: 1, blue: 1, alpha: 0.12).cgColor
    track.cornerRadius = 1.5
    root.layer?.addSublayer(track)

    let progress = CALayer()
    progress.frame = CGRect(x: 4, y: 0, width: width - 4, height: progressH)
    progress.backgroundColor = accent.cgColor
    progress.cornerRadius = 1.5
    root.layer?.addSublayer(progress)
    self.progressLayer = progress

    panel.contentView = root

    root.onHover = { [weak self] inside in
      guard let self else { return }
      self.paused = inside
      if !inside { self.lastTick = Date() }
    }
    let tracking = NSTrackingArea(
      rect: root.bounds,
      options: [.activeAlways, .mouseEnteredAndExited, .inVisibleRect],
      owner: root,
      userInfo: nil
    )
    root.addTrackingArea(tracking)

    let screen = screenForFrontmost() ?? NSScreen.main
    if let screen {
      let visible = screen.visibleFrame
      let x = visible.maxX - width - 16
      let y = visible.maxY - clampedHeight - 12
      panel.setFrameOrigin(NSPoint(x: x, y: y))
    }

    panel.orderFrontRegardless()
    self.window = panel

    NSAnimationContext.runAnimationGroup { ctx in
      ctx.duration = 0.18
      panel.animator().alphaValue = 1
    }

    // Optional: post accessibility announcement for VoiceOver users
    NSAccessibility.post(
      element: root,
      notification: .announcementRequested,
      userInfo: [
        .announcement: "CodeLore tip. \(tierWord). \(message)" as NSString,
        .priority: NSAccessibilityPriorityLevel.medium.rawValue as NSNumber,
      ]
    )

    startTimer()
  }

  private static func tierDisplayName(_ tier: String) -> String {
    switch tier {
    case "critical": return "Critical"
    case "gotcha": return "Gotcha"
    case "changelog": return "Change"
    case "onboarding": return "Intro"
    case "convention": return "Convention"
    case "stack", "structure": return "Stack"
    default: return "Tip"
    }
  }

  /// Accent + high-contrast badge pair (text never relies on color alone).
  private static func tierColors(_ tier: String) -> (NSColor, NSColor, NSColor) {
    switch tier {
    case "critical":
      // White on deep red — strong contrast
      return (
        NSColor(srgbRed: 0.95, green: 0.28, blue: 0.30, alpha: 1),
        NSColor.white,
        NSColor(srgbRed: 0.55, green: 0.10, blue: 0.12, alpha: 1)
      )
    case "gotcha":
      // Near-black on solid amber
      return (
        NSColor(srgbRed: 0.95, green: 0.65, blue: 0.15, alpha: 1),
        NSColor(srgbRed: 0.12, green: 0.10, blue: 0.05, alpha: 1),
        NSColor(srgbRed: 0.95, green: 0.72, blue: 0.20, alpha: 1)
      )
    default:
      // White on deep teal
      return (
        NSColor(srgbRed: 0.25, green: 0.78, blue: 0.88, alpha: 1),
        NSColor.white,
        NSColor(srgbRed: 0.08, green: 0.35, blue: 0.42, alpha: 1)
      )
    }
  }

  private func tierBadge(word: String, fg: NSColor, bg: NSColor, origin: NSPoint) -> NSView {
    let font = NSFont.systemFont(ofSize: 11, weight: .bold)
    let textW = (word as NSString).size(withAttributes: [.font: font]).width
    let w = ceil(textW) + 14
    let h: CGFloat = 20
    let pill = NSView(frame: NSRect(x: origin.x, y: origin.y, width: w, height: h))
    pill.wantsLayer = true
    pill.layer?.cornerRadius = 10
    pill.layer?.backgroundColor = bg.cgColor
    // Visible border so badge isn't only fill color
    pill.layer?.borderWidth = 1
    pill.layer?.borderColor = fg.withAlphaComponent(0.35).cgColor
    let label = makeLabel(
      word,
      font: font,
      color: fg,
      frame: NSRect(x: 0, y: 1, width: w, height: h - 2),
      align: .center
    )
    label.setAccessibilityLabel("Severity: \(word)")
    pill.addSubview(label)
    pill.setAccessibilityElement(true)
    pill.setAccessibilityRole(.staticText)
    pill.setAccessibilityLabel("Severity \(word)")
    return pill
  }

  private func screenForFrontmost() -> NSScreen? {
    if let app = NSWorkspace.shared.frontmostApplication {
      let pid = app.processIdentifier
      let opts = CGWindowListOption(arrayLiteral: .optionOnScreenOnly, .excludeDesktopElements)
      if let info = CGWindowListCopyWindowInfo(opts, kCGNullWindowID) as? [[String: Any]] {
        for w in info {
          guard let owner = w[kCGWindowOwnerPID as String] as? pid_t, owner == pid else { continue }
          guard let bounds = w[kCGWindowBounds as String] as? [String: CGFloat] else { continue }
          let rect = CGRect(
            x: bounds["X"] ?? 0,
            y: bounds["Y"] ?? 0,
            width: bounds["Width"] ?? 0,
            height: bounds["Height"] ?? 0
          )
          for s in NSScreen.screens where s.frame.intersects(rect) {
            return s
          }
        }
      }
    }
    return NSScreen.main
  }

  private func startTimer() {
    lastTick = Date()
    progressTimer?.invalidate()
    progressTimer = Timer.scheduledTimer(withTimeInterval: 1.0 / 30.0, repeats: true) {
      [weak self] _ in
      self?.tick()
    }
    if let t = progressTimer {
      RunLoop.main.add(t, forMode: .common)
    }
  }

  private func tick() {
    guard !paused else {
      lastTick = Date()
      return
    }
    let now = Date()
    let dt = now.timeIntervalSince(lastTick ?? now)
    lastTick = now
    remaining -= dt
    let p = max(0, remaining / timeout)
    let full = width - 4
    progressLayer?.frame = CGRect(x: 4, y: 0, width: full * CGFloat(p), height: 3)
    if remaining <= 0 {
      dismiss()
    }
  }

  private func measureHeight(_ text: String, font: NSFont, width: CGFloat, maxLines: Int)
    -> CGFloat
  {
    let attr: [NSAttributedString.Key: Any] = [.font: font]
    let rect = (text as NSString).boundingRect(
      with: NSSize(width: width, height: 10_000),
      options: [.usesLineFragmentOrigin, .usesFontLeading],
      attributes: attr
    )
    let lineH = font.ascender - font.descender + font.leading
    let maxH = lineH * CGFloat(maxLines) + 6
    return min(max(ceil(rect.height) + 2, 24), maxH)
  }

  private func makeLabel(
    _ text: String,
    font: NSFont,
    color: NSColor,
    frame: NSRect,
    align: NSTextAlignment = .left,
    maxLines: Int = 1
  ) -> NSTextField {
    let l = NSTextField(frame: frame)
    l.stringValue = text
    l.isEditable = false
    l.isBordered = false
    l.isBezeled = false
    l.drawsBackground = false
    l.font = font
    l.textColor = color
    l.alignment = align
    l.lineBreakMode = maxLines > 1 ? .byWordWrapping : .byTruncatingTail
    l.maximumNumberOfLines = maxLines
    l.cell?.wraps = maxLines > 1
    l.cell?.isScrollable = false
    l.setAccessibilityElement(true)
    l.setAccessibilityRole(.staticText)
    return l
  }

  @objc private func closeClicked() {
    progressTimer?.invalidate()
    dismiss()
  }

  private func dismiss() {
    progressTimer?.invalidate()
    progressTimer = nil
    NSAnimationContext.runAnimationGroup({ ctx in
      ctx.duration = 0.16
      window?.animator().alphaValue = 0
    }, completionHandler: {
      self.window?.orderOut(nil)
      self.window = nil
      NSApp.terminate(nil)
    })
  }
}

final class ClickView: NSView {
  var onClick: (() -> Void)?
  var onHover: ((Bool) -> Void)?

  override func mouseDown(with event: NSEvent) {
    let p = convert(event.locationInWindow, from: nil)
    for sub in subviews where sub is NSButton {
      if sub.frame.contains(p) { return }
    }
    onClick?()
  }

  override func mouseEntered(with event: NSEvent) {
    onHover?(true)
  }

  override func mouseExited(with event: NSEvent) {
    onHover?(false)
  }
}

@main
struct CodeloreToastMain {
  static func main() {
    let args = Array(CommandLine.arguments.dropFirst())
    func flag(_ name: String) -> String? {
      guard let i = args.firstIndex(of: name), i + 1 < args.count else { return nil }
      return args[i + 1]
    }

    let title = flag("--title") ?? "CodeLore"
    let message = flag("--message") ?? ""
    let subtitle = flag("--subtitle")
    let tier = flag("--tier") ?? "tip"
    let defaultTimeout: String = {
      switch tier.lowercased() {
      case "critical": return "16"
      case "gotcha": return "12"
      default: return "8"
      }
    }()
    let timeout = TimeInterval(flag("--timeout") ?? defaultTimeout) ?? 12

    guard !message.isEmpty else {
      fputs(
        "usage: CodeloreToast --title T --message M [--subtitle S] [--timeout 12] [--tier critical]\n",
        stderr
      )
      exit(2)
    }

    let cleanTitle =
      title
      .replacingOccurrences(of: " · CRITICAL", with: "", options: .caseInsensitive)
      .replacingOccurrences(of: " · GOTCHA", with: "", options: .caseInsensitive)
      .replacingOccurrences(of: "[CRITICAL]", with: "", options: .caseInsensitive)
      .trimmingCharacters(in: .whitespaces)

    let app = NSApplication.shared
    app.setActivationPolicy(.accessory)
    let controller = ToastController()
    controller.show(
      title: cleanTitle.isEmpty ? "Worth knowing" : cleanTitle,
      message: message,
      subtitle: subtitle,
      timeout: timeout,
      tier: tier
    )
    app.run()
  }
}
