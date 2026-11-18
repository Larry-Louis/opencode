import { app } from "electron"
import { Predicate } from "effect"
import { windowBootstrapArgument, type WindowBootstrap } from "../../shared/window-bootstrap"
import { FIRST_LAUNCH_ONBOARDING_COMPLETE_KEY } from "../storage/keys"
import { getStore } from "../storage/store"

// The settings store is already in memory when a window is created, so the renderer gets the
// answers its shell gate would otherwise ask for over IPC. A fresh install has no onboarding
// decision yet; the renderer asks once the layers have made one.
export function windowBootstrap(
  id: string,
  options?: { kind?: "main" | "hud"; route?: string },
): WindowBootstrap {
  // The HUD only exists for an existing session: it never runs onboarding and needs its route
  // before it boots instead of restoring a remembered URL.
  if (options?.kind === "hud")
    return {
      id,
      kind: "hud",
      firstLaunchPending: false,
      packaged: app.isPackaged,
      initialRoute: options.route,
    }

  const complete = getStore().get(FIRST_LAUNCH_ONBOARDING_COMPLETE_KEY)

  return {
    id,
    firstLaunchPending: Predicate.isBoolean(complete) ? !complete : undefined,
    packaged: app.isPackaged,
  }
}

export function windowArguments(id: string, options?: { kind?: "main" | "hud"; route?: string }) {
  return [windowBootstrapArgument(windowBootstrap(id, options))]
}
