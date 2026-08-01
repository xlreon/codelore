# CodeLore — Windows top-right toast (Action Center) / balloon fallback.
# Zero deps. Called from poc/codelore.mjs.
param(
  [Parameter(Mandatory = $true)][string]$Title,
  [Parameter(Mandatory = $true)][string]$Message,
  [string]$Subtitle = "",
  [string]$Tier = "tip",
  [int]$DurationMs = 8000
)

$ErrorActionPreference = "Stop"

function Show-WinRtToast {
  param([string]$Title, [string]$Message, [string]$Subtitle)

  # Load WinRT types (Windows 10+)
  $null = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
  $null = [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]

  $line3 = if ($Subtitle) { "<text hint-style='captionSubtle'>$([System.Security.SecurityElement]::Escape($Subtitle))</text>" } else { "" }
  $xml = @"
<toast duration="short" scenario="reminder">
  <visual>
    <binding template="ToastGeneric">
      <text>$([System.Security.SecurityElement]::Escape($Title))</text>
      <text>$([System.Security.SecurityElement]::Escape($Message))</text>
      $line3
    </binding>
  </visual>
</toast>
"@

  $doc = New-Object Windows.Data.Xml.Dom.XmlDocument
  $doc.LoadXml($xml)
  # AppId: generic PowerShell host — shows in Action Center / top-right toast area
  $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("CodeLore.Tips")
  $toast = [Windows.UI.Notifications.ToastNotification]::new($doc)
  $notifier.Show($toast)
  return "winrt-toast"
}

function Show-BalloonTip {
  param([string]$Title, [string]$Message, [int]$DurationMs)

  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing

  $icon = New-Object System.Windows.Forms.NotifyIcon
  $icon.Icon = [System.Drawing.SystemIcons]::Information
  $icon.Visible = $true
  $icon.BalloonTipTitle = $Title
  $icon.BalloonTipText = if ($Message.Length -gt 250) { $Message.Substring(0, 247) + "..." } else { $Message }
  $icon.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Info
  $icon.ShowBalloonTip([Math]::Max(3000, $DurationMs))
  Start-Sleep -Milliseconds ([Math]::Min(2000, $DurationMs))
  $icon.Dispose()
  return "balloon"
}

try {
  $backend = Show-WinRtToast -Title $Title -Message $Message -Subtitle $Subtitle
  Write-Output $backend
  exit 0
} catch {
  try {
    $text = if ($Subtitle) { "$Message`n$Subtitle" } else { $Message }
    $backend = Show-BalloonTip -Title $Title -Message $text -DurationMs $DurationMs
    Write-Output $backend
    exit 0
  } catch {
    Write-Error $_.Exception.Message
    exit 1
  }
}
