import { getStore } from "@netlify/blobs";
import type { Config, Context } from "@netlify/functions";

type KujiState = {
  themes: string[];
  drawn: string[];
  /** いま札に出ている決定済みのテーマ。未抽選なら null。 */
  current: string | null;
  exclude: boolean;
  updatedAt: number;
};

const STORE_NAME = "talk-theme-lottery";
const STATE_KEY = "shared-state";
const MAX_THEMES = 300;
const MAX_THEME_LENGTH = 240;
const MAX_DRAWN = 1000;

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function cleanTextList(value: unknown, maxItems: number): string[] | null {
  if (!Array.isArray(value) || value.length > maxItems) return null;

  const items: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") return null;
    const text = entry.trim();
    if (!text || text.length > MAX_THEME_LENGTH) return null;
    items.push(text);
  }
  return items;
}

function cleanCurrent(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return undefined;      // undefined = 不正
  const text = value.trim();
  if (!text || text.length > MAX_THEME_LENGTH) return undefined;
  return text;
}

function parseState(value: unknown): KujiState | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const themes = cleanTextList(input.themes, MAX_THEMES);
  const drawn = cleanTextList(input.drawn, MAX_DRAWN);
  const current = cleanCurrent(input.current);

  if (!themes || !drawn || current === undefined) return null;
  if (typeof input.exclude !== "boolean") return null;

  return {
    themes,
    drawn,
    current,
    exclude: input.exclude,
    updatedAt: Date.now(),
  };
}

export default async (request: Request, _context: Context): Promise<Response> => {
  const store = getStore(STORE_NAME, { consistency: "strong" });

  if (request.method === "GET") {
    const state = await store.get<KujiState>(STATE_KEY, { type: "json" });
    return reply(state);
  }

  if (request.method !== "POST") {
    return reply({ error: "Method not allowed" }, 405);
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 100_000) {
    return reply({ error: "Payload too large" }, 413);
  }

  try {
    const state = parseState(await request.json());
    if (!state) {
      return reply({ error: "Invalid shared lottery state" }, 400);
    }

    await store.setJSON(STATE_KEY, state);
    return reply(state);
  } catch {
    return reply({ error: "Invalid JSON payload" }, 400);
  }
};

export const config: Config = {
  path: "/api/kuji",
};
