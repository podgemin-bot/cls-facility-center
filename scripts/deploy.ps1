param(
  [int]$Port = 3000,
  [switch]$Start
)
$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo
Write-Output "== Roles: project = $repo =="

# 1) production build / compile
Write-Output "== 1/4 build =="
npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw "next build failed" }

# 2) standalone static assets (not copied by next build automatically)
Write-Output "== 2/4 sync .next/static -> standalone/.next/static =="
$static = Join-Path $repo ".next\static"
$dest = Join-Path $repo ".next\standalone\.next\static"
if (Test-Path $static) {
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  Copy-Item -Recurse -Force "$static\*" $dest
  Write-Output "synced $((Get-ChildItem $dest -Recurse -File | Measure-Object).Count) asset files"
} else {
  Write-Output "no .next/static (expected only if no client assets)"
}

# 3) env for the standalone server (reads .env.production first, then .env)
Write-Output "== 3/4 env for standalone =="
$envFile = Join-Path $repo ".env.production"
if (-not (Test-Path $envFile)) { $envFile = Join-Path $repo ".env" }
if (Test-Path $envFile) {
  Copy-Item -Force $envFile (Join-Path $repo ".next\standalone\.env")
  Write-Output "env copied: $envFile"
} else {
  Write-Output "WARNING: no .env or .env.production found"
}

$dist = Join-Path $repo ".next\standalone"
Write-Output ""
Write-Output "== ready =="
Write-Output "Bundle: $dist"
Write-Output "Run :  cd `"$dist`" ; `$env:PORT=$Port ; node server.js"
Write-Output "Keep  HOSTNAME/BETTER_AUTH_URL consistent with the public URL."

if ($Start) {
  Write-Output "== starting on 0.0.0.0:$Port =="
  $env:PORT = "$Port"
  $env:HOSTNAME = "localhost"
  $env:BETTER_AUTH_URL = "http://localhost:$Port"
  $out = Join-Path $repo "deploy.out.log"
  $err = Join-Path $repo "deploy.err.log"
  Remove-Item $out, $err -ErrorAction SilentlyContinue
  $p = Start-Process -FilePath "node" -ArgumentList "server.js" -WorkingDirectory $dist -RedirectStandardOutput $out -RedirectStandardError $err -PassThru -NoNewWindow
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 1
    try { $code = (Invoke-WebRequest "http://localhost:$Port/login" -MaximumRedirection 0 -ErrorAction Stop).StatusCode; Write-Output "server up (PID $($p.Id)) on http://localhost:$Port/login -> $code"; break } catch { }
  }
  if ($p.HasExited) { Write-Output "!! server exited early - see deploy.err.log"; Get-Content $err -ErrorAction SilentlyContinue | Select-Object -Last 20 }
}