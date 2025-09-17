import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import Modal from '@mui/material/Modal';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import LanguageIcon from '@mui/icons-material/Language';
import { FIREBASE_FUNCTIONS_URL, FIREBASE_STORAGE_URL } from '../components/constants';
import { getCachedImage } from '../components/imageCache';

// Field component definition - moved to top to avoid hoisting warnings
function Field({ label, value }) {
  if (!value) return null;
  return (
    <Grid item xs={12} sm={6}>
      <Box sx={{ textAlign: 'center' }}>
        <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase' }}>{label}</Typography>
        <Typography variant="body1" sx={{ fontWeight: 500 }}>{value}</Typography>
      </Box>
    </Grid>
  );
}


export default function ProjectDetailView() {
  const { builderId, projectId } = useParams();

  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [signedUrls, setSignedUrls] = useState({});
  const [modalOpen, setModalOpen] = useState(false);
  const [modalImageUrl, setModalImageUrl] = useState('');
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState("");
  const [bannerSrc, setBannerSrc] = useState(null);
  const [builderLogoCached, setBuilderLogoCached] = useState(null);
  const [projectLogoCached, setProjectLogoCached] = useState(null);
  // Track pending signed_url fetches to avoid duplicate requests
  const pendingSignedFetches = useRef(new Set());

  // Control loading of large image groups — only fetch signed URLs when the section is opened
  const [amenitiesOpen, setAmenitiesOpen] = useState(false);
  const [layoutsOpen, setLayoutsOpen] = useState(false);
  const [floorPlansOpen, setFloorPlansOpen] = useState(false);
  const [photosOpen, setPhotosOpen] = useState(false);
  const [videosOpen, setVideosOpen] = useState(false);

  // Banner carousel state
  const [bannerIndex, setBannerIndex] = useState(0);
  const bannerTimerRef = useRef(null);
  // Swipe/drag refs for carousel interaction
  const touchStartXRef = useRef(null);
  const touchDeltaXRef = useRef(0);
  const isPointerDownRef = useRef(false);
  const pointerStartXRef = useRef(0);

  // Project details are provided by backend under data.project.key_project_details
  const pd = data ? ((data.project && data.project.key_project_details) || {}) : {};

  // Safe alias to avoid accessing properties of null while data is still loading
  const dataSafe = data || {};

  // Banner candidates depend on pd/data and must be declared after pd
  const bannerCandidates = Array.isArray(data?.banners) && data.banners.length
    ? data.banners.slice()
    : (pd?.banner ? [pd.banner] : (pd?.banner_image ? [pd.banner_image] : []));

  // Prefetch signed URLs for carousel entries
  useEffect(() => {
    if (!bannerCandidates || bannerCandidates.length === 0) return;
    let alive = true;
    bannerCandidates.forEach((b, i) => {
      // Skip empty banners
      if (!b) return;
      
      let fname = b;
      const parts = (typeof fname === 'string') ? fname.split('/').filter(Boolean) : [];
      
      // If already has builder/project path structure
      if (parts.length >= 4 && parts[0] === builderId && parts[1] === projectId) {
        const folderFromPath = parts[2];
        const filenameFromPath = parts.slice(3).join('/');
        fetchSignedUrlOnDemand(folderFromPath, normalizeFilenameForUrl(filenameFromPath), `banner_${i}`);
        return;
      }
      // If has folder prefix like 'banners/filename'
      if (parts.length >= 2 && parts[0] === 'banners') {
        const filenameFromPath = parts.slice(1).join('/');
        fetchSignedUrlOnDemand('banners', normalizeFilenameForUrl(filenameFromPath), `banner_${i}`);
        return;
      }
      // Default case - assume it's just the filename
      fetchSignedUrlOnDemand('banners', normalizeFilenameForUrl(String(fname)), `banner_${i}`);
    });
    return () => { alive = false; };
  }, [bannerCandidates, builderId, projectId]);

  // Auto-advance banner carousel
  useEffect(() => {
    if (!bannerCandidates || bannerCandidates.length <= 1) return;
    if (bannerTimerRef.current) clearInterval(bannerTimerRef.current);
    bannerTimerRef.current = setInterval(() => setBannerIndex((n) => (n + 1) % bannerCandidates.length), 5000);
    return () => { if (bannerTimerRef.current) { clearInterval(bannerTimerRef.current); bannerTimerRef.current = null; } };
  }, [bannerCandidates.length]);

  const handleOpenModal = (imageUrl) => {
    setModalImageUrl(imageUrl);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setModalImageUrl('');
  };

  const handleOpenPdfModal = (url) => {
    setPdfUrl(url);
    setPdfModalOpen(true);
  };
  const handleClosePdfModal = () => {
    setPdfModalOpen(false);
    setPdfUrl("");
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        // Always fetch the canonical project JSON from the remote functions endpoint
        const fbResp = await fetch(`${FIREBASE_FUNCTIONS_URL}/project_details/${builderId}/${projectId}`);
        if (!fbResp.ok) {
          const text = await fbResp.text();
          throw new Error(`HTTP ${fbResp.status}: ${text.substring(0, 200)}`);
        }
        const json = await fbResp.json();
        if (alive) setData(json || {});
      } catch (e) {
        if (alive) setError(String(e?.message || e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [builderId, projectId]);

  // Stable callbacks for resolving logos so effects can safely depend on them
  const resolveBuilderLogoCandidate = useCallback(() => {
    if (signedUrls.builder_logo) return signedUrls.builder_logo;
    if (pd?.builder_logo) return resolveFileUrl(pd.builder_logo, 'logos', 'builder_logo');
    if (pd?.logo) return resolveFileUrl(pd.logo, 'logos', 'builder_logo');
    if (Array.isArray(data?.logos) && data.logos.length > 0) return resolveFileUrl(data.logos[0], 'logos');
    if (data?.logo) return data.logo;
    return null;
  }, [pd, data, signedUrls]);

  const resolveProjectLogoCandidate = useCallback(() => {
    if (signedUrls.project_logo) return signedUrls.project_logo;
    if (pd?.project_logo) return resolveFileUrl(pd.project_logo, 'logos', 'project_logo');
    if (pd?.logo) return resolveFileUrl(pd.logo, 'logos', 'project_logo');
    if (Array.isArray(data?.logos) && data.logos.length > 1) return resolveFileUrl(data.logos[1], 'logos');
    if (Array.isArray(data?.logos) && data.logos.length === 1) return resolveFileUrl(data.logos[0], 'logos');
    return null;
  }, [pd, data, signedUrls]);

  // DEBUG: surface the resolved data shape in browser console to help locate description fields
  // (will be useful while some scrapes may not include a dedicated description key)
  if (process.env.NODE_ENV !== 'production') {
    console.debug('ProjectDetailView - resolved data:', { data, pd });
  }

  // Amenities source used in multiple places (signed-url fetch, rendering, key lookups)
  const amenitySrc = (data && (data.amenities)) || [];

  // Heuristic: determine whether a value likely refers to an asset filename/path
  // We only request signed URLs for values that look like file paths or have an image extension.
  function looksLikeAssetFilename(v) {
    if (!v || typeof v !== 'string') return false;
    // contains a path segment -> likely an object path
    if (v.includes('/')) return true;
    // has a known image/video extension
    if (/\.(jpe?g|png|webp|svg|gif|bmp|avif|tiff|mp4|mov)(\?.*)?$/i.test(v)) return true;
    // percent-encoded filename probably valid
    if (/%[0-9A-F]{2}/i.test(v)) return true;
    return false;
  }

  // Fetch signed URLs for main files (banner, brochure, logos) and a small set of assets
  useEffect(() => {
    if (!data || data._isLocal) return;
    let alive = true;
    const toFetch = [];

    // If callers sometimes pass a full storage.googleapis URL, extract the object path
    // so the signed_url endpoint receives the correct 'file' value (e.g. 'floor_plans/14.webp')
    function extractStorageObjectInfo(url) {
      try {
        const u = new URL(url);
        if (!FIREBASE_STORAGE_URL) return null;
        // FIREBASE_STORAGE_URL -> https://storage.googleapis.com/<bucket>
        const base = FIREBASE_STORAGE_URL.replace(/^https?:\/\//, '').replace(/\/$/, '');
        const [baseHost, baseBucket] = base.split('/');
        if (u.host !== baseHost) return null;
        // u.pathname typically starts with /<bucket>/...
        const pathname = u.pathname || '';
        const bucketPrefix = '/' + (baseBucket || '');
        if (!pathname.startsWith(bucketPrefix)) return null;
        const relative = pathname.slice(bucketPrefix.length).replace(/^\/+/, ''); // remove leading /
        const parts = relative.split('/').filter(Boolean);
        if (parts.length < 3) return null; // need at least builder/project/folder/filename
        const [bId, pId, folder, ...rest] = parts;
        const filename = rest.join('/');
        return { builderId: bId, projectId: pId, folder, filename };
      } catch (e) {
        return null;
      }
    }

    const addIf = (key, folder, value) => {
      if (!value) return;
      // Handle both string filenames and objects with a `path` or `file` property
      let fname = typeof value === 'string' ? value : (value.path || value.file || value.file_name || value.filename || value.name);
      if (!fname) return;

      // NEW: Avoid requesting signed_url for amenity names that are not asset filenames
      if (folder === 'amenities' && typeof fname === 'string' && !looksLikeAssetFilename(fname)) {
        if (process.env.NODE_ENV !== 'production') console.debug('addIf: skipping non-asset amenity candidate', fname);
        return;
      }

      // If fname already looks like an object path that includes builder/project (e.g. 'myhome/akrida/photos/1.jpg')
      if (typeof fname === 'string') {
        const parts = fname.split('/').filter(Boolean);
        // pattern: <builderId>/<projectId>/<folder>/<filename>
        if (parts.length >= 4 && parts[0] === builderId && parts[1] === projectId) {
          const folderFromPath = parts[2];
          const filenameFromPath = parts.slice(3).join('/');
          toFetch.push({ key, folder: folderFromPath, filename: filenameFromPath });
          return;
        }
        // pattern: '<folder>/<filename>' already (e.g. 'photos/1.jpg') -> extract filename
        if (parts.length >= 2 && parts[0] === folder) {
          const filenameFromPath = parts.slice(1).join('/');
          toFetch.push({ key, folder, filename: filenameFromPath });
          return;
        }
      }

      // If the filename is a full URL pointing at our storage bucket, extract the object filename and folder
      if (typeof fname === 'string' && fname.startsWith('http') && FIREBASE_STORAGE_URL && fname.includes(new URL(FIREBASE_STORAGE_URL).host)) {
        const info = extractStorageObjectInfo(fname);
        if (info) {
          // prefer the parsed folder/filename since it matches how signed_url expects input
          toFetch.push({ key, folder: info.folder, filename: info.filename });
          return;
        }
      }

      toFetch.push({ key, folder, filename: fname });
    };

    // data.files is deprecated; prefer pd.* and top-level arrays
    addIf('banner', 'banners', pd?.banner || (Array.isArray(dataSafe?.banners) ? dataSafe.banners[0] : null));
    addIf('brochure', 'brochures', pd?.brochure || (Array.isArray(dataSafe?.brochures) ? dataSafe.brochures[0] : null));
    addIf('builder_logo', 'logos', pd?.builder_logo || pd?.project_logo || (Array.isArray(dataSafe?.logos) ? dataSafe.logos[0] : null));
    addIf('project_logo', 'logos', pd?.project_logo || pd?.builder_logo || (Array.isArray(dataSafe?.logos) ? (dataSafe.logos[1] || dataSafe.logos[0]) : null));

    // Fetch signed URLs for asset groups only when their section is opened in the UI
    if (photosOpen) {
      (dataSafe.photos || []).forEach((p, i) => addIf(`photo_${i}`, 'photos', p));
    }
    if (layoutsOpen) {
      (dataSafe.layouts || []).forEach((l, i) => addIf(`layout_${i}`, 'layouts', l));
    }
    if (floorPlansOpen) {
      (dataSafe.floor_plans || []).forEach((f, i) => addIf(`floor_${i}`, 'floor_plans', f));
    }
    // Add amenities (use the component-scoped amenitySrc) only when opened
    if (amenitiesOpen) {
      amenitySrc.forEach((a, i) => {
        // amenity may be a string or an object { name, icon }
        // Only consider explicit icon/path/file values for amenity assets. Do NOT use amenity.name.
        const candidate = (a && typeof a === 'object') ? (a.icon || null) : a;
        // Do not attempt to fetch when the amenity has no explicit icon or the value is a human-readable name
        if (!candidate) return;
        if (typeof candidate === 'string' && !looksLikeAssetFilename(candidate)) return;
        addIf(`amenity_${i}`, 'amenities', candidate);
      });

    }

    if (toFetch.length === 0) {
      if (process.env.NODE_ENV !== 'production') {
        console.debug('ProjectDetailView: no assets to fetch for signed URLs', { builderId, projectId, dataFiles: dataSafe.files, photos: dataSafe.photos?.length, layouts: dataSafe.layouts?.length, floor_plans: dataSafe.floor_plans?.length, amenityCount: amenitySrc.length });
      }
      return;
    }

    // Ensure banner and logos are explicitly requested so UI (banner/logo) can render quickly.
    try {
      if (pd?.banner || (Array.isArray(dataSafe.banners) && dataSafe.banners.length)) {
        let fname = pd?.banner || (Array.isArray(dataSafe.banners) ? dataSafe.banners[0] : null);
        if (fname) {
          const parts = (typeof fname === 'string') ? fname.split('/').filter(Boolean) : [];
          let folder = 'banners';
          let file = fname;
          if (parts.length >= 4 && parts[0] === builderId && parts[1] === projectId) {
            folder = parts[2];
            file = parts.slice(3).join('/');
          } else if (parts.length >= 2 && parts[0] === 'banners') {
            file = parts.slice(1).join('/');
          }
          fetchSignedUrlOnDemand(folder, normalizeFilenameForUrl(String(file)), 'banner');
        }
      }
      // builder_logo: prefer canonical pd fields when available
      const builderLogoCandidate = pd?.builder_logo || pd?.project_logo || (Array.isArray(dataSafe?.logos) ? dataSafe.logos[0] : null);
      if (builderLogoCandidate) {
        let fname = builderLogoCandidate;
        const parts = (typeof fname === 'string') ? fname.split('/').filter(Boolean) : [];
        let folder = 'logos';
        let file = fname;
        if (parts.length >= 4 && parts[0] === builderId && parts[1] === projectId) {
          folder = parts[2];
          file = parts.slice(3).join('/');
        } else if (parts.length >= 2 && parts[0] === 'logos') {
          file = parts.slice(1).join('/');
        }
        fetchSignedUrlOnDemand(folder, normalizeFilenameForUrl(String(file)), 'builder_logo');
      }
      const projectLogoCandidate = pd?.project_logo || pd?.builder_logo || (Array.isArray(dataSafe?.logos) ? (dataSafe.logos[1] || dataSafe.logos[0]) : null);
      if (projectLogoCandidate) {
        let fname = projectLogoCandidate;
        const parts = (typeof fname === 'string') ? fname.split('/').filter(Boolean) : [];
        let folder = 'logos';
        let file = fname;
        if (parts.length >= 4 && parts[0] === builderId && parts[1] === projectId) {
          folder = parts[2];
          file = parts.slice(3).join('/');
        } else if (parts.length >= 2 && parts[0] === 'logos') {
          file = parts.slice(1).join('/');
        }
        fetchSignedUrlOnDemand(folder, normalizeFilenameForUrl(String(file)), 'project_logo');
      }
    } catch (e) {
      // ignore
    }

    if (process.env.NODE_ENV !== 'production') {
      console.debug('ProjectDetailView - toFetch signed_url list', { toFetch, builderId, projectId, FIREBASE_FUNCTIONS_URL });
    }

    (async () => {
      const map = {};
      await Promise.all(toFetch.map(async (it) => {
        try {
          const rawFileParam = it.filename || '';
          // if filename was accidentally passed with a leading folder segment (e.g. 'photos/7.png'), strip it
          const requestFile = rawFileParam.replace(new RegExp('^' + it.folder + '\/'), '');
          // Normalize filename to match uploader rules before requesting signed URL
          const requestFileNormalized = normalizeFilenameForUrl(requestFile || rawFileParam || it.filename || '');
          const url = `${FIREBASE_FUNCTIONS_URL}/signed_url?folder=${encodeURIComponent(it.folder)}&builderId=${encodeURIComponent(builderId)}&projectId=${encodeURIComponent(projectId)}&file=${encodeURIComponent(requestFileNormalized)}`;
          if (process.env.NODE_ENV !== 'production') console.debug('Requesting signed_url', url);
          const r = await fetch(url);
          if (!r.ok) {
            const txt = await r.text().catch(() => '');
            if (process.env.NODE_ENV !== 'production') console.warn('signed_url fetch failed', { status: r.status, url, text: txt });
            throw new Error(`signed_url ${r.status}`);
          }
          const j = await r.json();
          if (alive && j && j.url) {
            // store under the dynamic key used by UI (e.g. 'layout_0')
            map[it.key] = j.url;
            // also store under composite keys so resolveFileUrl can find a match for object-path-style values
            const normalizedFilenameForMap = requestFileNormalized;
            const composite1 = `${it.folder}:${normalizedFilenameForMap}`;
            const composite2 = `${it.folder}/${normalizedFilenameForMap}`;
            map[composite1] = j.url;
            map[composite2] = j.url;
            if (process.env.NODE_ENV !== 'production') console.debug('signed_url mapped', { key: it.key, composite1, composite2, url: j.url });
          }
        } catch (err) {
          if (process.env.NODE_ENV !== 'production') console.warn('signed_url error for', it, err);
          // ignore failures; UI will defer rendering until a signed URL is available (do NOT fall back to unauthenticated storage URLs)
        }
      }));
      if (alive) setSignedUrls((s) => {
        const merged = { ...s, ...map };
        if (process.env.NODE_ENV !== 'production') console.debug('setSignedUrls', Object.keys(merged).slice(0,200));
        return merged;
      });
    })();

    return () => { alive = false; };
  }, [data, builderId, projectId, amenitiesOpen, layoutsOpen, floorPlansOpen, photosOpen, videosOpen]);

  // Try to resolve and cache the banner as early as possible to improve LCP.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!dataSafe) return;
        const candidate = (signedUrls.banner) || resolveFileUrl(pd?.banner || (Array.isArray(dataSafe?.banners) ? dataSafe.banners[0] : null), 'banners');
        if (!candidate) return;
        // getCachedImage will request a signed URL if needed and return an object URL or original URL
        const cached = await getCachedImage(candidate);
        if (alive && cached) {
          setBannerSrc(cached);
          // add a preload hint so the browser prioritizes it for LCP
          try {
            const existing = document.querySelector(`link[rel=preload][data-reflat-banner]`);
            if (existing) existing.remove();
            const l = document.createElement('link');
            l.rel = 'preload';
            l.as = 'image';
            l.href = cached;
            l.setAttribute('data-reflat-banner', '1');
            document.head.appendChild(l);
          } catch (e) {
            // ignore
          }
        }
      } catch (e) {
        // ignore
      }
    })();
    return () => { alive = false; };
  }, [data, signedUrls]);

  // Fetch and cache builder logo for header
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const candidate = resolveBuilderLogoCandidate();
        if (!candidate) return;
        const cached = await getCachedImage(candidate);
        if (alive) setBuilderLogoCached(cached);
      } catch (e) {
        // ignore
      }
    })();
    return () => { alive = false; };
  }, [data, signedUrls]);

  // Fetch and cache project logo for title
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const candidate = resolveProjectLogoCandidate();
        if (!candidate) return;
        const cached = await getCachedImage(candidate);
        if (alive) setProjectLogoCached(cached);
      } catch (e) {
        // ignore
      }
    })();
    return () => { alive = false; };
  }, [data, signedUrls, resolveProjectLogoCandidate]);

  function normalizeFilenameForUrl(name) {
    if (!name) return name;
    // This logic should EXACTLY match the `normalizeFilename` function in the upload script.
    // It replaces backslashes, trims whitespace from each path segment, and replaces spaces with underscores.
    return name.replace(/\\/g, '/').split('/').map(s => s.trim().replace(/\s+/g, '_')).join('/');
  }

  function resolveFileUrl(item, folder, fallbackName) {
    // item may be a string filename or an object with url/file/file_name/name
    if (!item) return null;

    const rawFilename = typeof item === 'string' ? item : (item.file || item.path || item.file_name || item.filename || fallbackName);

    if (typeof rawFilename === 'string' && rawFilename.startsWith('http')) {
      return rawFilename;
    }

    // For local data, construct the path to the image
    if (data?._isLocal) {
      // Handle paths like '../media/logos/myhome_logo.png'
      if (rawFilename.startsWith('../')) {
        // This assumes it goes up one level from the project folder to the builder folder
        const localPath = `${builderId}/${rawFilename.substring(3)}`;
        if (process.env.NODE_ENV !== 'production' && FIREBASE_STORAGE_URL) {
          const base = FIREBASE_STORAGE_URL.replace(/\/+$/, '');
          const normalized = normalizeFilenameForUrl(localPath);
          return `${base}/${normalized}`;
        }
        return `/data/${localPath}`;
      }
      // Handle normal paths like 'media/amenities/outdoor_gym.png'
      const localPath = `${builderId}/${projectId}/${rawFilename}`;
      if (process.env.NODE_ENV !== 'production' && FIREBASE_STORAGE_URL) {
        const base = FIREBASE_STORAGE_URL.replace(/\/+$/, '');
        const normalized = normalizeFilenameForUrl(localPath);
        return `${base}/${normalized}`;
      }
      return `/data/${localPath}`;
    }

    // If the stored filename already includes a builder/project prefix or full object path, use it directly
    if (typeof rawFilename === 'string' && rawFilename.split('/').filter(Boolean).length >= 3) {
      const parts = rawFilename.split('/').filter(Boolean);
      // If it already looks like builder/project/... or contains an absolute object path, and includes builderId or projectId, use it as-is
      if (parts[0] === builderId || parts[1] === projectId || parts.length >= 4) {
        // Attempt to prefer any signed URL we already fetched for this exact folder+filename
        const folderFromPath = parts[2];
        // Normalize the filename segment so it matches how signed URLs are indexed
        const filenameFromPath = normalizeFilenameForUrl(parts.slice(3).join('/'));
        const compositeKey1 = `${folderFromPath}:${filenameFromPath}`;
        const compositeKey2 = `${folderFromPath}/${filenameFromPath}`;
        if (signedUrls[compositeKey1]) return signedUrls[compositeKey1];
        if (signedUrls[compositeKey2]) return signedUrls[compositeKey2];

        // Trigger an on-demand signed_url fetch for this particular asset and defer returning a direct GCS URL to avoid 403
        // (returns null now; UI will re-render when signed URL arrives)
        fetchSignedUrlOnDemand(folderFromPath, filenameFromPath, null);
        return null;
      }
    }

    // Normalize the filename to match how it's stored in GCS by the upload script.
    const filename = normalizeFilenameForUrl(rawFilename);

    // Helper: get normalized base name (last path segment) for various item shapes
    function extractNormalizedBase(itemOrString) {
      if (!itemOrString) return '';
      const raw = (typeof itemOrString === 'string') ? itemOrString : (itemOrString.file || itemOrString.path || itemOrString.file_name || itemOrString.filename || '');
      const norm = normalizeFilenameForUrl(String(raw));
      return norm.split('/').filter(Boolean).pop() || '';
    }

    const baseFilename = filename.split('/').filter(Boolean).pop();

    const photoIdx = (data?.photos || []).findIndex(p => extractNormalizedBase(p) === baseFilename);
    const layoutIdx = (data?.layouts || []).findIndex(l => extractNormalizedBase(l) === baseFilename);
    const floorIdx = (data?.floor_plans || []).findIndex(f => extractNormalizedBase(f) === baseFilename);
    const amenityIdx = (amenitySrc || []).findIndex(a => extractNormalizedBase(a) === baseFilename);

    const keyCandidates = [
      // main file keys
      folder === 'banners' && 'banner',
      folder === 'brochures' && 'brochure',
      folder === 'logos' && (fallbackName && fallbackName.includes('builder') ? 'builder_logo' : 'project_logo'),
      // dynamic keys for small-asset caches (only include when index found)
      photoIdx >= 0 && `photo_${photoIdx}`,
      layoutIdx >= 0 && `layout_${layoutIdx}`,
      floorIdx >= 0 && `floor_${floorIdx}`,
      amenityIdx >= 0 && `amenity_${amenityIdx}`,
    ].filter(Boolean);

    for (const k of keyCandidates) {
      if (k && signedUrls[k]) return signedUrls[k];
    }

    // If we have some signedUrls in state but none match this filename, try an on-demand fetch
    //    if (signedUrls && Object.keys(signedUrls).length > 0) {
    //      // request a signed URL for this folder/filename in background and defer returning a direct URL
    //      fetchSignedUrlOnDemand(folder, filename, null);
    //      return null;
    //    }
    //
    //    // Never fall back to direct storage.googleapis.com URLs here (they will 403 if the bucket is private).
    //    // Instead, trigger an on-demand signed_url request and return null so the UI waits for the signed URL.
    //    if (filename) {
    //      // Always request on-demand signed URL and defer returning a URL (avoid returning unauthenticated storage URLs)
    //      if (process.env.NODE_ENV !== 'production') console.debug('resolveFileUrl requesting on-demand signed URL', { folder, filename });
    //      fetchSignedUrlOnDemand(folder, filename, null);
    //    }
    //    return null;

    // Request a signed URL in background so it can replace the returned URL if available.
    if (filename) {
      try {
        // Normalize for on-demand request
        const normalized = normalizeFilenameForUrl(filename);
        // Only request on-demand signed URL when the filename looks like an actual asset (has extension or path)
        if (looksLikeAssetFilename(filename)) fetchSignedUrlOnDemand(folder, normalized, null);
      } catch (e) {
        if (looksLikeAssetFilename(filename)) fetchSignedUrlOnDemand(folder, filename, null);
      }
    }

    // Defer rendering until signed URL arrives to avoid returning unauthenticated storage.googleapis.com URLs
    // which will 403 for private buckets. The UI will re-render when the signed URL is merged into state.
    return null;
  }

  function getYouTubeId(videoUrl) {
    if (!videoUrl) return null;
    // Normalize to a string URL when callers may pass an object (e.g. { file, path, url })
    let urlStr = null;
    if (typeof videoUrl === 'string') {
      urlStr = videoUrl;
    } else if (typeof videoUrl === 'object' && videoUrl !== null) {
      urlStr = videoUrl.url || videoUrl.file || videoUrl.file_name || videoUrl.filename || videoUrl.path || videoUrl.name || null;
    }
    if (!urlStr || typeof urlStr !== 'string') return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = urlStr.match(regExp);
    if (match && match[2].length === 11) {
      return match[2];
    }
    return null;
  }

  // Fetch a signed URL for a specific folder/filename and merge into signedUrls state
  async function fetchSignedUrlOnDemand(folder, filename, keyHint) {
    if (!folder || !filename) return;
    const composite1 = `${folder}:${filename}`;
    const composite2 = `${folder}/${filename}`;
    if (signedUrls[composite1] || signedUrls[composite2]) return; // already have it
    const pendingKey = `${folder}::${filename}`;

    // NEW: Skip requests for values that do not look like asset filenames (prevents requests like 'Multipurpose_Halls')
    if (typeof filename === 'string' && !looksLikeAssetFilename(filename)) {
      if (process.env.NODE_ENV !== 'production') console.debug('fetchSignedUrlOnDemand: skipping non-asset filename', filename, folder, keyHint);
      return;
    }

    if (pendingSignedFetches.current.has(pendingKey)) return;
    pendingSignedFetches.current.add(pendingKey);
    try {
      const url = `${FIREBASE_FUNCTIONS_URL}/signed_url?folder=${encodeURIComponent(folder)}&builderId=${encodeURIComponent(builderId)}&projectId=${encodeURIComponent(projectId)}&file=${encodeURIComponent(filename)}`;
      if (process.env.NODE_ENV !== 'production') console.debug('On-demand requesting signed_url', url);
      const r = await fetch(url);
      if (!r.ok) {
        const txt = await r.text().catch(() => '');
        if (process.env.NODE_ENV !== 'production') console.warn('On-demand signed_url fetch failed', { status: r.status, url, text: txt });
        return;
      }
      const j = await r.json().catch(() => null);
      if (j && j.url) {
        setSignedUrls((s) => ({ ...s, [keyHint || composite1]: j.url, [composite1]: j.url, [composite2]: j.url }));
      }
    } catch (e) {
      if (process.env.NODE_ENV !== 'production') console.warn('On-demand signed_url error', folder, filename, e);
    } finally {
      pendingSignedFetches.current.delete(pendingKey);
    }
  }

  // Prefetch signed URLs for a group of items (used when accordion opens)
  function prefetchGroup(folder, items) {
    if (!items || !Array.isArray(items)) return;
    items.forEach((it, idx) => {
      // Only use explicit fields: it.icon (asset path) and it.name (display). Do NOT fall back to .path/.file/.filename or raw string values.
      const candidateRaw = (it && typeof it === 'object') ? (it.icon ?? null) : null;

      // Determine a UI-friendly key hint so fetchSignedUrlOnDemand stores the URL under dynamic keys like 'layout_0'
      let keyHint = null;
      if (folder === 'photos') keyHint = `photo_${idx}`;
      if (folder === 'layouts') keyHint = `layout_${idx}`;
      if (folder === 'floor_plans') keyHint = `floor_${idx}`;
      if (folder === 'amenities') keyHint = `amenity_${idx}`;


      // Candidate must be a string path/filename
      if (typeof candidateRaw !== 'string') return;

      const candidate = candidateRaw;

      // If the candidate looks like it was synthesized from the amenity name (e.g. last segment equals the amenity.name
      // and there is no file extension), skip. This prevents treating an absent icon as a filename derived from the name.
      try {
        const lastSegment = String(candidate).split('/').filter(Boolean).pop() || '';
        const lastNoExt = lastSegment.replace(/\.[^/.]+$/, '');
        const nameCandidate = (it && typeof it === 'object' && it.name) ? normalizeFilenameForUrl(String(it.name)) : '';
        const lastNormalized = normalizeFilenameForUrl(String(lastNoExt));
        const looksSynthesizedFromName = nameCandidate && lastNormalized && nameCandidate === lastNormalized && !/\.[a-z0-9]{2,6}(\?.*)?$/i.test(lastSegment);
        if (looksSynthesizedFromName) {
          if (process.env.NODE_ENV !== 'production') console.debug('prefetchGroup: skipping synthesized icon (matches amenity.name)', { candidate, name: it.name, keyHint });
          return;
        }
      } catch (e) {
        // ignore and continue
      }

      // Debug: show candidate and keyHint
      if (process.env.NODE_ENV !== 'production') console.debug('prefetchGroup candidate', { candidate, folder, keyHint });

      // Strict additional guard: require an extension in the last path segment (e.g. '.png', '.jpg')
      // or percent-encoding present. This avoids prefetching values that are generated from an amenity name
      // like 'myhome/akrida/amenities/Multipurpose_Halls' which lack an actual file extension.
      const lastSegment = candidate.split('/').filter(Boolean).pop() || '';
      const hasExt = /\.[a-z0-9]{2,6}(\?.*)?$/i.test(lastSegment);
      const hasPct = /%[0-9A-F]{2}/i.test(candidate);
      if (!hasExt && !hasPct) {
        if (process.env.NODE_ENV !== 'production') console.debug('prefetchGroup: skipping non-asset candidate (no extension)', { candidate, folder, keyHint });
        return;
      }

      // If candidate includes builder/project prefix, extract folder+filename
      const parts = candidate.split('/').filter(Boolean);
      if (parts.length >= 4 && parts[0] === builderId && parts[1] === projectId) {
        const folderFromPath = parts[2];
        const filenameFromPath = parts.slice(3).join('/');
        // Only fetch if filename looks like a valid asset
        if (looksLikeAssetFilename(filenameFromPath)) fetchSignedUrlOnDemand(folderFromPath, normalizeFilenameForUrl(filenameFromPath), keyHint);
        return;
      }

      // If candidate already includes the folder (e.g. 'amenities/x.png'), extract the filename
      if (parts.length >= 2 && parts[0] === folder) {
        const filenameFromPath = parts.slice(1).join('/');
        if (looksLikeAssetFilename(filenameFromPath)) fetchSignedUrlOnDemand(folder, normalizeFilenameForUrl(filenameFromPath), keyHint);
        return;
      }

      // Fallback: only request when the candidate looks like an asset filename (has extension or path)
      if (!looksLikeAssetFilename(candidate)) return;
      fetchSignedUrlOnDemand(folder, normalizeFilenameForUrl(String(candidate)), keyHint);
    });
  }

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto', p: 2 }}>
      {/* Mobile-optimized header: separate rows for better space utilization */}
      <Box sx={{ 
        mb: 2,
        position: 'sticky', 
        top: 'var(--app-header-height, 72px)', 
        backgroundColor: 'background.paper', 
        zIndex: 1300, 
        pt: 1, 
        pb: 1 
      }}>
        {/* Top row: Back button and Builder logo */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Button 
            component={Link} 
            to="/new-projects" 
            startIcon={<ArrowBackIcon />} 
            size="small"
            sx={{ 
              minWidth: 'auto',
              px: { xs: 1, sm: 2 },
              fontSize: { xs: '0.8rem', sm: '0.875rem' }
            }}
          >
            Back
          </Button>
          {/* Builder logo on the right */}
          {builderLogoCached && (
            <Box
              component="img"
              src={builderLogoCached}
              alt="builder logo"
              sx={{ height: { xs: 32, sm: 40 }, maxWidth: 120, objectFit: 'contain', display: 'block' }}
            />
          )}
        </Box>

        {/* Bottom row: Project logo, title, and brochure button */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, minWidth: 0 }}>
          {/* Left side: Project logo and title */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0, flex: 1 }}>
            {/* Project logo */}
            {projectLogoCached && (
              <Box
                component="img"
                src={projectLogoCached}
                alt="project logo"
                sx={{ width: { xs: 40, sm: 56 }, height: { xs: 28, sm: 40 }, objectFit: 'contain', flex: '0 0 auto' }}
              />
            )}
            {/* Project title and location with available width */}
            <Box sx={{ overflow: 'hidden', minWidth: 0, flex: 1 }}>
              <Typography 
                variant="h5" 
                component="div" 
                sx={{ 
                  fontWeight: 700, 
                  fontSize: { xs: '1.1rem', sm: '1.5rem' }, // Slightly smaller on mobile
                  lineHeight: 1.2,
                  // Responsive text handling: wrap on mobile, ellipsis on larger screens
                  whiteSpace: { xs: 'normal', sm: 'nowrap' },
                  textOverflow: { xs: 'initial', sm: 'ellipsis' },
                  overflow: 'hidden',
                  // On mobile, limit to 2 lines using CSS line clamping
                  display: { xs: '-webkit-box', sm: 'block' },
                  WebkitLineClamp: { xs: 2, sm: 'unset' },
                  WebkitBoxOrient: { xs: 'vertical', sm: 'unset' },
                  maxHeight: { xs: '2.4em', sm: 'auto' },
                  wordBreak: { xs: 'break-word', sm: 'normal' }
                }}
              >
                {pd.project_name || pd.name || data.project?.project_name || data.project?.name || 'Untitled'}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                {(pd.project_location || pd.location || '')}{pd.project_city ? `, ${pd.project_city}` : ''}
              </Typography>
            </Box>
          </Box>

          {/* Right side: Brochure button and RERA */}
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5 }}>
            {(pd?.brochure || (Array.isArray(data?.brochures) && data.brochures.length)) && (
              <Button
                onClick={() => handleOpenPdfModal(signedUrls.brochure || resolveFileUrl(pd?.brochure || (Array.isArray(data?.brochures) ? data.brochures[0] : null), 'brochures'))}
                startIcon={<i className="fa-solid fa-file-pdf" />}
                variant="outlined"
                size="small"
                sx={{ 
                  flex: '0 0 auto',
                  minWidth: 'auto',
                  px: { xs: 1, sm: 2 },
                  fontSize: { xs: '0.75rem', sm: '0.875rem' }
                }}
              >
                Brochure
              </Button>
            )}
            {pd.rera_number && (
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }}>
                RERA: {pd.rera_number}
              </Typography>
            )}
          </Box>
        </Box>
      </Box>

      {loading && <Typography color="text.secondary">Loading…</Typography>}
      {error && <Box sx={{ bgcolor: '#fde2e2', color: '#8a1f1f', p: 2, borderRadius: 1 }}>{error}</Box>}

      {!loading && !error && data && (
        <Box>
          {/* Description / Highlights (left aligned beneath header) */}
          {(pd.description || data.description || pd.highlights || data.highlights || pd.summary || data.summary || pd.overview || data.overview) && (
            <Typography variant="body1" sx={{ mb: 2, textAlign: 'left' }}>
              {pd.description || data.description || pd.highlights || data.highlights || pd.summary || data.summary || pd.overview || data.overview}
            </Typography>
          )}

          {/* Banner: single image or simple carousel when multiple banners present */}
          {bannerCandidates && bannerCandidates.length > 0 && (() => {
            const current = bannerIndex % bannerCandidates.length;
            const currentCandidate = bannerCandidates[current];
            // Ensure we treat the candidate as a string for filename extraction. The banner entry may be an object.
            const candidateStr = (typeof currentCandidate === 'string')
              ? currentCandidate
              : (currentCandidate && (currentCandidate.file || currentCandidate.path || currentCandidate.url || currentCandidate.name)) || '';
            const normalizedBase = normalizeFilenameForUrl(String(candidateStr).split('/').filter(Boolean).pop() || '');
            
            // Try multiple ways to get the banner URL for the current index
            let src = null;
            
            // First, try the indexed banner from signed URLs
            if (signedUrls[`banner_${current}`]) {
              src = signedUrls[`banner_${current}`];
            }
            // Then try the normalized base name approach
            else if (signedUrls[`banners:${normalizedBase}`] || signedUrls[`banners/${normalizedBase}`]) {
              src = signedUrls[`banners:${normalizedBase}`] || signedUrls[`banners/${normalizedBase}`];
            }
            // For the first banner, try the cached banner source
            else if (current === 0 && bannerSrc) {
              src = bannerSrc;
            }
            // Finally, try resolving the URL for the current candidate
            else {
              src = resolveFileUrl(currentCandidate, 'banners');
            }

            // If no src available, try to use the candidate directly if it's a URL
            const finalSrc = src || (typeof currentCandidate === 'string' && currentCandidate.startsWith('http') ? currentCandidate : null);

            // Debug logging to help troubleshoot carousel issues
            if (process.env.NODE_ENV !== 'production') {
              console.debug('Banner carousel debug:', {
                current,
                currentCandidate,
                normalizedBase,
                src,
                finalSrc,
                availableSignedUrls: Object.keys(signedUrls).filter(k => k.includes('banner')),
                bannerCandidatesLength: bannerCandidates.length
              });
            }

            return (
              <Box
                sx={{ position: 'relative', mb: 1.5, touchAction: 'pan-y' }} // Reduced from mb: 4 to mb: 1.5
                onTouchStart={(e) => { 
                  touchStartXRef.current = e.touches?.[0]?.clientX ?? null; 
                }}
                onTouchMove={(e) => { 
                  if (touchStartXRef.current != null) touchDeltaXRef.current = e.touches?.[0]?.clientX - touchStartXRef.current; 
                }}
                onTouchEnd={() => {
                  const delta = touchDeltaXRef.current || 0;
                  touchStartXRef.current = null;
                  touchDeltaXRef.current = 0;
                  if (Math.abs(delta) > 50 && bannerCandidates && bannerCandidates.length > 0) {
                    if (delta < 0) setBannerIndex((n) => (n + 1) % bannerCandidates.length);
                    else setBannerIndex((n) => (n - 1 + bannerCandidates.length) % bannerCandidates.length);
                    if (bannerTimerRef.current) { 
                      clearInterval(bannerTimerRef.current); 
                      bannerTimerRef.current = setInterval(() => setBannerIndex((n) => (n + 1) % bannerCandidates.length), 5000);
                    }
                  }
                }}
                onMouseDown={(e) => { isPointerDownRef.current = true; pointerStartXRef.current = e.clientX; }}
                onMouseMove={(e) => { if (!isPointerDownRef.current) return; touchDeltaXRef.current = e.clientX - pointerStartXRef.current; }}
                onMouseUp={() => {
                  if (!isPointerDownRef.current) return;
                  const delta = touchDeltaXRef.current || 0;
                  isPointerDownRef.current = false;
                  touchDeltaXRef.current = 0;
                  pointerStartXRef.current = 0;
                  if (Math.abs(delta) > 50 && bannerCandidates && bannerCandidates.length > 0) {
                    if (delta < 0) setBannerIndex((n) => (n + 1) % bannerCandidates.length);
                    else setBannerIndex((n) => (n - 1 + bannerCandidates.length) % bannerCandidates.length);
                    if (bannerTimerRef.current) { 
                      clearInterval(bannerTimerRef.current); 
                      bannerTimerRef.current = setInterval(() => setBannerIndex((n) => (n + 1) % bannerCandidates.length), 5000);
                    }
                  }
                }}
                onMouseLeave={() => { isPointerDownRef.current = false; touchDeltaXRef.current = 0; pointerStartXRef.current = 0; }}
              >
                {finalSrc ? (
                  <Box
                    component="img"
                    src={finalSrc}
                    alt={`banner-${current}`}
                    loading="eager"
                    fetchPriority="high"
                    sx={{ 
                      width: '100%', 
                      height: 'auto', 
                      maxHeight: { xs: 200, sm: 280 }, // Reduced from 420px for mobile-first
                      objectFit: 'cover', 
                      borderRadius: 2, 
                      aspectRatio: '16/9', // Changed from 16/7 to be less tall
                      userSelect: 'none' 
                    }}
                  />
                ) : (
                  <Box 
                    sx={{ 
                      width: '100%', 
                      height: { xs: 200, sm: 280 },
                      maxHeight: { xs: 200, sm: 280 },
                      backgroundColor: 'grey.100',
                      borderRadius: 2,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      aspectRatio: '16/9'
                    }}
                  >
                    <Typography variant="body2" color="text.secondary">Loading banner...</Typography>
                  </Box>
                )}
                
                {/* Left/Right click areas for navigation */}
                {bannerCandidates.length > 1 && (
                  <>
                    {/* Left click area - previous */}
                    <Box
                      sx={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        width: '50%',
                        height: '100%',
                        cursor: 'pointer',
                        zIndex: 10,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-start',
                        pl: 2,
                        background: 'transparent',
                        '&:hover': {
                          background: 'linear-gradient(to right, rgba(0,0,0,0.1), transparent)'
                        }
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setBannerIndex((n) => (n - 1 + bannerCandidates.length) % bannerCandidates.length);
                        // Reset auto-advance timer
                        if (bannerTimerRef.current) {
                          clearInterval(bannerTimerRef.current);
                          bannerTimerRef.current = setInterval(() => setBannerIndex((n) => (n + 1) % bannerCandidates.length), 5000);
                        }
                      }}
                    >
                      <Box
                        sx={{
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          backgroundColor: 'rgba(255,255,255,0.8)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          opacity: 0,
                          transition: 'opacity 0.2s ease',
                          '&:hover': { opacity: 1 },
                          '.parent:hover &': { opacity: 0.7 }
                        }}
                      >
                        <Box
                          sx={{
                            width: 0,
                            height: 0,
                            borderTop: '6px solid transparent',
                            borderBottom: '6px solid transparent',
                            borderRight: '8px solid #333',
                            ml: '-2px'
                          }}
                        />
                      </Box>
                    </Box>

                    {/* Right click area - next */}
                    <Box
                      sx={{
                        position: 'absolute',
                        right: 0,
                        top: 0,
                        width: '50%',
                        height: '100%',
                        cursor: 'pointer',
                        zIndex: 10,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        pr: 2,
                        background: 'transparent',
                        '&:hover': {
                          background: 'linear-gradient(to left, rgba(0,0,0,0.1), transparent)'
                        }
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setBannerIndex((n) => (n + 1) % bannerCandidates.length);
                        // Reset auto-advance timer
                        if (bannerTimerRef.current) {
                          clearInterval(bannerTimerRef.current);
                          bannerTimerRef.current = setInterval(() => setBannerIndex((n) => (n + 1) % bannerCandidates.length), 5000);
                        }
                      }}
                    >
                      <Box
                        sx={{
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          backgroundColor: 'rgba(255,255,255,0.8)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          opacity: 0,
                          transition: 'opacity 0.2s ease',
                          '&:hover': { opacity: 1 },
                          '.parent:hover &': { opacity: 0.7 }
                        }}
                      >
                        <Box
                          sx={{
                            width: 0,
                            height: 0,
                            borderTop: '6px solid transparent',
                            borderBottom: '6px solid transparent',
                            borderLeft: '8px solid #333',
                            mr: '-2px'
                          }}
                        />
                      </Box>
                    </Box>
                  </>
                )}

                {/* Simple dots indicator for multiple banners */}
                {bannerCandidates.length > 1 && (
                  <Box sx={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: 8, display: 'flex', gap: 1 }}>
                    {bannerCandidates.map((_, i) => (
                      <Box 
                        key={i} 
                        sx={{ 
                          width: 8, 
                          height: 8, 
                          borderRadius: '50%', 
                          bgcolor: i === current ? 'primary.main' : 'rgba(255,255,255,0.6)', 
                          transition: 'background-color 0.2s ease'
                        }} 
                      />
                    ))}
                  </Box>
                )}

              </Box>
             );
           })()}

          {/* Property details grid - directly after banner with tight spacing */}
          <Box sx={{ mt: 0.5, mb: 2, borderTop: 1, borderColor: 'divider', pt: 1 }}>
            <Grid container spacing={2} sx={{ justifyContent: 'center', maxWidth: 800 }}>
              <Grid item xs={12}>
                {/* Property details grid with better visual emphasis */}
                <Grid container spacing={2} sx={{ '& .MuiGrid-item': { textAlign: 'center' } }}>
                  <Field label="Towers" value={pd.total_towers || pd.totalTowers || pd.total_towers} />
                  <Field label="Flats" value={pd.total_units || pd.totalUnits || pd.total_flats || pd.totalFlats} />
                  <Field label="Floors" value={pd.total_floors || pd.totalFloors} />
                  <Field label="/Floor" value={pd.flats_per_floor || pd.units_perfloor || pd.unitsPerFloor} />
                  <Field label="Acres" value={pd.total_acres || pd.totalAcres} />
                  <Field label="/Acre" value={pd.flats_per_acre || pd.density_per_acre || pd.density || pd.flats_density || pd.flatsDensity} />
                  <Field label="Configuration" value={pd.configuration || pd.config} />
                  <Field label="Flat Sizes" value={pd.unit_sizes || pd.unitSizes || pd.flat_sizes} />
                  {pd.possession_date && <Field label="Possession" value={pd.possession_date} />}
                </Grid>
              </Grid>
            </Grid>
          </Box>

          {/* Amenities */}
          {/* {Array.isArray(amenitySrc) && amenitySrc.length > 0 && (
            <Accordion sx={{ mb: 4 }} defaultExpanded={false} expanded={amenitiesOpen} onChange={(e, isExpanded) => { setAmenitiesOpen(isExpanded); if (isExpanded) prefetchGroup('amenities', amenitySrc); }}>
              <AccordionSummary 
                expandIcon={<ExpandMoreIcon />} 
                sx={{ 
                  position: 'sticky', 
                  top: 'calc(var(--app-header-height, 72px) + 120px)', // Adjusted for project header
                  zIndex: 1100, 
                  backgroundColor: 'background.paper',
                  borderBottom: amenitiesOpen ? '1px solid' : 'none',
                  borderColor: 'divider',
                  boxShadow: amenitiesOpen ? '0 2px 4px rgba(0,0,0,0.1)' : 'none'
                }}
              >
                <Typography variant="h6">Amenities ({amenitySrc.length})</Typography>
              </AccordionSummary>
              <AccordionDetails>
                {amenitiesOpen ? (
                  <Box sx={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
                    gap: '16px',
                  }}>
                    {amenitySrc.map((amenity, idx) => {
                      // Display name: prefer amenity.name when object, otherwise string value
                      const displayName = (amenity && typeof amenity === 'object') ? (amenity.name || '') : (typeof amenity === 'string' ? amenity : '');

                      // Image candidate: ONLY from amenity.icon when amenity is an object
                      const imageCandidate = (amenity && typeof amenity === 'object') ? (amenity.icon || null) : null;

                      // Resolve URL only if we have an explicit image candidate
                      const src = imageCandidate ? resolveFileUrl(imageCandidate, 'amenities') : null;

                      // Stable key based on display name or index
                      const stableKey = displayName || `amenity_${idx}`;

                      return (
                        <React.Fragment key={stableKey}>
                          {src ? (
                            <Box
                              sx={{ textAlign: 'center', cursor: 'pointer' }}
                              onClick={() => handleOpenModal(src)}
                            >
                              <Box
                                component="img"
                                src={src}
                                alt={displayName}
                                loading="lazy"
                                fetchPriority="low"
                                sx={{
                                  width: 64,
                                  height: 64,
                                  objectFit: 'contain',
                                  borderRadius: '50%',
                                  border: '1px solid #eee',
                                  p: 1,
                                  mb: 1,
                                }}
                              />
                              <Typography
                                variant="caption"
                                display="block"
                                title={displayName}
                              >
                                {displayName}
                              </Typography>
                            </Box>
                          ) : (
                            <Box sx={{ textAlign: 'center' }}>
                              <Box sx={{ width: 64, height: 64, bgcolor: 'grey.100', borderRadius: '50%', display: 'inline-block' }} />
                              <Typography variant="caption" display="block" title={displayName} sx={{ mt: 1 }}>
                                {displayName}
                              </Typography>
                            </Box>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </Box>
                ) : null}
              </AccordionDetails>
            </Accordion>
          )} */}

          {/* Site Plan (Layouts) */}
          {Array.isArray(data.layouts) && data.layouts.length > 0 && (
            <Accordion sx={{ mb: 4 }} expanded={layoutsOpen} onChange={(e, isExpanded) => { setLayoutsOpen(isExpanded); if (isExpanded) prefetchGroup('layouts', data.layouts); }}>
              <AccordionSummary
                expandIcon={<ExpandMoreIcon />}
                sx={{
                  position: 'sticky',
                  top: 'calc(var(--app-header-height, 72px) + 120px)', // Adjusted for project header
                  zIndex: 1100,
                  backgroundColor: 'background.paper',
                  borderBottom: layoutsOpen ? '1px solid' : 'none',
                  borderColor: 'divider',
                  boxShadow: layoutsOpen ? '0 2px 4px rgba(0,0,0,0.1)' : 'none'
                }}
              >
                 <Typography variant="h6">Site Plans ({data.layouts?.length || 0})</Typography>
               </AccordionSummary>
              <AccordionDetails>
                {layoutsOpen ? (
                  <Grid container spacing={2}>
                    {data.layouts.map((l) => {
                      const src = resolveFileUrl(l, 'layouts');
                      return (
                        <Grid item key={l.id || l.path || (l.file || l.file_name || Math.random())} xs={6} sm={4} md={3}>
                          {src ? (
                            <Box
                              component="img"
                              src={src}
                              alt={l.caption || 'layout'}
                              loading="lazy"
                              fetchPriority="low"
                              sx={{ width: '100%', height: 'auto', objectFit: 'cover', borderRadius: 1, border: '1px solid #ddd', cursor: 'pointer', aspectRatio: '4/3', minHeight: 120 }}
                              onClick={() => handleOpenModal(src)}
                            />
                          ) : (
                            <Box sx={{ width: '100%', aspectRatio: '4/3', bgcolor: 'grey.100', borderRadius: 1 }} />
                          )}
                        </Grid>
                      );
                    })}
                  </Grid>
                ) : null}
              </AccordionDetails>
            </Accordion>
          )}

          {/* Floor Plans */}
          {Array.isArray(data.floor_plans) && data.floor_plans.length > 0 && (
            <Accordion sx={{ mb: 4 }} expanded={floorPlansOpen} onChange={(e, isExpanded) => { setFloorPlansOpen(isExpanded); if (isExpanded) prefetchGroup('floor_plans', data.floor_plans); }}>
              <AccordionSummary
                expandIcon={<ExpandMoreIcon />}
                sx={{
                  position: 'sticky',
                  top: 'calc(var(--app-header-height, 72px) + 120px)', // Adjusted for project header
                  zIndex: 1100,
                  backgroundColor: 'background.paper',
                  borderBottom: floorPlansOpen ? '1px solid' : 'none',
                  borderColor: 'divider',
                  boxShadow: floorPlansOpen ? '0 2px 4px rgba(0,0,0,0.1)' : 'none'
                }}
              >
                 <Typography variant="h6">Floor Plans ({data.floor_plans?.length || 0})</Typography>
               </AccordionSummary>
              <AccordionDetails>
                {floorPlansOpen ? (
                  <Grid container spacing={2}>
                    {data.floor_plans.map((f) => {
                      const src = resolveFileUrl(f, 'floor_plans');
                      return (
                        <Grid item key={f.id || f.path || (f.file || Math.random())} xs={6} sm={4} md={3}>
                          {src ? (
                            <Box
                              component="img"
                              src={src}
                              alt={f.caption || 'floor plan'}
                              loading="lazy"
                              fetchPriority="low"
                              sx={{ width: '100%', height: 'auto', objectFit: 'cover', borderRadius: 1, border: '1px solid #ddd', cursor: 'pointer', aspectRatio: '4/3', minHeight: 120 }}
                              onClick={() => handleOpenModal(src)}
                            />
                          ) : (
                            <Box sx={{ width: '100%', aspectRatio: '4/3', bgcolor: 'grey.100', borderRadius: 1 }} />
                          )}
                        </Grid>
                      );
                    })}
                  </Grid>
                ) : null}
              </AccordionDetails>
            </Accordion>
          )}

          {/* Videos */}
          {Array.isArray(data.videos) && data.videos.length > 0 && (
            <Accordion sx={{ mb: 4 }} expanded={videosOpen} onChange={(e, isExpanded) => { setVideosOpen(isExpanded); if (isExpanded) prefetchGroup('videos', data.videos); }}>
              <AccordionSummary 
                expandIcon={<ExpandMoreIcon />} 
                sx={{ 
                  position: 'sticky', 
                  top: 'calc(var(--app-header-height, 72px) + 120px)', // Adjusted for project header
                  zIndex: 1100, 
                  backgroundColor: 'background.paper',
                  borderBottom: videosOpen ? '1px solid' : 'none',
                  borderColor: 'divider',
                  boxShadow: videosOpen ? '0 2px 4px rgba(0,0,0,0.1)' : 'none'
                }}
              >
                <Typography variant="h6">Videos ({data.videos.length})</Typography>
              </AccordionSummary>
              <AccordionDetails>
                {videosOpen ? (
                  <Grid container spacing={2} justifyContent="center">
                    {data.videos.map((videoUrl, index) => {
                      const videoId = getYouTubeId(videoUrl);
                      const resolvedUrl = resolveFileUrl(videoUrl, 'videos');
                      return (
                        <Grid item xs={12} md={6} key={index}>
                          {videoId ? (
                            <Box sx={{ position: 'relative', width: '100%', pb: '56.25%', borderRadius: 2, overflow: 'hidden', bgcolor: 'black' }}>
                              <iframe
                                title={`project-video-${index}`}
                                src={`https://www.youtube.com/embed/${videoId}?rel=0`}
                                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
                                frameBorder="0"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                              />
                            </Box>
                          ) : (
                            <Box sx={{ width: '100%', borderRadius: 2, overflow: 'hidden', bgcolor: 'black' }}>
                              <video
                                src={resolvedUrl}
                                controls
                                style={{ width: '100%', height: 'auto', maxHeight: 320, backgroundColor: 'black', display: 'block' }}
                              >
                                Sorry, your browser doesn't support embedded videos.
                              </video>
                            </Box>
                          )}
                        </Grid>
                      );
                    })}
                  </Grid>
                ) : null}
              </AccordionDetails>
            </Accordion>
          )}

          {/* Photo Gallery */}
          {Array.isArray(data.photos) && data.photos.length > 0 && (
            <Accordion sx={{ mb: 4 }} expanded={photosOpen} onChange={(e, isExpanded) => { setPhotosOpen(isExpanded); if (isExpanded) prefetchGroup('photos', data.photos); }}>
              <AccordionSummary 
                expandIcon={<ExpandMoreIcon />} 
                sx={{ 
                  position: 'sticky', 
                  top: 'calc(var(--app-header-height, 72px) + 120px)', // Adjusted for project header
                  zIndex: 1100, 
                  backgroundColor: 'background.paper',
                  borderBottom: photosOpen ? '1px solid' : 'none',
                  borderColor: 'divider',
                  boxShadow: photosOpen ? '0 2px 4px rgba(0,0,0,0.1)' : 'none'
                }}
              >
                <Typography variant="h6">Photo Gallery ({data.photos.length})</Typography>
              </AccordionSummary>
              <AccordionDetails>
                {photosOpen ? (
                  <Grid container spacing={2}>
                    {data.photos.map((p) => {
                      const src = resolveFileUrl(p, 'photos');
                      return (
                        <Grid item key={p.id || p.path || (p.file || p.file_name || Math.random())} xs={6} sm={4} md={3}>
                          {src ? (
                            <Box
                              component="img"
                              src={src}
                              alt={p.caption || 'photo'}
                              loading="lazy"
                              fetchPriority="low"
                              sx={{ width: '100%', height: 'auto', objectFit: 'cover', borderRadius: 1, border: '1px solid #ddd', cursor: 'pointer', aspectRatio: '4/3', minHeight: 120 }}
                              onClick={() => handleOpenModal(src)}
                            />
                          ) : (
                            <Box sx={{ width: '100%', aspectRatio: '4/3', bgcolor: 'grey.100', borderRadius: 1 }} />
                          )}
                        </Grid>
                      );
                    })}
                  </Grid>
                ) : null}
              </AccordionDetails>
            </Accordion>
          )}

          {/* Website Link */}
          {(pd?.website || data.website) && (
            <Box sx={{ mt: 4, textAlign: 'center' }}>
              <Button component="a" href={pd?.website || data.website} target="_blank" rel="noopener noreferrer" startIcon={<LanguageIcon />} variant="outlined">
                Visit Project Website
              </Button>
            </Box>
          )}
        </Box>
      )}

      <Modal
        open={modalOpen}
        onClose={handleCloseModal}
       
      >
        <img
          src={modalImageUrl}
          alt="enlarged view"
          style={{
            display: 'block',
            maxWidth: '95vw',
            maxHeight: '95vh',
            objectFit: 'contain',
            outline: 'none',
            boxShadow: '0px 11px 15px -7px rgba(0,0,0,0.2), 0px 24px 38px 3px rgba(0,0,0,0.14), 0px 9px 46px 8px rgba(0,0,0,0.12)',
          }}
        />
      </Modal>

      <Modal
        open={pdfModalOpen}
        onClose={handleClosePdfModal}
        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <Box sx={{ position: 'relative', width: '100vw', maxWidth: 600, height: '90vh', bgcolor: 'background.paper', borderRadius: { xs: 0, sm: 2 }, boxShadow: 24, p: 0 }}>
          <Button onClick={handleClosePdfModal} sx={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}>Close</Button>
          <iframe
            src={pdfUrl}
            title="Brochure PDF"
            width="100%"
            height="100%"
            style={{ border: 'none', minHeight: '80vh' }}
          />
        </Box>
      </Modal>
    </Box>
  );
}
