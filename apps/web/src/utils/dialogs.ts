/* eslint-disable functional/prefer-tacit -- Wrappers for globals to enforce context boundaries */
export const showAlert = (message?: string): void => {
  // eslint-disable-next-line no-restricted-globals -- Wrapper for global alert
  alert(message);
};

export const showPrompt = (message?: string, _default?: string): string | null => {
  // eslint-disable-next-line no-restricted-globals -- Wrapper for global prompt
  return prompt(message, _default);
};

export const showConfirm = (message?: string): boolean => {
  return confirm(message);
};
