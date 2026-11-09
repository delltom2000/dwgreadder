$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules/vite/bin/vite.js'))) {
    throw 'Dependencies missing. Run npm install in this folder first.'
}
$localDir = Join-Path $projectRoot '.local'
New-Item -ItemType Directory -Force -Path $localDir | Out-Null
$url = 'http://127.0.0.1:5173/'
$running = $false
try { $probe = Invoke-WebRequest -Uri ($url + 'api/reader-health') -UseBasicParsing -TimeoutSec 2; $running = $probe.Content -eq 'dwg-reader' } catch { }
if (-not $running) {
    $sampleConfig = Join-Path $localDir 'sample-path.json'
    if (Test-Path -LiteralPath $sampleConfig) { $env:DWG_SAMPLE = (Get-Content -LiteralPath $sampleConfig -Raw | ConvertFrom-Json).path }
    $nodePath = (Get-Command node -ErrorAction Stop).Source
    $server = Start-Process -FilePath $nodePath -ArgumentList @('node_modules/vite/bin/vite.js', '--host', '127.0.0.1') -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $localDir 'server.log') -RedirectStandardError (Join-Path $localDir 'server-error.log')
    $server.Id | Set-Content -LiteralPath (Join-Path $localDir 'server.pid')
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        Start-Sleep -Milliseconds 500
        try { $probe = Invoke-WebRequest -Uri ($url + 'api/reader-health') -UseBasicParsing -TimeoutSec 1; if ($probe.Content -eq 'dwg-reader') { $running = $true; break } } catch { }
        if ($server.HasExited) { break }
    }
    if (-not $running) { throw 'Unable to start reader. See .local/server-error.log. Port 5173 may be in use.' }
}
Start-Process $url
Write-Host 'DWG reader opened at http://127.0.0.1:5173/'
