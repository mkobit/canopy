import { Cause, Console, Effect, Option, Ref, Result, Runtime } from 'effect';
import { CliError, CliOutput } from 'effect/cli';
import type { HelpDoc as HelpDocumentType } from 'effect/cli/HelpDoc';

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
  if (type.includes(' | ')) return `One of the following: ${type.replaceAll(' | ', ', ')}`;
  if (type === 'string') return 'A user-defined piece of text.';
  if (type === 'integer') return 'A whole number.';
  return type === 'boolean' ? 'A true or false value.' : '';
};

const renderOption = (
  name: string,
  kind: string,
  description: string,
  optional: boolean,
  optionalCount = 1,
): string =>
  `${name}\n\n  ${kind}\n\n  ${description}${optional ? '\n\n  This setting is optional.'.repeat(optionalCount) : ''}`;

const renderHelp = (document_: HelpDocumentType, displayName: string, version: string): string => {
  const usage = document_.usage.replace(/ \[flags\].*$/, '');
  const flags = document_.flags.map((flag) => {
    const value = flag.type === 'boolean' ? '' : ` ${flag.type.replaceAll('string', 'text')}`;
    return {
      name: `--${flag.name}${value}`,
      kind: typeDescription(flag.type),
      description: Option.getOrElse(flag.description, () => ''),
      optional: !flag.required,
    };
  });
  const options = [
    ...flags.map((flag) =>
      renderOption(
        flag.name,
        flag.kind,
        flag.description,
        flag.optional,
        flag.name === '--ephemeral' ? 2 : 1,
      ),
    ),
    ...globalOptions.map((option) =>
      renderOption(option.name, option.kind, option.description, true),
    ),
  ];
  const sections = [
    `${displayName}\n\n${displayName} ${version}`,
    `USAGE\n\n$ ${usage}${flags.map((flag) => ` ${flag.optional ? `[${flag.name}]` : flag.name}`).join('')}`,
    ...(document_.description ? [`DESCRIPTION\n\n${document_.description}`] : []),
  ];
  return `${[...sections, `OPTIONS\n\n${options.join('\n\n')}`].join('\n\n')}\n`;
};

const errorMessage = (error: Readonly<CliError.CliError>): string => {
  switch (error._tag) {
    case 'UnrecognizedOption': {
      return `Received unknown argument: '${error.option}'`;
    }
    case 'InvalidValue': {
      return `'${error.value}' is not a ${error.expected}`;
    }
    case 'UnknownSubcommand':
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

const diagnosticError = (error: Readonly<CliError.NonShowHelpErrors>): string => {
  const tag = error._tag === 'UnrecognizedOption' ? 'InvalidValue' : error._tag;
  return `\n  Error: ${JSON.stringify({
    _tag: tag,
    error: { _tag: 'Paragraph', value: { _tag: 'Text', value: errorMessage(error) } },
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

export const runWithDaemonCliOutput = <A, E, R>(
  program: Effect.Effect<A, E, R>,
  formatter: CliOutput.Formatter,
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
          yield* reportDiagnostic(error.errors.map(diagnosticError).join('\n'));
        } else {
          yield* flushHelp;
        }
        return yield* Effect.fail(error);
      }
      yield* flushHelp;
      return result.success;
    }),
  );

export const daemonCliFormatter = (displayName: string, version: string): CliOutput.Formatter => ({
  formatHelpDoc: (document_) => renderHelp(document_, displayName, version),
  formatCliError: errorMessage,
  formatError: errorMessage,
  formatVersion: (_name, currentVersion) => `${displayName} ${currentVersion}`,
  formatErrors: (errors) => errors.map(errorMessage).join('\n'),
});
