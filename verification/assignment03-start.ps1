param([ValidateSet(1499, 1205, 1212)][int]$Port = 1499)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path $PSScriptRoot -Parent)
$node = Join-Path (Get-Location).Path '.runtime/node-v22.16.0-win-x64/node.exe'
if (-not (Test-Path -LiteralPath $node)) { throw 'Portable Node runtime is missing from .runtime.' }
$env:PORT = [string]$Port
$env:NODE_ENV = 'development'
$env:HOST = '127.0.0.1'
$env:SERVE_CLIENT = 'true'
$env:ALLOWED_ORIGINS = 'http://127.0.0.1:1499,http://127.0.0.1:1205,http://127.0.0.1:1212'
$env:MONGODB_URI = "mongodb://127.0.0.1:27028/assignment03_device_${Port}?replicaSet=assignment03"
$env:TELEGRAM_BOT_TOKEN = ''
$env:TELEGRAM_BOT_USERNAME = ''
& $node server/index.js
