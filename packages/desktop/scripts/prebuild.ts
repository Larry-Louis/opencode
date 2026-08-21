#!/usr/bin/env bun
import { $ } from "bun"

import { downloadCliToResources, resolveChannel } from "./utils"

const channel = resolveChannel()
await $`bun ./scripts/copy-icons.ts ${channel}`
await $`bun ./scripts/copy-metainfo.ts ${channel}`

await $`cd ../opencode && bun script/build-node.ts`
// 本地主题开发不需要下载发布版 CLI（注册表上没有本地 dev 版本号）。
// 打包安装包前再恢复此行：
// if (channel === "dev") await downloadCliToResources()
