import AppKit
import Foundation

/// Non-activating floating toast with close (×). Does not steal keyboard focus.
/// Usage:
///   CodeloreToast --title "CodeLore · my-app" --message "tip line" [--subtitle "line2"] [--timeout 12] [--tier critical]

final class ToastController: NSObject {
  private var window: NSPanel!
  private var timeoutWork: DispatchWorkItem?

  func show(title: String, message: String, subtitle: String?, timeout: TimeInterval, tier: String) {
    let width: CGFloat = 420
    let padding: CGFloat = 14
    let hasSub = !(subtitle ?? "").isEmpty
    let height: CGFloat = hasSub ? 108 : 88

    let panel = NSPanel(
      contentRect: NSRect(x: 0, y: 0, width: width, height: height),
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
    // Critical: never steal focus from the user's current app
    panel.worksWhenModal = true

    let root = NSView(frame: NSRect(x: 0, y: 0, width: width, height: height))
    root.wantsLayer = true

    let bg = CALayer()
    bg.frame = root.bounds
    bg.cornerRadius = 12
    bg.backgroundColor = NSColor(calibratedWhite: 0.11, alpha: 0.94).cgColor
    bg.borderWidth = 1
    let accent: NSColor =
      tier.lowercased() == "critical"
      ? NSColor(calibratedRed: 0.85, green: 0.25, blue: 0.25, alpha: 1)
      : NSColor(calibratedRed: 0.25, green: 0.72, blue: 0.85, alpha: 1)
    bg.borderColor = accent.withAlphaComponent(0.7).cgColor
    root.layer = bg

    // Left accent bar
    let bar = NSView(frame: NSRect(x: 0, y: 0, width: 4, height: height))
    bar.wantsLayer = true
    bar.layer?.backgroundColor = accent.cgColor
    bar.layer?.cornerRadius = 2
    root.addSubview(bar)

    let titleLabel = makeLabel(
      title,
      font: NSFont.systemFont(ofSize: 12, weight: .semibold),
      color: NSColor(calibratedWhite: 0.75, alpha: 1),
      frame: NSRect(x: padding + 6, y: height - 28, width: width - padding * 2 - 36, height: 16)
    )
    root.addSubview(titleLabel)

    let msgLabel = makeLabel(
      message,
      font: NSFont.systemFont(ofSize: 13, weight: .medium),
      color: .white,
      frame: NSRect(
        x: padding + 6,
        y: hasSub ? 36 : 22,
        width: width - padding * 2 - 36,
        height: hasSub ? 22 : 28
      )
    )
    root.addSubview(msgLabel)

    if let sub = subtitle, !sub.isEmpty {
      let subLabel = makeLabel(
        sub,
        font: NSFont.systemFont(ofSize: 12, weight: .regular),
        color: NSColor(calibratedWhite: 0.7, alpha: 1),
        frame: NSRect(x: padding + 6, y: 14, width: width - padding * 2 - 36, height: 18)
      )
      root.addSubview(subLabel)
    }

    // Close (×) button — top right
    let close = NSButton(
      frame: NSRect(x: width - 34, y: height - 32, width: 24, height: 24)
    )
    close.title = "×"
    close.font = NSFont.systemFont(ofSize: 16, weight: .medium)
    close.isBordered = false
    close.wantsLayer = true
    close.layer?.cornerRadius = 12
    close.layer?.backgroundColor = NSColor(calibratedWhite: 1, alpha: 0.08).cgColor
    close.contentTintColor = NSColor(calibratedWhite: 0.85, alpha: 1)
    close.target = self
    close.action = #selector(closeClicked)
    close.focusRingType = .none
    root.addSubview(close)

    panel.contentView = root

    // Bottom-right of the main screen, like a toast
    if let screen = NSScreen.main {
      let visible = screen.visibleFrame
      let x = visible.maxX - width - 16
      let y = visible.minY + 16
      panel.setFrameOrigin(NSPoint(x: x, y: y))
    }

    panel.orderFrontRegardless()
    self.window = panel

    if timeout > 0 {
      let work = DispatchWorkItem { [weak self] in self?.dismiss() }
      self.timeoutWork = work
      DispatchQueue.main.asyncAfter(deadline: .now() + timeout, execute: work)
    }
  }

  private func makeLabel(_ text: String, font: NSFont, color: NSColor, frame: NSRect) -> NSTextField {
    let l = NSTextField(frame: frame)
    l.stringValue = text
    l.isEditable = false
    l.isBordered = false
    l.isBezeled = false
    l.drawsBackground = false
    l.font = font
    l.textColor = color
    l.lineBreakMode = .byTruncatingTail
    l.maximumNumberOfLines = 2
    l.cell?.wraps = true
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
      fputs("usage: CodeloreToast --title T --message M [--subtitle S] [--timeout 12] [--tier critical]\n", stderr)
      exit(2)
    }

    let app = NSApplication.shared
    app.setActivationPolicy(.accessory) // no dock bounce, no menu bar steal
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
