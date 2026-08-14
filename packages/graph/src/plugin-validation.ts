import type { ValidationError } from './validation-types';
import type { PropertyValue } from './properties';

// Recognized WASM plugin capability vocabulary. Kept in sync with
// `KNOWN_WASM_CAPABILITIES` in `@canopy/api-adapter`; duplicated here because
// `@canopy/graph` is the leaf kernel and cannot import adapter packages.
// Exported so a cross-package guard test can assert the two lists stay
// identical until `canopy-3xr` derives them from a single source.
export const RECOGNIZED_WASM_CAPABILITIES: ReadonlySet<string> = new Set([
  'read:nodes',
  'read:edges',
  'read:properties',
  'read:traversal',
  'read:events',
  'write:create-node',
  'write:update-properties',
  'write:delete-node',
  'write:create-edge',
  'write:delete-edge',
  'render:declarative',
  'render:raw-html',
  'wizard',
  'read:*',
  'write:*',
  '*',
]);

const brotliDecompressSync = (() => {
  // eslint-disable-next-line functional/no-try-statements
  try {
    const hasImportMeta = import.meta !== undefined;
    const request =
      hasImportMeta && 'require' in import.meta
        ? (import.meta as Readonly<{ require?: unknown }>).require
        : // eslint-disable-next-line unicorn/prefer-module
          typeof require === 'undefined'
          ? undefined
          : // eslint-disable-next-line unicorn/prefer-module
            require;

    if (typeof request === 'function') {
      const zlib = request('node:zlib') as Readonly<{ brotliDecompressSync?: unknown }> | undefined;
      if (zlib && typeof zlib.brotliDecompressSync === 'function') {
        return zlib.brotliDecompressSync as (buffer: Uint8Array) => Uint8Array;
      }
    }
  } catch {
    // Ignore errors in browser or environments without require
  }
  return null;
})();

function decodeBase64(base64: string): Uint8Array {
  // eslint-disable-next-line functional/no-try-statements
  try {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(base64, 'base64');
    }
  } catch {
    // ignore and fall back to browser atob
  }

  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  // eslint-disable-next-line functional/no-loop-statements -- standard loop to populate typed array
  for (let index = 0; index < binaryString.length; index++) {
    // eslint-disable-next-line functional/immutable-data -- standard code point assignment
    bytes[index] = binaryString.codePointAt(index) || 0;
  }
  return bytes;
}

export function validateWasmBinaryProperty(
  value: PropertyValue,
  propertyName: string,
): readonly ValidationError[] {
  if (typeof value !== 'string') {
    return [
      {
        path: [propertyName],
        message: `Property '${propertyName}' must be a string`,
        expected: 'string',
        actual: typeof value,
      },
    ];
  }

  const cleaned = value.replaceAll(/\s+/g, '');
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
  if (!base64Regex.test(cleaned)) {
    return [
      {
        path: [propertyName],
        message: `Property '${propertyName}' is not a valid base64-encoded string`,
        expected: 'base64 string',
        actual: value,
      },
    ];
  }

  // eslint-disable-next-line functional/no-try-statements
  try {
    const raw = atob(cleaned.slice(0, 32));
    const isWasmMagic =
      raw.codePointAt(0) === 0x00 &&
      raw.codePointAt(1) === 0x61 &&
      raw.codePointAt(2) === 0x73 &&
      raw.codePointAt(3) === 0x6d;

    if (isWasmMagic) {
      return [];
    }

    if (brotliDecompressSync !== null) {
      const compressedBytes = decodeBase64(cleaned);
      const decompressed = brotliDecompressSync(compressedBytes);
      const isDecompressedWasmMagic =
        decompressed[0] === 0x00 &&
        decompressed[1] === 0x61 &&
        decompressed[2] === 0x73 &&
        decompressed[3] === 0x6d;

      if (!isDecompressedWasmMagic) {
        return [
          {
            path: [propertyName],
            message: `Property '${propertyName}' is missing the WebAssembly magic binary header`,
            expected: 'WebAssembly magic header (0x00 0x61 0x73 0x6d)',
            actual: cleaned.slice(0, 8),
          },
        ];
      }
    }
  } catch {
    return [
      {
        path: [propertyName],
        message: `Property '${propertyName}' failed WebAssembly magic binary header validation or Brotli decompression`,
        expected: 'valid WebAssembly binary (raw or Brotli-compressed)',
        actual: value,
      },
    ];
  }

  return [];
}

// eslint-disable-next-line max-lines-per-function
export function validatePluginManifestProperty(
  value: PropertyValue,
  propertyName: string,
): readonly ValidationError[] {
  if (typeof value !== 'string') {
    return [
      {
        path: [propertyName],
        message: `Property '${propertyName}' must be a string`,
        expected: 'string',
        actual: typeof value,
      },
    ];
  }

  // eslint-disable-next-line functional/no-try-statements
  try {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return [
        {
          path: [propertyName],
          message: `Property '${propertyName}' must parse to a JSON object`,
          expected: 'JSON object',
          actual: typeof parsed,
        },
      ];
    }

    const manifest = parsed as Record<string, unknown>;

    const nameError =
      typeof manifest.name !== 'string' || manifest.name.trim() === ''
        ? [
            {
              path: [propertyName, 'name'],
              message: "Manifest property 'name' must be a non-empty string",
              expected: 'non-empty string',
              actual: typeof manifest.name === 'string' ? manifest.name : typeof manifest.name,
            },
          ]
        : [];

    const versionError =
      typeof manifest.version !== 'string' || manifest.version.trim() === ''
        ? [
            {
              path: [propertyName, 'version'],
              message: "Manifest property 'version' must be a non-empty string",
              expected: 'non-empty string',
              actual:
                typeof manifest.version === 'string' ? manifest.version : typeof manifest.version,
            },
          ]
        : [];

    const capabilitiesError = Array.isArray(manifest.capabilities)
      ? manifest.capabilities
          .map((cap: unknown, index): ValidationError | null => {
            if (typeof cap !== 'string' || cap.trim() === '') {
              return {
                path: [propertyName, 'capabilities', String(index)],
                message: `Manifest property 'capabilities' element at index ${index} must be a non-empty string`,
                expected: 'non-empty string',
                actual: typeof cap === 'string' ? cap : typeof cap,
              };
            }
            if (!RECOGNIZED_WASM_CAPABILITIES.has(cap)) {
              return {
                path: [propertyName, 'capabilities', String(index)],
                message: `Manifest property 'capabilities' element at index ${index} ('${cap}') is not a recognized capability`,
                expected: 'recognized WasmCapability string',
                actual: cap,
              };
            }
            return null;
          })
          .filter((error): error is ValidationError => error !== null)
      : [
          {
            path: [propertyName, 'capabilities'],
            message: "Manifest property 'capabilities' must be an array of strings",
            expected: 'array of strings',
            actual: typeof manifest.capabilities,
          },
        ];

    const menuItemsError =
      manifest.menuItems === undefined
        ? []
        : Array.isArray(manifest.menuItems)
          ? manifest.menuItems.flatMap((item: unknown, index): readonly ValidationError[] => {
              if (typeof item !== 'object' || item === null || Array.isArray(item)) {
                return [
                  {
                    path: [propertyName, 'menuItems', String(index)],
                    message: `Manifest property 'menuItems' element at index ${index} must be an object`,
                    expected: 'object',
                    actual: typeof item,
                  },
                ];
              }
              const itemRec = item as Record<string, unknown>;
              const itemLabelError =
                typeof itemRec.label !== 'string' || itemRec.label.trim() === ''
                  ? [
                      {
                        path: [propertyName, 'menuItems', String(index), 'label'],
                        message: "Menu item 'label' must be a non-empty string",
                        expected: 'non-empty string',
                        actual: typeof itemRec.label,
                      },
                    ]
                  : [];
              const itemCommandError =
                typeof itemRec.command !== 'string' || itemRec.command.trim() === ''
                  ? [
                      {
                        path: [propertyName, 'menuItems', String(index), 'command'],
                        message: "Menu item 'command' must be a non-empty string",
                        expected: 'non-empty string',
                        actual: typeof itemRec.command,
                      },
                    ]
                  : [];
              const itemShortcutError =
                itemRec.shortcut !== undefined && typeof itemRec.shortcut !== 'string'
                  ? [
                      {
                        path: [propertyName, 'menuItems', String(index), 'shortcut'],
                        message: "Menu item 'shortcut' must be a string if defined",
                        expected: 'string',
                        actual: typeof itemRec.shortcut,
                      },
                    ]
                  : [];
              return [...itemLabelError, ...itemCommandError, ...itemShortcutError];
            })
          : [
              {
                path: [propertyName, 'menuItems'],
                message: "Manifest property 'menuItems' must be an array of objects",
                expected: 'array of objects',
                actual: typeof manifest.menuItems,
              },
            ];

    const commandsError =
      manifest.commands === undefined
        ? []
        : Array.isArray(manifest.commands)
          ? manifest.commands.flatMap((command: unknown, index): readonly ValidationError[] => {
              if (typeof command !== 'object' || command === null || Array.isArray(command)) {
                return [
                  {
                    path: [propertyName, 'commands', String(index)],
                    message: `Manifest property 'commands' element at index ${index} must be an object`,
                    expected: 'object',
                    actual: typeof command,
                  },
                ];
              }
              const commandRec = command as Record<string, unknown>;
              const commandIdError =
                typeof commandRec.id !== 'string' || commandRec.id.trim() === ''
                  ? [
                      {
                        path: [propertyName, 'commands', String(index), 'id'],
                        message: "Command 'id' must be a non-empty string",
                        expected: 'non-empty string',
                        actual: typeof commandRec.id,
                      },
                    ]
                  : [];
              const commandTitleError =
                typeof commandRec.title !== 'string' || commandRec.title.trim() === ''
                  ? [
                      {
                        path: [propertyName, 'commands', String(index), 'title'],
                        message: "Command 'title' must be a non-empty string",
                        expected: 'non-empty string',
                        actual: typeof commandRec.title,
                      },
                    ]
                  : [];
              const commandCategoryError =
                commandRec.category !== undefined && typeof commandRec.category !== 'string'
                  ? [
                      {
                        path: [propertyName, 'commands', String(index), 'category'],
                        message: "Command 'category' must be a string if defined",
                        expected: 'string',
                        actual: typeof commandRec.category,
                      },
                    ]
                  : [];
              return [...commandIdError, ...commandTitleError, ...commandCategoryError];
            })
          : [
              {
                path: [propertyName, 'commands'],
                message: "Manifest property 'commands' must be an array of objects",
                expected: 'array of objects',
                actual: typeof manifest.commands,
              },
            ];

    return [
      ...nameError,
      ...versionError,
      ...capabilitiesError,
      ...menuItemsError,
      ...commandsError,
    ];
  } catch {
    return [
      {
        path: [propertyName],
        message: `Property '${propertyName}' must be a valid JSON string`,
        expected: 'valid JSON',
        actual: value,
      },
    ];
  }
}
