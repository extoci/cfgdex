import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { configApi } from "./server/config-api";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

export default defineConfig({
  plugins: [react(), configApi()],
  server: isCodexSeatbeltSandbox ? { watch: { useFsEvents: false, usePolling: true } } : undefined,
});
