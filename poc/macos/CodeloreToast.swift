import AppKit
import Foundation

/// Non-activating floating toast with ×. Does not steal focus.
/// Council 2026-07-31: top-right, ~360px, quiet hierarchy, edge-only tier,
/// progress hairline, hover-pause, click-to-dismiss.

final class ToastController: NSObject {
  private var window: NSPanel!
  private var timeoutWork: DispatchWorkItem?
  private var progressTimer: Timer?
  private var progressLayer: CALayer!
  private var timeout: TimeInterval = 12
  private var remaining: TimeInterval = 12
  private var paused = false
  private var lastTick: Date?
  private var width: CGFloat = 360
  private var accent = NSColor(calibratedRed: 0.30, green: 0.78, blue: 0.90, alpha: 1)

  func show(title: String, message: String, subtitle: String?, timeout: TimeInterval, tier: String) {
    self.timeout = timeout
    self.remaining = timeout

    // Council: shrink card — peripheral tip, not a panel
    let width: CGFloat = 360
    self.width = width
    let padding: CGFloat = 16
    let hasSub = !(subtitle ?? "").isEmpty

    let msgFont = NSFont.systemFont(ofSize: 15, weight: .medium)
    let msgWidth = width - padding * 2 - 36
    let msgHeight = measureHeight(message, font: msgFont, width: msgWidth, maxLines: 2)
    let titleH: CGFloat = 18
    let subH: CGFloat = hasSub ? 18 : 0
    let gap: CGFloat = 6
    let progressH: CGFloat = 3
    let height = padding + titleH + gap + msgHeight + (hasSub ? gap + subH : 0) + padding + progressH
    let clampedHeight = max(90, min(height, 140))

    accent =
      tier.lowercased() == "critical"
      ? NSColor(calibratedRed: 0.90, green: 0.30, blue: 0.32, alpha: 1)
      : tier.lowercased() == "gotcha"
        ? NSColor(calibratedRed: 0.92, green: 0.60, blue: 0.18, alpha: 1)
        : NSColor(calibratedRed: 0.30, green: 0.78, blue: 0.90, alpha: 1)

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

    let root = ClickView(frame: NSRect(x: 0, y: 0, width: width, height: clampedHeight))
    root.wantsLayer = true
    root.onClick = { [weak self] in self?.closeClicked() }

    let bg = CALayer()
    bg.frame = root.bounds
    bg.cornerRadius = 12
    bg.backgroundColor = NSColor(calibratedWhite: 0.10, alpha: 0.90).cgColor
    bg.borderWidth = 1
    bg.borderColor = accent.withAlphaComponent(0.4).cgColor
    bg.shadowColor = NSColor.black.cgColor
    bg.shadowOpacity = 0.35
    bg.shadowRadius = 12
    bg.shadowOffset = CGSize(width: 0, height: -3)
    root.layer = bg

    // Tier as 4px left edge only (no CRITICAL pill — council tone fix)
    let bar = NSView(frame: NSRect(x: 0, y: 0, width: 4, height: clampedHeight))
    bar.wantsLayer = true
    bar.layer?.backgroundColor = accent.cgColor
    bar.layer?.cornerRadius = 2
    bar.layer?.maskedCorners = [.layerMinXMinYCorner, .layerMinXMaxYCorner]
    root.addSubview(bar)

    // Quiet title — no tier word in string
    let titleLabel = makeLabel(
      title,
      font: NSFont.systemFont(ofSize: 13, weight: .regular),
      color: NSColor(calibratedWhite: 0.68, alpha: 1),
      frame: NSRect(
        x: padding + 4,
        y: clampedHeight - padding - titleH - progressH,
        width: width - padding * 2 - 36,
        height: titleH
      )
    )
    root.addSubview(titleLabel)

    let msgY = padding + progressH + (hasSub ? subH + gap : 0)
    let msgLabel = makeLabel(
      message,
      font: msgFont,
      color: .white,
      frame: NSRect(x: padding + 4, y: msgY, width: msgWidth, height: msgHeight),
      maxLines: 2
    )
    root.addSubview(msgLabel)

    if let sub = subtitle, !sub.isEmpty {
      let subLabel = makeLabel(
        sub,
        font: NSFont.systemFont(ofSize: 12, weight: .regular),
        color: NSColor(calibratedWhite: 0.55, alpha: 1),
        frame: NSRect(x: padding + 4, y: padding + progressH, width: msgWidth, height: subH)
      )
      root.addSubview(subLabel)
    }

    // × close
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
    close.font = NSFont.systemFont(ofSize: 18, weight: .medium)
    close.isBordered = false
    close.wantsLayer = true
    close.layer?.cornerRadius = closeSize / 2
    close.layer?.backgroundColor = NSColor(calibratedWhite: 1, alpha: 0.08).cgColor
    close.contentTintColor = NSColor(calibratedWhite: 0.88, alpha: 1)
    close.target = self
    close.action = #selector(closeClicked)
    close.focusRingType = .none
    close.toolTip = "Dismiss"
    root.addSubview(close)

    // Progress hairline (accent drains left→right as time runs out = shrinks)
    let track = CALayer()
    track.frame = CGRect(x: 4, y: 0, width: width - 4, height: progressH)
    track.backgroundColor = NSColor(calibratedWhite: 1, alpha: 0.06).cgColor
    track.cornerRadius = 1.5
    root.layer?.addSublayer(track)

    let progress = CALayer()
    progress.frame = CGRect(x: 4, y: 0, width: width - 4, height: progressH)
    progress.backgroundColor = accent.cgColor
    progress.cornerRadius = 1.5
    root.layer?.addSublayer(progress)
    self.progressLayer = progress

    panel.contentView = root

    // Hover pause tracking (owner is ClickView)
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

    // Top-right of frontmost app's screen (else main), below menu bar
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

    startTimer()
  }

  private func screenForFrontmost() -> NSScreen? {
    // Prefer screen containing the frontmost app's key window if we can
    if let app = NSWorkspace.shared.frontmostApplication,
       let pid = app.processIdentifier as pid_t?
    {
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
          // CG coords are top-left origin; convert roughly via screens
          for s in NSScreen.screens {
            if s.frame.intersects(cgToAppKit(rect, on: s)) { return s }
          }
        }
      }
    }
    return NSScreen.main
  }

  private func cgToAppKit(_ r: CGRect, on screen: NSScreen) -> CGRect {
    // Approximate: use primary height for flip if needed — intersect check is loose enough
    return r
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

/// Click-to-dismiss root; hover callbacks for timer pause.
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
    // Tier-based dwell (council)
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

    // Strip CRITICAL/GOTCHA words from title if present (pill removed; edge only)
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
