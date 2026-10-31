$ErrorActionPreference = 'Stop'
$toolRoot = $PSScriptRoot
$exe = Join-Path $toolRoot 'node_modules\electron\dist\electron.exe'
if (!(Test-Path -LiteralPath $exe)) { throw 'Chua cai Electron. Hay chay Cai dat.cmd truoc.' }
$script = Join-Path $toolRoot 'src\create-shortcut.cjs'
$process = Start-Process -FilePath $exe -ArgumentList ('"' + $script + '"') -WorkingDirectory $toolRoot -WindowStyle Hidden -Wait -PassThru
if ($process.ExitCode -ne 0) { throw 'Khong tao duoc shortcut. Kiem tra quyen ghi Desktop.' }
Write-Host 'Da tao shortcut CapCut Compilation Builder voi icon va App ID thong nhat.'
