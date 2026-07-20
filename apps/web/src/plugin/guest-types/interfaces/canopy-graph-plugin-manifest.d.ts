declare module 'canopy:graph/plugin-manifest' {
  export interface MenuItem {
    label: string;
    command: string;
    shortcut?: string;
  }
  export interface CommandContribution {
    id: string;
    title: string;
    category?: string;
  }
  export interface PluginManifest {
    name: string;
    version: string;
    description?: string;
    capabilities: Array<string>;
    menuItems: Array<MenuItem>;
    commands: Array<CommandContribution>;
  }
}
