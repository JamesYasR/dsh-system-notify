# dsh-system-notify Windows delivery helper.
# Reads one JSON payload from the DSH_NOTIFY_PAYLOAD environment variable (never
# user-controlled shell text), shows a WinRT toast, and optionally plays a WAV or
# a system sound. Exit code 0 means the toast and/or sound was dispatched; 1
# carries the PowerShell error text.

$ErrorActionPreference = 'Stop'

function Escape-Xml([string]$value) {
  return [System.Security.SecurityElement]::Escape($value)
}

if (-not $env:DSH_NOTIFY_PAYLOAD) {
  [Console]::Error.WriteLine('payload: DSH_NOTIFY_PAYLOAD is empty')
  exit 1
}

try {
  $payload = $env:DSH_NOTIFY_PAYLOAD | ConvertFrom-Json
} catch {
  [Console]::Error.WriteLine('payload: ' + $_.Exception.Message)
  exit 1
}

$failed = $null

if ($payload.toast) {
  try {
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
    [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null

    $linesXml = ''
    foreach ($line in @($payload.lines)) {
      if ($null -eq $line) { continue }
      $text = [string]$line
      if ($text.Trim().Length -eq 0) { continue }
      $linesXml += '<text>' + (Escape-Xml $text) + '</text>'
    }

    $imageXml = ''
    if ($payload.icon -and (Test-Path -LiteralPath ([string]$payload.icon))) {
      $imageXml = '<image placement="appLogoOverride" hint-crop="circle" src="' + (Escape-Xml ([string]$payload.iconUri)) + '" />'
    }

    $audioXml = ''
    if ($payload.silent) {
      $audioXml = '<audio silent="true" />'
    } elseif ($payload.audio) {
      $audioXml = '<audio src="' + (Escape-Xml ([string]$payload.audio)) + '" />'
    }

    $activation = ''
    $actionsXml = ''
    if ($payload.clickEnabled -and $payload.clickUrl) {
      $activation = ' activationType="protocol" launch="' + (Escape-Xml ([string]$payload.clickUrl)) + '"'
      $actionsXml = '<actions><action content="' + (Escape-Xml ([string]$payload.actionLabel)) + '" activationType="protocol" arguments="' + (Escape-Xml ([string]$payload.clickUrl)) + '" /></actions>'
    }

    $duration = 'short'
    if ([string]$payload.duration -eq 'long') { $duration = 'long' }

    $xmlText = '<toast duration="' + $duration + '"' + $activation + '>' +
      '<visual><binding template="ToastGeneric"><text>' + (Escape-Xml ([string]$payload.title)) + '</text>' +
      $linesXml + $imageXml + '</binding></visual>' + $audioXml + $actionsXml + '</toast>'

    $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
    $xml.LoadXml($xmlText)
    $toast = New-Object Windows.UI.Notifications.ToastNotification $xml

    $appId = [string]$payload.appId
    if (-not $appId) {
      $appId = 'com.deepseek.dsh'
    }
    $fallbackId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
    $shown = $false
    $lastError = $null
    foreach ($id in @($appId, 'com.deepseek.dsh', 'DeepSeekHarness.Notify', $fallbackId)) {
      if (-not $id) { continue }
      try {
        $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($id)
        $notifier.Show($toast)
        $shown = $true
        break
      } catch {
        $lastError = $_
      }
    }
    if (-not $shown) { throw $lastError }
  } catch {
    $failed = $_
  }
}

if ($payload.playFile) {
  try {
    $player = New-Object System.Media.SoundPlayer ([string]$payload.playFile)
    $player.PlaySync()
  } catch {
    if ($null -eq $failed) { $failed = $_ }
  }
} elseif ($payload.playSystem) {
  try {
    switch ([string]$payload.playSystem) {
      'Hand' { [System.Media.SystemSounds]::Hand.Play() }
      'Exclamation' { [System.Media.SystemSounds]::Exclamation.Play() }
      default { [System.Media.SystemSounds]::Asterisk.Play() }
    }
    Start-Sleep -Milliseconds 700
  } catch {
    if ($null -eq $failed) { $failed = $_ }
  }
}

if ($null -ne $failed) {
  [Console]::Error.WriteLine($failed.Exception.Message)
  exit 1
}
exit 0
