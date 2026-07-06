import { Codec } from "@nomadshiba/codec";
import { Builder, combine, ref, Sync, tags } from "@purifyjs/core";
import { ModelOutput } from "~/backend/handlers/models/ModelOutput.ts";
import { Provider } from "~/backend/handlers/providers/ProviderOutput.ts";
import { api } from "~/frontend/api.ts";
import { useReplaceChildren, useValue } from "~/frontend/kit/bind.ts";
import { css } from "~/frontend/kit/css.ts";
import { matchScore } from "~/frontend/kit/search.ts";

export type SelectedModel = { name: string; providerId: string };
type Model = Codec.InferOutput<typeof ModelOutput>;

export function ModelPicker(model: Sync.Ref<SelectedModel | undefined>) {
    const { span, dialog, button, header, strong, small, p, ul, li, input } = tags;
    const self = span({ class: "picker" }).$bind(ModelPickerStyle.useScope());

    const loaded = ref<{ models: Model[]; providers: Provider[] } | null>(null);
    const loading = ref(false);
    const search = ref("");

    const refresh = async () => {
        loading.set(true);
        try {
            const [models, providers] = await Promise.all([
                api.fetch("GET /v1/models", { params: { pathname: {}, search: {} } }),
                api.fetch("GET /v1/providers", { params: { pathname: {}, search: {} } }),
            ]);
            loaded.set({ models, providers });
        } catch (cause) {
            console.error(cause);
        } finally {
            loading.set(false);
        }
    };

    const items = combine({ loaded, search }).derive(({ loaded, search }) => {
        if (!loaded) {
            return p({ class: "hint" })
                .textContent(loading.derive((loading) => loading ? "Loading models..." : "Failed to load models."));
        }

        const providerNames = new Map(loaded.providers.map((provider) => [provider.id, provider.name]));
        const term = search.trim().toLowerCase();
        const items = loaded.models
            .map((item) => ({ item, score: matchScore(item.name, providerNames.get(item.providerId) ?? "", term) }))
            .filter((entry): entry is { item: Model; score: number } => entry.score !== null)
            .sort((a, b) => a.score - b.score || a.item.name.localeCompare(b.item.name));

        if (!items.length) {
            return [p({ class: "hint" }).textContent(term ? "No models match your search." : "No models available.")];
        }

        return items.map(({ item }) =>
            li().append$(
                button()
                    .type("button")
                    .ariaCurrent(
                        model.derive((current) => current?.name === item.name && current?.providerId === item.providerId ? "true" : null),
                    )
                    .append$(
                        strong().textContent(item.name),
                        small().textContent(providerNames.get(item.providerId) ?? item.providerId),
                    )
                    .onclick(() => {
                        model.set({ name: item.name, providerId: item.providerId });
                        modal.close();
                    }),
            )
        );
    });

    const modal = dialog().$bind(ModelModalStyle.useScope())
        .onclose(() => search.set(""))
        .append$(
            header().append$(
                strong().textContent("Select Model"),
                new Builder(document.createElement("search")).append$(
                    input().type("search").placeholder("Search models...").$bind(useValue(search)),
                    button()
                        .type("button")
                        .ariaLabel("Refresh models")
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
        .append$(small().textContent("Model"), strong().textContent(model.derive((model) => model?.name ?? "None")))
        .onclick(async () => {
            modal.showModal();
            if (loaded.get()) {
                scrollToSelected();
                return;
            }
            await refresh();
            scrollToSelected();
        });

    return self.append$(trigger, modal);
}

const ModelPickerStyle = css`
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

const ModelModalStyle = css`
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
            animation: model-picker-spin 0.6s linear infinite;
            cursor: progress !important;
        }

        &:disabled {
            cursor: default;
        }
    }

    ul {
        display: block grid;
        gap: 0.35em;
        list-style: none;
        padding-inline: 1em;
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

    @keyframes model-picker-spin {
        to {
            transform: rotate(360deg);
        }
    }
`;
