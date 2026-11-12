import { describe, expect, test } from "bun:test"
import { directoryLabel, flattenGroups, groupTabs } from "./tab-groups"

type Tab = { id: string; directory: string }

const tab = (id: string, directory: string): Tab => ({ id, directory })

const group = (tabs: Tab[]) => groupTabs(tabs, (item) => item.directory, directoryLabel)

describe("groupTabs", () => {
  test("keeps first-appearance order of groups and tab order inside a group", () => {
    const groups = group([
      tab("a1", "/repo/alpha"),
      tab("b1", "/repo/beta"),
      tab("a2", "/repo/alpha"),
      tab("b2", "/repo/beta"),
      tab("a3", "/repo/alpha"),
    ])

    expect(groups.map((item) => item.key)).toEqual(["/repo/alpha", "/repo/beta"])
    expect(groups[0]?.tabs.map((item) => item.id)).toEqual(["a1", "a2", "a3"])
    expect(groups[1]?.tabs.map((item) => item.id)).toEqual(["b1", "b2"])
  })

  test("labels groups with the last path segment", () => {
    const groups = group([tab("a", "/repo/alpha"), tab("b", "C:\\work\\beta")])

    expect(groups.map((item) => item.label)).toEqual(["alpha", "beta"])
  })

  test("keeps tabs without a directory in their own group", () => {
    const groups = group([tab("a", ""), tab("b", "/repo/alpha"), tab("c", "")])

    expect(groups.map((item) => item.key)).toEqual(["", "/repo/alpha"])
    expect(groups[0]?.tabs.map((item) => item.id)).toEqual(["a", "c"])
  })

  test("flattenGroups returns the visual order", () => {
    const tabs = [tab("a1", "/repo/alpha"), tab("b1", "/repo/beta"), tab("a2", "/repo/alpha")]

    expect(flattenGroups(group(tabs)).map((item) => item.id)).toEqual(["a1", "a2", "b1"])
  })
})
