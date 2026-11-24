import { Show } from "solid-js"
import { Portal } from "solid-js/web"
import { Menu } from "@opencode/ui/menu"
import type { MarkdownLocalFileMenuTarget } from "@opencode/session-ui/context/markdown"
import { useLanguage } from "@/runtime/i18n/language"
import { usePlatform } from "@/runtime/platform/platform"
import { showToast } from "@/shell/notifications/toast"

/** Context menu for a file path linked from a chat message. */
export function LocalFileMenu(props: {
  target: MarkdownLocalFileMenuTarget | undefined
  onOpen: (path: string) => void
  onClose: () => void
}) {
  const language = useLanguage()
  const platform = usePlatform()

  const reveal = async (path: string) => {
    try {
      const done = platform.revealPath ? await platform.revealPath(path) : false

      if (!done) throw new Error(language.t("common.requestFailed"))
    } catch (error) {
      showToast({
        variant: "error",
        title: language.t("common.requestFailed"),
        description: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return (
    <Menu
      modal={false}
      placement="bottom-start"
      gutter={2}
      open={!!props.target}
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
    >
      {/* Portaled so a transformed timeline ancestor never offsets the fixed trigger. */}
      <Portal>
        <Menu.Trigger
          as="span"
          aria-hidden="true"
          disabled
          class="pointer-events-none fixed size-px"
          style={{ left: `${props.target?.x ?? 0}px`, top: `${props.target?.y ?? 0}px` }}
        />
      </Portal>
      <Menu.Portal>
        <Menu.Content onCloseAutoFocus={(event) => event.preventDefault()}>
          <Show when={props.target?.path}>
            {(path) => (
              <>
                <Menu.Item onSelect={() => props.onOpen(path())}>{language.t("command.file.open")}</Menu.Item>
                <Show when={platform.revealPath}>
                  <Menu.Item onSelect={() => void reveal(path())}>
                    {language.t("session.header.reveal.containingFolder")}
                  </Menu.Item>
                </Show>
              </>
            )}
          </Show>
        </Menu.Content>
      </Menu.Portal>
    </Menu>
  )
}
