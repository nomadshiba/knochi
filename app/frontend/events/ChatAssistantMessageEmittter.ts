import { ChatAssistantMessageDelta } from "~/backend/handlers/chats/messages/ChatAssistantMessageDelta.ts";
import { EmitterTopic } from "~/libs/events/EmitterTopic.ts";

export const ChatAssistantMessageEmittter = new EmitterTopic<ChatAssistantMessageDelta>();
