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
    // only handle urls that start with the configured FIREBASE_STORAGE_URL host
    if (!FIREBASE_STORAGE_URL) return null;
    // remove protocol from FIREBASE_STORAGE_URL for comparison
    const base = FIREBASE_STORAGE_URL.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const hostAndPath = u.host + u.pathname; // host + path
    if (!hostAndPath.startsWith(base)) return null;
    // path after the bucket root
    const relative = u.pathname.replace(/\/+/, '/');
    // expected structure: /<builderId>/<projectId>/<folder>/<filename>
    const parts = relative.split('/').filter(Boolean);
    if (parts.length < 4) return null;
    const [builderId, projectId, folder, ...rest] = parts;
    const filename = rest.join('/');
    return { builderId, projectId, folder, filename };
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

async function getBlobFromResponseOrFetch(url) {
  try {
    // If the URL appears to be from our storage bucket, prefer using the server-side proxy
    // so the browser doesn't need to fetch storage.googleapis.com signed URLs directly.
    const parsed = parseStorageUrl(url);
    if (parsed) {
      const proxyUrl = buildProxyUrlFromParsed(parsed);
      // try cache first using the original url as key but fetch via proxy
      const cachedResp = await ensureCachedResponse(url, proxyUrl);
      if (cachedResp) return await cachedResp.blob();
      // fallback: fetch via proxy and return blob
      const res = await fetch(proxyUrl, { mode: 'cors' });
      if (!res.ok) throw new Error(`fetch ${proxyUrl} failed ${res.status}`);
      return await res.blob();
    }

    // Non-storage URL path: preserve existing signed-url flow
    let fetchUrl = url;
    try {
      fetchUrl = await getSignedUrlForStorage(url);
    } catch (e) {
      fetchUrl = url;
    }

    // try cache first (note: cache keys are based on the original URL)
    const cachedResp = await ensureCachedResponse(url);
    if (cachedResp) return await cachedResp.blob();
    // fallback: fetch directly (or via signed URL) and return blob
    const res = await fetch(fetchUrl, { mode: 'cors' });
    if (!res.ok) throw new Error(`fetch ${url} failed ${res.status}`);
    return await res.blob();
  } catch (e) {
    console.debug('imageCache.getBlobFromResponseOrFetch failed', e);
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
    return url; // fallback to original
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
