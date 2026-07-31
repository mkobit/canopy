import type { Preview } from '@storybook/react';
import React from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import '@fontsource/inter';
import '@fontsource/jetbrains-mono';
import '@fontsource/space-grotesk';
import '@xyflow/react/dist/style.css';
import '../src/index.css';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
  decorators: [
    (Story) => (
      <ReactFlowProvider>
        <div className="w-full h-96 p-4 bg-slate-900 text-slate-100 font-sans">
          <Story />
        </div>
      </ReactFlowProvider>
    ),
  ],
};

export default preview;
