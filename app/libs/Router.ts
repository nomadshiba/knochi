import { Codec } from "@nomadshiba/codec";
import { RouteResponse, RouteResponseOptions } from "~/libs/RouterResponse.ts";
import { _, PromiseOrValue } from "~/types.ts";

type SchemaKeyGeneric = `${string} /${string}`;
export type Schema = { [key: SchemaKeyGeneric]: { input: Codec<_>; output: Codec<_> } };
export type SchemaKey<TSchema extends Schema = Schema> = Extract<keyof TSchema, SchemaKeyGeneric>;

export namespace Schema {
    export type InferParams<TSchemaKey extends SchemaKey> = {
        pathname: Record<MapPathParams<InferPattern<TSchemaKey>["Path"]>[number], string>;
        search:
            & Record<MapSearchParams<InferPattern<TSchemaKey>["Search"]>[number], string>
            // deno-lint-ignore ban-types
            & Record<string & {}, string | undefined>;
    };

    // Internal Helpers
    type IsParam<T extends string> = T extends `:${infer U}` ? U : never;
    type InferPattern<K extends SchemaKey> = K extends `${string} ${infer Path}?${infer Search}` ? { Path: Path; Search: Search }
        : K extends `${string} ${infer Path}` ? { Path: Path; Search: "" }
        : never;
    type MapPathParams<T extends string> = T extends `/${infer U}/${infer Rest}` ? [IsParam<U>, ...MapPathParams<`/${Rest}`>]
        : T extends `/${infer U}` ? [IsParam<U>]
        : [];
    type MapSearchParams<T extends string> = T extends `${string}=${infer U}&${infer Rest}`
        ? [IsParam<U>, ...MapSearchParams<Rest>]
        : T extends `${string}=${infer U}` ? [IsParam<U>]
        : [];
}

export type RouteEvent = { request: Request; url: URL };

// WTF do i have to extract that for????
type InferItem<T extends Schema, K extends keyof T> = Extract<T[K], Schema[keyof Schema]>;

export type RouteHandler<
    TSchema extends Schema = _,
    TSchemaKey extends SchemaKey<TSchema> = _,
    TMeta = _,
> = (
    options: RouteHandlerOptions<TSchema, TSchemaKey, TMeta>,
) => PromiseOrValue<RouteHandlerResult<TSchema, TSchemaKey>>;

export type RouteHandlerOptions<
    TSchema extends Schema,
    TSchemaKey extends SchemaKey<TSchema>,
    TMeta,
> = {
    event: RouteEvent;
    params: Schema.InferParams<TSchemaKey>;
    data: Codec.InferOutput<InferItem<TSchema, TSchemaKey>["input"]>;
    meta: TMeta;
};

export type RouteHandlerResult<TSchema extends Schema, TSchemaKey extends SchemaKey<TSchema>> = RouteResponseOptions<
    Codec.InferInput<InferItem<TSchema, TSchemaKey>["output"]>
>;

export type RouteMiddlewareOptions<TSchema extends Schema = _> = {
    event: RouteEvent;
    params: Schema.InferParams<SchemaKey<TSchema>>;
    data: Codec.InferOutput<InferItem<TSchema, SchemaKey<TSchema>>["input"]>;
};

export type RouteMiddlewareResult<TMeta = _> = { meta: TMeta };

type Bucket = {
    pattern: URLPattern;
    methods: Map<string, {
        input: Codec<_>;
        output: Codec<_>;
        handler: RouteHandler | null;
    }>;
}[];
export class Router<const TSchema extends Schema, TMeta> {
    private readonly metaMiddleware?: (
        options: RouteMiddlewareOptions,
    ) => PromiseOrValue<RouteMiddlewareResult>;
    public readonly schema: TSchema;
    public readonly prefixBuckets: readonly (readonly [string, Bucket])[];

    constructor(params: {
        metaMiddleware?: (options: RouteMiddlewareOptions<TSchema>) => PromiseOrValue<RouteMiddlewareResult<TMeta>>;
        schema: TSchema;
    }) {
        this.schema = params.schema;
        this.metaMiddleware = params.metaMiddleware;

        const prefixBucketMap = new Map<string, Map<string, Bucket[number]>>();
        for (const [key, { input, output }] of Object.entries(this.schema)) {
            const [method, pattern] = key.split(" ");
            const [pathname, search] = pattern.split("?");
            const colonIndex = pathname.indexOf(":");
            const prefix = colonIndex === -1 ? pathname : pathname.slice(0, colonIndex);

            let bucket = prefixBucketMap.get(prefix);
            if (!bucket) {
                bucket = new Map();
                prefixBucketMap.set(prefix, bucket);
            }
            let patternMatch = bucket.get(pathname);
            if (!patternMatch) {
                const pattern = new URLPattern({ pathname, search });
                patternMatch = { pattern, methods: new Map() };
                bucket.set(pathname, patternMatch);
            }
            patternMatch.methods.set(method, { input, output, handler: null });
        }
        this.prefixBuckets = prefixBucketMap.entries()
            .map(([prefix, bucket]) =>
                [
                    prefix,
                    bucket.values().toArray()
                        .sort((a, b) => b.pattern.pathname.split("/").length - a.pattern.pathname.split("/").length),
                ] as const
            ).toArray()
            .sort(([a], [b]) => b.split("/").length - a.split("/").length);
    }

    registerHandler<TSchemaKey extends SchemaKey<TSchema>>(
        key: TSchemaKey,
        handler: RouteHandler<TSchema, TSchemaKey, TMeta>,
    ) {
        const [method, pattern] = key.split(" ");
        const [pathname, search] = pattern.split("?");
        for (const [prefix, bucket] of this.prefixBuckets) {
            if (!pathname.startsWith(prefix)) continue;
            for (const { pattern, methods } of bucket.values()) {
                const match = pattern.test({ pathname, search });
                if (!match) continue;
                const item = methods.get(method);
                if (!item) continue;
                item.handler = handler;
            }
        }
    }

    async resolveRequest(request: Request): Promise<Response> {
        const url = new URL(request.url);
        const event = { request, url };

        const { pathname, search } = url;
        const { method } = request;

        let hasPatternMatch = false;

        for (const [prefix, bucket] of this.prefixBuckets) {
            if (!pathname.startsWith(prefix)) continue;
            for (const { pattern, methods } of bucket.values()) {
                const match = pattern.exec({ pathname, search });
                if (!match) continue;
                const item = methods.get(method);
                if (!item) {
                    // Pattern matched but method didn't — remember this,
                    // but keep looking for a more specific pattern that does match.
                    hasPatternMatch = true;
                    continue;
                }
                const { handler } = item;
                if (!handler) return new RouteResponse({ status: "NotImplemented" });

                const params = {
                    pathname: match.pathname.groups,
                    search: Object.fromEntries(url.searchParams.entries()),
                };

                const contentType = request.headers.get("Content-Type");

                let data;
                try {
                    if (contentType === "application/json") {
                        [data] = item.input.decode(item.input.encode(await request.json()));
                    } else if (contentType === "application/octet-stream") {
                        [data] = item.input.decode(await request.bytes());
                    }
                } catch (reason) {
                    return new RouteResponse({ status: "BadRequest", message: String(reason) });
                }

                try {
                    const { meta } = await this.metaMiddleware?.({ event, params, data }) ?? {};
                    const options = await handler({ event, params, data, meta });

                    if ("data" in options) {
                        if (contentType === "application/json") {
                            return new RouteResponse(options);
                        }
                        if (contentType === "application/octet-stream") {
                            options.format = { kind: "application/octet-stream", codec: item.output };
                            return new RouteResponse(options);
                        }
                        return new RouteResponse({ status: "UnsupportedMediaType" });
                    }
                    return new RouteResponse(options);
                } catch (reason) {
                    if (reason instanceof Response) {
                        return reason;
                    }

                    console.error(reason);

                    const message = String(reason);
                    return new RouteResponse({ status: "InternalServerError", message });
                }
            }
        }

        if (hasPatternMatch) {
            return new RouteResponse({ status: "MethodNotAllowed" });
        }
        return new RouteResponse({ status: "NotFound" });
    }
}
