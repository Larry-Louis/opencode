import { createContext, useContext, type ParentProps } from "solid-js"

// The same session screen renders in the app shell and in the floating HUD. This context is the
// only difference the screen needs to know about: HUD mode hides the desktop chrome (side dock,
// bottom dock, review toggle and the window drag region) without changing the session or composer.
const HudMode = createContext(false)

// The HUD has two complete skins: the reverse timeline of this branch and the dev branch's
// classic bottom-anchored layout. Components inside the HUD read this to pick their half.
const HudReverse = createContext(false)

export function HudModeProvider(props: ParentProps<{ reverse?: boolean }>) {
  return (
    <HudMode.Provider value={true}>
      <HudReverse.Provider value={props.reverse ?? true}>{props.children}</HudReverse.Provider>
    </HudMode.Provider>
  )
}

export function useHudMode() {
  return useContext(HudMode)
}

/** True only inside a HUD that uses the reverse (look-down-the-list) skin. */
export function useHudReverse() {
  return useContext(HudReverse)
}
