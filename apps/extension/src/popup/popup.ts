import type { BackgroundResponse, PopupRequest, RawClipCapture } from '../shared/messages.js';

const statusElement = document.querySelector<HTMLParagraphElement>('#status');
const errorElement = document.querySelector<HTMLDivElement>('#error');
const previewElement = document.querySelector<HTMLDivElement>('#preview');
const previewTitleElement = document.querySelector<HTMLHeadingElement>('#preview-title');
const previewSourceElement = document.querySelector<HTMLParagraphElement>('#preview-source');
const previewContentElement = document.querySelector<HTMLDivElement>('#preview-content');
const confirmButton = document.querySelector<HTMLButtonElement>('#confirm-button');
const discardButton = document.querySelector<HTMLButtonElement>('#discard-button');

const setStatus = (text: string): void => {
  if (statusElement) statusElement.textContent = text;
};

const setError = (message: string): void => {
  if (!errorElement) return;
  errorElement.textContent = message;
  errorElement.style.display = 'block';
};

const ERROR_GUIDANCE: Readonly<Record<string, string>> = {
  'daemon-unavailable': 'Could not reach the Canopy daemon. Start apps/daemon, then try again.',
  'host-not-installed':
    'Could not reach the Canopy clip host. Install the native-messaging host (see apps/extension/AGENTS.md), then try again.',
  'oversize-clip': 'This clip is too large. Try selecting a smaller portion of the page.',
};

const sendToBackground = (request: PopupRequest): Promise<BackgroundResponse> =>
  chrome.runtime.sendMessage(request) as Promise<BackgroundResponse>;

const captureActiveTab = async (): Promise<RawClipCapture> => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab to capture.');

  const [injection] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content/content-script.js'],
  });
  return injection?.result as RawClipCapture;
};

const showPreview = (response: BackgroundResponse & Readonly<{ type: 'preview-ready' }>): void => {
  setStatus('Review before saving:');
  if (previewTitleElement) previewTitleElement.textContent = response.clip.title;
  if (previewSourceElement) previewSourceElement.textContent = response.clip.sourceUrl;
  if (previewContentElement) previewContentElement.textContent = response.clip.content;
  if (previewElement) previewElement.style.display = 'block';

  confirmButton?.addEventListener(
    'click',
    () => {
      void handleConfirm(response.draftId);
    },
    { once: true },
  );
  discardButton?.addEventListener(
    'click',
    () => {
      void handleDiscard(response.draftId);
    },
    { once: true },
  );
};

const disableActions = (): void => {
  if (confirmButton) confirmButton.disabled = true;
  if (discardButton) discardButton.disabled = true;
};

const handleConfirm = async (draftId: string): Promise<void> => {
  disableActions();
  setStatus('Saving…');
  const response = await sendToBackground({ type: 'confirm-commit', draftId });
  if (response.type === 'commit-success') {
    setStatus(`Saved as ${response.nodeId}.`);
    return;
  }
  setError(response.type === 'commit-error' ? response.message : 'Could not save the clip.');
  setStatus('Save failed.');
};

const handleDiscard = async (draftId: string): Promise<void> => {
  disableActions();
  await sendToBackground({ type: 'discard', draftId });
  setStatus('Discarded. Nothing was saved.');
  if (previewElement) previewElement.style.display = 'none';
};

const run = async (): Promise<void> => {
  // eslint-disable-next-line functional/no-try-statements -- top-level popup entry point; failures render as UI, not thrown
  try {
    const capture = await captureActiveTab();
    setStatus('Staging the clip…');
    const response = await sendToBackground({ type: 'stage-clip', capture });
    if (response.type === 'preview-ready') {
      showPreview(response);
      return;
    }
    setStatus('Could not capture this page.');
    if (response.type === 'capture-error') {
      setError(ERROR_GUIDANCE[response.reason] ?? response.message);
    }
  } catch (error) {
    setStatus('Could not capture this page.');
    setError(error instanceof Error ? error.message : 'Unknown error.');
  }
};

void run();
