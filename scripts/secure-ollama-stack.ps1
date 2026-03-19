param(
    [string]$Host = "72.62.169.135",
    [string]$User = "root",
    [string]$Model = "llama3.2:latest",
    [string]$RenderServiceId = "srv-d6tg9i7diees73curoc0"
)

$hardenScriptPath = Join-Path $PSScriptRoot "harden-ollama-proxy.sh"
$renderScriptPath = Join-Path $PSScriptRoot "render-maintenance.mjs"

if (-not (Test-Path $hardenScriptPath)) {
    throw "No se encontró el script de hardening: $hardenScriptPath"
}

if (-not (Test-Path $renderScriptPath)) {
    throw "No se encontró el script de Render: $renderScriptPath"
}

$sshTarget = "$User@$Host"
$scriptContent = Get-Content $hardenScriptPath -Raw

Write-Host "Aplicando hardening de Ollama en $sshTarget..."
$output = $scriptContent | ssh $sshTarget "PUBLIC_HOST='$Host' OLLAMA_MODEL='$Model' bash -s --"
$output | ForEach-Object { Write-Host $_ }

$jsonLine = ($output | Select-Object -Last 1)
$config = $jsonLine | ConvertFrom-Json

if (-not $env:RENDER_API_KEY) {
    Write-Warning "No existe RENDER_API_KEY en el entorno. El VPS quedó protegido, pero debes sincronizar Render manualmente."
    Write-Host "OLLAMA_HOST=$($config.ollamaHost)"
    Write-Host "OLLAMA_API_KEY=$($config.ollamaApiKey)"
    Write-Host "OLLAMA_MODEL=$($config.ollamaModel)"
    return
}

$env:RENDER_SERVICE_ID = $RenderServiceId
& node $renderScriptPath set-ollama-connection --host $config.ollamaHost --api-key $config.ollamaApiKey --model $config.ollamaModel
