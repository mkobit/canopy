import { Cause, Console, Effect, Option, Ref, Result, Runtime } from 'effect';
import { CliError, CliOutput } from 'effect/cli';
import type { HelpDoc as HelpDocumentType } from 'effect/cli/HelpDoc';

interface CommandView {
  readonly name: string;
  readonly description: string | undefined;
  readonly shortDescription: string | undefined;
  readonly subcommands: readonly Readonly<{ commands: readonly CommandView[] }>[];
}

interface CommandRow {
  readonly path: string;
  readonly synopsis: string;
  readonly description: string;
}

const synopsisByPath: Readonly<Record<string, string>> = {
  status: '[--socket-path text] [--json]',
  node: '',
  'node get': '[--socket-path text] [--json] --id text',
  'node list': '[--socket-path text] [--json] [--type text] [--limit integer]',
  'node create': '[--socket-path text] [--json] [--id text] --type text [--properties text]',
  'node update': '[--socket-path text] [--json] --id text --properties text',
  'node delete': '[--socket-path text] [--json] --id text',
  edge: '',
  'edge get': '[--socket-path text] [--json] --id text',
  'edge list':
    '[--socket-path text] [--json] [--type text] [--source text] [--target text] [--limit integer]',
  'edge create':
    '[--socket-path text] [--json] [--id text] --type text --source text --target text [--properties text]',
  'edge delete': '[--socket-path text] [--json] --id text',
  types: '',
  'types list': '[--socket-path text] [--json] [--kind node | edge | all]',
  'types get': '[--socket-path text] [--json] --id text',
  query: '',
  'query execute': '[--socket-path text] [--json] [--query text] [--steps text]',
  events: '',
  'events tail': '[--socket-path text] [--json] [--graph-id text] [--from-sequence integer]',
};

const globalOptions = [
  {
    name: '--completions sh | bash | fish | zsh',
    kind: 'One of the following: sh, bash, fish, zsh',
    description: 'Generate a completion script for a specific shell.',
  },
  {
    name: '--log-level all | trace | debug | info | warning | error | fatal | none',
    kind: 'One of the following: all, trace, debug, info, warning, error, fatal, none',
    description: 'Sets the minimum log level for a command.',
  },
  {
    name: '(-h, --help)',
    kind: 'A true or false value.',
    description: 'Show the help documentation for a command.',
  },
  {
    name: '--wizard',
    kind: 'A true or false value.',
    description: 'Start wizard mode for a command.',
  },
  {
    name: '--version',
    kind: 'A true or false value.',
    description: 'Show the version of the application.',
  },
] as const;

const typeDescription = (type: string): string => {
  if (type.includes(' | ')) {
    return `One of the following: ${type.replaceAll(' | ', ', ')}`;
  }
  if (type === 'string') return 'A user-defined piece of text.';
  if (type === 'integer') return 'A whole number.';
  return type === 'boolean' ? 'A true or false value.' : '';
};

const collectRows = (
  command: CommandView,
  displayPrefix: readonly string[],
  metadataPrefix: readonly string[],
): readonly CommandRow[] => {
  const path = [...displayPrefix, command.name];
  const key = [...metadataPrefix, command.name].join(' ');
  const row: CommandRow = {
    path: path.join(' '),
    synopsis: synopsisByPath[key] ?? '',
    description: command.shortDescription ?? command.description ?? '',
  };
  return [
    row,
    ...command.subcommands.flatMap((group) =>
      group.commands.flatMap((child) =>
        collectRows(child, path, [...metadataPrefix, command.name]),
      ),
    ),
  ];
};

const findCommand = (root: CommandView, path: readonly string[]): CommandView | undefined =>
  path.length === 0 || path[0] !== root.name ? undefined : findCommandFrom(root, path.slice(1));

const findCommandFrom = (
  current: CommandView,
  path: readonly string[],
): CommandView | undefined => {
  if (path.length === 0) return current;
  const child = current.subcommands
    .flatMap((group) => group.commands)
    .find((command) => command.name === path[0]);
  return child ? findCommandFrom(child, path.slice(1)) : undefined;
};

const renderRows = (rows: readonly CommandRow[]): string => {
  const entries = rows.map((row) => ({
    left: `- ${row.path}${row.synopsis ? ` ${row.synopsis}` : ''}`,
    right: row.description,
  }));
  const width = Math.max(...entries.map((entry) => entry.left.length));
  return entries.map((entry) => `  ${entry.left.padEnd(width + 2)}${entry.right}`).join('\n\n');
};

const renderOption = (
  name: string,
  kind: string,
  description: string,
  optional: boolean,
  optionalCount = 1,
): string =>
  `${name}\n\n  ${kind}\n\n  ${description}${optional ? '\n\n  This setting is optional.'.repeat(optionalCount) : ''}`;

const renderHelp = (
  document_: HelpDocumentType,
  root: CommandView,
  rootName: string,
  displayName: string,
  version: string,
): string => {
  const path = document_.usage
    .replace(/ \[flags\].*$/, '')
    .split(' ')
    .filter((part) => !part.startsWith('<'));
  const commandPath = path[0] === rootName ? path.slice(1) : path;
  const shownPath = commandPath.length === 0 ? rootName : commandPath.join(' ');
  const flags = document_.flags.map((flag) => {
    const value = flag.type === 'boolean' ? '' : ` ${flag.type.replaceAll('string', 'text')}`;
    return {
      name: `--${flag.name}${value}`,
      type: flag.type,
      kind: typeDescription(flag.type),
      description: Option.getOrElse(flag.description, () => ''),
      optional: !flag.required,
    };
  });
  const sections = [
    `${displayName}\n\n${displayName} ${version}`,
    `USAGE\n\n$ ${shownPath}${flags.map((flag) => ` ${flag.optional ? `[${flag.name}]` : flag.name}`).join('')}`,
    ...(document_.description ? [`DESCRIPTION\n\n${document_.description}`] : []),
  ];
  const allOptions = [
    ...flags.map((flag) =>
      renderOption(
        flag.name,
        flag.kind,
        flag.description,
        flag.optional,
        flag.type === 'boolean' ? 2 : 1,
      ),
    ),
    ...globalOptions.map((option) =>
      renderOption(option.name, option.kind, option.description, true),
    ),
  ];
  const optionSection = `OPTIONS\n\n${allOptions.join('\n\n')}`;
  const current = findCommand(root, [rootName, ...commandPath]);
  const commandSection = current?.subcommands.length
    ? `COMMANDS\n\n${renderRows(
        current.subcommands.flatMap((group) =>
          group.commands.flatMap((command) => collectRows(command, [], commandPath)),
        ),
      )}`
    : undefined;
  return `${[...sections, optionSection, ...(commandSection ? [commandSection] : [])].join('\n\n')}\n`;
};

const legacyErrorMessage = (error: Readonly<CliError.CliError>, root: CommandView): string => {
  switch (error._tag) {
    case 'UnrecognizedOption': {
      const commands = root.subcommands
        .flatMap((group) => group.commands)
        .map((command) => command.name);
      return error.command?.length === 1 && error.command[0] === root.name
        ? `Invalid subcommand for ${root.name} - use one of ${commands.map((command) => `'${command}'`).join(', ')}`
        : `Received unknown argument: '${error.option}'`;
    }
    case 'InvalidValue': {
      const expected = error.expected.includes('finite number') ? 'integer' : error.expected;
      return `'${error.value}' is not a ${expected}`;
    }
    case 'UnknownSubcommand': {
      return `Invalid subcommand for ${error.parent?.join(' ') ?? root.name} - use one of ${error.suggestions.map((command) => `'${command}'`).join(', ')}`;
    }
    case 'DuplicateOption':
    case 'MissingOption':
    case 'MissingArgument':
    case 'UnexpectedArgument':
    case 'UserError':
    case 'ShowHelp': {
      return error.message;
    }
  }
};

const diagnosticError = (
  error: Readonly<CliError.NonShowHelpErrors>,
  root: CommandView,
): string => {
  const commandMismatch =
    error._tag === 'UnknownSubcommand' ||
    (error._tag === 'UnrecognizedOption' &&
      error.command?.length === 1 &&
      error.command[0] === root.name);
  const tag = commandMismatch
    ? 'CommandMismatch'
    : error._tag === 'UnrecognizedOption'
      ? 'InvalidValue'
      : error._tag;
  return `\n  Error: ${JSON.stringify({
    _tag: tag,
    error: { _tag: 'Paragraph', value: { _tag: 'Text', value: legacyErrorMessage(error, root) } },
  })}`;
};

// Keep the native runtime prefix and the legacy multiline diagnostic without
// Console.log inserting an extra argument separator before the newline.
const reportDiagnostic = (message: string | Cause.Cause<unknown>): Effect.Effect<void> =>
  Console.consoleWith((hostConsole) =>
    Effect.logError(message).pipe(
      Effect.provideService(
        Console.Console,
        Object.assign(Object.create(hostConsole), {
          log: new Proxy(hostConsole.log, {
            apply: (_target, _thisArgument, arguments_: readonly unknown[]) => {
              Reflect.apply(
                hostConsole.log,
                hostConsole,
                arguments_.length === 2 && arguments_.every((item) => typeof item === 'string')
                  ? [arguments_.join(typeof message === 'string' ? '' : '\n  ')]
                  : arguments_,
              );
              return undefined;
            },
          }),
        }),
      ),
    ),
  );

// Mirror runMain's reporting rules while preserving the complete native cause
// text and stack under the executable's legacy multiline presentation.
export const withExecutableErrorReporting = <A, E, R>(
  program: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.tapCause(program, (cause) =>
    Cause.hasInterruptsOnly(cause) || !Runtime.getErrorReported(Cause.squash(cause))
      ? Effect.void
      : reportDiagnostic(cause),
  );

interface DeferredHelp {
  readonly text: string | undefined;
  readonly write: readonly unknown[] | undefined;
}

export const runWithCliOutput = <A, E, R>(
  program: Effect.Effect<A, E, R>,
  formatter: CliOutput.Formatter,
  root: CommandView,
): Effect.Effect<A, E | CliError.CliError, R> =>
  Console.consoleWith((hostConsole) =>
    Effect.gen(function* () {
      // One help write is deferred; ordinary command output stays live.
      const help = yield* Ref.make<DeferredHelp>({ text: undefined, write: undefined });
      const flushHelp = Effect.sync(() => {
        const pending = Ref.getUnsafe(help).write;
        if (pending) {
          Reflect.apply(hostConsole.log, hostConsole, pending);
          Effect.runSync(Ref.update(help, (current) => ({ ...current, write: undefined })));
        }
        return undefined;
      });
      const invocationFormatter: CliOutput.Formatter = {
        ...formatter,
        formatHelpDoc: (document_) => {
          Effect.runSync(flushHelp);
          const text = formatter.formatHelpDoc(document_);
          Effect.runSync(Ref.set(help, { text, write: undefined }));
          return text;
        },
      };
      const invocationConsole: Console.Console = Object.assign(Object.create(hostConsole), {
        log: new Proxy(hostConsole.log, {
          apply: (_target, _thisArgument, arguments_: readonly unknown[]) => {
            const pending = Ref.getUnsafe(help);
            if (
              pending.text !== undefined &&
              arguments_.length === 1 &&
              arguments_[0] === pending.text
            ) {
              Effect.runSync(Ref.set(help, { text: undefined, write: arguments_ }));
            } else {
              Effect.runSync(flushHelp);
              Reflect.apply(hostConsole.log, hostConsole, arguments_);
            }
            return undefined;
          },
        }),
      });
      const result = yield* Effect.result(
        program.pipe(
          Effect.provide(CliOutput.layer(invocationFormatter)),
          Effect.provideService(Console.Console, invocationConsole),
        ),
      );
      if (Result.isFailure(result)) {
        const error = result.failure;
        if (CliError.isCliError(error) && error._tag === 'ShowHelp' && error.errors.length > 0) {
          yield* Console.error(`${formatter.formatErrors(error.errors)}\n`);
          yield* reportDiagnostic(
            error.errors.map((item) => diagnosticError(item, root)).join('\n'),
          );
        } else {
          yield* flushHelp;
        }
        return yield* Effect.fail(error);
      }
      yield* flushHelp;
      return result.success;
    }),
  );

export const cliOutputLayer = (
  root: CommandView,
  rootName: string,
  displayName: string,
  version: string,
): CliOutput.Formatter => ({
  formatHelpDoc: (document_) => renderHelp(document_, root, rootName, displayName, version),
  formatCliError: (error) => legacyErrorMessage(error, root),
  formatError: (error) => legacyErrorMessage(error, root),
  formatVersion: (_name, currentVersion) => `${displayName} ${currentVersion}`,
  formatErrors: (errors) => errors.map((error) => legacyErrorMessage(error, root)).join('\n'),
});
