/**
 * Blue Topaz：shell 命令行分词器
 * 从注入版 bluetopaz.js 移植为纯函数，供 Solid 渲染使用。
 * 只处理以 "$ " 开头的命令行；其他行原样输出。
 */

export type ShellToken = { cls: string | null; text: string }

const KEYWORDS = new Set(
  (
    "if then else elif fi for while until do done case esac in function select time " +
    "return exit true false local export readonly unset shift trap alias source"
  ).split(" "),
)

const TOK = {
  prompt: "bt-tok-prompt",
  cmd: "bt-tok-cmd",
  kw: "bt-tok-kw",
  str: "bt-tok-str",
  variable: "bt-tok-var",
  flag: "bt-tok-flag",
  comment: "bt-tok-comment",
  op: "bt-tok-op",
} as const

function tokenizeLine(line: string): ShellToken[] {
  const out: ShellToken[] = []
  let i = 0
  let expectCmd = true
  const push = (cls: string | null, t: string) => {
    if (t) out.push({ cls, text: t })
  }
  if (/^\$\s?/.test(line)) {
    push(TOK.prompt, line.slice(0, 2))
    i = 2
  }
  while (i < line.length) {
    const ch = line[i]
    if (ch === '"' || ch === "'") {
      const q = ch
      let j = i + 1
      while (j < line.length) {
        if (line[j] === "\\" && q === '"') j += 2
        else if (line[j] === q) { j++; break }
        else j++
      }
      push(TOK.str, line.slice(i, j))
      i = j
      expectCmd = false
      continue
    }
    if (ch === "#" && (i === 0 || /\s/.test(line[i - 1]))) {
      push(TOK.comment, line.slice(i))
      break
    }
    const vm = /^\$(?:\{[^}]*\}|[A-Za-z_?@#!*][A-Za-z0-9_]*)/.exec(line.slice(i))
    if (vm) { push(TOK.variable, vm[0]); i += vm[0].length; expectCmd = false; continue }
    const om = /^(2>&1|&&|\|\||;;|>>|>&|[|;<>()&])/.exec(line.slice(i))
    if (om) { push(TOK.op, om[0]); i += om[0].length; expectCmd = true; continue }
    if (ch === "-" && /(^|[\s=])$/.test(line.slice(0, i))) {
      const fm = /^-{1,2}[A-Za-z][\w-]*/.exec(line.slice(i))
      if (fm) { push(TOK.flag, fm[0]); i += fm[0].length; expectCmd = false; continue }
    }
    const wm = /^[^\s"'#;$|<>&()]+/.exec(line.slice(i))
    if (wm) {
      const w = wm[0]
      if (KEYWORDS.has(w)) push(TOK.kw, w)
      else if (expectCmd) { push(TOK.cmd, w); expectCmd = false }
      else push(null, w)
      i += w.length
      continue
    }
    push(null, ch)
    i++
  }
  return out
}

/** 把整段文本按行拆解，命令行分词、其余行原样。返回渲染用的 token 序列（含换行）。 */
export function tokenizeShellText(text: string): Array<{ cls: string | null; text: string }> {
  const out: Array<{ cls: string | null; text: string }> = []
  const lines = text.split("\n")
  for (let k = 0; k < lines.length; k++) {
    const line = lines[k]
    if (/^\s*\$\s/.test(line)) {
      out.push(...tokenizeLine(line.trim()).map(t => ({ cls: t.cls, text: t.text })))
    } else if (line) {
      out.push({ cls: null, text: line })
    }
    if (k < lines.length - 1) out.push({ cls: null, text: "\n" })
  }
  return out
}
