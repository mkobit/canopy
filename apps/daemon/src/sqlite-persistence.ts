import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SQLitePersistence } from '@canopy/storage-sqlite';

const isErrnoException = (value: unknown): value is NodeJS.ErrnoException =>
  value instanceof Error && 'code' in value;

/**
 * node:fs-backed SQLitePersistence for createSQLiteEventLog. There is no
 * shipped filesystem persistence adapter for @canopy/storage-sqlite anywhere
 * in the repo (it only ships the sql.js-backed EventLogStore itself), so the
 * daemon host owns this small adapter.
 *
 * Uses Promise#catch instead of try/catch/throw to stay within this package's
 * functional lint rules (functional/no-try-statements, functional/no-throw-statements);
 * createSQLiteEventLog's own init/appendEvents already wrap calls to this adapter
 * in fromAsyncThrowable, turning a rejected promise here into a proper Result err
 * at the call site.
 */
export const createFileSystemSqlitePersistence = (databasePath: string): SQLitePersistence => ({
  read: () =>
    fs.promises
      .readFile(databasePath)
      .catch((error: unknown) =>
        isErrnoException(error) && error.code === 'ENOENT' ? null : Promise.reject(error),
      ),

  write: async (data) => {
    await fs.promises.mkdir(path.dirname(databasePath), { recursive: true, mode: 0o700 });
    await fs.promises.writeFile(databasePath, data);
  },
});
