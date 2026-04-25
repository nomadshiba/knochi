import { Router } from "~/libs/Router.ts";
import { RoutesSchema } from "~/routes.ts";

export const router = new Router({
    schema: RoutesSchema,
    metaMiddleware() {
        return { meta: {} };
    },
});
