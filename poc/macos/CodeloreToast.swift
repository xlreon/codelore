import AppKit
import Foundation

/// Non-activating floating toast with close (×). Does not steal keyboard focus.
/// Position: top-left. Larger type + roomier card.
/// Usage:
///   CodeloreToast --title "CodeLore · my-app" --message "tip" [--subtitle "…"] [--timeout 12] [--tier critical]

final class ToastController: NSObject {
  private var window: NSPanel!
  private var timeoutWork: DispatchWorkItem?

  func show(title: String, message: String, subtitle: String?, timeout: TimeInterval, tier: String) {
    let width: CGFloat = 520
    let padding: CGFloat = 20
    let hasSub = !(subtitle ?? "").isEmpty

    // Measure message height for wrapping (up to 2 lines of large type)
    let msgFont = NSFont.systemFont(ofSize: 17, weight: .semibold)
    let msgWidth = width - padding * 2 - 44 // accent + close room
    let msgHeight = measureHeight(message, font: msgFont, width: msgWidth, maxLines: 2)
    let titleH: CGFloat = 20
    let subH: CGFloat = hasSub ? 20 : 0
    let gap: CGFloat = 8
    let height = padding + titleH + gap + msgHeight + (hasSub ? gap + subH : 0) + padding
    let clampedHeight = max(110, min(height, 180))

    let panel = NSPanel(
      contentRect: NSRect(x: 0, y: 0, width: width, height: clampedHeight),
      styleMask: [.borderless, .nonactivatingPanel],
      backing: .buffered,
      defer: false
    )
    panel.isFloatingPanel = true
    panel.level = .statusBar // above normal windows, still non-activating
    panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
    panel.isOpaque = false
    panel.backgroundColor = .clear
    panel.hasShadow = true
    panel.hidesOnDeactivate = false
    panel.becomesKeyOnlyIfNeeded = true
    panel.isMovableByWindowBackground = true
    panel.worksWhenModal = true
    panel.alphaValue = 0

    let root = NSView(frame: NSRect(x: 0, y: 0, width: width, height: clampedHeight))
    root.wantsLayer = true

    let accent: NSColor =
      tier.lowercased() == "critical"
      ? NSColor(calibratedRed: 0.92, green: 0.28, blue: 0.32, alpha: 1)
      : tier.lowercased() == "gotcha"
        ? NSColor(calibratedRed: 0.95, green: 0.62, blue: 0.18, alpha: 1)
        : NSColor(calibratedRed: 0.30, green: 0.78, blue: 0.90, alpha: 1)

    // Card background
    let bg = CALayer()
    bg.frame = root.bounds
    bg.cornerRadius = 16
    bg.backgroundColor = NSColor(calibratedWhite: 0.09, alpha: 0.96).cgColor
    bg.borderWidth = 1.5
    bg.borderColor = accent.withAlphaComponent(0.55).cgColor
    bg.shadowColor = NSColor.black.cgColor
    bg.shadowOpacity = 0.45
    bg.shadowRadius = 18
    bg.shadowOffset = CGSize(width: 0, height: -4)
    root.layer = bg

    // Left accent strip
    let bar = NSView(frame: NSRect(x: 0, y: 0, width: 5, height: clampedHeight))
    bar.wantsLayer = true
    bar.layer?.backgroundColor = accent.cgColor
    bar.layer?.cornerRadius = 2.5
    bar.layer?.maskedCorners = [.layerMinXMinYCorner, .layerMinXMaxYCorner]
    root.addSubview(bar)

    // Tier pill (top-left of content)
    let tierText = tier.uppercased()
    let pillW = max(64, CGFloat(tierText.count) * 9 + 16)
    let pill = NSView(
      frame: NSRect(x: padding + 6, y: clampedHeight - padding - 18, width: pillW, height: 22)
    )
    pill.wantsLayer = true
    pill.layer?.cornerRadius = 11
    pill.layer?.backgroundColor = accent.withAlphaComponent(0.22).cgColor
    let pillLabel = makeLabel(
      tierText,
      font: NSFont.systemFont(ofSize: 11, weight: .bold),
      color: accent,
      frame: NSRect(x: 0, y: 2, width: pillW, height: 18),
      align: .center
    )
    pill.addSubview(pillLabel)
    root.addSubview(pill)

    // Title to the right of pill
    let titleX = padding + 6 + pillW + 10
    let titleLabel = makeLabel(
      title,
      font: NSFont.systemFont(ofSize: 14, weight: .semibold),
      color: NSColor(calibratedWhite: 0.78, alpha: 1),
      frame: NSRect(
        x: titleX,
        y: clampedHeight - padding - 18,
        width: width - titleX - 48,
        height: 20
      )
    )
    root.addSubview(titleLabel)

    // Main tip message — larger
    let msgY = hasSub ? padding + subH + gap : padding
    let msgLabel = makeLabel(
      message,
      font: msgFont,
      color: .white,
      frame: NSRect(
        x: padding + 6,
        y: msgY,
        width: msgWidth,
        height: msgHeight
      ),
      maxLines: 2
    )
    root.addSubview(msgLabel)

    if let sub = subtitle, !sub.isEmpty {
      let subLabel = makeLabel(
        sub,
        font: NSFont.systemFont(ofSize: 13, weight: .regular),
        color: NSColor(calibratedWhite: 0.62, alpha: 1),
        frame: NSRect(x: padding + 6, y: padding, width: msgWidth, height: subH)
      )
      root.addSubview(subLabel)
    }

    // Close (×) — larger hit target
    let closeSize: CGFloat = 30
    let close = NSButton(
      frame: NSRect(
        x: width - padding - closeSize + 4,
        y: clampedHeight - padding - closeSize + 2,
        width: closeSize,
        height: closeSize
      )
    )
    close.title = "×"
    close.font = NSFont.systemFont(ofSize: 20, weight: .medium)
    close.isBordered = false
    close.wantsLayer = true
    close.layer?.cornerRadius = closeSize / 2
    close.layer?.backgroundColor = NSColor(calibratedWhite: 1, alpha: 0.10).cgColor
    close.contentTintColor = NSColor(calibratedWhite: 0.9, alpha: 1)
    close.target = self
    close.action = #selector(closeClicked)
    close.focusRingType = .none
    close.toolTip = "Dismiss"
    root.addSubview(close)

    panel.contentView = root

    // Top-left of the main screen (below menu bar)
    if let screen = NSScreen.main {
      let visible = screen.visibleFrame
      let x = visible.minX + 20
      let y = visible.maxY - clampedHeight - 20
      panel.setFrameOrigin(NSPoint(x: x, y: y))
    }

    panel.orderFrontRegardless()
    self.window = panel

    // Fade in
    NSAnimationContext.runAnimationGroup { ctx in
      ctx.duration = 0.2
      panel.animator().alphaValue = 1
    }

    if timeout > 0 {
      let work = DispatchWorkItem { [weak self] in self?.dismiss() }
      self.timeoutWork = work
      DispatchQueue.main.asyncAfter(deadline: .now() + timeout, execute: work)
    }
  }

  private func measureHeight(_ text: String, font: NSFont, width: CGFloat, maxLines: Int) -> CGFloat {
    let attr: [NSAttributedString.Key: Any] = [.font: font]
    let rect = (text as NSString).boundingRect(
      with: NSSize(width: width, height: 10_000),
      options: [.usesLineFragmentOrigin, .usesFontLeading],
      attributes: attr
    )
    let lineH = font.ascender - font.descender + font.leading
    let maxH = lineH * CGFloat(maxLines) + 8
    return min(max(ceil(rect.height) + 4, 28), maxH)
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
    timeoutWork?.cancel()
    dismiss()
  }

  private func dismiss() {
    NSAnimationContext.runAnimationGroup({ ctx in
      ctx.duration = 0.18
      window?.animator().alphaValue = 0
    }, completionHandler: {
      self.window?.orderOut(nil)
      self.window = nil
      NSApp.terminate(nil)
    })
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
    let timeout = TimeInterval(flag("--timeout") ?? "12") ?? 12

    guard !message.isEmpty else {
      fputs(
        "usage: CodeloreToast --title T --message M [--subtitle S] [--timeout 12] [--tier critical]\n",
        stderr
      )
      exit(2)
    }

    let app = NSApplication.shared
    app.setActivationPolicy(.accessory)
    let controller = ToastController()
    controller.show(
      title: title,
      message: message,
      subtitle: subtitle,
      timeout: timeout,
      tier: tier
    )
    app.run()
  }
}
