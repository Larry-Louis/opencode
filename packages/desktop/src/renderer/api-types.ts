import type { DesktopMenuAction, DesktopZoomLevel } from "@opencode/app/desktop-menu"
import type { DesktopNativeBundle } from "@opencode/app/i18n/desktop-native"
import type { StorageSnapshot } from "../shared/ipc-transport"
import type { HudBounds } from "../shared/hud-geometry"
import type { WindowBootstrap } from "../shared/window-bootstrap"
import type {
  ClipboardImage,
  DirectoryPickerOptions,
  FatalRendererError,
  FilePickerOptions,
  PickedFiles,
  SaveFilePickerOptions,
  ServerReadyData,
  TitlebarTheme,
} from "../shared/ipc-contract"

export type ElectronAPI = {
  awaitInitialization(): Promise<ServerReadyData>
  reconnectService(signal?: AbortSignal): Promise<ServerReadyData>
  onSidecarChanged(cb: (data: ServerReadyData) => void): () => void
  readyDeepLinks(): void
  acknowledgeDeepLinks(attempt: number): void
  isFirstLaunchOnboardingPending(): Promise<boolean>
  finishFirstLaunchOnboarding(createDefaultProject: boolean): Promise<string | null>
  checkAppExists(appName: string): Promise<boolean>
  resolveAppPath(appName: string): Promise<string | null>
  /** The namespaces the preload read before the page ran; `createDesktopStorage` serves each first read from it. */
  getStorageSnapshot(): Promise<StorageSnapshot>
  storeItems(name: string): Promise<{ items: Record<string, string>; revision: number }>
  storeUpdate(name: string, insert: Record<string, string>, remove: string[]): Promise<number>
  storeClear(name: string): Promise<void>
  onStoreChanged(
    cb: (name: string, insert: Record<string, string>, remove: string[], revision: number) => void,
  ): () => void
  draftGet(key: string): Promise<string | null>
  draftSet(key: string, value: string, strict: boolean): Promise<string[]>
  draftDelete(key: string): Promise<void>
  draftBlobPut(data: ArrayBuffer): Promise<string>
  draftBlobGet(id: string): Promise<ArrayBuffer | null>
  getWindowID(): string
  getWindowBootstrap(): WindowBootstrap
  hudOpen(route: string): Promise<void>
  hudClose(): Promise<void>
  hudToggle(route?: string): Promise<void>
  hudSetBounds(bounds: HudBounds): Promise<HudBounds>
  hudResize(input: {
    start: HudBounds
    edge: "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw"
    delta: { x: number; y: number }
  }): Promise<HudBounds>
  hudResetLayout(): Promise<HudBounds>
  hudSnapToPointer(): Promise<HudBounds>
  hudReportSession(route?: string): Promise<void>
  hudGetState(): Promise<{ open: boolean; bounds?: HudBounds }>
  hudCaptureContext(screenshot: boolean): Promise<{
    note: string
    image?: { dataUrl: string; mime: string; name: string }
    window?: { app: string; title: string; bounds: HudBounds; id: number; pid: number }
    frontmost?: { app: string; title: string }
    platform: string
  }>
  hudGetWindowing(): Promise<{
    backend: "cocoa" | "win32" | "x11" | "wayland"
    clientPlacement: boolean
    controlDrag: boolean
    nativeDrag: boolean
    solid: boolean
    workspaceTransfer: boolean
  }>
  hudSetWorkspaceTransfer(enabled: boolean): Promise<void>
  onHudStateChanged(cb: (state: { open: boolean }) => void): () => void
  themeReady(): Promise<void>
  onMenuCommand(cb: (id: string) => void): () => void
  onDeepLink(cb: (delivery: { attempt: number; urls: string[] }) => void): () => void
  openDirectoryPicker(opts?: DirectoryPickerOptions): Promise<string | string[] | null>
  openFilePicker(opts?: FilePickerOptions): Promise<PickedFiles | null>
  readPickedFile(token: string, path: string): Promise<ArrayBuffer>
  releasePickedFiles(token: string): Promise<void>
  getPathForFile(file: File): string
  saveFile(opts: SaveFilePickerOptions, content: string): Promise<boolean>
  openExternal(url: string): void
  openBrowser(url: string): Promise<boolean>
  openLocalFile(url: string): void
  openPath(path: string, app?: string): Promise<string | undefined>
  revealPath(path: string): Promise<boolean>
  readClipboardImage(): Promise<ClipboardImage | null>
  writeClipboardText(text: string): Promise<void>
  getWindowFocused(): Promise<boolean>
  requestMicrophone(): Promise<boolean>
  setVoiceCallActive(active: boolean): Promise<void>
  getWindowFullscreen(): Promise<boolean>
  onWindowFullscreenChanged(cb: (fullscreen: boolean) => void): () => void
  setWindowFocus(): Promise<void>
  showWindow(): Promise<void>
  relaunch(): void
  getZoomFactor(): Promise<number>
  setZoomFactor(factor: number): Promise<void>
  getPinchZoomEnabled(): Promise<boolean>
  setPinchZoomEnabled(enabled: boolean): Promise<void>
  onPinchZoomEnabledChanged(cb: (enabled: boolean) => void): () => void
  getZoomLevel(): Promise<DesktopZoomLevel>
  setZoomLevel(level: DesktopZoomLevel): Promise<void>
  onZoomChanged(cb: (zoom: { factor: number; level: DesktopZoomLevel }) => void): () => void
  setTitlebar(theme: TitlebarTheme): Promise<void>
  setTrafficLightsPosition(position: { x: number; y: number }): Promise<void>
  runDesktopMenuAction(action: DesktopMenuAction): Promise<void>
  setBackgroundColor(color: string): Promise<void>
  exportDebugLogs(): Promise<string>
  setForceFocus(enabled: boolean): Promise<void>
  getSpellcheckEnabled(): Promise<boolean>
  setSpellcheckEnabled(enabled: boolean): Promise<void>
  recordFatalRendererError(error: FatalRendererError): Promise<void>
  setNativeTranslations(bundle: DesktopNativeBundle): Promise<void>
}
