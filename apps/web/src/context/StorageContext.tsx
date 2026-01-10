import React, { createContext, useContext, useEffect, useState } from 'react';
import { StorageAdapter, IndexedDBAdapter } from '@canopy/storage';

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

export const StorageProvider: React.FC<Readonly<{ children: React.ReactNode }>> = ({ children }) => {
  const [storage, setStorage] = useState<StorageAdapter | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const initStorage = async () => {
      try {
        // Use IndexedDBAdapter for browser environment
        const adapter = new IndexedDBAdapter();
        const result = await adapter.init();
        // eslint-disable-next-line functional/no-throw-statements
        if (!result.ok) throw result.error;
        setStorage(adapter);
      } catch (err) {
        console.error("Failed to initialize storage:", err);
        setError(err instanceof Error ? err : new Error('Unknown error initializing storage'));
      } finally {
        setIsLoading(false);
      }
    };

    initStorage();
  }, []);

  return (
    <StorageContext.Provider value={{ storage, isLoading, error }}>
      {children}
    </StorageContext.Provider>
  );
};

export const useStorage = () => useContext(StorageContext);
