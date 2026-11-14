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
import { sessionStatus } from "@/shell/layout/project-avatar-state"
import { sessionLabel } from "@/session/title"
import { useTabs } from "@/shell/tabs/tabs"
import { useLanguage } from "@/runtime/i18n/language"
import { projectSettingsKey, useSettings } from "@/settings/model"
import { useDirectoryPicker } from "@/workspaces/selection/picker"

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
  const settings = useSettings()
  const pickDirectory = useDirectoryPicker()

  const current = createMemo(() => {
    const info = server.ctx.data.session.get(sessionId())

    return info ? server.ctx.projects.forSession(info) : undefined
  })

  // A row stands for a project, not one session, so it reports the strongest state among that
  // project's sessions with the same order the main window's compact tab rail uses: waiting on
  // the user, then working, then a finished run you have not read, then a failed one. The open
  // session alone would hide work happening in a sibling session of the same project.
  const rank = { input: 4, running: 3, unread: 2, failed: 1 } as const
  const projectStatus = (project: Project) => {
    const ctx = server.ctx
    const autoApprove = settings.permissions.autoApproves(projectSettingsKey(ctx.sdk.scope, project.id))
    let best: { status: keyof typeof rank; rank: number } | undefined

    for (const session of ctx.data.session.list()) {
      if (session.projectID !== project.id) continue

      const status = sessionStatus(ctx, session.id, { root: false, autoApprove, snapshot: session })
      if (status === "idle") continue

      const value = rank[status]
      if (!best || value > best.rank) best = { status, rank: value }
    }

    return best?.status
  }
  const status = (project: Project) => {
    const value = projectStatus(project)

    return value === "input" ? "attention" : value === "running" ? "busy" : value
  }

  const addProject = () =>
    pickDirectory({
      server: server.conn,
      title: language.t("command.project.open"),
      multiple: true,
      onSelect: (result) => {
        const directories = Array.isArray(result) ? result : result ? [result] : []

        // Registering a directory makes the server list it; each add also marks it used here.
        for (const directory of directories) void server.ctx.projects.add(directory)
      },
    })

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
              const projectState = createMemo(() => status(project))

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
                    data-status={projectState()}
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
                        <Menu.Item data-slot="hud-project-add" onSelect={addProject}>
                          {language.t("home.project.add")}
                        </Menu.Item>
                        <Menu.Item
                          data-slot="hud-project-hide"
                          onSelect={() => {
                            setOpenFor(undefined)
                            server.ctx.projects.hide(project)
                          }}
                        >
                          {language.t("sidebar.project.hide")}
                        </Menu.Item>
                        <Show when={sessions()}>
                          {(list) => (
                            <For each={list()}>
                              {(session) => {
                                const unread = () => server.ctx.notification.session.unread(session.id, session)

                                return (
                                  <Menu.Item
                                    data-slot="hud-project-session"
                                    data-active={session.id === params.id ? "" : undefined}
                                    data-status={unread() ? "unread" : undefined}
                                    onSelect={() => open(session)}
                                  >
                                    <span class="min-w-0 flex-1 truncate">{sessionLabel(session)}</span>
                                    <Show when={unread()}>
                                      <span data-slot="hud-project-session-dot" aria-hidden="true" />
                                    </Show>
                                  </Menu.Item>
                                )
                              }}
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
