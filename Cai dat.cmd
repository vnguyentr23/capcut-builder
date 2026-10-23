@echo off
setlocal
cd /d "%~dp0"
call npm.cmd ci --no-audit --no-fund
if errorlevel 1 goto failed
call node "node_modules\electron\install.js"
if errorlevel 1 goto failed
echo Da cai dat. Mo Khoi dong.cmd de chay.
pause
exit /b 0
:failed
echo Cai dat that bai. Kiem tra Node.js va ket noi Internet.
pause
exit /b 1
