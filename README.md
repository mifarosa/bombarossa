# Bombarossa

Online + single-player Bomberman for iOS (Expo / React Native).

```
packages/game-core   deterministic game logic (TypeScript), shared by client and server, with tests and bot AI
apps/server          authoritative WebSocket game server (rooms of 4, bots fill empty slots)
apps/mobile          Expo app (Skia rendering, on-screen D-pad + bomb button)
```

## Local development

```bash
npm install
npm test                 # game-core unit tests
npm run server           # ws://localhost:8080  (GET /health for a liveness check)
```

The mobile app needs a development build (Skia is a native module, Expo Go is not enough).
Build it through the GitHub workflow below and install it from TestFlight.
Point the app at your server with `EXPO_PUBLIC_SERVER_URL` (use `wss://` for anything public).

## iOS builds on GitHub Actions → TestFlight

`.github/workflows/ios.yml` builds on a macOS runner and uploads to TestFlight. One-time setup:

1. In App Store Connect, create an app record whose bundle ID matches `ios.bundleIdentifier` in `apps/mobile/app.json` (default `com.bombarossa.app`, change it to your own).
2. App Store Connect → Users and Access → Integrations → create an API key with the **App Manager** role. Download the `.p8` file (only possible once).
3. In the GitHub repo → Settings → Secrets and variables → Actions, add:
   - secrets: `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8` (full contents of the `.p8` file), `APPLE_TEAM_ID`
   - variable: `SERVER_URL` (your server, e.g. `wss://game.example.com`)
4. Run the workflow from the Actions tab (or push to `main`). The build shows up in TestFlight after Apple finishes processing it.

## Server deployment

The server is a single Node process (`npm run server`, `PORT` env var). Host it anywhere that supports WebSockets and put TLS in front of it so the app can use `wss://`.
