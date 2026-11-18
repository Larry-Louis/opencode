import { useLanguage } from "@/runtime/i18n/language"
import { usePlatform } from "@/runtime/platform/platform"
import { useCurrentRoute } from "@/shell/state/layout"
import { sessionHref } from "@/shell/routes/session"
import { useCommand, type CommandOption } from "./command"

export const exportLogsCommand = { id: "logs.export" }

export const toggleHudCommand = { id: "view.toggleHud" }

export function DesktopCommands() {
  const command = useCommand()
  const language = useLanguage()
  const platform = usePlatform()
  const route = useCurrentRoute()

  command.register("desktop", () => {
    const commands: CommandOption[] = []

    if (platform.hud)
      commands.push({
        ...toggleHudCommand,
        title: language.t("command.hud.toggle"),
        category: language.t("command.category.view"),
        onSelect: () => {
          const current = route()

          void platform.hud?.toggle(
            current.type === "session" ? sessionHref(current.server, current.sessionId) : undefined,
          )
        },
      })

    if (platform.platform !== "desktop" || !platform.exportDebugLogs) return commands
    commands.push({
      ...exportLogsCommand,
      title: language.t("command.logs.export"),
      category: language.t("command.category.settings"),
      onSelect: () => void platform.exportDebugLogs?.(),
    })

    return commands
  })

  return null
}
