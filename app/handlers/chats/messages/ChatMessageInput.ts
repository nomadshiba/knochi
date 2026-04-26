import { StructCodec } from "@nomadshiba/codec";
import { MessageRole } from "~/handlers/chats/messages/MessageRole.ts";

export const ChatMessageInput = new StructCodec({
    role: MessageRole,
});
