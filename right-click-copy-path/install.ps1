$ErrorActionPreference = 'Stop'
$toolDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$exe = Join-Path $toolDir 'CopyFolderPath.exe'
$hotkeyCommand = '"{0}" --hotkey' -f $exe
Get-CimInstance Win32_Process -Filter "name = 'CopyFolderPath.exe'" |
    Where-Object { $_.CommandLine -like '*--hotkey*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Push-Location $toolDir
try {
    go build -ldflags '-H windowsgui' -o $exe .
    if ($LASTEXITCODE -ne 0) { throw 'Go build failed.' }
} finally {
    Pop-Location
}

$menuItems = @(
    @{ Key = 'Software\Classes\Directory\shell\CopyFolderPath'; Label = '复制文件夹路径' },
    @{ Key = 'Software\Classes\*\shell\CopyFilePath'; Label = '复制文件路径' }
)
foreach ($item in $menuItems) {
    $menuKey = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($item.Key)
    try {
        $menuKey.SetValue('', $item.Label)
        $commandKey = $menuKey.CreateSubKey('command')
        try {
            $commandKey.SetValue('', ('"{0}" "%1"' -f $exe))
        } finally {
            $commandKey.Close()
        }
    } finally {
        $menuKey.Close()
    }
}
$runKey = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Software\Microsoft\Windows\CurrentVersion\Run')
try { $runKey.SetValue('CopyFolderPathHotkey', $hotkeyCommand) } finally { $runKey.Close() }
Start-Process -FilePath $exe -ArgumentList '--hotkey' -WindowStyle Hidden
Write-Host '已安装。右键文件或文件夹可复制路径；资源管理器中选中项目后按 Alt+F2 可复制多条路径。'
