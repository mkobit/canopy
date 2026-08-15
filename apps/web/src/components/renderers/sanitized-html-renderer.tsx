import React, { useEffect, useRef } from 'react';
import { sanitizeRenderedHtml } from './sanitize-html';

export interface SanitizedHtmlRendererProperties {
  readonly html: string;
  readonly className?: string;
}

// Mounts untrusted plugin HTML inside a closed shadow root after DOMPurify
// sanitization. The closed root contains plugin CSS to this block and blocks
// host-CSS bleed; it is not an XSS boundary (that rests on the sanitizer).
export const SanitizedHtmlRenderer: React.FC<SanitizedHtmlRendererProperties> = ({
  html,
  className,
}) => {
  const hostReference = useRef<HTMLDivElement | null>(null);
  const shadowReference = useRef<ShadowRoot | null>(null);

  useEffect(() => {
    const host = hostReference.current;
    if (!host) {
      return;
    }

    shadowReference.current ??= host.attachShadow({ mode: 'closed' });
    // Content is DOMPurify-sanitized above; assigning it into the shadow root is
    // the intended mount path, never a raw host-DOM innerHTML sink.

    shadowReference.current.innerHTML = sanitizeRenderedHtml(html);
  }, [html]);

  return <div ref={hostReference} className={className} />;
};
