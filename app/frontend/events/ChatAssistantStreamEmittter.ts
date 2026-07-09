import { ChatAssistantStream } from "~/backend/handlers/chats/messages/ChatAssistantStream.ts";
import { EmitterTopic } from "~/libs/events/EmitterTopic.ts";

export const ChatAssistantStreamEmittter = new EmitterTopic<ChatAssistantStream>();
