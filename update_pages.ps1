param(
  [string]$Message = "Update conveyors site"
)

# ---- Config: set your project path ----
$PROJECT = "C:\Users\asalron\Desktop\Conveyance-Project"

# ---- Checks ----
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Host "ERROR: Git is not installed or not on PATH." -ForegroundColor Red
  exit 1
}
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
  Write-Host "ERROR: Python is not installed or not on PATH." -ForegroundColor Red
  exit 1
}

Set-Location $PROJECT

# ---- 1) Export latest data to JSON ----
Write-Host "Running export_json.py ..." -ForegroundColor Cyan
python export_json.py
if ($LASTEXITCODE -ne 0) {
  Write-Host "ERROR: export_json.py failed." -ForegroundColor Red
  exit 1
}

# ---- 2) Stage files to commit ----
Write-Host "Staging changes ..." -ForegroundColor Cyan
git add docs/data/conveyors.json
git add docs/index.html   # always stage HTML too

# ---- 3) Commit only if there are staged changes ----
$changes = git status --porcelain
if (-not $changes) {
  Write-Host "No changes to commit." -ForegroundColor Yellow
  exit 0
}

$stamp = (Get-Date).ToString("yyyy-MM-dd HH:mm")
$fullMsg = "$Message ($stamp)"
Write-Host "Committing: $fullMsg" -ForegroundColor Cyan
git commit -m "$fullMsg"

# ---- 4) Push to GitHub ----
Write-Host "Pushing to origin ..." -ForegroundColor Cyan
git push

Write-Host "Done. Hard-refresh your Pages site." -ForegroundColor Green
