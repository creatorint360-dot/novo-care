Set-Location C:\novo-staff
$expected = [ordered]@{
  'lib\rbac.js' = 'dd422dfe808a49d3e881012383274cbcbff4ec5b665da32400ee4553bb8975a5'
  'api\me.js' = '796d2b1c80980415e455d502c6f80961cb69c78e9890abf81d16c8c92d9503a4'
  'api\backups.js' = '08ec02dd8b22ba816961ed190f661eb6a7550b7ced3aebf401b07367624d9b8f'
  'schema.sql' = 'a6518f2516160820b8dcfdca3966fa60c8425b8e45182a548a046e558bdeeadf'
  'least_privilege.sql' = '123c650955697c75758593529a6f0ddf33023e13bff10595f4d47046560d95d3'
  'public\sw.js' = '3e5d5f28d00bc5898868dc25272b44cc8b8c3853d718d56e39c8cc8c04e8f537'
  'public\style.css' = '40423cee7e24ab4d966970b8f0422c145beb1a7892cb880e4c2976df5912e3f3'
  'public\app.js' = 'a4656765a4e3fa5fdbfcb4c46d102ac20dff647c0e8a027d519aba7cdb538571'
}
$bad = 0
foreach ($name in $expected.Keys) {
  if (-not (Test-Path $name)) { Write-Host "MISSING   $name" -ForegroundColor Red; $bad++; continue }
  $got = (Get-FileHash $name -Algorithm SHA256).Hash.ToLower()
  if ($got -eq $expected[$name]) { Write-Host "OK        $name" -ForegroundColor Green }
  else { Write-Host "DIFFERENT $name" -ForegroundColor Red; $bad++ }
}
if ($bad -eq 0) { Write-Host "ALL $($expected.Count) FILES ARE EXACT" -ForegroundColor Green } else { Write-Host "$bad file(s) need fixing" -ForegroundColor Red }
