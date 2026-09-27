param([string]$NodePath = (Get-Command node -ErrorAction Stop).Source)
$ErrorActionPreference = 'Stop'
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { throw 'Offline verification requires an Administrator PowerShell to create temporary per-program firewall rules. No rules were changed.' }
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$nodeBinary = (Resolve-Path -LiteralPath $NodePath).Path
Set-Location -LiteralPath $workspace
$bareBinary = & $nodeBinary -e 'console.log(require("bare-runtime")())'
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $bareBinary)) { throw 'QVAC Bare runtime is missing. Run npm ci first.' }
if (-not (Test-Path -LiteralPath 'dist/server/index.js')) { throw 'Build first with npm run build.' }
try { $null = Invoke-WebRequest 'http://127.0.0.1:4317/api/status' -TimeoutSec 2; throw 'Stop NoteDrill before running this test.' } catch { if ($_.Exception.Message -eq 'Stop NoteDrill before running this test.') { throw } }
$group = 'NoteDrill-offline-' + [guid]::NewGuid().ToString()
$server = $null
try {
  # Scope the restriction to these exact binaries, preserving IPv4 and IPv6 loopback.
  $external = @('0.0.0.0-126.255.255.255','128.0.0.0-255.255.255.255','::2-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff')
  foreach ($binary in @($nodeBinary, $bareBinary)) {
    New-NetFirewallRule -DisplayName $group -Group $group -Direction Outbound -Action Block -Program $binary -RemoteAddress $external -Profile Any | Out-Null
  }
  if ((Get-NetFirewallRule -Group $group | Measure-Object).Count -ne 2) { throw 'Both runtime firewall rules must be active.' }
  & $nodeBinary -e 'fetch("https://example.com", {signal:AbortSignal.timeout(5000)}).then(()=>process.exit(1)).catch(()=>process.exit(0))'
  if ($LASTEXITCODE -ne 0) { throw 'External Node access remains available; isolation did not take effect.' }
  New-Item -ItemType Directory -Force '.local' | Out-Null
  $server = Start-Process -FilePath $nodeBinary -ArgumentList 'dist/server/index.js' -WorkingDirectory $workspace -WindowStyle Hidden -PassThru -RedirectStandardOutput '.local/offline-server.log' -RedirectStandardError '.local/offline-server-error.log'
  $ready = $false
  for ($i=0; $i -lt 30; $i++) {
    try { $null = Invoke-WebRequest 'http://127.0.0.1:4317/api/status' -TimeoutSec 2; $ready = $true; break } catch { Start-Sleep -Milliseconds 500 }
  }
  if (-not $ready) { throw 'Production server did not start on loopback.' }
  & $nodeBinary scripts/api-live.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Offline quiz verification failed.' }
  Write-Output 'Offline production startup and fresh QVAC quiz passed with Node and Bare external traffic blocked.'
} finally {
  if ($server -and -not $server.HasExited) {
    try { Invoke-RestMethod 'http://127.0.0.1:4317/api/release' -Method Post -Headers @{'X-NoteDrill'='local';'Origin'='http://127.0.0.1:4317'} -ContentType 'application/json' -Body '{}' | Out-Null } catch {}
    Stop-Process -Id $server.Id -ErrorAction SilentlyContinue
  }
  Get-NetFirewallRule -Group $group -ErrorAction SilentlyContinue | Remove-NetFirewallRule
}
