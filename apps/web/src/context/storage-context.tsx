import React, { createContext, useContext, useEffect, useState } from 'react';
import type { DeviceId } from '@canopy/graph';
import { fromAsyncThrowable } from '@canopy/graph';
import type { IndexedDBEventLog, GraphRegistry } from '@canopy/storage-indexeddb';
import { createIndexedDBEventLog, createGraphRegistry } from '@canopy/storage-indexeddb';
import { getOrCreateDeviceId } from '../utils/device-id';
import { seedVaultStore } from '../test/seed-vault';

interface StorageContextType {
  readonly eventLog: IndexedDBEventLog | null;
  readonly registry: GraphRegistry | null;
  readonly deviceId: DeviceId;
  readonly isLoading: boolean;
  readonly error: Error | null;
}

const StorageContext = createContext<StorageContextType>({
  eventLog: null,
  registry: null,
  deviceId: getOrCreateDeviceId(),
  isLoading: true,
  error: null,
});

export const StorageProvider: React.FC<Readonly<{ children: React.ReactNode }>> = ({
  children,
}) => {
  const [eventLog, setEventLog] = useState<IndexedDBEventLog | null>(null);
  const [registry, setRegistry] = useState<GraphRegistry | null>(null);
  const [deviceId] = useState<DeviceId>(getOrCreateDeviceId);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const initStorage = async () => {
      const result = await fromAsyncThrowable(async () => {
        const log = createIndexedDBEventLog();
        const logInit = await log.init();
        if (!logInit.ok) throw logInit.error;

        const reg = createGraphRegistry();
        const regInit = await reg.init();
        if (!regInit.ok) throw regInit.error;

        setEventLog(log);
        setRegistry(reg);

        const isDemoSeedEnabled =
          import.meta.env.VITE_CANOPY_DEMO_SEED === 'true' ||
          import.meta.env.CANOPY_DEMO_SEED === 'true' ||
          (typeof process !== 'undefined' && process.env?.CANOPY_DEMO_SEED === 'true');

        if (isDemoSeedEnabled) {
          const seedResult = await seedVaultStore(log, { registry: reg });
          if (!seedResult.ok) {
            console.error('Failed to seed demo vault:', seedResult.error);
          }
        }

        return undefined;
      });

      if (!result.ok) {
        console.error('Failed to initialize storage:', result.error);
        setError(result.error);
      }
      setIsLoading(false);
      return undefined;
    };

    initStorage();
    return undefined;
  }, []);

  return (
    <StorageContext.Provider value={{ eventLog, registry, deviceId, isLoading, error }}>
      {children}
    </StorageContext.Provider>
  );
};

export const useStorage = () => useContext(StorageContext);
