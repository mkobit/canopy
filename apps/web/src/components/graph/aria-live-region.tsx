import React, { useState, useCallback } from 'react';

export interface AriaLiveRegionProperties {
  readonly message?: string | undefined;
  readonly role?: 'status' | 'alert' | undefined;
}

export function AriaLiveRegion({
  message,
  role = 'status',
}: AriaLiveRegionProperties): React.ReactElement {
  return (
    <div
      role={role}
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
      data-testid="aria-live-region"
    >
      {message ?? ''}
    </div>
  );
}

export function useAriaLiveAnnouncer(): Readonly<{
  announcement: string;
  announce: (message: string) => void;
}> {
  const [announcement, setAnnouncement] = useState<string>('');

  const announce = useCallback((message: string) => {
    setAnnouncement(message);
  }, []);

  return {
    announcement,
    announce,
  };
}
