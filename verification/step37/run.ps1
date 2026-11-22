$ErrorActionPreference = 'Stop'
$scenarioRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
Push-Location -LiteralPath $scenarioRoot
try {
    if (-not $env:MONGOMS_SYSTEM_BINARY) {
        $cachedBinary = Join-Path (Split-Path (Split-Path $scenarioRoot -Parent) -Parent) '2026-11-01/github-plugin-github-openai-curated-remote/work/mongodb-binaries/mongod-x64-win32-7.0.24.exe'
        if (Test-Path -LiteralPath $cachedBinary) { $env:MONGOMS_SYSTEM_BINARY = $cachedBinary }
    }
    & node verification/step18/api.mjs server/test/end-to-end.test.js 2>&1 | Tee-Object -FilePath docs/evidence/step37-api.txt
    if ($LASTEXITCODE -ne 0) { throw 'The connected scenario failed. Evidence was not repackaged.' }
    & node verification/step37/record-evidence.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Evidence validation failed.' }
} finally {
    Pop-Location
}
