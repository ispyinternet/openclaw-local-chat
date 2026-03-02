export { };

declare global {
  interface Window {
    chatDesktop?: {
      getAppMeta: () => Promise<{ version: string; platform: string }>;
    };
  }
}
