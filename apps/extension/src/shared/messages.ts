// Message contracts between popup.ts and the background service worker.
// Type-only from the popup's perspective; the background module also uses
// these as real runtime discriminants (switch on `.type`).

export type RawClipCapture = Readonly<{
  title: string;
  sourceUrl: string;
  /** Selected text, or '' when nothing was selected (mainText is used instead). */
  selectionText: string;
  mainText: string;
}>;

export type ClipPayload = Readonly<{
  title: string;
  sourceUrl: string;
  content: string;
  capturedAt: string;
}>;

export type PopupRequest =
  | Readonly<{ type: 'stage-clip'; capture: RawClipCapture }>
  | Readonly<{ type: 'confirm-commit'; draftId: string }>
  | Readonly<{ type: 'discard'; draftId: string }>;

export type PreviewSummary = Readonly<{
  counts: Readonly<{ created: number; updated: number; deleted: number }>;
  touchedNodeIds: readonly string[];
}>;

export type CaptureErrorReason =
  'daemon-unavailable' | 'host-not-installed' | 'oversize-clip' | 'rejected' | 'unknown';

export type BackgroundResponse =
  | Readonly<{ type: 'preview-ready'; draftId: string; clip: ClipPayload; preview: PreviewSummary }>
  | Readonly<{ type: 'capture-error'; reason: CaptureErrorReason; message: string }>
  | Readonly<{ type: 'commit-success'; nodeId: string }>
  | Readonly<{ type: 'commit-error'; message: string }>
  | Readonly<{ type: 'discarded' }>;
