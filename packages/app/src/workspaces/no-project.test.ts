import { describe, expect, test } from "bun:test"
import { isNoProjectDirectory, noProjectPath, setNoProjectDirectory } from "./no-project"

describe("noProjectPath", () => {
  test("puts the shared folder beside the default location", () => {
    expect(noProjectPath("C:\\Users\\larry\\AppData\\Local\\Temp")).toBe(
      "C:\\Users\\larry\\AppData\\Local\\Temp\\opencode-no-project",
    )
    expect(noProjectPath("/home/larry/projects/")).toBe("/home/larry/projects/opencode-no-project")
  })
})

describe("isNoProjectDirectory", () => {
  // A restored session has not asked for the server location yet, so only the folder name is known.
  test("recognizes the shared folder before its full path is loaded", () => {
    setNoProjectDirectory(undefined)

    expect(isNoProjectDirectory("C:\\Users\\larry\\AppData\\Local\\Temp\\opencode-no-project")).toBe(true)
    expect(isNoProjectDirectory("/home/larry/projects/opencode-no-project/")).toBe(true)
    expect(isNoProjectDirectory("/home/larry/projects/alpha")).toBe(false)
    expect(isNoProjectDirectory(undefined)).toBe(false)
  })

  test("uses the exact path once it is known", () => {
    setNoProjectDirectory(noProjectPath("/srv/agent"))

    expect(isNoProjectDirectory("/srv/agent/opencode-no-project")).toBe(true)
    expect(isNoProjectDirectory("/srv/agent")).toBe(false)
    expect(isNoProjectDirectory("/elsewhere/opencode-no-project")).toBe(false)
  })
})
