export interface PluginConfig {
  readonly name: string;
  readonly entrypoint: string;
  readonly world: string;
  readonly outDir: string;
}

export interface ConfigSchema {
  readonly plugins: readonly PluginConfig[];
}
