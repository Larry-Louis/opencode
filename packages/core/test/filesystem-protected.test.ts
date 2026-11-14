import { describe, expect, test } from "bun:test"
import os from "os"
import path from "path"
import { Protected } from "../src/filesystem/protected"

describe("Protected.isHome", () => {
  test("accepts the home directory with or without a trailing separator", () => {
    expect(Protected.isHome(os.homedir())).toBe(true)
    expect(Protected.isHome(os.homedir() + path.sep)).toBe(true)
  })

  test("rejects a directory inside or above home", () => {
    expect(Protected.isHome(path.join(os.homedir(), "repo"))).toBe(false)
    expect(Protected.isHome(path.dirname(os.homedir()))).toBe(false)
  })

  test("resolves relative input before comparing", () => {
    expect(Protected.isHome(".")).toBe(false)
    expect(Protected.isHome("")).toBe(false)
  })
})

describe("Protected.names", () => {
  test("lists the home subdirectories to skip for this platform", () => {
    const names = Protected.names()

    if (process.platform === "win32") {
      expect(names.has("AppData")).toBe(true)
      expect(names.has("Desktop")).toBe(true)
      expect(names.has("Downloads")).toBe(true)
      expect(names.has("Documents")).toBe(true)
    } else if (process.platform === "darwin") {
      expect(names.has("Library")).toBe(true)
      expect(names.has("Desktop")).toBe(true)
      expect(names.has("Downloads")).toBe(true)
    } else {
      expect(names.size).toBe(0)
    }
  })

  test("returns a fresh set so callers cannot corrupt the list", () => {
    const first = Protected.names()
    const size = first.size
    first.add("Injected")

    const second = Protected.names()
    expect(second.has("Injected")).toBe(false)
    expect(second.size).toBe(size)
  })
})
