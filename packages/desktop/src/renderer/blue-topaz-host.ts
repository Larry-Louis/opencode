// The Blue Topaz widgets render into their own host element so the app's Solid tree never owns them. The host moves
// between the chat panel and the document root, and this reference survives that: a panel re-render that drops the
// element leaves the rendered nodes intact, so re-attaching it restores the widgets without re-rendering anything.
export const widgetHost = (() => {
  const host = document.createElement("div")
  host.id = "bt-widgets-root"
  return host
})()
