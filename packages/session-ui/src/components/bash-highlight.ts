/**
 * Blue Topaz：shell 命令行分词器
 * 从注入版 bluetopaz.js 移植为纯函数，供 Solid 渲染使用。
 *
 * 支持：
 * - "$ " 开头的命令行分词（prompt/cmd/kw/str/var/flag/op/comment）
 * - 跨行字符串：引号未闭合时后续行继续按字符串染色
 * - 其他行原样输出
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

/** 分词状态：跨行携带未闭合的引号信息 */
interface LineState {
  quote: string | null
}

/** 单行分词。state.quote 非空时从字符串续体开始；返回 tokens 并更新 state */
function tokenizeLine(line: string, state: LineState): ShellToken[] {
  const out: ShellToken[] = []
  let i = 0
  let expectCmd = true
  const push = (cls: string | null, t: string) => {
    if (t) out.push({ cls, text: t })
  }

  // 上一行遗留的未闭合引号：本行开头是字符串续体
  if (state.quote) {
    const q = state.quote
    let j = -1
    for (let x = 0; x < line.length; x++) {
      if (line[x] === "\\" && q === '"') { x++; continue }
      if (line[x] === q) { j = x; break }
    }
    if (j >= 0) { push(TOK.str, line.slice(0, j + 1)); i = j + 1; state.quote = null }
    else { push(TOK.str, line); return out } // 整行仍在字符串内
  }

  while (i < line.length) {
    const ch = line[i]

    // 字符串
    if (ch === '"' || ch === "'") {
      const q = ch
      let j = i + 1
      let closed = false
      while (j < line.length) {
        if (line[j] === "\\" && q === '"') { j += 2; continue }
        if (line[j] === q) { j++; closed = true; break }
        j++
      }
      push(TOK.str, line.slice(i, closed ? j : line.length))
      i = closed ? j : line.length
      if (!closed) state.quote = q // 未闭合→跨行携带
      expectCmd = false
      continue
    }

    // 注释到行尾
    if (ch === "#" && (i === 0 || /\s/.test(line[i - 1]))) {
      push(TOK.comment, line.slice(i))
      break
    }

    // 变量 $VAR ${..} $? 等
    const vm = /^\$(?:\{[^}]*\}|[A-Za-z_?@#!*][A-Za-z0-9_]*)/.exec(line.slice(i))
    if (vm) { push(TOK.variable, vm[0]); i += vm[0].length; expectCmd = false; continue }

    // 运算符
    const om = /^(2>&1|&&|\|\||;;|>>|>&|[|;<>()&])/.exec(line.slice(i))
    if (om) { push(TOK.op, om[0]); i += om[0].length; expectCmd = true; continue }

    // flag --xx / -x
    if (ch === "-" && /(^|[\s=])$/.test(line.slice(0, i))) {
      const fm = /^-{1,2}[A-Za-z][\w-]*/.exec(line.slice(i))
      if (fm) { push(TOK.flag, fm[0]); i += fm[0].length; expectCmd = false; continue }
    }

    // 词
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

/** 命令行起始检测 */
function isCommandStart(raw: string): boolean {
  return /^\s*\$\s/.test(raw)
}

/** 提取纯命令文本（剥提示符） */
function commandBody(raw: string): string {
  return raw.replace(/^\s*\$\s*/, "").trim()
}

/**
 * 把整段文本按行拆解，命令行分词、其余行原样。
 * 跨行字符串正确延续染色。返回渲染用的 token 序列（含换行）。
 */
export function tokenizeShellText(text: string): Array<{ cls: string | null; text: string }> {
  const out: Array<{ cls: string | null; text: string }> = []
  const lines = text.split("\n")
  const state: LineState = { quote: null }

  for (let k = 0; k < lines.length; k++) {
    const raw = lines[k]
    if (isCommandStart(raw)) {
      out.push({ cls: TOK.prompt, text: "$ " })
      out.push(...tokenizeLine(commandBody(raw), state).map(t => ({ cls: t.cls, text: t.text })))
    } else if (state.quote) {
      // 上一行遗留的未闭合引号延续到本行
      out.push(...tokenizeLine(raw, state).map(t => ({ cls: t.cls, text: t.text })))
    } else if (raw) {
      out.push({ cls: null, text: raw })
    }
    if (k < lines.length - 1) out.push({ cls: null, text: "\n" })
  }
  return out
}
