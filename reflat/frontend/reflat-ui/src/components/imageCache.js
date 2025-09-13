// Simple image caching util using the Cache Storage API plus an in-memory map of object URLs.
// getCachedImage(url) returns a stable object URL (created with URL.createObjectURL) when possible.
// The implementation:
// - Checks an in-memory Map first (fast for current session)
// - Uses the Service Worker Cache Storage ('reflat-images-v1') to persist responses across reloads.
// - If not found, fetches the resource, stores it in the cache, and returns an object URL.
// Note: If Cache Storage isn't available or an error occurs, the original URL is returned so the browser
// can use its own HTTP caching.

import { FIREBASE_FUNCTIONS_URL, FIREBASE_STORAGE_URL } from './constants';

const MEMORY_MAP = new Map(); // url -> objectURL
const CACHE_NAME = 'reflat-images-v1';
let cleanupRegistered = false;
let CACHE_ENABLED = true; // toggleable at runtime

export function enableImageCache(enabled) {
  CACHE_ENABLED = !!enabled;
}

export function isImageCachingEnabled() {
  return CACHE_ENABLED;
}

async function ensureCachedResponse(url, fetchUrl) {
  if (!('caches' in window)) return null;
  try {
    const cache = await caches.open(CACHE_NAME);
    const matched = await cache.match(url);
    if (matched) return matched;
    // fetch and populate cache (use fetchUrl if provided to fetch but store under original url)
    const toFetch = fetchUrl || url;
    const res = await fetch(toFetch, { mode: 'cors' });
    if (!res.ok) throw new Error(`Failed to fetch ${toFetch}: ${res.status}`);
    // clone into cache using the original url as key then return the response
    await cache.put(url, res.clone());
    return res;
  } catch (e) {
    // swallow and let caller fallback to direct URL
    console.debug('imageCache.ensureCachedResponse failed', e);
    return null;
  }
}

// If a storage.googleapis.com URL is provided in the app's configured storage base
// then ask the backend for a signed URL before fetching. This avoids 403s for
// private buckets and mirrors the signed_url usage in ProjectDetailView.
function parseStorageUrl(url) {
  try {
    const u = new URL(url);
    // Normalize configured FIREBASE_STORAGE_URL if present (but do not require it)
    const cfg = FIREBASE_STORAGE_URL ? FIREBASE_STORAGE_URL.replace(/^https?:\/\//, '').replace(/\/+$/, '') : null;
    const cfgParts = cfg ? cfg.split('/') : [];
    const cfgHost = cfgParts.length ? cfgParts[0] : null;
    const cfgBucket = cfgParts.length > 1 ? cfgParts[1] : null;

    const hostAndPath = u.host + u.pathname; // host + path

    // 1) If FIREBASE_STORAGE_URL is configured and URL starts with that base, use it
    if (cfg && hostAndPath.startsWith(cfg)) {
      let relative = u.pathname.replace(/^\/+/, '');
      const parts = relative.split('/').filter(Boolean);
      if (cfgBucket && parts.length && parts[0] === cfgBucket) parts.shift();
      if (parts.length < 4) return null;
      const [builderId, projectId, folder, ...rest] = parts;
      const filename = rest.join('/');
      return { builderId, projectId, folder, filename };
    }

    // 2) Common GCS host form: https://storage.googleapis.com/<bucket>/...  (bucket in path)
    if (u.host.endsWith('storage.googleapis.com')) {
      const parts = u.pathname.replace(/^\/+/, '').split('/').filter(Boolean);
      if (parts.length >= 5) {
        // drop the bucket segment
        parts.shift();
        if (parts.length < 4) return null;
        const [builderId, projectId, folder, ...rest] = parts;
        return { builderId, projectId, folder, filename: rest.join('/') };
      }
    }

    // 3) Appspot or custom bucket host form: https://<bucket>.appspot.com/<builder>/<project>/...
    if (u.host.endsWith('.appspot.com') || (cfgHost && u.host === cfgHost)) {
      const parts = u.pathname.replace(/^\/+/, '').split('/').filter(Boolean);
      if (parts.length >= 4) {
        const [builderId, projectId, folder, ...rest] = parts;
        return { builderId, projectId, folder, filename: rest.join('/') };
      }
    }

    // 4) Fallback: if the path looks like <builder>/<project>/<folder>/<file...> accept it
    const parts = u.pathname.replace(/^\/+/, '').split('/').filter(Boolean);
    if (parts.length >= 4) {
      const [builderId, projectId, folder, ...rest] = parts;
      return { builderId, projectId, folder, filename: rest.join('/') };
    }

    return null;
  } catch (e) {
    return null;
  }
}

async function getSignedUrlForStorage(url) {
  try {
    const parsed = parseStorageUrl(url);
    if (!parsed) return url;
    const { builderId, projectId, folder, filename } = parsed;
    const qs = `folder=${encodeURIComponent(folder)}&builderId=${encodeURIComponent(builderId)}&projectId=${encodeURIComponent(projectId)}&file=${encodeURIComponent(filename)}`;
    const resp = await fetch(`${FIREBASE_FUNCTIONS_URL}/signed_url?${qs}`);
    if (!resp.ok) return url;
    const j = await resp.json();
    return j.url || url;
  } catch (e) {
    console.debug('getSignedUrlForStorage failed', e);
    return url;
  }
}

// Build proxy URL for parsed storage paths so the function can stream objects same-origin
function buildProxyUrlFromParsed(parsed) {
  if (!parsed) return null;
  const { builderId, projectId, folder, filename } = parsed;
  const objectPath = `${builderId}/${projectId}/${folder}/${filename}`;
  return `${FIREBASE_FUNCTIONS_URL.replace(/\/$/, '')}/image?path=${encodeURIComponent(objectPath)}`;
}

async function getSignedUrlForObjectPath(objectPath) {
  try {
    if (!FIREBASE_FUNCTIONS_URL) throw new Error('FIREBASE_FUNCTIONS_URL not configured');
    const parts = String(objectPath || '').split('/').filter(Boolean);
    if (parts.length < 4) throw new Error('invalid objectPath');
    const [builderId, projectId, folder, ...rest] = parts;
    const filename = rest.join('/');
    const qs = `folder=${encodeURIComponent(folder)}&builderId=${encodeURIComponent(builderId)}&projectId=${encodeURIComponent(projectId)}&file=${encodeURIComponent(filename)}`;
    const resp = await fetch(`${FIREBASE_FUNCTIONS_URL.replace(/\/+$/, '')}/signed_url?${qs}`);
    if (!resp.ok) throw new Error(`signed_url failed ${resp.status}`);
    const j = await resp.json().catch(() => null);
    if (!j || !j.url) throw new Error('signed_url did not return url');
    return j.url;
  } catch (e) {
    console.debug('getSignedUrlForObjectPath failed', e && e.message);
    throw e;
  }
}

async function getBlobFromResponseOrFetch(url) {
  try {
    // If url is not an absolute http(s) URL, treat it as an objectPath and request the backend proxy
    if (typeof url === 'string' && !/^https?:\/\//i.test(url)) {
      if (!FIREBASE_FUNCTIONS_URL) throw new Error('FIREBASE_FUNCTIONS_URL not configured');
      const proxyBase = FIREBASE_FUNCTIONS_URL.replace(/\/+$/, '');
      const proxyUrl = `${proxyBase}/image?path=${encodeURIComponent(url)}`;
      console.debug('imageCache: requesting object via proxy for objectPath', { objectPath: url, proxyUrl });
      const pr = await fetch(proxyUrl, { mode: 'cors' });
      if (!pr.ok) throw new Error(`proxy ${proxyUrl} failed ${pr.status}`);
      const ct = (pr.headers.get && pr.headers.get('content-type')) || '';
      // Backend should stream binary with an image/* content-type. If it returns JSON, it's the legacy signed-url response.
      if (ct.includes('application/json')) {
        console.error('imageCache: backend /image returned JSON (signed-url). Update backend to stream image bytes to avoid direct browser fetch to GCS.');
        throw new Error('backend /image returned legacy JSON; update backend to stream bytes');
      }
      return await pr.blob();
    }

    // If the URL appears to be a storage.googleapis URL for our configured bucket, route via backend proxy
    const parsed = parseStorageUrl(url);
    if (parsed) {
      const objectPath = `${parsed.builderId}/${parsed.projectId}/${parsed.folder}/${parsed.filename}`;
      if (!FIREBASE_FUNCTIONS_URL) throw new Error('FIREBASE_FUNCTIONS_URL not configured');
      const proxyBase = FIREBASE_FUNCTIONS_URL.replace(/\/+$/, '');
      const proxyUrl = `${proxyBase}/image?path=${encodeURIComponent(objectPath)}`;
      console.debug('imageCache: requesting object via proxy for storage URL', { objectPath, proxyUrl });
      const pr = await fetch(proxyUrl, { mode: 'cors' });
      if (!pr.ok) throw new Error(`proxy ${proxyUrl} failed ${pr.status}`);
      const ct = (pr.headers.get && pr.headers.get('content-type')) || '';
      if (ct.includes('application/json')) {
        console.error('imageCache: backend /image returned JSON (signed-url). Update backend to stream image bytes to avoid direct browser fetch to GCS.');
        throw new Error('backend /image returned legacy JSON; update backend to stream bytes');
      }
      return await pr.blob();
    }

    // Otherwise treat as an external http(s) URL and fetch directly
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error(`fetch ${url} failed ${res.status}`);
    return await res.blob();
  } catch (e) {
    console.debug('imageCache.getBlobFromResponseOrFetch failed', e && e.message);
    throw e;
  }
}

export async function getCachedImage(url) {
  if (!url) return null;
  try {
    if (!CACHE_ENABLED) return url; // caching disabled: return original URL
    if (MEMORY_MAP.has(url)) return MEMORY_MAP.get(url);
    // Try to get blob from cache or network
    const blob = await getBlobFromResponseOrFetch(url);
    if (!blob) return url; // fallback
    const obj = URL.createObjectURL(blob);
    MEMORY_MAP.set(url, obj);

    // register cleanup once
    if (!cleanupRegistered) {
      cleanupRegistered = true;
      window.addEventListener('beforeunload', () => {
        for (const v of MEMORY_MAP.values()) {
          try { URL.revokeObjectURL(v); } catch (e) {}
        }
      });
    }

    return obj;
  } catch (e) {
    // If the requested URL is within our configured Firebase storage bucket, do NOT return the
    // original storage.googleapis.com URL because the browser will attempt an unauthenticated GET
    // and receive 403. Instead return null so callers render a placeholder and avoid direct fetches.
    try {
      if (typeof url === 'string' && FIREBASE_STORAGE_URL) {
        const storeBase = FIREBASE_STORAGE_URL.replace(/\/+$/, '');
        if (url.startsWith(storeBase) || url.includes(storeBase)) {
          console.warn('imageCache: failed to fetch storage URL; returning null to avoid direct browser GET', url, e && e.message);
          return null;
        }
      }
    } catch (ex) {
      // ignore
    }
    return url; // fallback to original for external URLs
  }
}

export function clearImageCache() {
  // clear in-memory URLs and revoke
  for (const v of MEMORY_MAP.values()) {
    try { URL.revokeObjectURL(v); } catch (e) {}
  }
  MEMORY_MAP.clear();
  // also clear Cache Storage entry (async)
  if ('caches' in window) {
    caches.delete(CACHE_NAME).catch(() => {});
  }
}
