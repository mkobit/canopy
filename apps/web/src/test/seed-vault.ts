import type { DeviceId, Result } from '@canopy/graph';
import { asDeviceId, ok } from '@canopy/graph';
import type { EventLogStore } from '@canopy/storage';
import type { GraphRegistry } from '@canopy/storage-indexeddb';
import type { GenerateVaultOptions } from './generators/graph-generators';
import { generateGraphVault, graphToEvents } from './generators/graph-generators';

export type SeedVaultOptions = Partial<GenerateVaultOptions> &
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

  // Skip appending duplicate events if store already contains events for graphId.
  const existingEvents = await store.getEvents(graphId);
  if (!existingEvents.ok) {
    return existingEvents;
  }

  if (existingEvents.value.length === 0) {
    const graph = generateGraphVault({ preset, seed });
    const events = graphToEvents(graph, deviceId);

    const appendResult = await store.appendEvents(graphId, events);
    if (!appendResult.ok) {
      return appendResult;
    }
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
