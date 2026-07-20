import type { ValidationError } from './validation-types';
import type { PropertyValue } from './properties';

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
    // eslint-disable-next-line unicorn/prefer-uint8array-base64 -- atob is standard and widely compatible in this runtime environment
    const raw = atob(cleaned.slice(0, 32));
    const isWasmMagic =
      raw.codePointAt(0) === 0x00 &&
      raw.codePointAt(1) === 0x61 &&
      raw.codePointAt(2) === 0x73 &&
      raw.codePointAt(3) === 0x6d;

    if (!isWasmMagic) {
      return [
        {
          path: [propertyName],
          message: `Property '${propertyName}' is missing the WebAssembly magic binary header`,
          expected: 'WebAssembly magic header (0x00 0x61 0x73 0x6d)',
          actual: cleaned.slice(0, 8),
        },
      ];
    }
  } catch {
    return [
      {
        path: [propertyName],
        message: `Property '${propertyName}' failed base64 decoding`,
        expected: 'valid base64',
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

    const nameErr =
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

    const versionErr =
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

    const capabilitiesErr = Array.isArray(manifest.capabilities)
      ? manifest.capabilities
          .map((cap: unknown, idx): ValidationError | null => {
            if (typeof cap !== 'string' || cap.trim() === '') {
              return {
                path: [propertyName, 'capabilities', String(idx)],
                message: `Manifest property 'capabilities' element at index ${idx} must be a non-empty string`,
                expected: 'non-empty string',
                actual: typeof cap === 'string' ? cap : typeof cap,
              };
            }
            return null;
          })
          .filter((err): err is ValidationError => err !== null)
      : [
          {
            path: [propertyName, 'capabilities'],
            message: "Manifest property 'capabilities' must be an array of strings",
            expected: 'array of strings',
            actual: typeof manifest.capabilities,
          },
        ];

    const menuItemsErr =
      manifest.menuItems === undefined
        ? []
        : Array.isArray(manifest.menuItems)
          ? manifest.menuItems.flatMap((item: unknown, idx): readonly ValidationError[] => {
              if (typeof item !== 'object' || item === null || Array.isArray(item)) {
                return [
                  {
                    path: [propertyName, 'menuItems', String(idx)],
                    message: `Manifest property 'menuItems' element at index ${idx} must be an object`,
                    expected: 'object',
                    actual: typeof item,
                  },
                ];
              }
              const itemRec = item as Record<string, unknown>;
              const itemLabelErr =
                typeof itemRec.label !== 'string' || itemRec.label.trim() === ''
                  ? [
                      {
                        path: [propertyName, 'menuItems', String(idx), 'label'],
                        message: "Menu item 'label' must be a non-empty string",
                        expected: 'non-empty string',
                        actual: typeof itemRec.label,
                      },
                    ]
                  : [];
              const itemCommandErr =
                typeof itemRec.command !== 'string' || itemRec.command.trim() === ''
                  ? [
                      {
                        path: [propertyName, 'menuItems', String(idx), 'command'],
                        message: "Menu item 'command' must be a non-empty string",
                        expected: 'non-empty string',
                        actual: typeof itemRec.command,
                      },
                    ]
                  : [];
              const itemShortcutErr =
                itemRec.shortcut !== undefined && typeof itemRec.shortcut !== 'string'
                  ? [
                      {
                        path: [propertyName, 'menuItems', String(idx), 'shortcut'],
                        message: "Menu item 'shortcut' must be a string if defined",
                        expected: 'string',
                        actual: typeof itemRec.shortcut,
                      },
                    ]
                  : [];
              return [...itemLabelErr, ...itemCommandErr, ...itemShortcutErr];
            })
          : [
              {
                path: [propertyName, 'menuItems'],
                message: "Manifest property 'menuItems' must be an array of objects",
                expected: 'array of objects',
                actual: typeof manifest.menuItems,
              },
            ];

    const commandsErr =
      manifest.commands === undefined
        ? []
        : Array.isArray(manifest.commands)
          ? manifest.commands.flatMap((cmd: unknown, idx): readonly ValidationError[] => {
              if (typeof cmd !== 'object' || cmd === null || Array.isArray(cmd)) {
                return [
                  {
                    path: [propertyName, 'commands', String(idx)],
                    message: `Manifest property 'commands' element at index ${idx} must be an object`,
                    expected: 'object',
                    actual: typeof cmd,
                  },
                ];
              }
              const cmdRec = cmd as Record<string, unknown>;
              const cmdIdErr =
                typeof cmdRec.id !== 'string' || cmdRec.id.trim() === ''
                  ? [
                      {
                        path: [propertyName, 'commands', String(idx), 'id'],
                        message: "Command 'id' must be a non-empty string",
                        expected: 'non-empty string',
                        actual: typeof cmdRec.id,
                      },
                    ]
                  : [];
              const cmdTitleErr =
                typeof cmdRec.title !== 'string' || cmdRec.title.trim() === ''
                  ? [
                      {
                        path: [propertyName, 'commands', String(idx), 'title'],
                        message: "Command 'title' must be a non-empty string",
                        expected: 'non-empty string',
                        actual: typeof cmdRec.title,
                      },
                    ]
                  : [];
              const cmdCategoryErr =
                cmdRec.category !== undefined && typeof cmdRec.category !== 'string'
                  ? [
                      {
                        path: [propertyName, 'commands', String(idx), 'category'],
                        message: "Command 'category' must be a string if defined",
                        expected: 'string',
                        actual: typeof cmdRec.category,
                      },
                    ]
                  : [];
              return [...cmdIdErr, ...cmdTitleErr, ...cmdCategoryErr];
            })
          : [
              {
                path: [propertyName, 'commands'],
                message: "Manifest property 'commands' must be an array of objects",
                expected: 'array of objects',
                actual: typeof manifest.commands,
              },
            ];

    return [...nameErr, ...versionErr, ...capabilitiesErr, ...menuItemsErr, ...commandsErr];
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
