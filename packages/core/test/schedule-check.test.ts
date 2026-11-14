import { describe, expect, test } from "bun:test"
import { Result } from "effect"
import type { Schedule } from "@opencode/schema/schedule"
import { ScheduleCheck } from "../src/schedule/check"

const shell = (input: Partial<Schedule.ShellCondition> & { run: string }) =>
  ({ type: "shell", ...input }) as Schedule.Condition
const code = (source: string) => ({ type: "code", code: source }) as Schedule.Condition

const failure = (condition: Schedule.Condition) => {
  const result = ScheduleCheck.validate(condition)
  if (!Result.isFailure(result)) throw new Error("expected the condition to be rejected")
  return result.failure
}

describe("ScheduleCheck.validate shell conditions", () => {
  test("accepts a plain command", () => {
    const result = ScheduleCheck.validate(shell({ run: "git status --porcelain" }))
    expect(Result.isSuccess(result)).toBe(true)
    if (!Result.isSuccess(result)) throw new Error("expected success")
    expect(result.success).toBeUndefined()
  })

  test("accepts one predicate and a valid regular expression", () => {
    expect(Result.isSuccess(ScheduleCheck.validate(shell({ run: "date", is: "2026-11-14" })))).toBe(true)
    expect(Result.isSuccess(ScheduleCheck.validate(shell({ run: "git log", matches: "^commit [0-9a-f]+" })))).toBe(true)
    expect(Result.isSuccess(ScheduleCheck.validate(shell({ run: "cat state.json", changes: true })))).toBe(true)
  })

  test("treats changes: false as no changes predicate, like runShell does", () => {
    // runShell only enables the changes predicate for `changes === true`, so `changes: false` must not
    // count toward the "at most one predicate" limit. This keeps validate consistent with execution.
    expect(Result.isSuccess(ScheduleCheck.validate(shell({ run: "date", is: "x", changes: false })))).toBe(true)
    expect(Result.isSuccess(ScheduleCheck.validate(shell({ run: "git log", matches: "^commit", changes: false })))).toBe(
      true,
    )
    expect(Result.isSuccess(ScheduleCheck.validate(shell({ run: "cat state.json", changes: false })))).toBe(true)
  })

  test("rejects an empty or whitespace-only command", () => {
    expect(failure(shell({ run: "" }))).toBe("A shell check needs a command")
    expect(failure(shell({ run: "   \n\t" }))).toBe("A shell check needs a command")
  })

  test("rejects more than one predicate", () => {
    expect(failure(shell({ run: "date", is: "x", matches: "y" }))).toBe("Choose at most one of is, matches or changes")
    expect(failure(shell({ run: "date", is: "x", changes: true }))).toBe(
      "Choose at most one of is, matches or changes",
    )
    expect(failure(shell({ run: "date", matches: "y", changes: true }))).toBe(
      "Choose at most one of is, matches or changes",
    )
    // `changes: false` is not a predicate (see check.ts runShell's `changes === true`), so it may coexist.
    expect(Result.isSuccess(ScheduleCheck.validate(shell({ run: "date", is: "x", changes: false })))).toBe(true)
  })

  test("rejects an invalid regular expression", () => {
    const message = failure(shell({ run: "date", matches: "(" }))
    expect(message).toContain('Invalid regular expression "("')
  })
})

describe("ScheduleCheck.validate code conditions", () => {
  test("accepts a program that calls tools statically", () => {
    const result = ScheduleCheck.validate(
      code(`const result = await tools.github.issues.list({ owner: "acme" }); return result.length > 0`),
    )
    expect(Result.isSuccess(result)).toBe(true)
    if (!Result.isSuccess(result)) throw new Error("expected success")
    expect(result.success).toBeUndefined()
  })

  test("rejects empty code", () => {
    expect(failure(code("   "))).toBe("Code cannot be empty.")
  })

  test("rejects tools that a check must not call", () => {
    expect(failure(code(`return tools.opencode.schedule_create({ when: {} })`))).toBe(
      "Tool opencode.schedule_create cannot be used inside a schedule check",
    )
    expect(failure(code(`return tools.opencode.session_move({ directory: "/tmp" })`))).toBe(
      "Tool opencode.session_move cannot be used inside a schedule check",
    )
  })

  test("rejects dynamic tool access", () => {
    const message = failure(code(`const name = "read"; return tools[name]({})`))
    expect(message).toContain("must reference tools statically")
  })

  test("rejects aliasing the tools object", () => {
    const message = failure(code(`const t = tools; return t.read({ path: "a" })`))
    expect(message).toContain("must call tools directly")
  })

  test("rejects a syntax error", () => {
    expect(failure(code(`return tools.read({`))).toContain("Code must be plain JavaScript")
  })
})

describe("ScheduleCheck.describe", () => {
  test("describes a shell condition by its command", () => {
    expect(ScheduleCheck.describe(shell({ run: "git status --porcelain" }))).toBe("git status --porcelain")
  })

  test("describes a code condition by its first non-empty line", () => {
    expect(ScheduleCheck.describe(code(`\n\n  const x = 1\n  return x`))).toBe("code (const x = 1)")

    const long = `const aVeryLongVariableName = ${"1".repeat(120)}`
    const described = ScheduleCheck.describe(code(long))
    expect(described).toBe(`code (${long.slice(0, 60)})`)
    expect(described.length).toBe("code (".length + 60 + 1)
  })

  test("falls back to plain \"code\" when the program has no visible line", () => {
    expect(ScheduleCheck.describe(code(" \n\t\n"))).toBe("code")
  })
})
