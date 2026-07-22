import type {
  pluginLifecycle as PluginLifecycleInterface,
  wizardExecution as WizardExecutionInterface,
} from 'canopy:graph/plugin';
import type {
  FormSchema,
  InputEntry,
  StepResult,
  WizardSession as WizardSessionClass,
} from 'canopy:graph/wizard-execution';
import type { DraftSessionHandle } from 'canopy:graph/draft-session';

export const pluginLifecycle: typeof PluginLifecycleInterface = {
  getManifest() {
    return {
      name: 'Mock Wizard Plugin',
      version: '1.0.0',
      description: 'A mock plugin for testing wizard UI flows',
      capabilities: ['wizard'],
      menuItems: [
        {
          label: 'Start Mock Wizard',
          command: 'mock-wizard:start',
          shortcut: 'Ctrl+Shift+M',
        },
      ],
      commands: [
        {
          id: 'mock-wizard:start',
          title: 'Start Mock Wizard',
          category: 'Plugins',
        },
      ],
    };
  },
  initialize() {
    return { tag: 'ok' as const, val: undefined };
  },
  shutdown() {
    return { tag: 'ok' as const, val: undefined };
  },
};

export class WizardSession implements WizardSessionClass {
  private readonly draft: DraftSessionHandle;
  private step: number;

  constructor(draft: DraftSessionHandle) {
    this.draft = draft;
    this.step = 0;
  }

  public renderStepSchema(): FormSchema {
    if (this.step === 0) {
      return {
        title: 'Mock Step 1',
        description: 'Please enter your name',
        fields: [
          {
            name: 'name',
            label: 'Your Name',
            kind: 'text',
            required: true,
          },
        ],
        submitLabel: 'Next',
      };
    } else {
      return {
        title: 'Mock Step 2',
        description: 'Please enter your age',
        fields: [
          {
            name: 'age',
            label: 'Your Age',
            kind: 'number',
            required: true,
          },
        ],
        submitLabel: 'Finish',
      };
    }
  }

  public handleStepSubmission(inputs: readonly InputEntry[]): StepResult {
    if (this.step === 0) {
      this.step = 1;
      return {
        nextStep: {
          tag: 'form',
          val: this.renderStepSchema(),
        },
        eventsToStage: [],
      };
    } else {
      const ageInput = inputs.find((i) => i.fieldName === 'age');
      const age = ageInput && ageInput.value.tag === 'integer' ? ageInput.value.val : 0n;
      const event = {
        tag: 'node-created' as const,
        val: {
          eventId: 'evt_mock_node',
          id: 'node_mock_plugin_output',
          nodeType: 'mock_output',
          properties: [
            {
              name: 'age',
              value: { tag: 'integer' as const, val: age },
            },
          ],
          timestamp: new Date().toISOString(),
          deviceId: 'host_device',
        },
      };
      return {
        nextStep: { tag: 'complete' as const },
        eventsToStage: [event],
      };
    }
  }
}

export const wizardExecution: typeof WizardExecutionInterface = {
  WizardSession,
};
