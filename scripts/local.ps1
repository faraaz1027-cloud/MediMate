param(
  [ValidateSet('Mongo','Initialize','Server','TaskWorker','CheckTelegram')][string]$Mode='Server',
  [ValidateRange(1024,65535)][int]$Port=1499,
  [ValidateRange(1024,65535)][int]$MongoPort=27028,
  [switch]$EnableTelegram,
  [string]$TelegramEnvFile='server/.env.telegram.local'
)
$ErrorActionPreference='Stop'
Set-Location -LiteralPath (Split-Path $PSScriptRoot -Parent)
if ($Mode -eq 'Mongo') {
  $command=Get-Command mongod -ErrorAction SilentlyContinue
  $binary=if ($env:MONGOMS_SYSTEM_BINARY) {$env:MONGOMS_SYSTEM_BINARY} elseif ($command) {$command.Source} else {''}
  if (-not $binary -or -not (Test-Path -LiteralPath $binary)) {throw 'Install MongoDB or set MONGOMS_SYSTEM_BINARY to its mongod executable.'}
  $dataName=if($MongoPort -eq 27028){'.local-data/mongo'}else{".local-data/mongo-$MongoPort"}
  $data=Join-Path (Get-Location).Path $dataName
  New-Item -ItemType Directory -Force -Path $data | Out-Null
  & $binary --dbpath $data --port $MongoPort --replSet assignment03 --bind_ip 127.0.0.1
  exit $LASTEXITCODE
}
$node=(Get-Command node -ErrorAction Stop).Source
$env:MEDIMATE_MONGO_PORT=[string]$MongoPort
if ($Mode -eq 'Initialize') {& $node verification/assignment03-init-replica.mjs; exit $LASTEXITCODE}
if ($Mode -eq 'Server' -and -not (Test-Path -LiteralPath 'client/dist/index.html')) {throw 'Run npm ci and npm run build first.'}
if ($Mode -eq 'TaskWorker' -and -not $EnableTelegram) {throw 'TaskWorker needs explicit -EnableTelegram and a private Telegram environment file.'}
if ($Mode -eq 'CheckTelegram') {
  & $node scripts/local-telegram.mjs $TelegramEnvFile check
  exit $LASTEXITCODE
}
$env:PORT=[string]$Port
$env:NODE_ENV='development'
$env:HOST='127.0.0.1'
$env:SERVE_CLIENT='true'
$env:ALLOWED_ORIGINS="http://127.0.0.1:$Port"
$env:MONGODB_URI="mongodb://127.0.0.1:${MongoPort}/assignment03_device_${Port}?replicaSet=assignment03"
if ($EnableTelegram) {
  $telegramTarget=if($Mode -eq 'TaskWorker'){'worker'}else{'server'}
  & $node scripts/local-telegram.mjs $TelegramEnvFile $telegramTarget
} else {
  $env:TELEGRAM_BOT_TOKEN=''
  $env:TELEGRAM_BOT_USERNAME=''
  & $node server/index.js
}
exit $LASTEXITCODE
