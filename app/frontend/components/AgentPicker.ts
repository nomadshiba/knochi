import { Builder, combine, ref, Sync, tags } from "@purifyjs/core";
import { AgentOutput } from "~/backend/handlers/agents/AgentOutput.ts";
import { api } from "~/frontend/api.ts";
import { useReplaceChildren, useValue } from "~/frontend/kit/bind.ts";
import { css } from "~/frontend/kit/css.ts";
import { matchScore } from "~/frontend/kit/search.ts";

export function AgentPicker(agent: Sync.Ref<string>) {
    const { span, dialog, button, header, strong, small, p, ul, li, input } = tags;
    const self = span({ class: "picker" }).$bind(AgentPickerStyle.useScope());

    const agents = ref<AgentOutput[] | null>(null);
    const loading = ref(false);
    const search = ref("");

    const refresh = async () => {
        loading.set(true);
        try {
            agents.set(await api.fetch("GET /v1/agents", { params: { pathname: {}, search: {} } }));
        } catch (cause) {
            console.error(cause);
        } finally {
            loading.set(false);
        }
    };

    const items = combine({ agents, search }).derive(({ agents, search }) => {
        if (!agents) {
            return p({ class: "hint" })
                .textContent(loading.derive((loading) => loading ? "Loading agents..." : "Failed to load agents."));
        }

        const term = search.trim().toLowerCase();
        const items = agents
            .map((item) => ({ item, score: matchScore(item.name, item.description, term) }))
            .filter((entry): entry is { item: AgentOutput; score: number } => entry.score !== null)
            .sort((a, b) => a.score - b.score || a.item.name.localeCompare(b.item.name));

        if (!items.length) {
            return [p({ class: "hint" }).textContent(term ? "No agents match your search." : "No agents available.")];
        }

        return items.map(({ item }) =>
            li().append$(
                button()
                    .type("button")
                    .ariaCurrent(agent.derive((agent) => item.name === agent ? "true" : null))
                    .append$(
                        strong().textContent(item.name),
                        small().textContent(item.description),
                    )
                    .onclick(() => {
                        agent.set(item.name);
                        modal.close();
                    }),
            )
        );
    });

    const modal = dialog().$bind(AgentModalStyle.useScope())
        .onclose(() => search.set(""))
        .append$(
            header().append$(
                strong().textContent("Select Agent"),
                new Builder(document.createElement("search")).append$(
                    input().type("search").placeholder("Search agents...").$bind(useValue(search)),
                    button()
                        .type("button")
                        .ariaLabel("Refresh agents")
                        .disabled(loading)
                        .ariaBusy(loading.derive((loading) => `${loading}` as const))
                        .onclick(() => refresh()),
                ),
            ),
            ul().$bind(useReplaceChildren(items)),
        );

    const scrollToSelected = () => {
        requestAnimationFrame(() => {
            modal.$node.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "center" });
        });
    };

    const trigger = button()
        .type("button")
        .append$(small().textContent("Agent"), strong().textContent(agent))
        .onclick(async () => {
            modal.showModal();
            if (agents.get()) {
                scrollToSelected();
                return;
            }
            await refresh();
            scrollToSelected();
        });

    return self.append$(trigger, modal);
}

const AgentPickerStyle = css`
    :scope {
        display: contents;
    }

    button {
        all: unset;
        cursor: pointer;
        display: block grid;
        grid-auto-flow: column;
        gap: 0.35em;
        align-items: baseline;
        padding-inline: 0.65em;
        padding-block: 0.4em;
        border-radius: 999px;
        background-color: color-mix(in srgb, var(--base), var(--pop) 8%);

        small {
            opacity: 0.5;
            font-size: 0.75em;
        }

        strong {
            font-size: 0.85em;
        }

        &:hover {
            background-color: color-mix(in srgb, var(--base), var(--pop) 14%);
        }
    }
`;

const AgentModalStyle = css`
    :scope[open] {
        display: block grid;
    }

    header {
        display: block grid;
        gap: 0.5em;
        padding: 1em;

        position: sticky;
        inset-block-start: 0;
        background-color: var(--base);
        z-index: 1;

        strong {
            grid-column: 1 / -1;
        }
    }

    header search {
        display: block grid;
        grid-template-columns: 1fr auto;
        align-items: center;
        gap: 0.5em;
    }

    header search input {
        all: unset;
        display: block flow;
        padding-inline: 0.65em;
        padding-block: 0.45em;
        border-radius: var(--radius);
        background-color: color-mix(in srgb, var(--base), var(--pop) 6%);

        &::placeholder {
            opacity: 0.5;
        }

        &:focus-visible {
            outline: 2px solid var(--accent-base);
            outline-offset: -2px;
        }
    }

    header search button {
        all: unset;
        cursor: pointer;
        display: block grid;
        border-radius: var(--radius);
        inline-size: 1.25em;
        aspect-ratio: 1;

        &::before {
            content: "";
            display: block flow;
            mask-image: url("/icons/refresh.svg");
            mask-size: contain;
            mask-position: center;
            background-color: currentcolor;
        }

        &[aria-busy="true"] {
            animation: agent-picker-spin 0.6s linear infinite;
            cursor: progress !important;
        }

        &:disabled {
            cursor: default;
        }
    }

    ul {
        display: block grid;
        gap: 0.35em;
        padding-inline: 1em;
        list-style: none;
    }

    ul li {
        display: contents;
    }

    ul button {
        all: unset;
        cursor: pointer;
        display: block grid;
        gap: 0.15em;
        padding-inline: 0.65em;
        padding-block: 0.5em;
        border-radius: var(--radius);

        small {
            opacity: 0.6;
            font-size: 0.8em;
        }

        &:hover {
            background-color: color-mix(in srgb, var(--base), var(--pop) 8%);
        }

        &[aria-current="true"] {
            background-color: var(--accent-base);
            color: var(--accent-pop);
        }
    }

    .hint {
        opacity: 0.6;
        font-size: 0.9em;
    }

    @keyframes agent-picker-spin {
        to {
            transform: rotate(360deg);
        }
    }
`;
