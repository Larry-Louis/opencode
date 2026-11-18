import { describe, expect, test } from "bun:test"
import { match } from "../src/util/wildcard"

describe("Wildcard.match", () => {
  test("matches a whole string, not a substring", () => {
    expect(match("notes.txt", "*.txt")).toBe(true)
    expect(match("notes.txt.bak", "*.txt")).toBe(false)
    expect(match("my-notes.txt", "notes.txt")).toBe(false)
  })

  test("normalizes backslashes in both the input and the pattern", () => {
    expect(match("src\\util\\wildcard.ts", "src/util/*.ts")).toBe(true)
    expect(match("src/util/wildcard.ts", "src\\util\\*.ts")).toBe(true)
    expect(match("src/util/wildcard.js", "src/util/*.ts")).toBe(false)
  })

  test("a question mark matches exactly one character", () => {
    expect(match("a.ts", "?.ts")).toBe(true)
    expect(match("ab.ts", "?.ts")).toBe(false)
    expect(match(".ts", "?.ts")).toBe(false)
  })

  test("treats regular-expression metacharacters in the pattern literally", () => {
    expect(match("file(1).txt", "file(1).txt")).toBe(true)
    expect(match("file1.txt", "file(1).txt")).toBe(false)
    expect(match("a+b", "a+b")).toBe(true)
    expect(match("aaab", "a+b")).toBe(false)
    expect(match("v1.2", "v1.2")).toBe(true)
    expect(match("v1x2", "v1.2")).toBe(false)
  })

  test("a trailing \" *\" also matches the text before the space", () => {
    expect(match("git commit", "git commit *")).toBe(true)
    expect(match("git commit -m message", "git commit *")).toBe(true)
    expect(match("git status", "git commit *")).toBe(false)
  })

  test("the star also crosses path separators", () => {
    expect(match("src/util/wildcard.ts", "*.ts")).toBe(true)
    expect(match("src/util/wildcard.ts", "src/*.ts")).toBe(true)
  })

  test("an empty input only matches a pattern that allows it", () => {
    expect(match("", "*")).toBe(true)
    expect(match("", "*.ts")).toBe(false)
  })

  test("matching is case-insensitive only on Windows", () => {
    expect(match("README.MD", "readme.md")).toBe(process.platform === "win32")
  })
})
