@echo off
setlocal
cd /d "%~dp0"
if not exist "node_modules\electron\dist\electron.exe" (
  echo Chua co Electron. Hay chay Cai dat.cmd truoc.
  pause
  exit /b 1
)
start "" "node_modules\electron\dist\electron.exe" "."
