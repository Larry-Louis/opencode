/**
 * The reverse timeline is the default HUD skin; the Settings switch restores the dev skin. The
 * attribute is written before the HUD renders, so timeline code outside the component tree can
 * read it without threading the setting through every callback.
 */
export function hudReverse() {
  return (
    typeof document !== "undefined" &&
    document.documentElement.hasAttribute("data-hud") &&
    document.documentElement.getAttribute("data-hud-style") !== "dev"
  )
}
