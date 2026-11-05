import { app } from "electron"

type Channel = "local" | "dev" | "beta" | "prod"

const raw = import.meta.env.OPENCODE_CHANNEL

export const CHANNEL: Channel = raw === "local" || raw === "dev" || raw === "beta" || raw === "prod" ? raw : "dev"

export const VERSION = app.isPackaged ? app.getVersion() : (process.env.OPENCODE_VERSION ?? app.getVersion())

const appNames: Record<string, string> = {
  dev: "OpenCode Dev",
  beta: "OpenCode Beta",
  prod: "OpenCode",
}

// Local renderer/server mode keeps the dev application identity.
export const APP_NAME = app.isPackaged ? appNames[CHANNEL] : "OpenCode Dev"

// Blue Topaz fork: always the official identity so this build shares the installed app's userData,
// including the credentials that unlock the free models. Never run both apps at the same time.
export const APP_ID = "ai.opencode.desktop"

// Blue Topaz fork: the toast AUMID must match the AppUserModelID of the Start Menu shortcut that
// electron-builder (or scripts/dev.ts for source runs) registers, otherwise Windows cannot route a
// notification click back to the app and launches the bare ToastActivator command instead - which
// opens Electron's built-in default_app window ("To run a local app ... path-to-app").
// Packaged: electron-builder writes the shortcut with the per-channel appId (see APP_IDS in
// electron-builder.config.ts), so the runtime id has to follow the channel even though userData
// stays on the shared APP_ID above.
// Source: anchored on the dev electron.exe, whose implicit shortcut AUMID is its target path.
const packagedUserModelIds: Record<string, string> = {
  // electron-builder's resolveChannel() treats anything that is not dev/beta/prod/latest as "dev".
  local: "ai.opencode.desktop.dev",
  dev: "ai.opencode.desktop.dev",
  beta: "ai.opencode.desktop.beta",
  prod: "ai.opencode.desktop",
}
export const APP_USER_MODEL_ID = app.isPackaged ? packagedUserModelIds[CHANNEL] : process.execPath
