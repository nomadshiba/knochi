import { handleChatStream } from "~/backend/handlers/chats/messages/stream.ts";
import { router } from "~/router.ts";
import appJs from "~/frontend/dist/app.js" with { type: "text" };
import appHtml from "~/frontend/app.html" with { type: "text" };

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

const PORT = Number(Deno.env.get("PORT") ?? 8000);
const CHAT_WEBSOCKET_REGEX = /^\/v1\/chats\/([0-9a-f-]+)\/stream$/;

const appHtmlTransformed = appHtml.replace("<!-- app.js -->", () => `<script type="module">${appJs}</script>`);

Deno.serve({
    port: PORT,
    onError: (error: unknown) => {
        console.error(error);
        return new Response("Internal Server Error", { status: 500 });
    },
}, (request) => {
    const url = new URL(request.url);

    if (url.pathname === "/") {
        return new Response(appHtmlTransformed, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    const webSocketMatch = url.pathname.match(CHAT_WEBSOCKET_REGEX);
    if (webSocketMatch && request.headers.get("upgrade") === "websocket") {
        const chatId = webSocketMatch[1];
        return handleChatStream(request, chatId);
    }

    return router.resolveRequest(request);
});
