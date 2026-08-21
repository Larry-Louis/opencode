import { $ } from "bun"
import { downloadCliToResources } from "./utils"

await $`bun run install-electron`

await $`bun ./scripts/copy-icons.ts ${process.env.OPENCODE_CHANNEL ?? "dev"}`

await $`cd ../opencode && bun script/build-node.ts`
// 本地主题开发不需要下载发布版 CLI（注册表上没有本地 dev 版本号，会报错）。
// 若运行时提示缺少 resources/opencode-cli.exe，再单独解决 sidecar 来源：
// await downloadCliToResources()
