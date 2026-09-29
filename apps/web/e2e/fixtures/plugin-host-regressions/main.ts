import { asDeviceId, asGraphId, createGraphSession } from '@canopy/graph';
import { createGraphAccessContext } from '@canopy/graph-access';
import { createInMemoryEventStore } from '@canopy/storage';
import { intersectCapabilities } from '@canopy/plugin-host';
import { executeSandboxedGuestPluginInWorker } from '../../../src/components/renderers/execute-wasm-render-worker';

type Listener = EventListenerOrEventListenerObject;

type WorkerStats = Readonly<{
  activeListeners: number;
  terminated: boolean;
  dispatchLateMessage: () => boolean;
}>;

type TrackedWorker = Readonly<{ worker: Worker; stats: WorkerStats }>;

const createTrackedWorker = (): TrackedWorker => {
  const worker = new Worker(new URL('worker.ts', import.meta.url), {
    type: 'module',
    name: 'plugin-host-regression-worker',
  });
  const activeListeners = { current: 0 };
  const termination = { current: false };
  const executeRequestId = { current: '' };
  const addEventListener = worker.addEventListener.bind(worker);
  const removeEventListener = worker.removeEventListener.bind(worker);
  const postMessage = worker.postMessage.bind(worker);
  worker.addEventListener = (
    type: string,
    listener: Listener,
    options?: boolean | AddEventListenerOptions,
  ): void => {
    activeListeners.current += 1;
    addEventListener(type, listener, options);
  };
  worker.removeEventListener = (
    type: string,
    listener: Listener,
    options?: boolean | EventListenerOptions,
  ): void => {
    activeListeners.current = Math.max(0, activeListeners.current - 1);
    removeEventListener(type, listener, options);
  };
  worker.postMessage = (message: unknown): void => {
    if (
      typeof message === 'object' &&
      message !== null &&
      'kind' in message &&
      message.kind === 'execute' &&
      'requestId' in message &&
      typeof message.requestId === 'string'
    ) {
      executeRequestId.current = message.requestId;
    }
    postMessage(message);
  };
  const stats: WorkerStats = {
    get activeListeners() {
      return activeListeners.current;
    },
    get terminated() {
      return termination.current;
    },
    dispatchLateMessage: (): boolean => {
      if (executeRequestId.current.length === 0) return false;
      worker.dispatchEvent(
        new MessageEvent('message', {
          data: {
            kind: 'host-call',
            requestId: executeRequestId.current,
            callId: 'late-call',
            group: 'mutations',
            method: 'write:create-node',
            token: '*',
            payloadJson: JSON.stringify({
              id: 'late-message-node',
              type: 'fixture:regression',
              properties: {},
            }),
          },
        }),
      );
      return true;
    },
  };
  const terminate = worker.terminate.bind(worker);
  worker.terminate = (): void => {
    termination.current = true;
    terminate();
  };
  return { worker, stats };
};

type WorkerResult = Readonly<{
  ok: boolean;
  value?: string;
  category?: string;
  message?: string;
}>;

const run = async (): Promise<void> => {
  const graphId = asGraphId('plugin-host-regressions-graph');
  const eventLogStore = createInMemoryEventStore();
  const session = createGraphSession(
    eventLogStore,
    graphId,
    asDeviceId('plugin-host-regressions-device'),
  );
  await session.load();
  const context = createGraphAccessContext({ graph: session.graph(), session, eventLogStore });
  const workers: TrackedWorker[] = [];
  const createWorker = (): Worker => {
    const worker = createTrackedWorker();
    workers.push(worker);
    return worker.worker;
  };

  const runGuest = async (mode: string, token: string, timeoutMs = 1000): Promise<WorkerResult> => {
    const result = await executeSandboxedGuestPluginInWorker(
      context,
      token,
      JSON.stringify({ mode }),
      'fixture:regression',
      timeoutMs,
      createWorker,
    );
    return result.ok
      ? { ok: true, value: result.value }
      : { ok: false, category: result.error.category, message: result.error.message };
  };

  const manifestIntersection = intersectCapabilities(['read:nodes', 'write:create-node'], 'read:*');
  const forgedWildcard = await runGuest('forge-wildcard', manifestIntersection);
  const changedToken = await runGuest('changed-token', manifestIntersection);
  const authorized = await runGuest('authorized', 'write:create-node');
  const eventsAfterAuthorized = await eventLogStore.getEvents(graphId);
  const authorizedEventCount = eventsAfterAuthorized.ok ? eventsAfterAuthorized.value.length : -1;

  const runaway = await runGuest('hang', 'write:create-node', 40);
  const runawayWorker = workers.at(-1);
  const lateMessageDispatched = runawayWorker?.stats.dispatchLateMessage() ?? false;
  const eventsAfterLateMessage = await eventLogStore.getEvents(graphId);
  const lateMessageEventCount = eventsAfterLateMessage.ok
    ? eventsAfterLateMessage.value.length
    : -1;
  const runawayStats = runawayWorker?.stats;

  const report = {
    manifestIntersection,
    forgedWildcard,
    changedToken,
    authorized,
    authorizedEventCount,
    runaway,
    listenerCleanup: runawayStats?.activeListeners === 0,
    nativeTermination: runawayStats?.terminated === true,
    lateMessageDispatched,
    lateMessageEventCount,
    lateMessageRejected: lateMessageEventCount === authorizedEventCount,
  };
  const root = document.querySelector('#root');
  if (root instanceof HTMLElement) {
    root.innerHTML = '<pre data-testid="regressions-report"></pre>';
    const output = root.querySelector('[data-testid="regressions-report"]');
    if (output !== null) output.textContent = JSON.stringify(report);
    root.dataset.testid = 'regressions-complete';
  }
};

void run().catch((error: unknown) => {
  const root = document.querySelector('#root');
  if (root instanceof HTMLElement) {
    root.dataset.testid = 'regressions-failed';
    root.textContent = error instanceof Error ? error.message : String(error);
  }
});
