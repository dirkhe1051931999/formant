$ErrorActionPreference = 'Stop'
$runKey = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Software\Microsoft\Windows\CurrentVersion\Run', $true)
if ($runKey) {
    try { $runKey.DeleteValue('CopyFolderPathHotkey', $false) } finally { $runKey.Close() }
}
Get-CimInstance Win32_Process -Filter "name = 'CopyFolderPath.exe'" |
    Where-Object { $_.CommandLine -like '*--hotkey*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
@(
    'Software\Classes\Directory\shell\CopyFolderPath',
    'Software\Classes\*\shell\CopyFilePath'
) | ForEach-Object {
    [Microsoft.Win32.Registry]::CurrentUser.DeleteSubKeyTree($_, $false)
}
Write-Host '已移除右键菜单和快捷键。'
