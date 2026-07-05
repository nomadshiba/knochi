import { StructCodec } from "@nomadshiba/codec";
import { MessageContent } from "~/backend/handlers/chats/messages/MessageContent.ts";
import { Timestamp } from "~/libs/codecs/Timestamp.ts";
import { UUID } from "~/libs/codecs/UUID.ts";

export const ChatMessageOutput = new StructCodec({
    id: UUID,
    content: MessageContent,
    created: Timestamp,
});
