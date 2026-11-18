import { describe, expect, test } from "bun:test"
import { SessionRecentText } from "../src/session/recent-text"

const message = (value: object) => value as never

describe("SessionRecentText.kept", () => {
  test("returns the text a compaction stored", () => {
    expect(SessionRecentText.kept(message({ metadata: { recent: "hello" } }))).toBe("hello")
  })

  test("returns an empty string when the compaction carries no text", () => {
    expect(SessionRecentText.kept(message({ metadata: {} }))).toBe("")
    expect(SessionRecentText.kept(message({}))).toBe("")
  })

  test("ignores a non-string recent value", () => {
    expect(SessionRecentText.kept(message({ metadata: { recent: 42 } }))).toBe("")
  })
})

describe("SessionRecentText.messageToText", () => {
  test("renders a user message with skills and attachments", () => {
    const text = SessionRecentText.messageToText(
      message({
        type: "user",
        text: "look at this",
        skills: [{ id: "sk_1", name: "review", text: "skill body" }, { id: "sk_2", name: "silent" }],
        files: [
          { mime: "image/png", name: "shot.png", source: { type: "inline" }, data: "" },
          { mime: "text/plain", source: { type: "uri", uri: "file:///tmp/notes.txt" }, data: "" },
          { mime: "application/pdf", source: { type: "inline" }, data: "" },
        ],
      }),
    )

    expect(text).toBe(
      [
        "[Skill activated: review]",
        "skill body",
        "[User]: look at this",
        "[Attached image/png: shot.png]",
        "[Attached text/plain: file:///tmp/notes.txt]",
        "[Attached application/pdf: inline attachment]",
      ].join("\n"),
    )
  })

  test("renders an assistant message with text and tool calls, skipping reasoning", () => {
    const text = SessionRecentText.messageToText(
      message({
        type: "assistant",
        content: [
          { type: "reasoning", text: "secret thinking" },
          { type: "text", text: "first" },
          {
            type: "tool",
            name: "read",
            state: { status: "completed", input: { path: "a.ts" }, content: [{ type: "text", text: "file body" }] },
          },
          { type: "tool", name: "grep", state: { status: "running", input: { query: "x" } } },
        ],
      }),
    )

    expect(text).toBe(
      [
        "[Assistant]: first",
        '[Assistant tool call]: read({"path":"a.ts"})',
        "[Tool result]: file body",
        '[Assistant tool call]: grep({"query":"x"})',
      ].join("\n"),
    )
    expect(text).not.toContain("secret thinking")
  })

  test("renders tool errors and non-text tool content", () => {
    const text = SessionRecentText.messageToText(
      message({
        type: "assistant",
        content: [
          { type: "tool", name: "write", state: { status: "error", input: {}, error: { message: "permission denied" } } },
          {
            type: "tool",
            name: "view",
            state: {
              status: "completed",
              input: "raw input string",
              content: [
                { type: "text", text: "line" },
                { type: "file", uri: "media:abc", mime: "image/png", name: "chart.png" },
                { type: "file", uri: "media:def", mime: "image/jpeg" },
              ],
            },
          },
        ],
      }),
    )

    expect(text).toBe(
      [
        "[Assistant tool call]: write({})",
        "[Tool error]: permission denied",
        "[Assistant tool call]: view(raw input string)",
        "[Tool result]: line",
        "[Attached image/png: chart.png]",
        "[Attached image/jpeg]",
      ].join("\n"),
    )
  })

  test("renders shell output and hides background shells", () => {
    expect(
      SessionRecentText.messageToText(message({ type: "shell", command: "bun test", output: { output: "ok" } })),
    ).toBe("[Shell]: bun test\nok")
    expect(
      SessionRecentText.messageToText(
        message({ type: "shell", command: "serve", metadata: { background: true }, output: { output: "started" } }),
      ),
    ).toBe("")
    expect(SessionRecentText.messageToText(message({ type: "shell", command: "true" }))).toBe("[Shell]: true\n")
  })

  test("renders synthetic, skill and location-switch messages", () => {
    expect(SessionRecentText.messageToText(message({ type: "synthetic", text: "context" }))).toBe(
      "[Synthetic context]: context",
    )
    expect(SessionRecentText.messageToText(message({ type: "skill", name: "tdd", text: "use tests" }))).toBe(
      "[Skill activated: tdd]\nuse tests",
    )
    expect(
      SessionRecentText.messageToText(
        message({ type: "location-switched", location: { directory: "/repo/sub" } }),
      ),
    ).toBe("[User]: The working directory has been changed to /repo/sub.")
  })

  test("leaves out messages the recent part does not carry", () => {
    for (const type of [
      "compaction",
      "system",
      "agent-switched",
      "model-switched",
      "idle",
      "unknown-future-type",
    ]) {
      expect(SessionRecentText.messageToText(message({ type }))).toBe("")
    }
  })
})

describe("SessionRecentText.truncateToolOutput", () => {
  test("keeps output at the limit untouched", () => {
    const value = "a".repeat(1_250)
    expect(SessionRecentText.truncateToolOutput(value)).toBe(value)
    expect(SessionRecentText.truncateToolOutput("")).toBe("")
  })

  test("truncates one character past the limit", () => {
    const value = "a".repeat(1_251)
    const truncated = SessionRecentText.truncateToolOutput(value)

    expect(truncated).toBe("a".repeat(1_250) + "\n[truncated]")
  })

  test("never splits a surrogate pair at the boundary", () => {
    const value = "a".repeat(1_249) + "😀" + "tail"
    const truncated = SessionRecentText.truncateToolOutput(value)

    expect(truncated).toBe("a".repeat(1_249) + "😀\n[truncated]")
    expect(truncated).not.toContain("\uFFFD")
  })
})

describe("SessionRecentText.serializeToolContent", () => {
  test("joins text parts and labels attachments", () => {
    expect(
      SessionRecentText.serializeToolContent([
        { type: "text", text: "one" },
        { type: "text", text: "two" },
        { type: "file", uri: "media:a", mime: "image/png", name: "a.png" },
        { type: "file", uri: "media:b", mime: "image/webp" },
      ] as never),
    ).toBe("one\ntwo\n[Attached image/png: a.png]\n[Attached image/webp]")
  })

  test("returns an empty string for empty content", () => {
    expect(SessionRecentText.serializeToolContent([])).toBe("")
  })
})
