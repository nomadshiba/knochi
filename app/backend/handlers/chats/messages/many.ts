import { ChatClient } from "~/backend/chats/ChatClient.ts";
import { router } from "~/router.ts";

router.registerHandler("GET /v1/chats/:chatId/messages", async ({ params }) => {
    const chatId = params.pathname.chatId;
    const chat = await ChatClient.getOrLoad(chatId);

    return {
        status: "OK",
        data: chat.messages.iter().toArray(),
    };
});
