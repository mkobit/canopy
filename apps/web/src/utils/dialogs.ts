// eslint-disable-next-line functional/no-return-void
export const showAlert = (message?: string): void => {
  // eslint-disable-next-line no-restricted-globals
  window.alert(message);
};

export const showPrompt = (message?: string, _default?: string): string | null => {
  // eslint-disable-next-line no-restricted-globals
  return window.prompt(message, _default);
};

export const showConfirm = (message?: string): boolean => {
  // eslint-disable-next-line no-restricted-globals
  return window.confirm(message);
};
