#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Run the full test suite: Vitest unit tests in Docker, then optional Playwright E2E.

.PARAMETER Unit
  Run only unit/action tests (default: true).

.PARAMETER E2E
  Also run Playwright E2E tests against the running app container.

.PARAMETER AppUrl
  Base URL for E2E tests. Defaults to http://localhost:3000.

.EXAMPLE
  .\run-tests.ps1                   # unit tests only
  .\run-tests.ps1 -E2E              # unit + E2E
  .\run-tests.ps1 -E2E -AppUrl http://localhost:3001
#>
param(
  [switch]$Unit = $true,
  [switch]$E2E,
  [string]$AppUrl = "http://localhost:3000"
)

$ErrorActionPreference = "Stop"

# ── Unit tests ────────────────────────────────────────────────────────────────
if ($Unit) {
  Write-Host "`n=== Running Vitest unit tests in Docker ===" -ForegroundColor Cyan

  docker compose -f docker-compose.test.yml build unit-tests
  if ($LASTEXITCODE -ne 0) { Write-Error "Docker build failed"; exit 1 }

  docker compose -f docker-compose.test.yml up --abort-on-container-exit --exit-code-from unit-tests
  $unitExit = $LASTEXITCODE

  docker compose -f docker-compose.test.yml down -v 2>$null

  if ($unitExit -ne 0) {
    Write-Host "`nUnit tests FAILED (exit $unitExit)" -ForegroundColor Red
    exit $unitExit
  }

  Write-Host "`nUnit tests PASSED" -ForegroundColor Green
}

# ── E2E tests ─────────────────────────────────────────────────────────────────
if ($E2E) {
  Write-Host "`n=== Running Playwright E2E tests against $AppUrl ===" -ForegroundColor Cyan

  # Verify the app is reachable
  try {
    $resp = Invoke-WebRequest -Uri "$AppUrl/api/health" -UseBasicParsing -TimeoutSec 10
    Write-Host "App is healthy (HTTP $($resp.StatusCode))" -ForegroundColor DarkGray
  } catch {
    Write-Error "App at $AppUrl is not reachable. Start the app first with: docker compose up -d"
    exit 1
  }

  $env:BASE_URL = $AppUrl
  npx playwright test --reporter=list
  $e2eExit = $LASTEXITCODE

  if ($e2eExit -ne 0) {
    Write-Host "`nE2E tests FAILED (exit $e2eExit)" -ForegroundColor Red
    exit $e2eExit
  }

  Write-Host "`nE2E tests PASSED" -ForegroundColor Green
}

Write-Host "`nAll tests passed." -ForegroundColor Green
