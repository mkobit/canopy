// eslint-disable-next-line functional/no-return-void
export const showAlert = (message?: string): void => {
  globalThis.alert(message);
};

export const showPrompt = (message?: string, _default?: string): string | null => {
  return globalThis.prompt(message, _default);
};

export const showConfirm = (message?: string): boolean => {
  return globalThis.confirm(message);
};
