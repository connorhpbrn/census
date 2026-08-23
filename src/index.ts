import { env } from "./env";
import { handleWebhook, start } from "./telegram";
import { handleTrueLayerCallback, seedRefreshToken } from "./bank";

seedRefreshToken();

const server = Bun.serve({
  port: env.PORT,
  async fetch(req) {
    const path = new URL(req.url).pathname;
    if (path === "/health" && req.method === "GET") return new Response("ok");
    if (path === "/telegram" && req.method === "POST") return handleWebhook(req);
    if (path === "/truelayer" && req.method === "GET") return handleTrueLayerCallback(req);
    return new Response("not found", { status: 404 });
  },
});

console.log(`§ census ${server.url}`);
console.log("db", env.DATABASE_PATH);
await start();
