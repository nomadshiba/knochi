import { Client } from "~/libs/RouterClient.ts";
import { RoutesSchema } from "~/routes.ts";

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

const state = {
    chats: [] as Chat[],
    currentChat: null as Chat | null,
    messages: [] as ChatMessage[],
    providers: [] as Provider[],
    models: [] as Model[],
    settings: null as Settings | null,
};

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const el = (tag: string, cls?: string) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
};

const msgInput = $<HTMLInputElement>("#msg-input");
const sendBtn = $<HTMLButtonElement>("#send-btn");
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
    renderMessages();
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
    messagesEl.innerHTML = "";
    if (state.messages.length === 0) {
        const empty = el("div", "empty");
        empty.textContent = "no messages yet. send one below.";
        messagesEl.appendChild(empty);
        return;
    }
    for (const msg of state.messages) {
        const wrap = el("div", "msg " + msg.content.kind);
        const role = el("div", "role");
        role.textContent = msg.content.kind;
        const bubble = el("div", "bubble");
        if (msg.content.kind === "user" || msg.content.kind === "system") {
            bubble.textContent = msg.content.value.content;
        } else if (msg.content.kind === "assistant") {
            const parts: string[] = [];
            if (msg.content.value.content) parts.push(msg.content.value.content);
            if (msg.content.value.refusal) parts.push(`[refused: ${msg.content.value.refusal}]`);
            for (const tc of msg.content.value.tool_calls) {
                parts.push(`-> ${tc.value.name}(${tc.value.arguments})`);
            }
            bubble.textContent = parts.join("\n");
        } else if (msg.content.kind === "tool") {
            bubble.textContent = msg.content.value.content;
        }
        wrap.appendChild(role);
        wrap.appendChild(bubble);
        messagesEl.appendChild(wrap);
    }
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

async function selectChat(chat: Chat) {
    state.currentChat = chat;
    renderChatList();
    await loadMessages(chat.id);
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

async function sendMessage() {
    const text = msgInput.value.trim();
    if (!text || !state.currentChat) return;
    msgInput.value = "";

    await client.fetch("POST /v1/chats/:chatId/messages", {
        params: { pathname: { chatId: state.currentChat.id }, search: {} },
        data: { content: text },
    });

    await loadMessages(state.currentChat.id);
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

await loadChats();
await loadProviders();
await loadSettings();
if (!state.settings?.last_provider_id && state.providers.length) {
    await selectProvider(state.providers[0].id);
}
await loadModels();
