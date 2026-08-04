const UA = "OwnTmrw/0.1 (public-data intelligence aggregator)";

export async function getJSON<T = unknown>(
  url: string,
  opts: { retries?: number; headers?: Record<string, string>; timeoutMs?: number } = {}
): Promise<T | null> {
  const { retries = 3, headers = {}, timeoutMs = 20000 } = opts;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { accept: "application/json", "user-agent": UA, ...headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 429 || res.status >= 500) {
        await sleep(1000 * (attempt + 1) ** 2);
        continue;
      }
      if (!res.ok) return null;
      return (await res.json()) as T;
    } catch {
      await sleep(800 * (attempt + 1));
    }
  }
  return null;
}

export async function postJSON<T = unknown>(url: string, body: unknown, retries = 3): Promise<T | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": UA },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(25000),
      });
      if (res.status === 429 || res.status >= 500) {
        await sleep(1200 * (attempt + 1) ** 2);
        continue;
      }
      if (!res.ok) return null;
      return (await res.json()) as T;
    } catch {
      await sleep(800 * (attempt + 1));
    }
  }
  return null;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
