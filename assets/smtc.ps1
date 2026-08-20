# AeroWidget - SMTC (System Media Transport Controls) ブリッジ
# Windows の「再生中メディア」(Spotify / ブラウザの YouTube など) を 3 秒ごとに監視し、
# 変化があったときだけ 1 行 JSON を stdout に出力する。
# WinRT を使うため Windows PowerShell 5.1 (powershell.exe) で実行すること。
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Runtime.WindowsRuntime

$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  })[0]

function Await($winRtTask, $resultType) {
  $asTask = $asTaskGeneric.MakeGenericMethod($resultType)
  $netTask = $asTask.Invoke($null, @($winRtTask))
  $null = $netTask.Wait(5000)
  if ($netTask.Status -ne 'RanToCompletion') { return $null }
  return $netTask.Result
}

function Get-ArtBase64($props) {
  try {
    $thumb = $props.Thumbnail
    if (-not $thumb) { return $null }
    $stream = Await ($thumb.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
    if (-not $stream) { return $null }
    $netStream = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($stream)
    $ms = New-Object System.IO.MemoryStream
    $netStream.CopyTo($ms)
    $bytes = $ms.ToArray()
    $ms.Dispose(); $netStream.Dispose(); $stream.Dispose()
    if ($bytes.Length -lt 100 -or $bytes.Length -gt 800000) { return $null }
    return [Convert]::ToBase64String($bytes)
  } catch { return $null }
}

$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
if (-not $mgr) {
  Write-Output '{"ok":false,"reason":"smtc-unavailable"}'
  exit 1
}

$lastKey = ''
while ($true) {
  $out = $null
  try {
    $session = $mgr.GetCurrentSession()
    if ($session) {
      $props = Await ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
      $info = $session.GetPlaybackInfo()
      $playing = ($info -and $info.PlaybackStatus -eq 'Playing')
      if ($props -and ($props.Title -or $props.Artist)) {
        $key = '{0}|{1}|{2}' -f $props.Title, $props.Artist, $playing
        if ($key -ne $lastKey) {
          $lastKey = $key
          $art = Get-ArtBase64 $props
          $out = [PSCustomObject]@{
            ok      = $true
            playing = [bool]$playing
            title   = [string]$props.Title
            artist  = [string]$props.Artist
            app     = [string]$session.SourceAppUserModelId
            art     = $art
          }
        }
      } elseif ($lastKey -ne 'none') {
        $lastKey = 'none'
        $out = [PSCustomObject]@{ ok = $true; playing = $false; title = ''; artist = ''; app = ''; art = $null }
      }
    } elseif ($lastKey -ne 'none') {
      $lastKey = 'none'
      $out = [PSCustomObject]@{ ok = $true; playing = $false; title = ''; artist = ''; app = ''; art = $null }
    }
  } catch { }
  if ($out) { Write-Output ($out | ConvertTo-Json -Compress) }
  Start-Sleep -Seconds 3
}
