/**
 * Whether the HUD's session is running. The session screen knows it from synced data; the frame sits above the
 * server provider, so the two meet here instead of on a data attribute the frame has to watch for.
 */
let working = false

const listeners = new Set<(value: boolean) => void>()

export function setHudWorking(value: boolean) {
  if (value === working) return
  working = value

  for (const listener of listeners) listener(value)
}

export function readHudWorking() {
  return working
}

export function subscribeHudWorking(listener: (value: boolean) => void) {
  listeners.add(listener)

  return () => listeners.delete(listener)
}
