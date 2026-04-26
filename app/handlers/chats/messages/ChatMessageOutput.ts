import { StructCodec } from "@nomadshiba/codec";
import { UUID } from "~/libs/codecs/UUID.ts";
import { MessageRole } from "~/handlers/chats/messages/MessageRole.ts";
import { Timestamp } from "~/libs/codecs/Timestamp.ts";

export const ChatMessageOutput = new StructCodec({
    id: UUID,
    chat_id: UUID,
    role: MessageRole,
    created: Timestamp,
});
