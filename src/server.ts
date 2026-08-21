import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { handleApiRequest } from "../api/app";
import type { ApiEnv } from "../api/types";
import { handleCron } from "../workers/cron";
import { handleQueueBatch } from "../workers/whatsapp-consumer";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

const PWA_PATHS = new Set([
  "/manifest.webmanifest",
  "/sw.js",
  "/favicon.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
]);

function withPwaHeaders(pathname: string, response: Response): Response {
  if (!response.ok) return response;
  const headers = new Headers(response.headers);
  if (pathname === "/sw.js") {
    headers.set("Service-Worker-Allowed", "/");
    headers.set("Cache-Control", "no-cache");
    headers.set("Content-Type", "text/javascript; charset=utf-8");
  } else if (pathname === "/manifest.webmanifest") {
    headers.set("Content-Type", "application/manifest+json; charset=utf-8");
    headers.set("Cache-Control", "public, max-age=86400");
  } else if (pathname.startsWith("/icons/") || pathname === "/favicon.png") {
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
  } else if (pathname.startsWith("/assets/")) {
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
  }
  return new Response(response.body, { status: response.status, headers });
}

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: ApiEnv = {} as ApiEnv, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/v1")) {
      try {
        return await handleApiRequest(request, env ?? ({} as ApiEnv), ctx);
      } catch (error) {
        console.error(error);
        return Response.json({ error: "Internal server error" }, { status: 500 });
      }
    }

    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      const normalized = await normalizeCatastrophicSsrResponse(response);
      if (PWA_PATHS.has(url.pathname) || url.pathname.startsWith("/assets/")) {
        return withPwaHeaders(url.pathname, normalized);
      }
      return normalized;
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },

  async scheduled(_event: ScheduledEvent, env: ApiEnv, ctx: ExecutionContext) {
    ctx.waitUntil(handleCron(env));
  },

  async queue(batch: MessageBatch<{ outboxId: string }>, env: ApiEnv) {
    await handleQueueBatch(batch, env);
  },
};
