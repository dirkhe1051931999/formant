$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ForegroundWindow {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}
'@
$foreground = [ForegroundWindow]::GetForegroundWindow().ToInt64()
$shell = New-Object -ComObject Shell.Application
$paths = New-Object System.Collections.Generic.List[string]
foreach ($window in $shell.Windows()) {
    try {
        if ([int64]$window.HWND -ne $foreground) { continue }
        foreach ($item in $window.Document.SelectedItems()) {
            if ($item.Path) { $paths.Add([string]$item.Path) }
        }
        break
    } catch { continue }
}
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
foreach ($path in $paths) { [Console]::WriteLine($path) }
