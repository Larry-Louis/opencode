#!/usr/bin/env bun
// Checks every locale dictionary against its English base.
//
// Two layouts exist in this repo:
//   A) <dir>/i18n/en.ts            plus <dir>/i18n/<locale>.ts   (app, ui, gui-plugins)
//   B) <dir>/i18n.ts with an inline `const en = {...}` plus <dir>/i18n/<locale>.ts
//      (packages/data/app, whose base is not exported)
//
// Usage:
//   bun script/i18n-audit.ts                 report zh and zht, exit 1 if zh has gaps
//   bun script/i18n-audit.ts --all           report every locale
//   bun script/i18n-audit.ts --locale zh,zht report specific locales
//   bun script/i18n-audit.ts --fail-on ""    never fail (report only)
//   bun script/i18n-audit.ts --json          machine-readable output
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"

const root = path.resolve(import.meta.dir, "..")
const argv = process.argv.slice(2)
const flag = (name: string) => argv.includes(`--${name}`)
const option = (name: string, fallback: string) => {
  const i = argv.indexOf(`--${name}`)
  const inline = argv.find((a) => a.startsWith(`--${name}=`))
  if (inline) return inline.slice(name.length + 3)
  if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--")) return argv[i + 1]
  return fallback
}

type Dict = { where: string; base: Record<string, unknown>; locales: Record<string, Record<string, unknown>> }

const pick = (mod: any) => mod?.dict ?? mod?.default ?? mod

// Evaluates the object literal that follows `const en = {` in a module that does not export it.
function inlineBase(file: string): Record<string, unknown> | undefined {
  const text = readFileSync(file, "utf8")
  const at = text.indexOf("const en = {")
  if (at < 0) return undefined
  const open = text.indexOf("{", at)
  let depth = 0
  for (let i = open; i < text.length; i++) {
    const c = text[i]
    if (c === "{") depth++
    else if (c === "}") {
      depth--
      if (depth === 0) return new Function(`return {${text.slice(open + 1, i)}}`)()
    }
  }
  return undefined
}

function localeFiles(dir: string, exclude: string[]): Array<[string, string]> {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts") && !exclude.includes(name))
    .map((name) => [name.replace(/\.ts$/, ""), path.join(dir, name)])
}

function findFiles(dir: string, want: (name: string) => boolean, depth: number, out: string[]) {
  if (depth > 5) return
  let entries: string[] = []
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const name of entries) {
    if (name === "node_modules" || name === "dist" || name === ".git") continue
    const full = path.join(dir, name)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) findFiles(full, want, depth + 1, out)
    else if (want(name)) out.push(full)
  }
}

async function discover(): Promise<Dict[]> {
  const out: Dict[] = []
  const roots = ["packages", "services"].map((dir) => path.join(root, dir))
  const bases: string[] = []
  for (const dir of roots) findFiles(dir, (name) => name === "en.ts", 0, bases)

  for (const full of bases) {
    const dirName = path.dirname(full)
    const locales: Record<string, Record<string, unknown>> = {}
    for (const [locale, file] of localeFiles(dirName, ["en.ts"])) locales[locale] = pick(await import(file))
    out.push({ where: path.relative(root, dirName).replaceAll("\\", "/"), base: pick(await import(full)), locales })
  }

  // Layout B: <dir>/i18n.ts with an inline base and a sibling i18n/ directory.
  const inlines: string[] = []
  for (const dir of roots) findFiles(dir, (name) => name === "i18n.ts", 0, inlines)
  for (const full of inlines) {
    const base = inlineBase(full)
    if (!base) continue
    const dirName = path.join(path.dirname(full), "i18n")
    const locales: Record<string, Record<string, unknown>> = {}
    for (const [locale, file] of localeFiles(dirName, [])) locales[locale] = pick(await import(file))
    out.push({ where: path.relative(root, path.dirname(full)).replaceAll("\\", "/"), base, locales })
  }

  return out.sort((a, b) => a.where.localeCompare(b.where))
}

const dicts = await discover()
const allLocales = [...new Set(dicts.flatMap((d) => Object.keys(d.locales)))].sort()
const reportAll = flag("all")
const locales = reportAll
  ? allLocales
  : option("locale", "zh,zht")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
const failOn = option("fail-on", "zh,zht")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)

type Row = { dict: string; locale: string; base: number; translated: number; missing: string[]; extra: string[]; same: number }
const rows: Row[] = []

for (const dict of dicts) {
  const keys = Object.keys(dict.base)
  for (const locale of locales) {
    const values = dict.locales[locale]
    if (!values) {
      rows.push({ dict: dict.where, locale, base: keys.length, translated: 0, missing: keys, extra: [], same: 0 })
      continue
    }
    const missing = keys.filter((k) => !(k in values))
    const extra = Object.keys(values).filter((k) => !(k in dict.base))
    const same = keys.filter((k) => k in values && String(values[k]) === String(dict.base[k])).length
    rows.push({ dict: dict.where, locale, base: keys.length, translated: keys.length - missing.length, missing, extra, same })
  }
}

if (flag("json")) {
  console.log(JSON.stringify({ locales, rows }, null, 2))
} else {
  const width = Math.max(...rows.map((r) => r.dict.length), 10)
  console.log(`${"dictionary".padEnd(width)}  ${locales.map((l) => l.padStart(9)).join("  ")}`)
  for (const dict of dicts) {
    const cells = locales.map((locale) => {
      const row = rows.find((r) => r.dict === dict.where && r.locale === locale)!
      if (!row.translated) return `${row.missing.length} MISS`.padStart(9)
      return `${row.missing.length}`.padStart(9)
    })
    console.log(`${dict.where.padEnd(width)}  ${cells.join("  ")}`)
  }
  const totals = locales.map((locale) => rows.filter((r) => r.locale === locale).reduce((n, r) => n + r.missing.length, 0))
  console.log(`${"missing keys".padEnd(width)}  ${totals.map((n) => `${n}`.padStart(9)).join("  ")}`)

  const extras = rows.filter((r) => r.extra.length)
  if (extras.length) {
    console.log("\nKeys present in a locale but absent from the base (stale):")
    for (const row of extras) console.log(`  ${row.dict} ${row.locale}: ${row.extra.join(", ")}`)
  }

  const gaps = rows.filter((r) => r.missing.length && failOn.includes(r.locale))
  if (gaps.length) {
    console.log(`\nGaps in ${failOn.join(", ")}:`)
    for (const row of gaps) {
      const shown = row.missing.slice(0, 10).join(", ")
      const more = row.missing.length > 10 ? ` … +${row.missing.length - 10}` : ""
      console.log(`  ${row.dict} [${row.locale}] ${row.missing.length}: ${shown}${more}`)
    }
  }
}

const failed = rows.some((r) => r.missing.length && failOn.includes(r.locale))
if (failed) {
  if (!flag("json")) console.error(`\n${failOn.join(", ")} is incomplete (script/i18n-audit.ts).`)
  process.exit(1)
}
