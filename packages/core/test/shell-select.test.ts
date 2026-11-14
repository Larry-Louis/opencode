import { describe, expect, test } from "bun:test"
import { ShellSelect } from "../src/shell/select"

describe("ShellSelect.name", () => {
  test("returns the lowercase basename without a Windows extension", () => {
    expect(ShellSelect.name("/bin/zsh")).toBe("zsh")
    expect(ShellSelect.name("C:\\Program Files\\PowerShell\\7\\pwsh.exe")).toBe(
      process.platform === "win32" ? "pwsh" : "pwsh.exe",
    )
    expect(ShellSelect.name("BASH")).toBe("bash")
  })

  test("returns an empty name for an empty path", () => {
    expect(ShellSelect.name("")).toBe("")
  })
})

describe("ShellSelect.login", () => {
  test("marks login shells", () => {
    expect(ShellSelect.login("/bin/bash")).toBe(true)
    expect(ShellSelect.login("zsh")).toBe(true)
    expect(ShellSelect.login("sh")).toBe(true)
    expect(ShellSelect.login("fish")).toBe(true)
  })

  test("does not mark PowerShell or unknown shells", () => {
    expect(ShellSelect.login("pwsh")).toBe(false)
    expect(ShellSelect.login("powershell")).toBe(false)
    expect(ShellSelect.login("cmd")).toBe(false)
    expect(ShellSelect.login("not-a-shell")).toBe(false)
  })
})

describe("ShellSelect.ps", () => {
  test("recognizes PowerShell variants", () => {
    expect(ShellSelect.ps("powershell")).toBe(true)
    expect(ShellSelect.ps("/usr/local/bin/pwsh")).toBe(true)
  })

  test("returns false for other shells", () => {
    expect(ShellSelect.ps("bash")).toBe(false)
    expect(ShellSelect.ps("fish")).toBe(false)
    expect(ShellSelect.ps("")).toBe(false)
  })
})

describe("ShellSelect.args", () => {
  test("runs cmd through /c", () => {
    expect(ShellSelect.args("cmd", "dir /b")).toEqual(["/c", "dir /b"])
    expect(ShellSelect.args("C:\\Windows\\System32\\cmd.exe", "echo hi")).toEqual(["/c", "echo hi"])
  })

  test("runs PowerShell non-interactively", () => {
    expect(ShellSelect.args("pwsh", "Get-Date")).toEqual([
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Get-Date",
    ])
    expect(ShellSelect.args("powershell", "Get-Date")[4]).toBe("Get-Date")
  })

  test("disables zsh's no-match glob abort", () => {
    expect(ShellSelect.args("/bin/zsh", "ls *.nothing")).toEqual(["+o", "nomatch", "-c", "ls *.nothing"])
  })

  test("falls back to a plain -c invocation for other names", () => {
    expect(ShellSelect.args("bash", "echo hi")).toEqual(["-c", "echo hi"])
    expect(ShellSelect.args("sh", "echo hi")).toEqual(["-c", "echo hi"])
    expect(ShellSelect.args("fish", "echo hi")).toEqual(["-c", "echo hi"])
    expect(ShellSelect.args("unknown-shell", "")).toEqual(["-c", ""])
  })
})
