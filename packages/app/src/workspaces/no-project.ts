import { createSignal } from "solid-js"
import { pathKey } from "./path-key"

/**
 * Sessions started without a project still need a working directory, so they all run in one dedicated folder instead of
 * a temporary path. The sidebar lists them last, under a group of their own.
 */
const noProjectFolder = "opencode-no-project"

const [noProjectDirectory, setNoProjectDirectory] = createSignal<string>()

export { noProjectDirectory, setNoProjectDirectory }

export function noProjectPath(base: string) {
  const trimmed = base.replace(/[\\/]+$/, "")
  const separator = trimmed.includes("\\") ? "\\" : "/"

  return `${trimmed}${separator}${noProjectFolder}`
}

/** The folder sits beside the directory sessions default to, so it survives temp cleanup. */
export function loadNoProjectDirectory(location: () => Promise<{ directory: string }>) {
  void location()
    .then((value) => setNoProjectDirectory(noProjectPath(value.directory)))
    .catch(() => undefined)
}

export function isNoProjectDirectory(directory: string | undefined) {
  if (!directory) return false

  const target = noProjectDirectory()

  // The full path only arrives once a new-session dialog asks for the server location, so sessions restored on
  // startup would show the shared folder by name until then. Fall back to the fixed folder name while it is unknown;
  // the exact path still decides once known, in case a real project happens to use the same name.
  if (target) return pathKey(directory) === pathKey(target)

  return directory.replace(/[\\/]+$/, "").split(/[\\/]/).filter(Boolean).at(-1) === noProjectFolder
}
