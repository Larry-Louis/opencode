import path from "node:path"
import { OPENCODE_CHANNEL } from "./version"

export function databasePath(data: string) {
  const filename =
    process.env.OPENCODE_DB ??
    // Blue Topaz fork: local theme and feature development shares the installed build's
    // database so sessions and configuration stay in sync. Setting OPENCODE_DISABLE_CHANNEL_DB
    // restores the upstream per-channel database isolation.
    (!process.env.OPENCODE_DISABLE_CHANNEL_DB ||
    ["latest", "dev", "beta", "next", "prod"].includes(OPENCODE_CHANNEL) ||
    process.env.OPENCODE_DISABLE_CHANNEL_DB === "1" ||
    process.env.OPENCODE_DISABLE_CHANNEL_DB === "true"
      ? "opencode.db"
      : `opencode-${OPENCODE_CHANNEL.replace(/[^a-zA-Z0-9._-]/g, "-")}.db`)
  return filename === ":memory:" ? filename : path.resolve(data, filename)
}
