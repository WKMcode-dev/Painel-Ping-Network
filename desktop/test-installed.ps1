$installer = Get-ChildItem ./desktop-release/*Windows*.exe | Select-Object -First 1
$destination = Join-Path $env:RUNNER_TEMP 'painel-ping-installed'
$install = Start-Process -FilePath $installer.FullName -ArgumentList "/S /D=$destination" -Wait -PassThru
if ($install.ExitCode -ne 0) { throw "Installer exited with $($install.ExitCode)" }
$app = Get-ChildItem $destination -Filter 'painel-ping-desktop.exe' -Recurse | Select-Object -First 1
if (-not $app) { throw 'Desktop executable missing after installation' }
$desktopProcess = Start-Process -FilePath $app.FullName -ArgumentList '--smoke-test' -Wait -PassThru
if ($desktopProcess.ExitCode -ne 0) { throw "Desktop exited with $($desktopProcess.ExitCode)" }
