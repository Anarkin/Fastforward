@echo off
setlocal
set "folders=%*"
set "FASTFORWARD_EXE=%~dp0..\Fastforward.exe"
if /i "%~1"=="--term" goto terminal
if not defined folders set "folders=."
set "FASTFORWARD_ARGS=-- %folders%"
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -Command "Start-Process -FilePath $env:FASTFORWARD_EXE -ArgumentList $env:FASTFORWARD_ARGS"
exit /b

:terminal
set "folders=%folders:*--term=%"
if not defined folders set "folders=."
start "" /wait "%FASTFORWARD_EXE%" --term -- %folders%
