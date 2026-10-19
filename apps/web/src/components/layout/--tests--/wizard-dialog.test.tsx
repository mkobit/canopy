import '../../../test/setup';
import { describe, it, expect, mock, afterEach } from 'bun:test';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';

const activeWizard = {
  stepSchema: { title: 'Test wizard', fields: [], submitLabel: '' },
  error: null,
};

mock.module('../../../context/plugin-context', () => ({
  usePlugin: () => ({ activeWizard, submitWizardStep: mock(), cancelWizard: mock() }),
}));

import { WizardDialog } from '../wizard-dialog';

afterEach(() => {
  cleanup();
});

describe('WizardDialog', () => {
  it('uses the default submit label when the step label is empty', () => {
    render(<WizardDialog />);

    expect(screen.getByText('Submit')).toBeDefined();
  });
});
