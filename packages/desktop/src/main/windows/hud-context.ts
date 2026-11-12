import { desktopCapturer, screen, systemPreferences } from "electron"
import type { HudBounds } from "../../shared/hud-geometry"
import { readWindowBelow, type WindowInfo } from "./window-below"

/** What the HUD can tell the model about the app and screen it floats over. */
export type HudCapture = {
  /** A model-facing sentence about the window and capture; empty when there is nothing to say. */
  note: string
  image?: {
    dataUrl: string
    mime: string
    name: string
  }
  window?: WindowInfo
  frontmost?: { app: string; title: string }
  platform: string
}

const MAX_CAPTURE_WIDTH = 1_280

const JPEG_QUALITY = 80

type ScreenCapture = Pick<HudCapture, "image"> & { readonly note?: string }

/**
 * Metadata and, when the user opted in, pixels for the display under the HUD.
 * Window identity comes from the platform enumerator; the screenshot is the
 * fallback that works everywhere and carries far more context than a title.
 */
export async function captureHudContext(bounds: HudBounds, screenshot: boolean): Promise<HudCapture> {
  const [below, captured] = await Promise.all([
    readWindowBelow(bounds),
    screenshot ? captureScreen(bounds) : Promise.resolve(undefined),
  ])

  const window = below.window
  const parts: string[] = []

  if (window) {
    parts.push(
      window.title && window.title !== window.app
        ? `The HUD is over ${window.app} — "${window.title}".`
        : `The HUD is over ${window.app}.`,
    )
  } else if (below.frontmost) {
    parts.push(`The frontmost other app is ${below.frontmost.app}.`)
  }

  if (below.note) parts.push(below.note)

  if (captured?.note) parts.push(captured.note)

  const result: HudCapture = { note: parts.join(" "), platform: below.platform }

  if (captured?.image) result.image = captured.image

  if (window) result.window = window

  if (below.frontmost) result.frontmost = below.frontmost

  return result
}

async function captureScreen(bounds: HudBounds): Promise<ScreenCapture> {
  if (process.platform === "darwin") {
    const status = systemPreferences.getMediaAccessStatus("screen")

    if (status === "denied" || status === "restricted")
      return { note: "Screen capture is unavailable because macOS screen-recording permission is not granted." }
  }

  const display = screen.getDisplayMatching(bounds)
  const scale = Math.min(1, MAX_CAPTURE_WIDTH / Math.max(1, display.size.width))

  const thumbnailSize = {
    width: Math.max(1, Math.round(display.size.width * scale)),
    height: Math.max(1, Math.round(display.size.height * scale)),
  }

  try {
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize,
      fetchWindowIcons: false,
    })

    // display_id is not populated on every compositor; the first source is the fallback.
    const source = sources.find((item) => item.display_id === String(display.id)) ?? sources[0]

    if (!source || source.thumbnail.isEmpty()) return { note: "The display behind the HUD could not be captured." }

    const jpeg = source.thumbnail.toJPEG(JPEG_QUALITY)

    if (!jpeg.length) return { note: "The display behind the HUD could not be captured." }

    return {
      note: "A screenshot of that display, captured when the HUD was last focused, is attached. The floating HUD bar may appear in it; ignore the bar and read the app behind it.",
      image: {
        dataUrl: `data:image/jpeg;base64,${jpeg.toString("base64")}`,
        mime: "image/jpeg",
        name: "hud-screen.jpg",
      },
    }
  } catch (error) {
    console.warn("[hud] screen capture failed", error)

    return { note: "Screen capture failed; the display behind the HUD could not be read." }
  }
}
