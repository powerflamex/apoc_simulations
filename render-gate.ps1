param([string]$Dir, [string]$Owner)
# Part of the render gate (render-gate.sh): while a render holds the gate, write the PC's state for it every 10 s
# ("idle-seconds on-charger gpu-temp gpu-use% hottest-gpu-temp game") and how many CPU cores the upload copy may use.
# Stops by itself once that render has left the gate.
Add-Type @'
using System; using System.Runtime.InteropServices;
public static class Idle {
  [StructLayout(LayoutKind.Sequential)] struct LII { public uint cbSize; public uint dwTime; }
  [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LII p);
  public static uint Seconds() {
    var l = new LII(); l.cbSize = (uint)Marshal.SizeOf(l);
    if (!GetLastInputInfo(ref l)) return 0;
    return unchecked((uint)Environment.TickCount - l.dwTime) / 1000;
  }
}
'@
# the owner's games (from his desktop): a render waits while he plays one
$games = 'javaw', 'RobloxPlayerBeta', 'RobloxStudioBeta', 'DELTARUNE', 'OMORI'
$max = 0
while ($true) {
  $holder = Get-Content -Raw "$Dir\lock\pid" -ErrorAction SilentlyContinue
  if (-not $holder -or $holder.Trim() -ne $Owner -or -not (Get-Process -Id $Owner -ErrorAction SilentlyContinue)) { break }
  $idle = [Idle]::Seconds()
  # BatteryStatus 1, 4, 5 = running on the battery (no battery at all counts as plugged in)
  $ac = 1
  foreach ($b in @(Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue)) { if ($b.BatteryStatus -in 1, 4, 5) { $ac = 0 } }
  $temp = 0; $util = 0
  $g = nvidia-smi --query-gpu=temperature.gpu,utilization.gpu --format=csv,noheader,nounits 2>$null | Select-Object -First 1
  if ($g) { $p = $g -split ',\s*'; [int]::TryParse($p[0], [ref]$temp) | Out-Null; [int]::TryParse($p[1], [ref]$util) | Out-Null }
  if ($temp -gt $max) { $max = $temp }
  # games can run on the Intel graphics too: also take the busiest graphics chip's 3D load from Windows
  $load = @{}
  foreach ($c in @((Get-Counter '\GPU Engine(*engtype_3D)\Utilization Percentage' -ErrorAction SilentlyContinue).CounterSamples)) {
    if ($c.InstanceName -match 'luid_(\w+_\w+)_phys') { $load[$Matches[1]] += $c.CookedValue }
  }
  foreach ($v in $load.Values) { if ($v -gt $util) { $util = [int]$v } }
  $game = @(Get-Process -Name $games -ErrorAction SilentlyContinue)[0].Name
  if (-not $game) { $game = '-' }
  $threads = if ($ac -eq 0) { 2 } elseif ($idle -ge 300) { 8 } else { 4 }
  # plain "\n" line ends (bash reads these), written whole and then swapped in so a reader never sees half a file
  [IO.File]::WriteAllText("$Dir\threads.tmp", "$threads`n"); Move-Item -Force "$Dir\threads.tmp" "$Dir\threads"
  [IO.File]::WriteAllText("$Dir\state.tmp", "$idle $ac $temp $util $max $game`n"); Move-Item -Force "$Dir\state.tmp" "$Dir\state"
  Start-Sleep 10
}
