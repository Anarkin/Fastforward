@echo off
setlocal
set "folders=%*"
if not defined folders set "folders=."
set "FASTFORWARD_EXE=%~dp0..\Fastforward.exe"
set "FASTFORWARD_ARGS=-- %folders%"
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -Command "Start-Process -FilePath $env:FASTFORWARD_EXE -ArgumentList $env:FASTFORWARD_ARGS"
