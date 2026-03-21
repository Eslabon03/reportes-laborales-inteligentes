param(
    [string]$VpsHost = "72.62.169.135",
    [string]$User = "root",
    [string]$Model = "llama3.2:latest"
)

$scriptPath = Join-Path $PSScriptRoot "setup-ollama-vps.sh"

if (-not (Test-Path $scriptPath)) {
    throw "No se encontró el script base: $scriptPath"
}

$scriptContent = Get-Content $scriptPath -Raw

if (-not $scriptContent.Trim()) {
    throw "El script base está vacío: $scriptPath"
}

$sshTarget = "$User@$VpsHost"

Write-Host "Ejecutando aprovisionamiento de Ollama en $sshTarget..."
$scriptContent | ssh $sshTarget "bash -s -- '$Model'"