import { router } from "~/router.ts";
import { ChatClient } from "~/backend/chats/ChatClient.ts";
import { v7 } from "@std/uuid";

router.registerHandler("POST /v1/chats/:chatId/messages", async ({ params, data }) => {
    const chatId = params.pathname.chatId;
    const chat = await ChatClient.getOrLoad(chatId);
    const now = Date.now();

    await chat.pushMessage({
        id: v7.generate(now),
        content: {
            kind: "user",
            value: { content: data.content },
        },
        created: new Date(now),
    });
    void chat.startAgent();

    return { status: "OK", data: null } as const;
});
