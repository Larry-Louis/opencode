import { describe, expect, test } from "bun:test"
import {
  absoluteArrayColumn,
  absoluteColumn,
  directoryColumn,
  pathColumn,
  storedAbsolutePath,
} from "../src/database/path"

const isWindows = process.platform === "win32"

// The exports are drizzle column builders; building one yields the column whose
// mapToDriverValue/mapFromDriverValue run this module's conversion functions.
const build = (builder: unknown) => (builder as { build: (table: object) => { mapToDriverValue: (v: never) => string; mapFromDriverValue: (v: never) => unknown } }).build({})

describe("storedAbsolutePath", () => {
  test("accepts a POSIX absolute path unchanged", () => {
    expect(storedAbsolutePath("/repo/packages/core")).toBe("/repo/packages/core")
    expect(storedAbsolutePath("/")).toBe("/")
  })

  test("accepts a Windows drive path on every platform", () => {
    expect(storedAbsolutePath("C:/Users/larry/repo")).toBe("C:/Users/larry/repo")
    expect(storedAbsolutePath("D:/")).toBe("D:/")
  })

  test("normalizes Windows backslashes only when running on Windows", () => {
    expect(storedAbsolutePath("C:\\Users\\larry\\repo")).toBe(isWindows ? "C:/Users/larry/repo" : undefined)
  })

  test("rejects relative and empty paths", () => {
    expect(storedAbsolutePath("../repo")).toBeUndefined()
    expect(storedAbsolutePath("repo/core")).toBeUndefined()
    expect(storedAbsolutePath("")).toBeUndefined()
    expect(storedAbsolutePath("./current")).toBeUndefined()
    expect(storedAbsolutePath("C:relative")).toBeUndefined()
  })
})

describe("absoluteColumn", () => {
  test("stores an absolute path unchanged", () => {
    const column = build(absoluteColumn("path"))
    expect(column.mapToDriverValue("/repo" as never)).toBe("/repo")
    expect(column.mapFromDriverValue("/repo" as never)).toBe("/repo")
  })

  test("returns a Windows drive path in the platform form", () => {
    const column = build(absoluteColumn("path"))
    expect(column.mapFromDriverValue("C:/Users/larry" as never)).toBe(
      isWindows ? "C:\\Users\\larry" : "C:/Users/larry",
    )
  })

  test("throws when asked to convert a relative path", () => {
    const column = build(absoluteColumn("path"))
    expect(() => column.mapToDriverValue("relative" as never)).toThrow("Path is not absolute: relative")
    expect(() => column.mapFromDriverValue("relative" as never)).toThrow("Path is not absolute: relative")
  })
})

describe("directoryColumn", () => {
  test("keeps the legacy empty directory readable", () => {
    const column = build(directoryColumn("directory"))
    expect(column.mapToDriverValue("" as never)).toBe("")
    expect(column.mapFromDriverValue("" as never)).toBe("")
  })

  test("normalizes a real directory", () => {
    const column = build(directoryColumn("directory"))
    expect(column.mapToDriverValue("/repo" as never)).toBe("/repo")
    expect(() => column.mapToDriverValue("repo" as never)).toThrow("Path is not absolute: repo")
  })
})

describe("pathColumn", () => {
  test("is lenient about relative paths, unlike absoluteColumn", () => {
    const column = build(pathColumn("path"))
    expect(column.mapToDriverValue("src/index.ts" as never)).toBe("src/index.ts")
    expect(column.mapFromDriverValue("src/index.ts" as never)).toBe("src/index.ts")
  })

  test("rewrites separators only on Windows", () => {
    const column = build(pathColumn("path"))
    expect(column.mapFromDriverValue("src\\index.ts" as never)).toBe(isWindows ? "src/index.ts" : "src\\index.ts")
    expect(column.mapToDriverValue("C:\\a\\b" as never)).toBe(isWindows ? "C:/a/b" : "C:\\a\\b")
  })
})

describe("absoluteArrayColumn", () => {
  test("stores a JSON array and decodes it back", () => {
    const column = build(absoluteArrayColumn("paths"))
    const stored = column.mapToDriverValue(["/a", "/b"] as never)
    expect(stored).toBe('["/a","/b"]')
    expect(column.mapFromDriverValue(stored as never)).toEqual(["/a", "/b"])
  })

  test("fails on invalid stored JSON instead of returning a partial list", () => {
    const column = build(absoluteArrayColumn("paths"))
    expect(() => column.mapFromDriverValue("not json" as never)).toThrow()
    expect(() => column.mapFromDriverValue('["relative"]' as never)).toThrow("Path is not absolute: relative")
  })
})
