Set-Location C:\novo-staff-mobile
$expected = [ordered]@{
  'src\config.js' = '2d06dcadd484278b7dd73db69895a7fef7441612839021676308490be7a197fe'
  'src\api.js' = 'd74eff6ffe1a68332ccf58b506f6d2b728aabae7b13fb6987a08570bccc288fc'
  'src\ui.js' = 'f9465df2b8441409845070477fbfcd1c18b525a3727092371406b6240660be04'
  'App.js' = '4f5883f9aa57d421870f41e28a9da54828e4f9a575885dbcb8bfe0d07e6cae1e'
  'src\screens.js' = 'b8ea0b7cae64df2ce6eccedf520ac797d779d92e009b468b2f15380ef7daae66'
}
$bad = 0
foreach ($name in $expected.Keys) {
  if (-not (Test-Path $name)) { Write-Host "MISSING   $name" -ForegroundColor Red; $bad++; continue }
  $got = (Get-FileHash $name -Algorithm SHA256).Hash.ToLower()
  if ($got -eq $expected[$name]) { Write-Host "OK        $name" -ForegroundColor Green }
  else { Write-Host "DIFFERENT $name" -ForegroundColor Red; $bad++ }
}
if ($bad -eq 0) { Write-Host "ALL $($expected.Count) FILES ARE EXACT" -ForegroundColor Green } else { Write-Host "$bad file(s) need fixing" -ForegroundColor Red }
