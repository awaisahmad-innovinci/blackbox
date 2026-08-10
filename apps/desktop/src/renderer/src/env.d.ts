export {};

declare global {
  interface Window {
    blackbox: {
      platform: NodeJS.Platform;
    };
  }
}
