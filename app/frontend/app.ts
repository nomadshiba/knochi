import { Client } from "~/libs/RouterClient.ts";
import { RoutesSchema } from "~/routes.ts";
import { renderMarkdown } from "~/frontend/markdown.ts";

const client = Client.create<RoutesSchema>({
    baseUrl: new URL("/", location.origin),
    schema: RoutesSchema,
    fetch: fetch.bind(window),
});

type Chat = Awaited<ReturnType<typeof client.fetch<"GET /v1/chats/:chatId">>>;
type ChatMessage = Awaited<ReturnType<typeof client.fetch<"GET /v1/chats/:chatId/messages/:messageId">>>;
type Provider = Awaited<ReturnType<typeof client.fetch<"GET /v1/providers/:providerId">>>;
type Model = Awaited<ReturnType<typeof client.fetch<"GET /v1/models/:modelName">>>;
type Settings = Awaited<ReturnType<typeof client.fetch<"GET /v1/settings">>>;
type Agent = Awaited<ReturnType<typeof client.fetch<"GET /v1/agents">>>[number];

type ChatEvent =
    | { kind: "user_message"; value: { id: string; content: string } }
    | { kind: "assistant_start"; value: { id: string } }
    | { kind: "assistant_text"; value: { id: string; delta: string } }
    | { kind: "assistant_refusal"; value: { id: string; delta: string } }
    | {
        kind: "assistant_tool_call_delta";
        value: { id: string; index: number; tool_call_id: string; name: string; arguments: string; display: string };
    }
    | { kind: "assistant_tool_call"; value: { id: string; tool_call_id: string; name: string; arguments: string } }
    | { kind: "assistant_done"; value: { id: string } }
    | { kind: "tool_start"; value: { tool_call_id: string; name: string; arguments: string; display: string } }
    | { kind: "tool_result"; value: { tool_call_id: string; content: string; display: string } }
    | { kind: "error"; value: { message: string } };

type LiveToolCall = { id: string; name: string; display: string };
type LiveEntry =
    | { kind: "user"; id: string; text: string }
    | { kind: "assistant"; id: string; text: string }
    | { kind: "tool_call"; id: string; toolCallId: string; name: string; display: string }
    | { kind: "tool_result"; id: string; toolCallId: string; name: string; display: string }
    | { kind: "error"; id: string; text: string };

const state = {
    chats: [] as Chat[],
    currentChat: null as Chat | null,
    messages: [] as ChatMessage[],
    providers: [] as Provider[],
    models: [] as Model[],
    agents: [] as Agent[],
    settings: null as Settings | null,
    ws: null as WebSocket | null,
    liveEntries: [] as LiveEntry[],
    liveAssistant: null as null | LiveEntry & { kind: "assistant" },
};

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const el = (tag: string, cls?: string) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
};

const msgInput = $<HTMLInputElement>("#msg-input");
const sendBtn = $<HTMLButtonElement>("#send-btn");
const agentSelect = $<HTMLSelectElement>("#agent-select");
const providerSelect = $<HTMLSelectElement>("#provider-select");
const modelSelect = $<HTMLSelectElement>("#model-select");
const chatList = $<HTMLDivElement>("#chat-list");
const providersList = $<HTMLDivElement>("#providers-list");
const provName = $<HTMLInputElement>("#prov-name");
const provBase = $<HTMLInputElement>("#prov-base");
const provKey = $<HTMLInputElement>("#prov-key");
const messagesEl = $<HTMLDivElement>("#messages");

async function loadChats() {
    state.chats = await client.fetch("GET /v1/chats", { params: { pathname: {}, search: {} } });
    renderChatList();
}

async function loadProviders() {
    state.providers = await client.fetch("GET /v1/providers", { params: { pathname: {}, search: {} } });
    renderProviders();
    renderProviderSelect();
}

async function loadAgents() {
    state.agents = await client.fetch("GET /v1/agents", { params: { pathname: {}, search: {} } });
    renderAgentSelect();
}

async function loadSettings() {
    state.settings = await client.fetch("GET /v1/settings", { params: { pathname: {}, search: {} } });
}

async function loadModels() {
    const providerId = state.settings?.last_provider_id;
    if (providerId) {
        state.models = await client.fetch("GET /v1/models?provider=:provider", {
            params: { pathname: {}, search: { provider: providerId } },
        });
    } else {
        state.models = await client.fetch("GET /v1/models", { params: { pathname: {}, search: {} } });
    }
    renderModelSelect();
}

async function loadMessages(chatId: string) {
    state.messages = await client.fetch("GET /v1/chats/:chatId/messages", {
        params: { pathname: { chatId }, search: {} },
    });
    state.liveEntries = [];
    state.liveAssistant = null;
    renderMessages();
}

function connectWS(chatId: string) {
    if (state.ws) {
        state.ws.close();
        state.ws = null;
    }
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${location.host}/v1/chats/${chatId}/stream`);
    ws.onmessage = (e) => {
        const event: ChatEvent = JSON.parse(e.data);
        handleEvent(event);
    };
    ws.onerror = () => console.error("ws error");
    state.ws = ws;
}

function handleEvent(event: ChatEvent) {
    if (event.kind === "user_message") {
        state.liveEntries.push({ kind: "user", id: event.value.id, text: event.value.content });
        renderLive();
    } else if (event.kind === "assistant_start") {
        state.liveAssistant = { kind: "assistant", id: event.value.id, text: "" };
        state.liveEntries.push(state.liveAssistant);
        renderLive();
    } else if (event.kind === "assistant_text") {
        if (state.liveAssistant && state.liveAssistant.id === event.value.id) {
            state.liveAssistant.text += event.value.delta;
            renderLive();
        }
    } else if (event.kind === "assistant_refusal") {
        if (state.liveAssistant && state.liveAssistant.id === event.value.id) {
            state.liveAssistant.text += `[refused: ${event.value.delta}]`;
            renderLive();
        }
    } else if (event.kind === "assistant_tool_call_delta") {
        const existing = state.liveEntries.find((e): e is LiveEntry & { kind: "tool_call" } =>
            e.kind === "tool_call" && e.toolCallId === event.value.tool_call_id
        );
        if (existing) {
            existing.name = event.value.name;
            existing.display = event.value.display;
            renderLive();
        } else {
            state.liveEntries.push({
                kind: "tool_call",
                id: event.value.tool_call_id,
                toolCallId: event.value.tool_call_id,
                name: event.value.name,
                display: event.value.display,
            });
            renderLive();
        }
    } else if (event.kind === "tool_start") {
        const existing = state.liveEntries.find((e): e is LiveEntry & { kind: "tool_call" } =>
            e.kind === "tool_call" && e.toolCallId === event.value.tool_call_id
        );
        if (existing) {
            existing.display = event.value.display;
        } else {
            state.liveEntries.push({
                kind: "tool_call",
                id: event.value.tool_call_id,
                toolCallId: event.value.tool_call_id,
                name: event.value.name,
                display: event.value.display,
            });
        }
        renderLive();
    } else if (event.kind === "tool_result") {
        state.liveEntries.push({
            kind: "tool_result",
            id: event.value.tool_call_id,
            toolCallId: event.value.tool_call_id,
            name: "tool",
            display: event.value.display,
        });
        renderLive();
    } else if (event.kind === "assistant_done") {
        state.liveAssistant = null;
        renderLive();
    } else if (event.kind === "error") {
        state.liveEntries.push({ kind: "error", id: "error-" + Date.now(), text: event.value.message });
        renderLive();
    }
}

function renderChatList() {
    chatList.innerHTML = "";
    for (const chat of state.chats) {
        const item = el("div", "chat-item" + (state.currentChat?.id === chat.id ? " active" : ""));
        item.textContent = chat.name;
        item.onclick = () => selectChat(chat);
        chatList.appendChild(item);
    }
}

function renderProviders() {
    providersList.innerHTML = "";
    for (const p of state.providers) {
        const row = el("div", "provider-row");
        const name = el("span");
        name.textContent = p.name;
        const del = el("button", "");
        del.textContent = "x";
        del.onclick = async () => {
            await client.fetch("DELETE /v1/providers/:providerId", {
                params: { pathname: { providerId: p.id }, search: {} },
            });
            await loadProviders();
            if (state.settings?.last_provider_id === p.id) {
                state.settings.last_provider_id = undefined;
                state.settings.last_model_id = undefined;
                await client.fetch("PATCH /v1/settings", {
                    params: { pathname: {}, search: {} },
                    data: { last_provider_id: null, last_model_id: null },
                });
                await loadSettings();
                await loadModels();
            }
        };
        row.appendChild(name);
        row.appendChild(del);
        providersList.appendChild(row);
    }
}

function renderProviderSelect() {
    providerSelect.innerHTML = "";
    for (const p of state.providers) {
        const opt = el("option") as HTMLOptionElement;
        opt.value = p.id;
        opt.textContent = p.name;
        if (state.settings?.last_provider_id === p.id) opt.selected = true;
        providerSelect.appendChild(opt);
    }
}

function renderAgentSelect() {
    agentSelect.innerHTML = "";
    for (const a of state.agents) {
        const opt = el("option") as HTMLOptionElement;
        opt.value = a.name;
        opt.textContent = a.name;
        if (state.settings?.last_agent === a.name) opt.selected = true;
        agentSelect.appendChild(opt);
    }
}

function renderModelSelect() {
    modelSelect.innerHTML = "";
    for (const m of state.models) {
        const opt = el("option") as HTMLOptionElement;
        opt.value = m.id;
        opt.textContent = m.name;
        if (state.settings?.last_model_id === m.id) opt.selected = true;
        modelSelect.appendChild(opt);
    }
}

function renderMessages() {
    renderLive();
}

function renderLive() {
    messagesEl.innerHTML = "";

    const hasStored = state.messages.length > 0;
    const hasLive = state.liveEntries.length > 0;
    if (!hasStored && !hasLive) {
        const empty = el("div", "empty");
        empty.textContent = "no messages yet. send one below.";
        messagesEl.appendChild(empty);
        return;
    }

    for (const msg of state.messages) {
        if (msg.content.kind === "user") {
            appendBubble("user", "user", msg.content.value.content);
        } else if (msg.content.kind === "system") {
            appendBubble("system", "system", msg.content.value.content, true);
        } else if (msg.content.kind === "assistant") {
            if (msg.content.value.content) appendBubble("assistant", "assistant", msg.content.value.content, true);
            if (msg.content.value.refusal) appendBubble("assistant", "assistant", `**refused:** ${msg.content.value.refusal}`, true);
            for (const tc of msg.content.value.tool_calls) {
                appendBubble("tool_call", `${tc.value.name} ${tc.value.id}`, tc.value.display, true);
            }
        } else if (msg.content.kind === "tool") {
            appendBubble("tool", `result ${msg.content.value.tool_call_id}`, msg.content.value.display, true);
        }
    }

    for (const entry of state.liveEntries) {
        if (entry.kind === "user") {
            appendBubble("user", "user", entry.text);
        } else if (entry.kind === "assistant") {
            appendBubble("assistant", "assistant", entry.text || "...", true);
        } else if (entry.kind === "tool_call") {
            appendBubble("tool_call", `${entry.name} ${entry.toolCallId}`, entry.display, true);
        } else if (entry.kind === "tool_result") {
            appendBubble("tool", `result ${entry.toolCallId}`, entry.display, true);
        } else if (entry.kind === "error") {
            appendBubble("error", "error", entry.text, true);
        }
    }

    messagesEl.scrollTop = messagesEl.scrollHeight;
}

function appendBubble(cls: string, label: string, content: string, markdown = false) {
    const wrap = el("div", "msg " + cls);
    const role = el("div", "role");
    role.textContent = label;
    const bubble = el("div", "bubble");
    if (markdown) {
        bubble.innerHTML = renderMarkdown(content);
    } else {
        bubble.textContent = content;
    }
    wrap.appendChild(role);
    wrap.appendChild(bubble);
    messagesEl.appendChild(wrap);
}

async function selectChat(chat: Chat) {
    state.currentChat = chat;
    renderChatList();
    await loadMessages(chat.id);
    connectWS(chat.id);
    msgInput.disabled = false;
    sendBtn.disabled = false;
}

async function createChat() {
    const name = prompt("chat name?");
    if (!name) return;
    await client.fetch("POST /v1/chats", {
        params: { pathname: {}, search: {} },
        data: { name },
    });
    await loadChats();
}

async function addProvider() {
    const name = provName.value.trim();
    const base = provBase.value.trim();
    const key = provKey.value.trim();
    if (!name || !base || !key) return;
    await client.fetch("POST /v1/providers", {
        params: { pathname: {}, search: {} },
        data: { name, base: new URL(base), key },
    });
    provName.value = "";
    provBase.value = "";
    provKey.value = "";
    await loadProviders();
    const first = state.providers[state.providers.length - 1];
    if (first) {
        providerSelect.value = first.id;
        await selectProvider(first.id);
    }
}

async function selectProvider(id: string) {
    state.settings!.last_provider_id = id;
    state.settings!.last_model_id = undefined;
    await client.fetch("PATCH /v1/settings", {
        params: { pathname: {}, search: {} },
        data: { last_provider_id: id, last_model_id: null },
    });
    await loadModels();
}

async function selectModel(id: string) {
    state.settings!.last_model_id = id;
    await client.fetch("PATCH /v1/settings", {
        params: { pathname: {}, search: {} },
        data: { last_model_id: id },
    });
}

async function selectAgent(name: string) {
    state.settings!.last_agent = name;
    await client.fetch("PATCH /v1/settings", {
        params: { pathname: {}, search: {} },
        data: { last_agent: name },
    });
}

async function sendMessage() {
    const text = msgInput.value.trim();
    if (!text || !state.currentChat) return;
    msgInput.value = "";

    await client.fetch("POST /v1/chats/:chatId/messages", {
        params: { pathname: { chatId: state.currentChat.id }, search: {} },
        data: { content: text },
    });
}

$<HTMLButtonElement>("#new-chat").onclick = createChat;
$<HTMLButtonElement>("#add-prov").onclick = addProvider;
sendBtn.onclick = sendMessage;
msgInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMessage();
});
providerSelect.addEventListener("change", (e) => {
    selectProvider((e.target as HTMLSelectElement).value);
});
modelSelect.addEventListener("change", (e) => {
    selectModel((e.target as HTMLSelectElement).value);
});
agentSelect.addEventListener("change", (e) => {
    selectAgent((e.target as HTMLSelectElement).value);
});

await loadChats();
await loadProviders();
await loadAgents();
await loadSettings();
if (!state.settings?.last_provider_id && state.providers.length) {
    await selectProvider(state.providers[0].id);
}
if (!state.settings?.last_agent && state.agents.length) {
    await selectAgent(state.agents[0].name);
    renderAgentSelect();
}
await loadModels();
