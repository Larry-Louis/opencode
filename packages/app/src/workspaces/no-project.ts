import { createSignal } from "solid-js"
import { pathKey } from "./path-key"

/**
 * Sessions started without a project still need a working directory, so they all run in one dedicated folder instead of
 * a temporary path. The sidebar lists them last, under a group of their own.
 */
const [noProjectDirectory, setNoProjectDirectory] = createSignal<string>()

export { noProjectDirectory, setNoProjectDirectory }

export function noProjectPath(base: string) {
  const trimmed = base.replace(/[\\/]+$/, "")
  const separator = trimmed.includes("\\") ? "\\" : "/"

  return `${trimmed}${separator}opencode-no-project`
}

/** The folder sits beside the directory sessions default to, so it survives temp cleanup. */
export function loadNoProjectDirectory(location: () => Promise<{ directory: string }>) {
  void location()
    .then((value) => setNoProjectDirectory(noProjectPath(value.directory)))
    .catch(() => undefined)
}

export function isNoProjectDirectory(directory: string | undefined) {
  const target = noProjectDirectory()

  return !!directory && !!target && pathKey(directory) === pathKey(target)
}
