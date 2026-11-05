import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, extname, relative, resolve } from "node:path"
import solidPlugin from "vite-plugin-solid"
import tailwindcss from "@tailwindcss/vite"
import { fileURLToPath } from "url"

const theme = fileURLToPath(new URL("./public/oc-theme-preload.js", import.meta.url))
const publicRoot = fileURLToPath(new URL("./public", import.meta.url))
const publicLinkRoot = resolve(publicRoot, "../..")

const themeScript = readFileSync(theme, "utf8")

const tailwind = tailwindcss()

const tailwindGenerate = tailwind.find((plugin) => plugin.name === "@tailwindcss/vite:generate:serve")

const tailwindHotUpdate = tailwindGenerate?.hotUpdate

// Tailwind 4.3.3 expects a server that Vite's bundled dev hook does not provide.
if (tailwindGenerate && typeof tailwindHotUpdate === "function") {
  tailwindGenerate.hotUpdate = function (context) {
    if (!context.server) return

    return tailwindHotUpdate.call(this, context)
  }
}

// The markdown worker imports these directly, so they are served unbundled to keep worker startup
// stable.
const workerDeps = ["@pierre/highlights", "marked"]

// The Office previews load their wasm and fonts through `new URL(..., import.meta.url)`, which a pre-bundle would move
// away from the files.
const officeDeps = ["@betteroffice/docx", "@betteroffice/fonts", "@betteroffice/pptx", "@betteroffice/xlsx"]

// The build emits the Office engines' wasm and worker files for every `new URL(..., import.meta.url)` it sees, even in
// code that tree shaking drops. A file that no other emitted file names never loads, so it is left out of the build.
const officeEmitted = /^(?:docx_\w+_bg|ooxml_opc_bg|pptx_wasm_bg|xlsx_wasm_bg|residentEngineWorker)\b/

/** @type {import("vite").Plugin} */
const dropUnloadedOfficeFiles = {
  name: "opencode-desktop:drop-unloaded-office-files",
  apply: "build",
  generateBundle: {
    order: "post",
    handler(_, bundle) {
      const files = Object.values(bundle).filter((file) => !file.fileName.endsWith(".map"))
      const name = (file) => file.fileName.split("/").pop() ?? file.fileName
      const source = (file) => (file.type === "chunk" ? file.code : typeof file.source === "string" ? file.source : "")
      const named = (file) => files.some((other) => other !== file && source(other).includes(name(file)))

      files
        .filter((file) => officeEmitted.test(name(file)) && !named(file))
        .forEach((file) => {
          delete bundle[file.fileName]
          delete bundle[`${file.fileName}.map`]
        })
    },
  },
}

/** @type {import("rolldown").Plugin} */
const bundleNestedWorkerDeps = {
  name: "opencode-desktop:bundle-nested-worker-deps",
  resolveId(id, importer) {
    if (!importer || !importer.includes("node_modules")) return
    if (!workerDeps.some((dep) => id === dep || id.startsWith(`${dep}/`))) return

    try {
      return createRequire(importer).resolve(id)
    } catch {
      return
    }
  },
}

// The components lab globs every story, and the dependency scan cannot parse a .tsx story that calls import.meta.glob
// itself. The lab is a development tool, so its dependencies are found when it first opens rather than at startup.
/** @type {import("rolldown").Plugin} */
const skipComponentsLab = {
  name: "opencode-desktop:skip-components-lab",
  resolveId(id) {
    if (id === "@/components-lab/lab") return { id, external: true }
  },
}

export const channel = (() => {
  const raw = process.env.OPENCODE_CHANNEL

  if (raw === "local" || raw === "dev" || raw === "beta" || raw === "prod") return raw

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
            // The font package imports its 33 MB Chinese, Japanese and Korean add-on on demand; the app does not ship it.
            "@betteroffice/fonts-cjk": fileURLToPath(
              new URL("../gui-plugins/src/microsoft-office/fonts-cjk.ts", import.meta.url),
            ),
          },
        },
        define: {
          "import.meta.env.VITE_OPENCODE_CHANNEL": JSON.stringify(channel),
        },
        worker: {
          format: "es",
        },
        optimizeDeps: {
          exclude: [...workerDeps, ...officeDeps],
          rolldownOptions: { plugins: [bundleNestedWorkerDeps, skipComponentsLab] },
        },
      }
    },
  },
  dropUnloadedOfficeFiles,
  {
    name: "opencode-desktop:theme-preload",
    transformIndexHtml: {
      order: "pre",
      handler: inlineThemePreload,
    },
  },
  ...tailwind,
  solidPlugin(),
]

export function inlineThemePreload(html) {
  return html.replace(
    /<script id="oc-theme-preload-script" src="(?:\.\/|\/)oc-theme-preload\.js"><\/script>/,
    `<script id="oc-theme-preload-script">${themeScript}</script>`,
  )
}
