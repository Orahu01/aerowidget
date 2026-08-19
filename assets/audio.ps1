# WidgetWall - オーディオ制御ブリッジ
# stdin で 1 行ずつコマンドを受け取り、状態を 1 行 JSON で stdout に返す。
#   list                 … 出力デバイス一覧と現在の音量を返す
#   vol <0-100>          … マスター音量を設定
#   mute <0|1>           … ミュート切替
#   device <deviceId>    … 既定の再生デバイスを切り替える
#   state                … 現在の状態を返す
# Core Audio (IMMDeviceEnumerator / IAudioEndpointVolume) と、
# デバイス切替のみ非公開の IPolicyConfig を使う (Windows 標準機能で追加導入は不要)。
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

namespace WW {

  [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator {
    int EnumAudioEndpoints(int dataFlow, int stateMask, out IMMDeviceCollection devices);
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
    int GetDevice(string id, out IMMDevice device);
    int RegisterEndpointNotificationCallback(IntPtr client);
    int UnregisterEndpointNotificationCallback(IntPtr client);
  }

  [Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceCollection {
    int GetCount(out uint count);
    int Item(uint index, out IMMDevice device);
  }

  [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDevice {
    int Activate(ref Guid iid, int clsCtx, IntPtr activationParams,
      [MarshalAs(UnmanagedType.IUnknown)] out object iface);
    int OpenPropertyStore(int access, out IPropertyStore properties);
    int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
    int GetState(out int state);
  }

  [Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IPropertyStore {
    int GetCount(out uint count);
    int GetAt(uint index, out PropertyKey key);
    int GetValue(ref PropertyKey key, out PropVariant value);
    int SetValue(ref PropertyKey key, ref PropVariant value);
    int Commit();
  }

  [StructLayout(LayoutKind.Sequential)]
  struct PropertyKey { public Guid fmtid; public int pid; }

  [StructLayout(LayoutKind.Explicit)]
  struct PropVariant {
    [FieldOffset(0)] public short vt;
    [FieldOffset(8)] public IntPtr pointerValue;
    public string AsString() { return vt == 31 ? Marshal.PtrToStringUni(pointerValue) : null; }
  }

  [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioEndpointVolume {
    int RegisterControlChangeNotify(IntPtr notify);
    int UnregisterControlChangeNotify(IntPtr notify);
    int GetChannelCount(out uint count);
    int SetMasterVolumeLevel(float level, ref Guid ctx);
    int SetMasterVolumeLevelScalar(float level, ref Guid ctx);
    int GetMasterVolumeLevel(out float level);
    int GetMasterVolumeLevelScalar(out float level);
    int SetChannelVolumeLevel(uint ch, float level, ref Guid ctx);
    int SetChannelVolumeLevelScalar(uint ch, float level, ref Guid ctx);
    int GetChannelVolumeLevel(uint ch, out float level);
    int GetChannelVolumeLevelScalar(uint ch, out float level);
    int SetMute(bool mute, ref Guid ctx);
    int GetMute(out bool mute);
  }

  [Guid("f8679f50-850a-41cf-9c72-430f290290c8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IPolicyConfig {
    int GetMixFormat(string device, IntPtr format);
    int GetDeviceFormat(string device, bool def, IntPtr format);
    int ResetDeviceFormat(string device);
    int SetDeviceFormat(string device, IntPtr endpoint, IntPtr mix);
    int GetProcessingPeriod(string device, bool def, IntPtr a, IntPtr b);
    int SetProcessingPeriod(string device, IntPtr period);
    int GetShareMode(string device, IntPtr mode);
    int SetShareMode(string device, IntPtr mode);
    int GetPropertyValue(string device, ref PropertyKey key, out PropVariant value);
    int SetPropertyValue(string device, ref PropertyKey key, ref PropVariant value);
    int SetDefaultEndpoint(string device, int role);
    int SetEndpointVisibility(string device, bool visible);
  }

  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator { }
  [ComImport, Guid("870af99c-171d-4f9e-af0d-e63df40c2bc9")] class CPolicyConfigClient { }

  public class Audio {
    static Guid IID_EndpointVolume = new Guid("5CDF2C82-841E-4546-9722-0CF74078229A");
    static Guid ctx = Guid.Empty;
    const int RENDER = 0, CONSOLE = 0, ACTIVE = 1;

    static IMMDeviceEnumerator Enumerator() {
      return (IMMDeviceEnumerator)(new MMDeviceEnumerator());
    }

    static string NameOf(IMMDevice d) {
      IPropertyStore store;
      d.OpenPropertyStore(0, out store);
      var key = new PropertyKey {
        fmtid = new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"), pid = 14 // FriendlyName
      };
      PropVariant v;
      store.GetValue(ref key, out v);
      var s = v.AsString();
      Marshal.ReleaseComObject(store);
      return s == null ? "(不明なデバイス)" : s;
    }

    static IAudioEndpointVolume VolumeOf(IMMDevice d) {
      object o;
      d.Activate(ref IID_EndpointVolume, 1 /* CLSCTX_INPROC_SERVER */, IntPtr.Zero, out o);
      return (IAudioEndpointVolume)o;
    }

    public static string DefaultId() {
      IMMDevice d;
      Enumerator().GetDefaultAudioEndpoint(RENDER, CONSOLE, out d);
      string id;
      d.GetId(out id);
      return id;
    }

    public static int GetVolume() {
      IMMDevice d;
      Enumerator().GetDefaultAudioEndpoint(RENDER, CONSOLE, out d);
      var v = VolumeOf(d);
      float f;
      v.GetMasterVolumeLevelScalar(out f);
      return (int)Math.Round(f * 100);
    }

    public static bool GetMute() {
      IMMDevice d;
      Enumerator().GetDefaultAudioEndpoint(RENDER, CONSOLE, out d);
      var v = VolumeOf(d);
      bool m;
      v.GetMute(out m);
      return m;
    }

    public static void SetVolume(int percent) {
      IMMDevice d;
      Enumerator().GetDefaultAudioEndpoint(RENDER, CONSOLE, out d);
      var v = VolumeOf(d);
      float f = Math.Max(0f, Math.Min(1f, percent / 100f));
      v.SetMasterVolumeLevelScalar(f, ref ctx);
    }

    public static void SetMute(bool mute) {
      IMMDevice d;
      Enumerator().GetDefaultAudioEndpoint(RENDER, CONSOLE, out d);
      var v = VolumeOf(d);
      v.SetMute(mute, ref ctx);
    }

    // "id\tname" のリストを返す
    public static List<string> Devices() {
      var list = new List<string>();
      IMMDeviceCollection col;
      Enumerator().EnumAudioEndpoints(RENDER, ACTIVE, out col);
      uint n;
      col.GetCount(out n);
      for (uint i = 0; i < n; i++) {
        IMMDevice d;
        col.Item(i, out d);
        string id;
        d.GetId(out id);
        list.Add(id + "\t" + NameOf(d));
        Marshal.ReleaseComObject(d);
      }
      Marshal.ReleaseComObject(col);
      return list;
    }

    public static void SetDefault(string id) {
      var pc = (IPolicyConfig)(new CPolicyConfigClient());
      for (int role = 0; role < 3; role++) pc.SetDefaultEndpoint(id, role);
      Marshal.ReleaseComObject(pc);
    }
  }
}
'@

function Esc([string]$s) {
  if ($null -eq $s) { return '' }
  return $s.Replace('\', '\\').Replace('"', '\"')
}

function Emit([bool]$withDevices) {
  try {
    $vol = [WW.Audio]::GetVolume()
    $mute = [WW.Audio]::GetMute()
    $cur = [WW.Audio]::DefaultId()
    $sb = New-Object System.Text.StringBuilder
    [void]$sb.Append('{"ok":true,"volume":').Append($vol)
    [void]$sb.Append(',"muted":').Append($(if ($mute) { 'true' } else { 'false' }))
    [void]$sb.Append(',"current":"').Append((Esc $cur)).Append('"')
    if ($withDevices) {
      [void]$sb.Append(',"devices":[')
      $first = $true
      foreach ($line in [WW.Audio]::Devices()) {
        $parts = $line -split "`t", 2
        if (-not $first) { [void]$sb.Append(',') }
        $first = $false
        [void]$sb.Append('{"id":"').Append((Esc $parts[0])).Append('","name":"').Append((Esc $parts[1])).Append('"}')
      }
      [void]$sb.Append(']')
    }
    [void]$sb.Append('}')
    Write-Output $sb.ToString()
  } catch {
    Write-Output ('{"ok":false,"error":"' + (Esc $_.Exception.Message) + '"}')
  }
}

Emit $true

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  $line = $line.Trim()
  if ($line -eq '') { continue }
  $cmd, $arg = $line -split ' ', 2
  try {
    switch ($cmd) {
      'vol'    { [WW.Audio]::SetVolume([int]$arg); Emit $false }
      'mute'   { [WW.Audio]::SetMute($arg -eq '1'); Emit $false }
      'device' { [WW.Audio]::SetDefault($arg); Start-Sleep -Milliseconds 250; Emit $true }
      'list'   { Emit $true }
      'state'  { Emit $false }
      default  { }
    }
  } catch {
    Write-Output ('{"ok":false,"error":"' + (Esc $_.Exception.Message) + '"}')
  }
}
