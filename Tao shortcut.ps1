$ErrorActionPreference = 'Stop'
$toolRoot = $PSScriptRoot
$exe = Join-Path $toolRoot 'node_modules\electron\dist\electron.exe'
if (!(Test-Path -LiteralPath $exe)) { throw 'Chua cai Electron. Hay chay Cai dat.cmd truoc.' }
$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutFile = Join-Path $desktop 'CapCut Compilation Builder.lnk'
$wsh = New-Object -ComObject WScript.Shell
$link = $wsh.CreateShortcut($shortcutFile)
$link.TargetPath = $exe
$link.Arguments = '"' + $toolRoot + '"'
$link.WorkingDirectory = $toolRoot
$link.IconLocation = (Join-Path $toolRoot 'src\assets\app.ico') + ',0'
$link.Description = 'CapCut Compilation Builder'
$link.Save()
Write-Host "Da tao shortcut: $shortcutFile"
