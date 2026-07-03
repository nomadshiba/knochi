import { ProviderClient, ProviderModel } from "~/backend/providers/ProviderClient.ts";

const CACHE_TTL_MS = 60_000;

type CacheEntry = { models: ProviderModel[]; expires: number };

const cache = new Map<string, CacheEntry>();

export async function getCachedModels(providerId: string, base: string, key: string): Promise<ProviderModel[]> {
    const now = Date.now();
    const cached = cache.get(providerId);
    if (cached && cached.expires > now) {
        return cached.models;
    }

    const client = ProviderClient.create({ base, key });
    const models = await client.models();
    cache.set(providerId, { models, expires: now + CACHE_TTL_MS });
    return models;
}

export function invalidateModelsCache(providerId: string): void {
    cache.delete(providerId);
}