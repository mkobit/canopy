export const showAlert = (message?: string): void => {
  // eslint-disable-next-line no-restricted-globals -- Wrapper for global alert
  alert(message);
};

// eslint-disable-next-line functional/prefer-tacit -- Wrapper to restrict parameters and avoid global namespace reference issues
export const showPrompt = (message?: string, _default?: string): string | null => {
  // eslint-disable-next-line no-restricted-globals -- Wrapper for global prompt
  return prompt(message, _default);
};

// eslint-disable-next-line functional/prefer-tacit -- Wrapper to restrict parameters and avoid global namespace reference issues
export const showConfirm = (message?: string): boolean => {
  return confirm(message);
};
