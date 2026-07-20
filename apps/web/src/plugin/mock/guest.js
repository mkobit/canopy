export const pluginLifecycle = {
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
  initialize() {},
  shutdown() {},
};

export class WizardSession {
  constructor(draft) {
    this.draft = draft;
    this.step = 0;
  }

  renderStepSchema() {
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

  handleStepSubmission(inputs) {
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
      const age = ageInput ? ageInput.value.val : 0;
      const event = {
        tag: 'node-created',
        val: {
          eventId: 'evt_mock_node',
          id: 'node_mock_plugin_output',
          nodeType: 'mock_output',
          properties: [
            {
              name: 'age',
              value: { tag: 'integer', val: BigInt(age) },
            },
          ],
          timestamp: new Date().toISOString(),
          deviceId: 'host_device',
          batchId: undefined,
        },
      };
      return {
        nextStep: { tag: 'complete' },
        eventsToStage: [event],
      };
    }
  }
}

export const wizardExecution = {
  WizardSession,
};
