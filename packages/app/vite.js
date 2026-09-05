import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { dirname, extname, relative, resolve } from "node:path"
import solidPlugin from "vite-plugin-solid"
import tailwindcss from "@tailwindcss/vite"
import { fileURLToPath } from "url"

const theme = fileURLToPath(new URL("./public/oc-theme-preload.js", import.meta.url))
const publicRoot = fileURLToPath(new URL("./public", import.meta.url))
const publicLinkRoot = resolve(publicRoot, "../..")

const channel = (() => {
  const raw = process.env.OPENCODE_CHANNEL
  if (raw === "dev" || raw === "beta" || raw === "prod") return raw
  if (process.env.OPENCODE_CHANNEL === "latest") return "prod"
  return "dev"
})()

function isWithin(root, file) {
  const path = relative(root, file)
  return path === "" || (!path.startsWith("..") && !path.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`))
}

function linkedPublicFile(file) {
  if (!existsSync(file) || !statSync(file).isFile()) return
  const value = readFileSync(file, "utf8").trim()
  if (!value.startsWith("../") && !value.startsWith("./")) return
  const target = resolve(dirname(file), value)
  if (!isWithin(publicLinkRoot, target) || !existsSync(target) || !statSync(target).isFile()) return
  return target
}

function publicFile(url) {
  const pathname = url?.split("?", 1)[0]
  if (!pathname) return
  const file = resolve(publicRoot, ...pathname.split("/").filter(Boolean).map(decodeURIComponent))
  return isWithin(publicRoot, file) ? file : undefined
}

function publicMime(file) {
  const types = {
    ".avif": "image/avif",
    ".bmp": "image/bmp",
    ".gif": "image/gif",
    ".ico": "image/x-icon",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
  }
  return types[extname(file).toLowerCase()] ?? "application/octet-stream"
}

function resolvePublicLinksPlugin() {
  return {
    name: "opencode:resolve-public-links",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.method !== "GET" && request.method !== "HEAD") return next()
        const file = publicFile(request.url)
        const target = file && linkedPublicFile(file)
        if (!target) return next()
        response.statusCode = 200
        response.setHeader("Content-Type", publicMime(file))
        response.end(request.method === "HEAD" ? undefined : readFileSync(target))
      })
    },
    writeBundle(options) {
      if (!options.dir) return
      const replace = (source, destination) => {
        for (const entry of readdirSync(source, { withFileTypes: true })) {
          const sourceFile = resolve(source, entry.name)
          const destinationFile = resolve(destination, entry.name)
          if (entry.isDirectory()) {
            mkdirSync(destinationFile, { recursive: true })
            replace(sourceFile, destinationFile)
            continue
          }
          const target = linkedPublicFile(sourceFile)
          if (target) writeFileSync(destinationFile, readFileSync(target))
        }
      }
      replace(publicRoot, options.dir)
    },
  }
}

/**
 * @type {import("vite").PluginOption}
 */
export default [
  resolvePublicLinksPlugin(),
  {
    name: "opencode-desktop:config",
    config() {
      return {
        resolve: {
          alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)),
          },
        },
        define: {
          "import.meta.env.VITE_OPENCODE_CHANNEL": JSON.stringify(channel),
        },
        worker: {
          format: "es",
        },
      }
    },
  },
  {
    name: "opencode-desktop:theme-preload",
    transformIndexHtml(html) {
      return html.replace(
        '<script id="oc-theme-preload-script" src="/oc-theme-preload.js"></script>',
        `<script id="oc-theme-preload-script">${readFileSync(theme, "utf8")}</script>`,
      )
    },
  },
  tailwindcss(),
  solidPlugin(),
]
