export * as ConfigOctopus from "./octopus.js"

import { Schema } from "effect"
import { optional } from "../schema.js"

/**
 * Reports session usage that never passes through the Octopus gateway to the gateway's statistics.
 * Requests routed through a gateway URL are already counted by the gateway itself and are never reported.
 */
export class Info extends Schema.Class<Info>("ConfigOctopus.Info")({
  enabled: Schema.Boolean.pipe(optional).annotate({
    description: "Report direct-provider usage to Octopus statistics. Enabled when an api_key is configured.",
  }),
  url: Schema.String.pipe(optional).annotate({
    description: "Base URL of the Octopus gateway that receives the statistics. Defaults to http://127.0.0.1:8080",
  }),
  api_key: Schema.String.pipe(optional).annotate({
    description: "Octopus API key used to authenticate usage reports. Reporting stays off without one.",
  }),
  gateways: Schema.String.pipe(Schema.Array, optional).annotate({
    description:
      "Additional gateway base URLs whose traffic is already counted by Octopus. Defaults to url. Compared by origin (scheme, host, port).",
  }),
  exclude_providers: Schema.String.pipe(Schema.Array, optional).annotate({
    description: "Provider IDs whose usage is never reported, even when they do not point at a gateway.",
  }),
}) {}
