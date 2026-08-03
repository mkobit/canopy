import type { DeviceId, Result } from '@canopy/graph';
import { asDeviceId, ok } from '@canopy/graph';
import type { EventLogStore } from '@canopy/storage';
import type { GraphRegistry } from '@canopy/storage-indexeddb';
import type { GenerateVaultOptions } from './generators/graph-generators';
import { generateGraphVault, graphToEvents } from './generators/graph-generators';
import { Temporal } from 'temporal-polyfill';

export type SeedVaultOptions = GenerateVaultOptions &
  Readonly<{
    graphId?: string | undefined;
    deviceId?: DeviceId | undefined;
    registry?: GraphRegistry | undefined;
  }>;

export const seedVaultStore = async (
  store: EventLogStore,
  options?: SeedVaultOptions,
): Promise<Result<void, Error>> => {
  const preset = options?.preset ?? 'demo';
  const seed = options?.seed ?? 42;
  const graphId = options?.graphId ?? 'demo-graph';
  const deviceId = options?.deviceId ?? asDeviceId('demo-device');

  const graph = generateGraphVault({ preset, seed });
  const events = graphToEvents(graph, deviceId);

  const appendResult = await store.appendEvents(graphId, events);
  if (!appendResult.ok) {
    return appendResult;
  }

  if (options?.registry) {
    const now = Temporal.Now.instant().toString();
    const upsertResult = await options.registry.upsert({
      id: graphId,
      name: 'Demo Graph',
      createdAt: now,
      updatedAt: now,
    });
    if (!upsertResult.ok) {
      return upsertResult;
    }
  }

  return ok(undefined);
};
