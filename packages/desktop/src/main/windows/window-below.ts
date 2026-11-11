import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { Option, Schema } from "effect"
import type { HudBounds } from "../../shared/hud-geometry"

const run = promisify(execFile)

export type WindowInfo = {
  readonly app: string
  readonly title: string
  readonly bounds: HudBounds
  readonly id: number
  readonly pid: number
}

export type WindowBelow = {
  window: WindowInfo | null
  frontmost: { app: string; title: string } | null
  platform: string
  note?: string
}

const MAX_LIST_BYTES = 1_000_000

// Every platform provider answers with this shape; parsing at the I/O boundary
// keeps untyped JSON out of the picking logic.
const RawWindow = Schema.Struct({
  id: Schema.optional(Schema.NullOr(Schema.Number)),
  pid: Schema.optional(Schema.NullOr(Schema.Number)),
  app: Schema.optional(Schema.NullOr(Schema.String)),
  title: Schema.optional(Schema.NullOr(Schema.String)),
  x: Schema.optional(Schema.NullOr(Schema.Number)),
  y: Schema.optional(Schema.NullOr(Schema.Number)),
  width: Schema.optional(Schema.NullOr(Schema.Number)),
  height: Schema.optional(Schema.NullOr(Schema.Number)),
})

type RawWindow = Schema.Schema.Type<typeof RawWindow>

const WindowsPayload = Schema.fromJsonString(Schema.Union([Schema.Array(RawWindow), RawWindow]))

export function pickWindowBelow(windows: readonly WindowInfo[], selfPid: number, selfTitle: string) {
  const others = windows.filter((window) => window.pid !== selfPid && window.title !== selfTitle)
  const named = others.find((window) => window.title.length > 0) ?? others[0]
  const frontmost = named ? { app: named.app, title: named.title } : null
  const selfIndex = windows.findIndex((window) => window.pid === selfPid || window.title === selfTitle)
  const selfBounds = selfIndex === -1 ? null : windows[selfIndex].bounds
  const behind = selfIndex === -1 ? others : windows.slice(selfIndex + 1).filter((window) => window.pid !== selfPid)

  const below =
    (selfBounds ? behind.find((window) => overlaps(window.bounds, selfBounds)) : undefined) ?? behind[0] ?? null

  return { below, frontmost }
}

function overlaps(a: HudBounds, b: HudBounds) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

function toWindow(raw: RawWindow): WindowInfo[] {
  const title = raw.title ?? ""
  const app = raw.app || "unknown"

  if (!title && app === "unknown") return []

  return [
    {
      app,
      title,
      bounds: { x: raw.x ?? 0, y: raw.y ?? 0, width: raw.width ?? 0, height: raw.height ?? 0 },
      id: raw.id ?? 0,
      pid: raw.pid ?? 0,
    },
  ]
}

function windowsFromJson(stdout: string): WindowInfo[] {
  const parsed = Option.getOrUndefined(Schema.decodeUnknownOption(WindowsPayload)(stdout))

  if (!parsed) return []

  return (Array.isArray(parsed) ? parsed : [parsed]).flatMap(toWindow)
}

// Windows: top-level windows in z-order via GetTopWindow/GetWindow(GW_HWNDNEXT). One
// PowerShell process per read; HUD refresh happens on focus, not per frame.
const WINDOWS_SCRIPT = String.raw`
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class HudWin {
  [DllImport("user32.dll")] public static extern IntPtr GetTopWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr hWnd, uint uCmd);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
"@
$procNames = @{}
Get-Process -ErrorAction SilentlyContinue | ForEach-Object { $procNames[$_.Id] = $_.ProcessName }
$list = New-Object System.Collections.ArrayList
$h = [HudWin]::GetTopWindow([IntPtr]::Zero)
while ($h -ne [IntPtr]::Zero) {
  if ([HudWin]::IsWindowVisible($h)) {
    $len = [HudWin]::GetWindowTextLength($h)
    $title = ''
    if ($len -gt 0) {
      $sb = New-Object System.Text.StringBuilder ($len + 1)
      [void][HudWin]::GetWindowText($h, $sb, $sb.Capacity)
      $title = $sb.ToString()
    }
    $rect = New-Object HudWin+RECT
    [void][HudWin]::GetWindowRect($h, [ref]$rect)
    $pidValue = 0
    [void][HudWin]::GetWindowThreadProcessId($h, [ref]$pidValue)
    if ($rect.Left -gt -30000 -and $rect.Right -gt $rect.Left + 1 -and $rect.Bottom -gt $rect.Top + 1) {
      [void]$list.Add([pscustomobject]@{
        id = $h.ToInt64()
        pid = [int]$pidValue
        app = [string]$procNames[[int]$pidValue]
        title = $title
        x = $rect.Left
        y = $rect.Top
        width = $rect.Right - $rect.Left
        height = $rect.Bottom - $rect.Top
      })
    }
  }
  $h = [HudWin]::GetWindow($h, 2)
}
if ($list.Count -eq 0) { '[]' } else { $list | ConvertTo-Json -Compress }
`

async function windowsList(): Promise<WindowInfo[]> {
  const encoded = Buffer.from(WINDOWS_SCRIPT, "utf16le").toString("base64")

  const { stdout } = await run(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
    { timeout: 5_000, maxBuffer: MAX_LIST_BYTES, windowsHide: true },
  )

  return windowsFromJson(stdout)
}

const RawHyprlandWindow = Schema.Struct({
  address: Schema.optional(Schema.NullOr(Schema.String)),
  pid: Schema.optional(Schema.NullOr(Schema.Number)),
  class: Schema.optional(Schema.NullOr(Schema.String)),
  title: Schema.optional(Schema.NullOr(Schema.String)),
  at: Schema.optional(Schema.Array(Schema.Number)),
  size: Schema.optional(Schema.Array(Schema.Number)),
  mapped: Schema.optional(Schema.Boolean),
  hidden: Schema.optional(Schema.Boolean),
})

const HyprlandPayload = Schema.fromJsonString(Schema.Array(RawHyprlandWindow))

async function hyprlandList(): Promise<WindowInfo[]> {
  const { stdout } = await run("hyprctl", ["clients", "-j"], { timeout: 3_000, maxBuffer: MAX_LIST_BYTES })
  const parsed = Option.getOrUndefined(Schema.decodeUnknownOption(HyprlandPayload)(stdout))

  if (!parsed) return []

  return parsed.flatMap((value) => {
    if (value.mapped === false || value.hidden === true) return []
    const at = value.at ?? []
    const size = value.size ?? []

    return [
      {
        app: value.class || "unknown",
        title: value.title ?? "",
        bounds: { x: at[0] ?? 0, y: at[1] ?? 0, width: size[0] ?? 0, height: size[1] ?? 0 },
        id: Number.parseInt((value.address ?? "").replace(/^0x/i, ""), 16) || 0,
        pid: value.pid ?? 0,
      },
    ]
  })
}

const XWINDOW = /^\s*(0x[0-9a-f]+)\s+"([^"]*)":\s+\("([^"]*)",?\s+"?([^")]*)"?\)\s+(\d+)x(\d+)\+(-?\d+)\+(-?\d+)/i

async function x11List(): Promise<WindowInfo[]> {
  const [stacking, tree] = await Promise.all([
    run("xprop", ["-root", "_NET_CLIENT_LIST_STACKING"], { timeout: 3_000, maxBuffer: MAX_LIST_BYTES }),
    run("xwininfo", ["-root", "-tree"], { timeout: 3_000, maxBuffer: MAX_LIST_BYTES }),
  ])

  const ids = [...stacking.stdout.matchAll(/0x[0-9a-f]+/gi)].map((match) => match[0].toLowerCase()).reverse()
  const info = new Map<string, WindowInfo>()

  for (const line of tree.stdout.split(/\r?\n/)) {
    const match = XWINDOW.exec(line)

    if (!match) continue
    const id = match[1].toLowerCase()
    info.set(id, {
      app: match[4] || match[3] || "unknown",
      title: match[2],
      bounds: { x: Number(match[7]), y: Number(match[8]), width: Number(match[5]), height: Number(match[6]) },
      id: Number.parseInt(id, 16),
      pid: 0,
    })
  }

  if (!ids.length) return [...info.values()]

  return ids.flatMap((id) => info.get(id) ?? [])
}

async function macList(): Promise<WindowInfo[]> {
  const script = `
ObjC.import('CoreGraphics');
const info = $.CGWindowListCopyWindowInfo(1 | 16, 0);
const list = ObjC.deepUnwrap(info) || [];
JSON.stringify(list.map(function (w) {
  const bounds = w.kCGWindowBounds || {};
  return {
    id: w.kCGWindowNumber || 0,
    pid: w.kCGWindowOwnerPID || 0,
    app: w.kCGWindowOwnerName || 'unknown',
    title: w.kCGWindowName || '',
    x: bounds.X || 0,
    y: bounds.Y || 0,
    width: bounds.Width || 0,
    height: bounds.Height || 0
  };
}))`

  const { stdout } = await run("osascript", ["-l", "JavaScript", "-e", script], {
    timeout: 4_000,
    maxBuffer: MAX_LIST_BYTES,
  })

  return windowsFromJson(stdout)
}

let cached: { readonly key: string; readonly at: number; readonly result: WindowBelow } | undefined

/**
 * Metadata-only description of the window under the HUD, never pixels. Each
 * platform has its own z-order source; where one cannot answer, `note` says why
 * and the HUD still has its screen capture.
 */
export async function readWindowBelow(bounds: HudBounds, selfTitle = "OpenCode HUD"): Promise<WindowBelow> {
  const key = `${bounds.x},${bounds.y},${bounds.width},${bounds.height}`

  if (cached && cached.key === key && Date.now() - cached.at < 1_500) return cached.result

  let windows: WindowInfo[] = []
  let note: string | undefined

  try {
    if (process.platform === "win32") windows = await windowsList()
    else if (process.platform === "darwin") windows = await macList()
    else if (process.env.HYPRLAND_INSTANCE_SIGNATURE) windows = await hyprlandList()
    else if (process.env.DISPLAY) windows = await x11List()
    else note = "This Wayland session does not expose other applications' windows."
  } catch (error) {
    note =
      process.platform === "linux" && !process.env.DISPLAY
        ? "This Wayland session does not expose other applications' windows."
        : `Window enumeration failed: ${error instanceof Error ? error.message : "unknown error"}`
  }

  const { below, frontmost } = pickWindowBelow(windows, process.pid, selfTitle)
  // A compositor that hides the HUD from its own list leaves no self marker; the
  // first named non-self window is still the best useful answer.
  const candidates = windows.filter((window) => window.pid !== process.pid && window.title !== selfTitle)
  const fallback = candidates.find((window) => window.title.length > 0) ?? candidates[0]

  const result: WindowBelow = {
    window: below ?? fallback ?? null,
    frontmost,
    platform: process.platform,
  }

  if (note) result.note = note

  cached = { key, at: Date.now(), result }

  return result
}

export function resetWindowBelowCache() {
  cached = undefined
}
