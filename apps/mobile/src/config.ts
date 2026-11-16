// Set EXPO_PUBLIC_SERVER_URL at build time. Use wss:// for anything that is not a local dev server.
export const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? 'ws://localhost:8080';
