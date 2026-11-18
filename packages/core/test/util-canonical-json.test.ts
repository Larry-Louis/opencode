import { describe, expect, test } from "bun:test"
import type { Schema } from "effect"
import { canonicalJson } from "../src/util/canonical-json"

const json = (value: unknown) => canonicalJson(value as Schema.Json)

describe("canonicalJson", () => {
  test("serializes primitives like JSON.stringify", () => {
    expect(json(null)).toBe("null")
    expect(json(true)).toBe("true")
    expect(json(false)).toBe("false")
    expect(json(0)).toBe("0")
    expect(json(-1.5)).toBe("-1.5")
    expect(json("hello")).toBe('"hello"')
    expect(json("quote \" and \\ and \n")).toBe(JSON.stringify("quote \" and \\ and \n"))
  })

  test("sorts object keys at every depth", () => {
    expect(json({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}')
    expect(json({ z: null, y: [], x: {} })).toBe('{"x":{},"y":[],"z":null}')
  })

  test("insertion order does not change the output", () => {
    expect(json({ a: 1, b: 2 })).toBe(json({ b: 2, a: 1 }))
  })

  test("arrays keep their order and are not sorted", () => {
    expect(json([3, 1, 2])).toBe("[3,1,2]")
    expect(json([{ b: 1, a: 2 }])).toBe('[{"a":2,"b":1}]')
    expect(json([])).toBe("[]")
  })

  test("sorts keys with a plain code-unit comparison, not locale order", () => {
    // Uppercase sorts before lowercase in code-unit order, which localeCompare would not do.
    expect(json({ a: 1, A: 2 })).toBe('{"A":2,"a":1}')
    expect(json({ "10": 1, "2": 2 })).toBe('{"10":1,"2":2}')
  })

  test("nested empty containers survive the round trip", () => {
    expect(json({ b: [[], {}], a: [[]] })).toBe('{"a":[[]],"b":[[],{}]}')
  })
})
