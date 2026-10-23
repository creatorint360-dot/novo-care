function Initialize-NovoDatabase {
    Set-Location C:\novo-staff
    $secretsFile = Join-Path $env:USERPROFILE "novo-staff-secrets.txt"
    if (-not (Test-Path $secretsFile)) { Write-Host "Secrets file not found: $secretsFile" -ForegroundColor Red; return }
    $secrets = @{}
    Get-Content $secretsFile | ForEach-Object { $k, $v = $_ -split '=', 2; $secrets[$k] = $v }
    foreach ($needed in 'RDS_MASTER_PASSWORD', 'NOVO_APP_PASSWORD') {
        if (-not $secrets[$needed]) { Write-Host "$needed is missing from the secrets file" -ForegroundColor Red; return }
    }

    $dbHost = (Read-Host "Paste the database endpoint (ends with .rds.amazonaws.com)").Trim()
    $dbPort = 5432
    if (-not $dbHost) { Write-Host "No endpoint entered." -ForegroundColor Red; return }

    Write-Host "1/4  Checking that your PC can reach the database..." -ForegroundColor Cyan
    $client = New-Object System.Net.Sockets.TcpClient
    $attempt = $client.BeginConnect($dbHost, $dbPort, $null, $null)
    $reached = $attempt.AsyncWaitHandle.WaitOne(10000, $false) -and $client.Connected
    $client.Close()
    if (-not $reached) {
        Write-Host "Cannot reach $dbHost on port $dbPort. Paste this message to me." -ForegroundColor Red
        return
    }
    Write-Host "     reachable." -ForegroundColor Green

    $env:DATABASE_URL = "postgres://novoadmin:" + $secrets['RDS_MASTER_PASSWORD'] + "@" + $dbHost + ":" + $dbPort + "/novostaff"

    Write-Host "2/4  Creating the tables (schema.sql)..." -ForegroundColor Cyan
    node scripts\run-sql.js schema.sql
    if ($LASTEXITCODE -ne 0) { Write-Host "schema.sql failed. Paste the message above to me." -ForegroundColor Red; return }

    Write-Host "3/4  Creating the limited account (least_privilege.sql)..." -ForegroundColor Cyan
    $env:NOVO_APP_PASSWORD = $secrets['NOVO_APP_PASSWORD']
    node scripts\run-sql.js least_privilege.sql
    $code = $LASTEXITCODE
    Remove-Item Env:NOVO_APP_PASSWORD -ErrorAction SilentlyContinue
    if ($code -ne 0) { Write-Host "least_privilege.sql failed. Paste the message above to me." -ForegroundColor Red; return }

    Write-Host "4/4  Proving it works as the LIMITED account..." -ForegroundColor Cyan
    $env:DATABASE_URL = "postgres://novostaff_app:" + $secrets['NOVO_APP_PASSWORD'] + "@" + $dbHost + ":" + $dbPort + "/novostaff"
    node scripts\check-db.js
    $env:DATABASE_URL = $null
    if ($LASTEXITCODE -eq 0) { Write-Host "DATABASE READY." -ForegroundColor Green } else { Write-Host "The final check failed. Paste the message above to me." -ForegroundColor Red }
}
Initialize-NovoDatabase
