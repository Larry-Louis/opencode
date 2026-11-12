# Blue Topaz fork - dev-only helper (invoked by scripts/dev.ts on `bun dev`).
#
# Registers a Start Menu shortcut whose target is the dev electron.exe.
# Windows derives the implicit AppUserModelID of a shortcut from its target path, so this
# shortcut is the anchor that lets Windows route toast-notification clicks back to the
# running dev instance (which calls app.setAppUserModelId(process.execPath)).
#
# Without it, clicking a notification launches the bare ToastActivator command Electron
# registered (electron.exe with no app path), and Electron opens its built-in default_app
# window: "To run a local app, execute the following on the command line: ... path-to-app".

param(
  [Parameter(Mandatory = $true)][string]$ElectronPath,
  [Parameter(Mandatory = $true)][string]$AppDir,
  [string]$DisplayName = "OpenCode Dev",
  # Distinct per checkout so two source trees (different electron versions) keep two anchors.
  [string]$ShortcutName = "OpenCode Dev (source)"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $ElectronPath)) { throw "electron.exe not found: $ElectronPath" }
if (-not (Test-Path -LiteralPath $AppDir)) { throw "app dir not found: $AppDir" }

$programs = [Environment]::GetFolderPath("Programs")
$lnkPath = Join-Path $programs ("{0}.lnk" -f $ShortcutName)

$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut($lnkPath)
$lnk.TargetPath = $ElectronPath
$lnk.Arguments = '"{0}"' -f $AppDir
$lnk.WorkingDirectory = $AppDir
$lnk.Description = "OpenCode Dev (source run) - toast activation anchor"
$icon = Join-Path $AppDir "resources\icons\icon.ico"
if (Test-Path -LiteralPath $icon) { $lnk.IconLocation = $icon }
$lnk.Save()

# Let the notification header show the app name instead of the electron.exe path.
# An AUMID stores backslashes as forward slashes (Windows does the same for path AUMIDs),
# hence the .NET registry API instead of New-Item (PowerShell would split on "/").
$key = "Software\Classes\AppUserModelId\" + ($ElectronPath -replace '\\', '/')
$base = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($key)
$base.SetValue("DisplayName", $DisplayName, [Microsoft.Win32.RegistryValueKind]::String)
$base.Close()

Write-Output "toast anchor shortcut : $lnkPath"
Write-Output "app user model id     : $ElectronPath"
