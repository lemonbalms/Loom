# Step 0 — Windows host half
# Run in PowerShell (Admin recommended for firewall + OpenSSH).
#
# A) Enable remote control from Mac over Tailscale (recommended):
#    Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
#    Start-Service sshd
#    Set-Service -Name sshd -StartupType Automatic
#    # optional: firewall rule for SSH is usually added by the capability
#
# B) Local Step 0 without SSH — start relay + probe WSL:
#    powershell -ExecutionPolicy Bypass -File step0-windows.ps1

$ErrorActionPreference = "Continue"
$Port = if ($env:LOOM_RELAY_PORT) { [int]$env:LOOM_RELAY_PORT } else { 7842 }
if (-not $env:LOOM_RELAY_TOKEN) {
  $bytes = New-Object byte[] 24
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $env:LOOM_RELAY_TOKEN = -join ($bytes | ForEach-Object { $_.ToString("x2") })
}
$Token = $env:LOOM_RELAY_TOKEN

Write-Host "=== Step 0 Windows host ==="
Write-Host "hostname: $env:COMPUTERNAME"
Write-Host "user:     $env:USERNAME"
Write-Host "port:     $Port"
Write-Host "token:    $Token"

# Tailscale IPv4 if present
$TsIp = $null
try {
  $TsIp = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -like '100.*' -and $_.PrefixOrigin -ne 'WellKnown' } |
    Select-Object -First 1 -ExpandProperty IPAddress)
} catch {}
if (-not $TsIp) { $TsIp = "100.65.103.113" }  # Mac discovery fallback
Write-Host "ts_ip:    $TsIp"

Write-Host "`n--- wsl --version ---"
wsl --version 2>&1 | Write-Host

$wslConfig = Join-Path $env:USERPROFILE ".wslconfig"
Write-Host "`n--- .wslconfig ($wslConfig) ---"
if (Test-Path $wslConfig) {
  Get-Content $wslConfig | Write-Host
} else {
  Write-Host "missing — writing mirrored networkingMode"
  @"
[wsl2]
networkingMode=mirrored
"@ | Set-Content -Path $wslConfig -Encoding ascii
  Write-Host "wrote. Run: wsl --shutdown   then reopen Ubuntu"
}

# Firewall for relay
try {
  if (-not (Get-NetFirewallRule -DisplayName "Loom relay $Port" -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName "Loom relay $Port" -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow | Out-Null
    Write-Host "firewall: added Loom relay $Port"
  } else {
    Write-Host "firewall: rule already present"
  }
} catch {
  Write-Host "firewall: skipped ($($_.Exception.Message))"
}

# Start loom relay if available on Windows PATH
$loom = Get-Command loom -ErrorAction SilentlyContinue
if ($loom) {
  Write-Host "`nStarting Windows-host loom relay on 0.0.0.0:$Port ..."
  $args = @("relay", "--host", "0.0.0.0", "--port", "$Port", "--token", $Token)
  Start-Process -FilePath $loom.Source -ArgumentList $args -WindowStyle Minimized
  Start-Sleep -Seconds 2
  try {
    $h = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 5
    Write-Host "health(host): $($h | ConvertTo-Json -Compress)"
  } catch {
    Write-Host "health(host) FAIL: $($_.Exception.Message)"
  }
} else {
  Write-Host "`nloom not on Windows PATH — install in WSL and/or add Windows loom."
  Write-Host "WSL install: curl -fsSL https://raw.githubusercontent.com/lemonbalms/Loom/main/scripts/install.sh | bash"
}

Write-Host "`n--- WSL health probe (mirrored localhost / gateway / ts) ---"
$wslCmd = @"
export LOOM_RELAY_PORT=$Port
export LOOM_RELAY_TOKEN='$Token'
export WIN_TS_IP='$TsIp'
export MAC_TS_IP='100.69.230.114'
curl -fsSL https://raw.githubusercontent.com/lemonbalms/Loom/main/docs/spikes/scripts/step0-wsl.sh | bash
"@
wsl -e bash -lc $wslCmd

Write-Host "`n=== paste back to Mac agent ==="
Write-Host "WIN_HOST=$env:COMPUTERNAME"
Write-Host "TOKEN=$Token"
Write-Host "PORT=$Port"
Write-Host "WIN_TS_IP=$TsIp"
Write-Host "Mac check: curl -m 5 http://${TsIp}:$Port/health"
