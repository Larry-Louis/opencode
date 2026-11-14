import { For, Show, createMemo, createSignal } from "solid-js"
import { createStore } from "solid-js/store"
import { useNavigate, useParams } from "@solidjs/router"
import type { SessionInfo } from "@opencode/client/promise"
import { displayName } from "@opencode/ui/project-avatar"
import { Menu } from "@opencode/ui/menu"
import { useServer } from "@/runtime/server/current"
import type { Project } from "@/runtime/server/types"
import { sessionHref } from "@/shell/routes/session"
import { ProjectIcon } from "@/shell/layout/project-icon"
import { useSessionTabAvatarState } from "@/shell/layout/project-avatar-state"
import { sessionLabel } from "@/session/title"
import { useTabs } from "@/shell/tabs/tabs"
import { useLanguage } from "@/runtime/i18n/language"

const SESSION_LIMIT = 24

/**
 * The normal window's project sidebar, pinned to its icon rail: project avatars on the right
 * edge, never wider than the rail. Each avatar opens that project's recent sessions, with a
 * new conversation as the first row, so switching projects never grows the bar.
 */
export function HudRail() {
  const server = useServer()
  const language = useLanguage()
  const params = useParams<{ id: string }>()
  const navigate = useNavigate()
  const tabs = useTabs()

  const sessionId = () => params.id ?? ""

  const current = createMemo(() => {
    const info = server.ctx.data.session.get(sessionId())

    return info ? server.ctx.projects.forSession(info) : undefined
  })

  // The same avatar state the main window's tab rail uses: a pulsing ring while the
  // session works, a warning ring while it waits on the user.
  const avatar = useSessionTabAvatarState(
    () => server.key,
    sessionId,
    () => true,
  )
  const status = () => (avatar.attention() ? "attention" : avatar.loading() ? "busy" : undefined)

  // The rail keeps its last populated list while the server reloads, so navigation never
  // collapses the bar to nothing mid-session.
  const projects = createMemo<Project[]>((previous) => {
    const used = server.ctx.projects.used()
    const active = current()

    // A session opened by URL can belong to a project this client has not used yet.
    if (active && !used.some((project) => project.id === active.id)) return [active, ...used]

    if (used.length > 0) return used

    if (previous.length > 0) return previous

    return active ? [active] : []
  }, [])

  const [state, setState] = createStore<{
    sessions: Record<string, SessionInfo[]>
    pending: Record<string, boolean>
    failed: Record<string, boolean>
  }>({ sessions: {}, pending: {}, failed: {} })

  // A click on another project switches straight to its newest session, like
  // the normal window's icon rail. The session menu belongs to the project
  // already on screen, where switching needs a choice.
  const [openFor, setOpenFor] = createSignal<string>()
  const [switching, setSwitching] = createSignal<string>()

  const load = (project: Project) => {
    const id = project.id

    if (state.sessions[id] || state.pending[id]) return

    setState("pending", id, true)
    setState("failed", id, false)

    void server.ctx.sdk.api.session
      .list({ project: id, limit: SESSION_LIMIT, order: "desc", parentID: null, archived: false })
      .then((response) => setState("sessions", id, response.data))
      .catch(() => setState("failed", id, true))
      .finally(() => setState("pending", id, false))
  }

  const open = (session: SessionInfo) => {
    server.ctx.projects.touch(session.location.directory)
    navigate(sessionHref(server.key, session.id))
  }

  const start = (project: Project) => {
    server.ctx.projects.touch(project.worktree)
    void tabs.newDraft({ server: server.key, directory: project.worktree })
  }

  const switchTo = (project: Project) => {
    const known = state.sessions[project.id]?.[0]

    if (known) return open(known)

    if (switching()) return

    setSwitching(project.id)

    void server.ctx.sdk.api.session
      .list({ project: project.id, limit: 1, order: "desc", parentID: null, archived: false })
      .then((response) => {
        const session = response.data[0]

        if (session) return open(session)

        // Nothing to switch to: show the project's menu so the new-conversation
        // row is still reachable.
        setOpenFor(project.id)
        load(project)
      })
      .catch(() => {
        setOpenFor(project.id)
        load(project)
      })
      .finally(() => setSwitching(undefined))
  }

  return (
    <Show when={projects().length > 0}>
      <aside
        data-hud-rail
        data-slot="hud-project-rail"
        aria-label={language.t("hud.rail.projects")}
      >
        <div data-slot="hud-project-rail-list">
          <For each={projects()}>
            {(project) => {
              const active = () => current()?.id === project.id
              const sessions = () => state.sessions[project.id]

              return (
                <Menu
                  appearance="standard"
                  modal={false}
                  placement="left-start"
                  gutter={8}
                  open={openFor() === project.id}
                  onOpenChange={(open) => {
                    if (!open) return setOpenFor(undefined)

                    // The menu already opened for this project (a project with no sessions
                    // opens it from switchTo); opening again would re-run the switch.
                    if (openFor() === project.id) return

                    if (!active()) return switchTo(project)

                    setOpenFor(project.id)
                    load(project)
                  }}
                >
                  <Menu.Trigger
                    as="button"
                    type="button"
                    data-hud-project
                    data-active={active() ? "" : undefined}
                    data-status={active() ? status() : undefined}
                    data-pending={switching() === project.id ? "" : undefined}
                    aria-label={displayName(project)}
                    title={displayName(project)}
                  >
                    <ProjectIcon project={project} style={{ width: "20px", height: "20px" }} />
                  </Menu.Trigger>
                  <Menu.Portal>
                    <Menu.Content class="max-w-80 min-w-56" data-slot="hud-project-menu">
                      <Menu.Group>
                        <Menu.GroupLabel>{displayName(project)}</Menu.GroupLabel>
                        <Menu.Item data-slot="hud-project-new" onSelect={() => start(project)}>
                          {language.t("command.session.new")}
                        </Menu.Item>
                        <Show when={sessions()}>
                          {(list) => (
                            <For each={list()}>
                              {(session) => (
                                <Menu.Item
                                  data-slot="hud-project-session"
                                  data-active={session.id === params.id ? "" : undefined}
                                  onSelect={() => open(session)}
                                >
                                  <span class="min-w-0 flex-1 truncate">{sessionLabel(session)}</span>
                                </Menu.Item>
                              )}
                            </For>
                          )}
                        </Show>
                      </Menu.Group>
                    </Menu.Content>
                  </Menu.Portal>
                </Menu>
              )
            }}
          </For>
        </div>
      </aside>
    </Show>
  )
}
