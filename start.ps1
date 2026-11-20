$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$pythonPath = Join-Path $projectRoot ".venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $pythonPath)) {
    throw "Project virtual environment not found: $pythonPath. Create .venv and install requirements.txt first."
}

Set-Location -LiteralPath $projectRoot
& $pythonPath -m uvicorn app:app --host 127.0.0.1 --port 8000
