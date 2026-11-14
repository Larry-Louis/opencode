import { createMemo, Show } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { useServer } from "@/runtime/server/current"
import { cacheHitRate, formatTokens } from "./stats-format"

/**
 * The routed session's cumulative token usage, beside the composer. It reads the session the client
 * already syncs, so it follows a reply as it streams and never polls the server or parses the route.
 */
export function SessionTokenStats(props: { sessionID?: string }) {
  const server = useServer()
  const language = useLanguage()

  const text = createMemo(() => {
    const id = props.sessionID

    if (!id) return
    const tokens = server.ctx.data.session.get(id)?.tokens

    if (!tokens) return
    const input = formatTokens(tokens.input)
    const output = formatTokens(tokens.output)
    const cache = `${cacheHitRate(tokens)}`

    if (tokens.reasoning > 0)
      return language.t("session.stats.summaryReasoning", {
        input,
        output,
        reasoning: formatTokens(tokens.reasoning),
        cache,
      })

    return language.t("session.stats.summary", { input, output, cache })
  })

  return (
    <Show when={text()}>
      {(value) => (
        <span
          data-component="session-token-stats"
          aria-label={language.t("session.stats.label")}
          class="min-w-0 shrink truncate text-[13px] font-[440] leading-[var(--line-height-compact)] tracking-[-0.04px] tabular-nums text-v2-text-text-faint"
        >
          {value()}
        </span>
      )}
    </Show>
  )
}
