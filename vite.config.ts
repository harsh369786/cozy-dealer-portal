// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import type { Plugin } from "vite";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

function pwaDevHeaders(): Plugin {
  return {
    name: "pwa-dev-headers",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split("?")[0] ?? "";
        if (path === "/sw.js") {
          res.setHeader("Content-Type", "text/javascript; charset=utf-8");
          res.setHeader("Service-Worker-Allowed", "/");
          res.setHeader("Cache-Control", "no-cache");
        } else if (path === "/manifest.webmanifest") {
          res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
          res.setHeader("Cache-Control", "no-cache");
        }
        next();
      });
    },
  };
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [pwaDevHeaders()],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            // NOTE: recharts/d3 are intentionally NOT forced into a manual chunk. Forcing them into
            // a single named chunk made the bundler/router emit a <link rel="modulepreload"> for that
            // ~500KiB chunk on EVERY route (including the dealer home, which renders no chart),
            // because the shared router graph statically references it. Leaving them unassigned lets
            // Rollup keep recharts inside the already-lazy report route chunks, so it downloads only
            // when a report screen is actually opened.
            if (id.includes("@radix-ui")) return "radix-ui";
            if (id.includes("node_modules/react-dom") || id.includes("node_modules/react/")) {
              return "react-vendor";
            }
            if (id.includes("node_modules/@tanstack")) return "tanstack";
            if (id.includes("node_modules/lucide-react")) return "icons";
          },
        },
      },
    },
  },
});
