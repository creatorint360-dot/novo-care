Set-Location C:\novo-staff-mobile
$expected = [ordered]@{
  'src\ui.js' = 'b447b31c9fd4f59e6a3f17905a20884037e66eec1aa229a5f2b8707dda501a95'
  'App.js' = '21991aa75d082410884b000ea7860316253329420c30f1037921838c5f1b0eb2'
  'scripts\prepare-build.js' = '529f7c47a376637e33572b5b406018166eaeea7ea9ae2b46f3422b13549ca286'
}
$bad = 0
foreach ($name in $expected.Keys) {
  if (-not (Test-Path $name)) { Write-Host "MISSING   $name" -ForegroundColor Red; $bad++; continue }
  $got = (Get-FileHash $name -Algorithm SHA256).Hash.ToLower()
  if ($got -eq $expected[$name]) { Write-Host "OK        $name" -ForegroundColor Green }
  else { Write-Host "DIFFERENT $name" -ForegroundColor Red; $bad++ }
}
if ($bad -eq 0) { Write-Host "ALL $($expected.Count) FILES ARE EXACT" -ForegroundColor Green } else { Write-Host "$bad file(s) need fixing" -ForegroundColor Red }
