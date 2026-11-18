import { createContext, useContext, type ParentProps } from "solid-js"

// The same session screen renders in the app shell and in the floating HUD. This context is the
// only difference the screen needs to know about: HUD mode hides the desktop chrome (side dock,
// bottom dock, review toggle and the window drag region) without changing the session or composer.
const HudMode = createContext(false)

export function HudModeProvider(props: ParentProps) {
  return <HudMode.Provider value={true}>{props.children}</HudMode.Provider>
}

export function useHudMode() {
  return useContext(HudMode)
}
