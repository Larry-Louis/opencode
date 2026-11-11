import { desktopCapturer, screen, systemPreferences } from "electron"
import type { HudBounds } from "../../shared/hud-geometry"

/** What the HUD can tell the model about the screen it floats over. */
export type HudCapture = {
  /** A model-facing sentence about the capture; empty when there is nothing to say. */
  readonly note: string
  readonly image?: {
    readonly dataUrl: string
    readonly mime: string
    readonly name: string
  }
}

const MAX_CAPTURE_WIDTH = 1_280

const JPEG_QUALITY = 80

/**
 * Captures the display under the HUD. Electron has no cross-platform "window below" API, so the
 * display is the honest unit: a screenshot carries far more context than a window title and needs
 * no native helper. The bar itself is part of the capture; the note tells the model to ignore it.
 */
export async function captureHudContext(bounds: HudBounds): Promise<HudCapture> {
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

    if (!source || source.thumbnail.isEmpty())
      return { note: "The display behind the HUD could not be captured." }

    const jpeg = source.thumbnail.toJPEG(JPEG_QUALITY)

    if (!jpeg.length) return { note: "The display behind the HUD could not be captured." }

    return {
      note: "A screenshot of the display behind the HUD, captured when the HUD was last focused, is attached. The floating HUD bar may appear in it; ignore the bar and read the app behind it.",
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
