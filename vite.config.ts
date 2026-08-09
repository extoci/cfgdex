import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { configApi } from "./server/config-api";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";
const remoteUrl = process.env.CFGDEX_REMOTE_URL?.trim();
const bindHost = process.env.CFGDEX_BIND_HOST?.trim();
const appPort = process.env.CFGDEX_APP_PORT?.trim();

export default defineConfig({
  plugins: [react(), ...(remoteUrl ? [] : [configApi()])],
  server: {
    ...(bindHost ? { host: bindHost } : {}),
    ...(appPort ? { port: Number(appPort), strictPort: true } : {}),
    ...(remoteUrl
      ? {
          proxy: {
            "/api": {
              target: remoteUrl,
              changeOrigin: true,
              secure: false,
            },
          },
        }
      : {}),
    ...(isCodexSeatbeltSandbox ? { watch: { useFsEvents: false, usePolling: true } } : {}),
  },
});
