/** Server address baked in at build time (GitHub variable SERVER_URL). Can be overridden in Settings. */
export const DEFAULT_SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? '';
