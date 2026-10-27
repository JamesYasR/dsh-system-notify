# dsh-system-notify interactive action handler (Windows).
#
# Invoked by the per-user `dsh-system-notify://` protocol registered by the
# plugin. The URL carries a one-time token + interaction id and the local DSH
# origin; this script posts the chosen action back to the plugin route.
#
# Actions:
#   allow / deny / option:N / open   -> immediately post the action
#   input                            -> show a text input box, then post the text
#   choose                           -> show a list/checklist, then post selections
#
# It is intentionally silent on errors: the toast has already disappeared and
# there is no useful place for a modal error from an OS protocol handler.

param(
  [Parameter(Mandatory = $true)][string]$Uri
)

$ErrorActionPreference = 'Stop'

function Decode([string]$value) {
  return [System.Uri]::UnescapeDataString($value)
}

try {
  $parsed = [System.Uri]$Uri
  if ($parsed.Scheme -ne 'dsh-system-notify') { exit 1 }
  $query = @{}
  if ($parsed.Query) {
    foreach ($pair in $parsed.Query.TrimStart('?').Split('&')) {
      $parts = $pair.Split('=', 2)
      if ($parts.Count -eq 2) { $query[(Decode $parts[0])] = Decode $parts[1] }
    }
  }
  $base = [string]$query['base']
  $id = [string]$query['id']
  $token = [string]$query['token']
  $action = [string]$query['action']
  if (-not $base -or -not $id -or -not $token -or -not $action) { exit 1 }
  $base = $base.TrimEnd('/')

  function Post-Respond([string]$actionName, $value) {
    $body = @{
      id = $id
      token = $token
      action = $actionName
      value = $value
    } | ConvertTo-Json -Depth 8 -Compress
    Invoke-RestMethod -Method Post -Uri "$base/dsh-system-notify/respond" `
      -ContentType 'application/json; charset=utf-8' -Body $body -TimeoutSec 8 | Out-Null
  }

  function Get-InteractionMeta {
    $queryString = 'id=' + [System.Uri]::EscapeDataString($id) + '&token=' + [System.Uri]::EscapeDataString($token)
    return Invoke-RestMethod -Uri "$base/dsh-system-notify/respond/meta?$queryString" -TimeoutSec 8
  }

  switch ($action) {
    'input' {
      Post-Respond 'dialog-open' $null
      $meta = Get-InteractionMeta
      Add-Type -AssemblyName Microsoft.VisualBasic
      $text = [Microsoft.VisualBasic.Interaction]::InputBox([string]$meta.question, 'DSH', '')
      if ($null -ne $text -and $text.Trim().Length -gt 0) {
        Post-Respond 'input' $text.Trim()
      } else {
        Post-Respond 'open' $null
      }
    }
    'choose' {
      Post-Respond 'dialog-open' $null
      $meta = Get-InteractionMeta
      Add-Type -AssemblyName System.Windows.Forms
      Add-Type -AssemblyName System.Drawing

      $form = New-Object System.Windows.Forms.Form
      $form.Text = 'DSH'
      $form.ClientSize = New-Object System.Drawing.Size(440, 320)
      $form.StartPosition = 'CenterScreen'
      $form.FormBorderStyle = 'FixedDialog'
      $form.MaximizeBox = $false
      $form.MinimizeBox = $false

      $label = New-Object System.Windows.Forms.Label
      $label.Text = [string]$meta.question
      $label.SetBounds(12, 12, 416, 56)
      $form.Controls.Add($label)

      if ($meta.multiSelect -eq $true) {
        $list = New-Object System.Windows.Forms.CheckedListBox
        $list.CheckOnClick = $true
      } else {
        $list = New-Object System.Windows.Forms.ListBox
      }
      $list.SetBounds(12, 74, 416, 190)
      foreach ($option in @($meta.options)) {
        [void]$list.Items.Add([string]$option)
      }
      $form.Controls.Add($list)

      $ok = New-Object System.Windows.Forms.Button
      $ok.Text = 'OK'
      $ok.SetBounds(258, 278, 80, 28)
      $ok.Add_Click({ $form.DialogResult = 'OK'; $form.Close() })
      $form.Controls.Add($ok)

      $cancel = New-Object System.Windows.Forms.Button
      $cancel.Text = 'Cancel'
      $cancel.SetBounds(348, 278, 80, 28)
      $cancel.Add_Click({ $form.DialogResult = 'Cancel'; $form.Close() })
      $form.Controls.Add($cancel)

      $form.AcceptButton = $ok
      $form.CancelButton = $cancel
      [void]$form.ShowDialog()

      if ($form.DialogResult -ne 'OK') {
        Post-Respond 'open' $null
        exit 0
      }
      if ($meta.multiSelect -eq $true) {
        $selected = @($list.CheckedItems | ForEach-Object { [string]$_ })
      } else {
        $selected = @()
        if ($null -ne $list.SelectedItem) { $selected += [string]$list.SelectedItem }
      }
      if ($selected.Count -gt 0) {
        Post-Respond 'choose' $selected
      } else {
        Post-Respond 'open' $null
      }
    }
    default {
      Post-Respond $action $null
    }
  }
  exit 0
} catch {
  exit 1
}
