import { router } from "~/router.ts";
import { ChatClient } from "~/backend/chats/ChatClient.ts";
import { v7 } from "@std/uuid";

router.registerHandler("POST /v1/chats/:chatId/messages", async ({ params, data }) => {
    const chatId = params.pathname.chatId;
    const chat = await ChatClient.getOrLoad(chatId);

    await chat.pushProviderMessage(v7.generate(), { role: "user", content: data.content });

    return { status: "OK", data: null } as const;
});
