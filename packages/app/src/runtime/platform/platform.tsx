import { createSimpleContext } from "@opencode/ui/context"
import type { AsyncStorage, SyncStorage } from "@solid-primitives/storage"
import type { Accessor } from "solid-js"
import type { DesktopMenuAction, DesktopZoomLevel } from "@/shell/commands/desktop-menu"
import type { DraftStore } from "@/runtime/persistence/drafts"
import type { Bridge } from "@opencode/plugin/gui/host"

type PickerPaths = string | string[] | null

type OpenDirectoryPickerOptions = { title?: string; multiple?: boolean }

type OpenAttachmentPickerOptions = {
  title?: string
  multiple?: boolean
  accept?: string[]
  extensions?: string[]
  defaultPath?: string
}

type OpenFilePathPickerOptions = { title?: string; multiple?: boolean; extensions?: string[] }

type SaveFilePickerOptions = { title?: string; defaultPath?: string }

type PlatformName = "web" | "desktop"

type DesktopOS = "macos" | "windows" | "linux"

export type HudBounds = {
  x: number
  y: number
  width: number
  height: number
}

export type HudEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw"

export type HudWindowInfo = {
  app: string
  title: string
  bounds: HudBounds
  id: number
  pid: number
}

export type HudContextCapture = {
  note: string
  image?: { dataUrl: string; mime: string; name: string }
  window?: HudWindowInfo
  frontmost?: { app: string; title: string }
  platform: string
}

export type HudWindowing = {
  backend: "cocoa" | "win32" | "x11" | "wayland"
  clientPlacement: boolean
  controlDrag: boolean
  nativeDrag: boolean
  solid: boolean
  clickThrough: boolean
  workspaceTransfer: boolean
}

/** The floating HUD's native window, exposed only by the desktop platform. */
export type HudPlatform = {
  open(route: string): Promise<void>
  close(): Promise<void>
  toggle(route?: string): Promise<void>
  setBounds(bounds: HudBounds): Promise<HudBounds>
  resize(input: { start: HudBounds; edge: HudEdge; delta: { x: number; y: number } }): Promise<HudBounds>
  resetLayout(): Promise<HudBounds>
  snapToPointer(): Promise<HudBounds>
  reportSession(route?: string): Promise<void>
  getState(): Promise<{ open: boolean; bounds?: HudBounds }>
  captureContext(screenshot: boolean): Promise<HudContextCapture>
  windowing(): Promise<HudWindowing>
  setWorkspaceTransfer(enabled: boolean): Promise<void>
  setIgnoreMouse(ignore: boolean): Promise<void>
  setFrost(enabled: boolean): Promise<void>
}

export type FatalRendererErrorLog = {
  error: string
  url: string
  version?: string
  platform: PlatformName
  os?: DesktopOS
}

type PlatformBase = {
  requestMicrophone?(): Promise<boolean>
  setVoiceCallActive?(active: boolean): Promise<void>
  /** App version */
  version?: string

  /** Open a web or mail URL in the default system application */
  openExternal(url: string): void

  /** Open an authentication page, reporting whether the browser could be launched. */
  openBrowser?(url: string): Promise<boolean>

  /** Open a local path in a local app (desktop only) */
  openPath?(path: string, app?: string): Promise<void>

  /** Open a local file URL in its default app (desktop only) */
  openLocalFile?(url: string): void

  /** Reveal a local path in the system file manager; false when the path does not exist (desktop only) */
  revealPath?(path: string): Promise<boolean>

  /** Restart the app  */
  restart(): Promise<void>

  /** Send a system notification */
  notify(title: string, description?: string, onClick?: () => void): Promise<void>

  /** Open a native attachment picker and read selected files sequentially (desktop only) */
  openAttachmentPickerDialog?<Value>(
    opts: OpenAttachmentPickerOptions,
    onFile: (file: File) => Promise<Value>,
  ): Promise<void>

  /** Open a native file picker and return the selected paths without reading the files (desktop only) */
  openFilePathPickerDialog?(opts: OpenFilePathPickerOptions): Promise<string[] | null>

  /** Resolve the native source path for a desktop File. */
  getPathForFile?(file: File): string

  /** Observe native drag cancellation that does not reach the renderer event loop. */
  onDragCancel?(callback: () => void): () => void

  /** Open a native save file dialog and write content to the selected path (desktop only) */
  saveFile?(opts: SaveFilePickerOptions, content: string): Promise<boolean>

  /** Storage mechanism, defaults to localStorage */
  storage?: (name?: string) => SyncStorage | AsyncStorage

  /** Prompt drafts, history, and their blobs. */
  draftStore?: DraftStore

  /** Fetch override */
  fetch?: typeof fetch

  /** Webview zoom level (desktop only) */
  webviewZoom?: Accessor<number>

  /** Saved interface zoom level; a pinch can move `webviewZoom` off it (desktop only) */
  zoomLevel?: Accessor<DesktopZoomLevel>

  /** Save an interface zoom level and apply it to every window (desktop only) */
  setZoomLevel?(level: DesktopZoomLevel): Promise<void>

  /** Whether the native desktop window is fullscreen */
  windowFullscreen?: Accessor<boolean>

  /** Move the native macOS traffic lights' top-left corner, in window points (desktop only) */
  setTrafficLightsPosition?(position: { x: number; y: number }): Promise<void>

  /** Get whether native pinch/Ctrl-scroll zoom gestures are enabled (desktop only) */
  getPinchZoomEnabled?(): Promise<boolean> | boolean

  /** Allow native pinch/Ctrl-scroll zoom gestures (desktop only) */
  setPinchZoomEnabled?(enabled: boolean): Promise<void> | void

  /** Get whether the native spellchecker underlines misspelled words (desktop only) */
  getSpellcheckEnabled?(): Promise<boolean>

  /** Turn the native spellchecker on or off (desktop only) */
  setSpellcheckEnabled?(enabled: boolean): Promise<void>

  /** Run a desktop-only menu action from the app chrome */
  runDesktopMenuAction?(action: DesktopMenuAction): Promise<void> | void

  /** Check if an editor app exists (desktop only) */
  checkAppExists?(appName: string): Promise<boolean>

  /** Read image from clipboard (desktop only) */
  readClipboardImage?(): Promise<File | null>

  /** Write text to the native clipboard (desktop only) */
  writeClipboardText?(text: string): Promise<void>

  /** Export collected diagnostic logs (desktop only) */
  exportDebugLogs?(): Promise<string>

  /** Force focus styles on interactive elements through desktop devtools (desktop only) */
  setForceFocus?(enabled: boolean): Promise<void>

  /** Record a fatal renderer error in platform logs (desktop only) */
  recordFatalRendererError?(error: FatalRendererErrorLog): Promise<void>

  /** GUI plugin bridge to the main-process plugin host (desktop only). */
  plugins?: Bridge

  /** The floating HUD window (desktop only). */
  hud?: HudPlatform
}

export type Platform = PlatformBase &
  (
    | { platform: "web"; os?: never; windowID?: never }
    | {
        platform: "desktop"
        os?: DesktopOS
        /** Stable platform window identity for window-scoped persistence */
        windowID: string
        openDirectoryPickerDialog(opts?: OpenDirectoryPickerOptions): Promise<PickerPaths>
      }
  )

export const { use: usePlatform, provider: PlatformProvider } = createSimpleContext({
  name: "Platform",
  init: (props: { value: Platform }) => {
    return props.value
  },
})
