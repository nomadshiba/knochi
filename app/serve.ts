import { serveDir } from "@std/http";
import { handleChatStream } from "~/backend/handlers/chats/messages/stream.ts";
import appHtml from "~/frontend/app.html" with { type: "text" };
import appJs from "~/frontend/dist/app.js" with { type: "text" };
import { router } from "~/router.ts";

await import("~/backend/database/migrate.ts");
await import("~/backend/handlers/agents/many.ts");
await import("~/backend/handlers/models/many.ts");
await import("~/backend/handlers/providers/create.ts");
await import("~/backend/handlers/providers/many.ts");
await import("~/backend/handlers/providers/update.ts");
await import("~/backend/handlers/providers/delete.ts");
await import("~/backend/handlers/chats/create.ts");
await import("~/backend/handlers/chats/many.ts");
await import("~/backend/handlers/chats/one.ts");
await import("~/backend/handlers/chats/update.ts");
await import("~/backend/handlers/chats/delete.ts");
await import("~/backend/handlers/chats/messages/create.ts");
await import("~/backend/handlers/chats/messages/many.ts");
await import("~/backend/handlers/chats/messages/delete.ts");

const PORT = Number(Deno.env.get("PORT") ?? 5000);
const CHAT_WEBSOCKET_REGEX = /^\/v1\/chats\/([0-9a-f-]+)\/stream$/;

const appHtmlTransformed = appHtml.replace("<!-- app.js -->", () => `<script type="module">${appJs}</script>`);

Deno.serve({
    port: PORT,
    hostname: "0.0.0.0",
    onError: (reason: unknown) => {
        console.error(reason);
        return new Response("Internal Server Error", { status: 500 });
    },
}, (request) => {
    const url = new URL(request.url);

    if (url.pathname === "/") {
        return new Response(appHtmlTransformed, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    if (url.pathname.startsWith("/static/")) {
        return serveDir(request, {
            showIndex: false,
            showDirListing: false,
            showDotfiles: false,
            fsRoot: new URL("./frontend/static/", import.meta.url).pathname,
            urlRoot: "static",
        });
    }

    const webSocketMatch = url.pathname.match(CHAT_WEBSOCKET_REGEX);
    if (webSocketMatch && request.headers.get("upgrade") === "websocket") {
        const chatId = webSocketMatch[1];
        return handleChatStream(request, chatId);
    }

    return router.resolveRequest(request);
});
