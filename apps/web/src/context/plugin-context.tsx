/* eslint-disable functional/no-try-statements -- WASM integration requires boundary exception handling */
/* eslint-disable functional/no-loop-statements -- Staging graph events requires sequential iteration */
/* eslint-disable functional/immutable-data -- Map mutations are encapsulated within event parsing */
/* eslint-disable functional/no-let -- Local variables used during WASM type conversions */
/* eslint-disable max-lines-per-function -- Context provider exposes multiple complex hooks */
/* eslint-disable @typescript-eslint/no-explicit-any -- WASM and JCO output contains dynamically-typed structures */
/* eslint-disable unicorn/prefer-direct-iteration -- WIT inputs format matches object entries exactly */
/* eslint-disable unicorn/prefer-switch -- Submissions have different dynamic branches */
/* eslint-disable unicorn/prefer-early-return -- Clean toggle structures */
/* eslint-disable functional/readonly-type -- React properties layout demands readonly fields */
/* eslint-disable @typescript-eslint/no-empty-function -- Context defaults are intentionally empty */
/* eslint-disable functional/prefer-immutable-types -- Web framework variables have mutable structures */
/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- Casting dynamic WASM structures requires assertions */
/* eslint-disable unicorn/no-negated-condition -- Clean conditionals matching specs preferred */
/* eslint-disable unicorn/prefer-number-is-safe-integer -- Compatibility with integer validation */
/* eslint-disable unicorn/no-useless-else -- Clear flow control */
/* eslint-disable functional/no-throw-statements -- Safe boundary checking */

import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { useGraph } from './graph-context';
import type { DraftSession, GraphEvent } from '@canopy/graph';
import { createDraftSession, SYSTEM_IDS } from '@canopy/graph';
import { DraftSessionHandle } from '../plugin/draft-session-shim';
import * as mockPlugin from '../plugin/mock/guest';

export interface MenuItem {
  readonly label: string;
  readonly command: string;
  readonly shortcut?: string;
}

export interface CommandContribution {
  readonly id: string;
  readonly title: string;
  readonly category?: string;
}

export interface PluginManifest {
  readonly name: string;
  readonly version: string;
  readonly description?: string;
  readonly capabilities: readonly string[];
  readonly menuItems: readonly MenuItem[];
  readonly commands: readonly CommandContribution[];
}

export type FieldKind = 'text' | 'number' | 'boolean' | 'date' | 'node-reference';

export interface FieldDefinition {
  readonly name: string;
  readonly label: string;
  readonly kind: FieldKind;
  readonly required: boolean;
  readonly defaultValue?: any;
  readonly options?: readonly string[];
}

export interface FormSchema {
  readonly title: string;
  readonly description?: string;
  readonly fields: readonly FieldDefinition[];
  readonly submitLabel: string;
}

export interface ActiveWizardState {
  readonly pluginName: string;
  readonly commandId: string;
  readonly stepSchema: FormSchema;
  readonly draftSession: DraftSession;
  readonly wizardSessionInstance: any;
  readonly error: string | null;
}

interface PluginContextType {
  readonly loadedPlugins: readonly PluginManifest[];
  readonly menuItems: readonly MenuItem[];
  readonly commands: readonly CommandContribution[];
  readonly activeWizard: ActiveWizardState | null;
  readonly startWizard: (commandId: string) => Promise<void>;
  readonly submitWizardStep: (inputs: ReadonlyMap<string, any>) => Promise<void>;
  readonly cancelWizard: () => void;
}

const PluginContext = createContext<PluginContextType>({
  loadedPlugins: [],
  menuItems: [],
  commands: [],
  activeWizard: null,
  startWizard: async () => {},
  submitWizardStep: async () => {},
  cancelWizard: () => {},
});

const STATIC_PLUGINS: ReadonlyMap<string, any> = new Map([['Mock Wizard Plugin', mockPlugin]]);

export const PluginProvider: React.FC<{ readonly children: React.ReactNode }> = ({ children }) => {
  const { graph, session: parentSession } = useGraph();
  const [loadedPlugins, setLoadedPlugins] = useState<readonly PluginManifest[]>([]);
  const [activeWizard, setActiveWizard] = useState<ActiveWizardState | null>(null);

  // Scan graph for plugins when the graph changes
  useEffect(() => {
    if (!graph) {
      setLoadedPlugins([]);
      return;
    }

    const plugins: PluginManifest[] = [];
    for (const node of graph.nodes.values()) {
      if (node.type !== SYSTEM_IDS.TYPE_PLUGIN) {
        continue;
      }

      const manifestString = node.properties.get('manifest');
      if (typeof manifestString === 'string') {
        try {
          const parsed = JSON.parse(manifestString) as PluginManifest;
          plugins.push(parsed);
        } catch (error) {
          console.error('Failed to parse plugin manifest:', error);
        }
      }
    }
    setLoadedPlugins(plugins);
  }, [graph]);

  const menuItems = useMemo(() => loadedPlugins.flatMap((p) => p.menuItems), [loadedPlugins]);
  const commands = useMemo(() => loadedPlugins.flatMap((p) => p.commands), [loadedPlugins]);

  const startWizard = async (commandId: string) => {
    if (!parentSession) {
      console.error('No active graph session to start draft session.');
      return;
    }

    // Find the plugin that contributes this command
    const manifest = loadedPlugins.find((p) => p.commands.some((c) => c.id === commandId));
    if (!manifest) {
      console.error(`No loaded plugin found for command ${commandId}`);
      return;
    }

    const pluginModule = STATIC_PLUGINS.get(manifest.name);
    if (!pluginModule) {
      console.error(`Plugin implementation not found in registry: ${manifest.name}`);
      return;
    }

    // Verify capability and exports using reflection.
    if (!manifest.capabilities.includes('wizard')) {
      console.error(`Plugin '${manifest.name}' does not declare capability 'wizard'.`);
      return;
    }

    if (
      typeof pluginModule !== 'object' ||
      pluginModule === null ||
      !('wizardExecution' in pluginModule) ||
      !pluginModule.wizardExecution
    ) {
      console.error(`Plugin '${manifest.name}' does not export 'wizardExecution' interface.`);
      return;
    }

    try {
      const draft = createDraftSession(parentSession);
      const draftHandle = new DraftSessionHandle(draft, parentSession.graph().metadata.modifiedBy);

      // Instantiate wizard session from plugin
      const WizardSessionClass = pluginModule.wizardExecution.WizardSession;
      const wizardInstance = new WizardSessionClass(draftHandle);

      // Render the initial step schema
      const schemaResult = wizardInstance.renderStepSchema();
      const stepSchema: FormSchema =
        schemaResult.ok !== undefined ? schemaResult.value : schemaResult;

      setActiveWizard({
        pluginName: manifest.name,
        commandId,
        stepSchema,
        draftSession: draft,
        wizardSessionInstance: wizardInstance,
        error: null,
      });
    } catch (error: any) {
      console.error('Failed to start wizard session:', error);
    }
  };

  const submitWizardStep = async (inputs: ReadonlyMap<string, any>) => {
    if (!activeWizard || !parentSession) return;

    try {
      // Map inputs to WIT format
      const witInputs = [...inputs.entries()].map(([fieldName, value]) => {
        let tag = 'none';
        let value_: any = value;
        if (typeof value === 'string') {
          tag = 'text';
        } else if (typeof value === 'number') {
          if (Number.isInteger(value)) {
            tag = 'integer';
            value_ = BigInt(value);
          } else {
            tag = 'decimal';
          }
        } else if (typeof value === 'boolean') {
          tag = 'boolean';
        } else if (Array.isArray(value)) {
          tag = 'list-of-text';
        }
        return {
          fieldName,
          value: { tag, val: value_ },
        };
      });

      const submissionResult = activeWizard.wizardSessionInstance.handleStepSubmission(witInputs);
      const stepResult =
        submissionResult.ok !== undefined ? submissionResult.value : submissionResult;

      // Apply staged events to the draft session
      if (stepResult.eventsToStage && stepResult.eventsToStage.length > 0) {
        const deviceId = parentSession.graph().metadata.modifiedBy;
        const draftEvents: GraphEvent[] = stepResult.eventsToStage.map((event_: any) => {
          const timestampString = event_.val.timestamp || Temporal.Now.instant().toString();
          const deviceIdString = event_.val.deviceId || deviceId;
          const eventIdString = event_.val.eventId || crypto.randomUUID();

          if (event_.tag === 'node-created') {
            const properties = new Map<string, any>();
            if (event_.val.properties) {
              for (const entry of event_.val.properties) {
                // Map properties
                let value = entry.value.val;
                if (entry.value.tag === 'integer') {
                  value = Number(value);
                }
                properties.set(entry.name, value);
              }
            }
            return {
              type: 'NodeCreated',
              eventId: eventIdString,
              id: event_.val.id,
              nodeType: event_.val.nodeType,
              properties,
              timestamp: timestampString,
              deviceId: deviceIdString,
              batchId: event_.val.batchId,
            };
          } else if (event_.tag === 'node-properties-updated') {
            const changes = new Map<string, any>();
            if (event_.val.changes) {
              for (const entry of event_.val.changes) {
                let value = entry.value.val;
                if (entry.value.tag === 'integer') {
                  value = Number(value);
                }
                changes.set(entry.name, value);
              }
            }
            return {
              type: 'NodePropertiesUpdated',
              eventId: eventIdString,
              id: event_.val.id,
              changes,
              timestamp: timestampString,
              deviceId: deviceIdString,
              batchId: event_.val.batchId,
            };
          }
          throw new Error(`Unsupported event tag: ${event_.tag}`);
        });

        const applyResult = activeWizard.draftSession.applyEvents(draftEvents);
        if (!applyResult.ok) {
          setActiveWizard((previous) =>
            previous ? { ...previous, error: `Apply error: ${applyResult.error.type}` } : null,
          );
          return;
        }
      }

      // Check next step destination
      const nextStep = stepResult.nextStep;
      if (nextStep.tag === 'form') {
        setActiveWizard((previous) =>
          previous
            ? {
                ...previous,
                stepSchema: nextStep.val,
                error: null,
              }
            : null,
        );
      } else if (nextStep.tag === 'complete') {
        // Commit draft session events to parent graph session
        const currentRevResult = activeWizard.draftSession.getParentRevision();
        if (!currentRevResult.ok) {
          setActiveWizard((previous) =>
            previous ? { ...previous, error: 'Could not resolve parent revision.' } : null,
          );
          return;
        }

        const commitResult = await activeWizard.draftSession.commit(currentRevResult.value);
        if (!commitResult.ok) {
          setActiveWizard((previous) =>
            previous ? { ...previous, error: `Commit error: ${commitResult.error.type}` } : null,
          );
          return;
        }

        setActiveWizard(null);
      } else if (nextStep.tag === 'cancel') {
        activeWizard.draftSession.discard();
        setActiveWizard(null);
      }
    } catch (error: any) {
      console.error('Error during step submission:', error);
      setActiveWizard((previous) =>
        previous ? { ...previous, error: error.message || String(error) } : null,
      );
    }
  };

  const cancelWizard = () => {
    if (activeWizard) {
      activeWizard.draftSession.discard();
      setActiveWizard(null);
    }
  };

  return (
    <PluginContext.Provider
      value={{
        loadedPlugins,
        menuItems,
        commands,
        activeWizard,
        startWizard,
        submitWizardStep,
        cancelWizard,
      }}
    >
      {children}
    </PluginContext.Provider>
  );
};

export const usePlugin = () => useContext(PluginContext);
