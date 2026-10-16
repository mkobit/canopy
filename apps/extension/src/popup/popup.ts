import type { BackgroundResponse, PopupRequest, RawClipCapture } from '../shared/messages.js';
import { resolvePopupElements, type PopupElements } from './dom.js';

const popupElements = resolvePopupElements(document);

const setStatus = (elements: PopupElements, text: string): void => {
  elements.statusElement.textContent = text;
};

const setError = (elements: PopupElements, message: string): void => {
  elements.errorElement.textContent = message;
  elements.errorElement.style.display = 'block';
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

const showPreview = (
  elements: PopupElements,
  response: BackgroundResponse & Readonly<{ type: 'preview-ready' }>,
): void => {
  setStatus(elements, 'Review before saving:');
  elements.previewTitleElement.textContent = response.clip.title;
  elements.previewSourceElement.textContent = response.clip.sourceUrl;
  elements.previewContentElement.textContent = response.clip.content;
  elements.previewElement.style.display = 'block';

  elements.confirmButton.addEventListener(
    'click',
    () => {
      void handleConfirm(elements, response.draftId);
    },
    { once: true },
  );
  elements.discardButton.addEventListener(
    'click',
    () => {
      void handleDiscard(elements, response.draftId);
    },
    { once: true },
  );
};

const disableActions = (elements: PopupElements): void => {
  elements.confirmButton.disabled = true;
  elements.discardButton.disabled = true;
};

const handleConfirm = async (elements: PopupElements, draftId: string): Promise<void> => {
  disableActions(elements);
  setStatus(elements, 'Saving…');
  const response = await sendToBackground({ type: 'confirm-commit', draftId });
  if (response.type === 'commit-success') {
    setStatus(elements, `Saved as ${response.nodeId}.`);
    return;
  }
  setError(
    elements,
    response.type === 'commit-error' ? response.message : 'Could not save the clip.',
  );
  setStatus(elements, 'Save failed.');
};

const handleDiscard = async (elements: PopupElements, draftId: string): Promise<void> => {
  disableActions(elements);
  await sendToBackground({ type: 'discard', draftId });
  setStatus(elements, 'Discarded. Nothing was saved.');
  elements.previewElement.style.display = 'none';
};

const run = async (): Promise<void> => {
  if (!popupElements.ok) return;
  const elements = popupElements.value;

  // eslint-disable-next-line functional/no-try-statements -- top-level popup entry point; failures render as UI, not thrown
  try {
    const capture = await captureActiveTab();
    setStatus(elements, 'Staging the clip…');
    const response = await sendToBackground({ type: 'stage-clip', capture });
    if (response.type === 'preview-ready') {
      showPreview(elements, response);
      return;
    }
    setStatus(elements, 'Could not capture this page.');
    if (response.type === 'capture-error') {
      setError(elements, ERROR_GUIDANCE[response.reason] ?? response.message);
    }
  } catch (error) {
    setStatus(elements, 'Could not capture this page.');
    setError(elements, error instanceof Error ? error.message : 'Unknown error.');
  }
};

void run();
