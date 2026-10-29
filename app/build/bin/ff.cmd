@echo off
setlocal
set folders=%*
if not defined folders set "folders=."
set "FASTFORWARD_EXE=%~dp0..\Fastforward.exe"
set FASTFORWARD_ARGS=-- %folders:\"=\."%
set "FASTFORWARD_CWD=%CD%"
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -Command "$app = New-Object Diagnostics.ProcessStartInfo $env:FASTFORWARD_EXE, $env:FASTFORWARD_ARGS; $app.WorkingDirectory = $env:FASTFORWARD_CWD; $app.UseShellExecute = $true; [void][Diagnostics.Process]::Start($app)"
