import React, { createContext, useContext, useEffect, useState } from 'react';
import type { StorageAdapter } from '@canopy/storage';
import { IndexedDBAdapter } from '@canopy/storage';
import { fromAsyncThrowable } from '@canopy/types';

interface StorageContextType {
  readonly storage: StorageAdapter | null;
  readonly isLoading: boolean;
  readonly error: Error | null;
}

const StorageContext = createContext<StorageContextType>({
  storage: null,
  isLoading: true,
  error: null,
});

export const StorageProvider: React.FC<Readonly<{ children: React.ReactNode }>> = ({
  children,
}) => {
  const [storage, setStorage] = useState<StorageAdapter | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const initStorage = async () => {
      const result = await fromAsyncThrowable(async () => {
        // Use IndexedDBAdapter for browser environment
        const adapter = new IndexedDBAdapter();
        const initResult = await adapter.init();

        if (!initResult.ok) throw initResult.error;
        setStorage(adapter);
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
    <StorageContext.Provider value={{ storage, isLoading, error }}>
      {children}
    </StorageContext.Provider>
  );
};

export const useStorage = () => useContext(StorageContext);
