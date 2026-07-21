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
/* eslint-disable unicorn/catch-error-name -- Standard local names preferred in wizard boundaries */
/* eslint-disable unicorn/no-negated-condition -- Clean conditionals matching specs preferred */
/* eslint-disable unicorn/prefer-number-is-safe-integer -- Compatibility with integer validation */
/* eslint-disable unicorn/no-useless-else -- Clear flow control */
/* eslint-disable functional/no-throw-statements -- Safe boundary checking */

import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { useGraph } from './graph-context';
import type { DraftSession, GraphEvent } from '@canopy/graph';
import { createDraftSession, SYSTEM_IDS } from '@canopy/graph';
import { DraftSessionHandle } from '../plugin/draft-session-shim';
import { Temporal } from 'temporal-polyfill';
// eslint-disable-next-line import/extensions -- Mock javascript plugin must be loaded directly
import * as mockPlugin from '../plugin/mock/guest.js';

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
      if (node.type === SYSTEM_IDS.TYPE_PLUGIN) {
        const manifestStr = node.properties.get('manifest');
        if (typeof manifestStr === 'string') {
          try {
            const parsed = JSON.parse(manifestStr) as PluginManifest;
            plugins.push(parsed);
          } catch (e) {
            console.error('Failed to parse plugin manifest:', e);
          }
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
    } catch (e: any) {
      console.error('Failed to start wizard session:', e);
    }
  };

  const submitWizardStep = async (inputs: ReadonlyMap<string, any>) => {
    if (!activeWizard || !parentSession) return;

    try {
      // Map inputs to WIT format
      const witInputs = [...inputs.entries()].map(([fieldName, value]) => {
        let tag = 'none';
        let val: any = value;
        if (typeof value === 'string') {
          tag = 'text';
        } else if (typeof value === 'number') {
          if (Number.isInteger(value)) {
            tag = 'integer';
            val = BigInt(value);
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
          value: { tag, val },
        };
      });

      const submissionResult = activeWizard.wizardSessionInstance.handleStepSubmission(witInputs);
      const stepResult =
        submissionResult.ok !== undefined ? submissionResult.value : submissionResult;

      // Apply staged events to the draft session
      if (stepResult.eventsToStage && stepResult.eventsToStage.length > 0) {
        const deviceId = parentSession.graph().metadata.modifiedBy;
        const draftEvents: GraphEvent[] = stepResult.eventsToStage.map((e: any) => {
          const timestampStr = e.val.timestamp || Temporal.Now.instant().toString();
          const deviceIdStr = e.val.deviceId || deviceId;
          const eventIdStr = e.val.eventId || crypto.randomUUID();

          if (e.tag === 'node-created') {
            const properties = new Map<string, any>();
            if (e.val.properties) {
              for (const entry of e.val.properties) {
                // Map properties
                let val = entry.value.val;
                if (entry.value.tag === 'integer') {
                  val = Number(val);
                }
                properties.set(entry.name, val);
              }
            }
            return {
              type: 'NodeCreated',
              eventId: eventIdStr,
              id: e.val.id,
              nodeType: e.val.nodeType,
              properties,
              timestamp: timestampStr,
              deviceId: deviceIdStr,
              batchId: e.val.batchId,
            };
          } else if (e.tag === 'node-properties-updated') {
            const changes = new Map<string, any>();
            if (e.val.changes) {
              for (const entry of e.val.changes) {
                let val = entry.value.val;
                if (entry.value.tag === 'integer') {
                  val = Number(val);
                }
                changes.set(entry.name, val);
              }
            }
            return {
              type: 'NodePropertiesUpdated',
              eventId: eventIdStr,
              id: e.val.id,
              changes,
              timestamp: timestampStr,
              deviceId: deviceIdStr,
              batchId: e.val.batchId,
            };
          }
          throw new Error(`Unsupported event tag: ${e.tag}`);
        });

        const applyRes = activeWizard.draftSession.applyEvents(draftEvents);
        if (!applyRes.ok) {
          setActiveWizard((prev) =>
            prev ? { ...prev, error: `Apply error: ${applyRes.error.type}` } : null,
          );
          return;
        }
      }

      // Check next step destination
      const nextStep = stepResult.nextStep;
      if (nextStep.tag === 'form') {
        setActiveWizard((prev) =>
          prev
            ? {
                ...prev,
                stepSchema: nextStep.val,
                error: null,
              }
            : null,
        );
      } else if (nextStep.tag === 'complete') {
        // Commit draft session events to parent graph session
        const currentRevRes = activeWizard.draftSession.getParentRevision();
        if (!currentRevRes.ok) {
          setActiveWizard((prev) =>
            prev ? { ...prev, error: 'Could not resolve parent revision.' } : null,
          );
          return;
        }

        const commitRes = await activeWizard.draftSession.commit(currentRevRes.value);
        if (!commitRes.ok) {
          setActiveWizard((prev) =>
            prev ? { ...prev, error: `Commit error: ${commitRes.error.type}` } : null,
          );
          return;
        }

        setActiveWizard(null);
      } else if (nextStep.tag === 'cancel') {
        activeWizard.draftSession.discard();
        setActiveWizard(null);
      }
    } catch (e: any) {
      console.error('Error during step submission:', e);
      setActiveWizard((prev) => (prev ? { ...prev, error: e.message || String(e) } : null));
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
