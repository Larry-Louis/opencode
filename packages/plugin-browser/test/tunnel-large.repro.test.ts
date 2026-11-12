import { expect, test } from "bun:test"
import { createServer } from "node:http"
import { request } from "node:http"
import { once } from "node:events"
import { Effect } from "effect"
import { BrowserTunnel } from "../src/tunnel.js"
import { BrowserProxy } from "../src/proxy.js"

test("proxy relays a response larger than one tunnel chunk", async () => {
  const body = Buffer.alloc(200_000, 97)
  const origin = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/plain", "content-length": String(body.length) })
    res.end(body)
  })
  await once(origin.listen(0, "127.0.0.1"), "listening")
  const address = origin.address()
  if (!address || typeof address === "string") throw new Error("No origin address")
  const tunnel = BrowserTunnel.make()
  const proxy = await BrowserProxy.make({
    open: (destination, signal) => Effect.runPromise(tunnel.open(destination), { signal }),
    read: (id, signal) => Effect.runPromise(tunnel.read(id), { signal }),
    write: (id, data, end, signal) => Effect.runPromise(tunnel.write(id, data, end), { signal }),
    close: (id) => Effect.runPromise(tunnel.close(id)),
  })
  try {
    const received = await new Promise<{ status?: number; length: number }>((resolve, reject) => {
      const req = request(
        {
          hostname: proxy.host,
          port: proxy.port,
          method: "GET",
          path: `http://127.0.0.1:${address.port}/big.txt`,
          headers: {
            "proxy-authorization": `Basic ${Buffer.from(
              `${proxy.credentials.username}:${proxy.credentials.password}`,
            ).toString("base64")}`,
          },
        },
        (response) => {
          let length = 0
          response.on("data", (chunk: Buffer) => {
            length += chunk.length
          })
          response.on("end", () => resolve({ status: response.statusCode, length }))
        },
      )
      req.on("error", reject)
      req.end()
    })
    expect(received.status).toBe(200)
    expect(received.length).toBe(body.length)
  } finally {
    await proxy.close()
    tunnel.dispose()
    await new Promise<void>((resolve) => origin.close(() => resolve()))
  }
}, 15_000)
