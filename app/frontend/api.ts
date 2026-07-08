import { RouterClient } from "~/libs/routing/RouterClient.ts";
import { RoutesSchema } from "~/routes.ts";

export const api = RouterClient.create<RoutesSchema>({
    baseUrl: new URL("/", location.origin),
    schema: RoutesSchema,
    fetch: fetch.bind(window),
});
