export interface MarketNewsItem {
  id: string;
  title: string;
  link: string;
  source?: string;
  publishedAt?: string;
}

export interface MarketNewsPayload {
  items: MarketNewsItem[];
  fetchedAt: string;
  query: string;
}

const CACHE_TTL_MS = 60_000;
let cache: { key: string; at: number; payload: MarketNewsPayload } | null = null;

function decodeXml(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1');
}

function extractTag(block: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const m = block.match(re);
  return m ? decodeXml(m[1].trim()) : '';
}

function parseRss(xml: string, query: string): MarketNewsPayload {
  const items: MarketNewsItem[] = [];
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];

  for (const block of blocks.slice(0, 25)) {
    const title = extractTag(block, 'title');
    const link = extractTag(block, 'link');
    const pubDate = extractTag(block, 'pubDate');
    const source = extractTag(block, 'source');
    if (!title || !link) continue;
    items.push({
      id: link,
      title,
      link,
      source: source || undefined,
      publishedAt: pubDate
        ? new Date(pubDate).toISOString()
        : undefined,
    });
  }

  items.sort((a, b) => {
    const aTime = a.publishedAt ? new Date(a.publishedAt).getTime() : -Infinity;
    const bTime = b.publishedAt ? new Date(b.publishedAt).getTime() : -Infinity;
    if (aTime !== bTime) return bTime - aTime;
    return a.title.localeCompare(b.title);
  });

  return {
    items,
    fetchedAt: new Date().toISOString(),
    query,
  };
}

function newsQueryForSymbol(symbol: string): string {
  const label = symbol.split(':').pop()?.replace('-INDEX', '') ?? 'NIFTY';
  const map: Record<string, string> = {
    NIFTY50: 'NIFTY 50',
    NIFTYBANK: 'Bank Nifty',
    FINNIFTY: 'Fin Nifty',
    MIDCPNIFTY: 'Midcap Nifty',
  };
  const name = map[label] ?? label;
  return `${name} Indian stock market`;
}

export async function fetchMarketNews(
  symbol: string,
  refresh = false,
): Promise<MarketNewsPayload> {
  const query = newsQueryForSymbol(symbol);
  const cacheKey = query;
  const now = Date.now();

  if (
    !refresh &&
    cache &&
    cache.key === cacheKey &&
    now - cache.at < CACHE_TTL_MS
  ) {
    return cache.payload;
  }

  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'alpha-trader/1.0' },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      throw new Error(`News feed HTTP ${res.status}`);
    }
    const xml = await res.text();
    const payload = parseRss(xml, query);
    cache = { key: cacheKey, at: now, payload };
    return payload;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const fallback: MarketNewsPayload = {
      items: [],
      fetchedAt: new Date().toISOString(),
      query,
    };
    if (cache?.key === cacheKey) {
      return { ...cache.payload, fetchedAt: fallback.fetchedAt };
    }
    throw new Error(`Market news fetch failed: ${message}`);
  }
}