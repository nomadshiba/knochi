import { StructCodec } from "@nomadshiba/codec";
import { MessageContent } from "~/handlers/chats/messages/MessageContent.ts";

export const ChatMessageInput = new StructCodec({
    content: MessageContent,
});
