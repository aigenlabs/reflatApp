import React, { useEffect, useState, useRef } from 'react';
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


export default function ProjectDetailView() {
  const { builderId, projectId } = useParams();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [signedUrls, setSignedUrls] = useState({});
  const [modalOpen, setModalOpen] = useState(false);
  const [modalImageUrl, setModalImageUrl] = useState('');
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState("");
  const [bannerSrc, setBannerSrc] = useState(null);
  // Track pending signed_url fetches to avoid duplicate requests
  const pendingSignedFetches = useRef(new Set());

  // Control loading of large image groups — only fetch signed URLs when the section is opened
  const [amenitiesOpen, setAmenitiesOpen] = useState(false);
  const [layoutsOpen, setLayoutsOpen] = useState(false);
  const [floorPlansOpen, setFloorPlansOpen] = useState(false);
  const [photosOpen, setPhotosOpen] = useState(false);
  const [videosOpen, setVideosOpen] = useState(false);

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
        if (alive) setData(json);
      } catch (e) {
        if (alive) setError(String(e?.message || e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [builderId, projectId]);

  // Prefer project details from several possible keys to handle different response shapes
  // Common variants: Key_Project_details, key_project_details, data.project, data.project.Key_Project_details
  const pd = (data && (
    data.Key_Project_details || data.key_project_details ||
    data.project?.Key_Project_details || data.project?.key_project_details ||
    data.project || {}
  )) || {};

  // DEBUG: surface the resolved data shape in browser console to help locate description fields
  // (will be useful while some scrapes may not include a dedicated description key)
  if (process.env.NODE_ENV !== 'production') {
    console.debug('ProjectDetailView - resolved data:', { data, pd });
  }

  // Amenities source used in multiple places (signed-url fetch, rendering, key lookups)
  const amenitySrc = (data && (data.amenities || data.project?.amenities || pd?.amenities)) || [];

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

    addIf('banner', 'banners', data.files?.banner);
    addIf('brochure', 'brochures', data.files?.brochure);
    addIf('builder_logo', 'logos', data.files?.builder_logo);
    addIf('project_logo', 'logos', data.files?.project_logo);

    // Fetch signed URLs for asset groups only when their section is opened in the UI
    if (photosOpen) {
      (data.photos || []).forEach((p, i) => addIf(`photo_${i}`, 'photos', p));
    }
    if (layoutsOpen) {
      (data.layouts || []).forEach((l, i) => addIf(`layout_${i}`, 'layouts', l));
    }
    if (floorPlansOpen) {
      (data.floor_plans || []).forEach((f, i) => addIf(`floor_${i}`, 'floor_plans', f));
    }
    // Add amenities (use the component-scoped amenitySrc) only when opened
    if (amenitiesOpen) {
      amenitySrc.forEach((a, i) => addIf(`amenity_${i}`, 'amenities', a));
    }

    if (toFetch.length === 0) {
      if (process.env.NODE_ENV !== 'production') {
        console.debug('ProjectDetailView: no assets to fetch for signed URLs', { builderId, projectId, dataFiles: data.files, photos: data.photos?.length, layouts: data.layouts?.length, floor_plans: data.floor_plans?.length, amenityCount: amenitySrc.length });
      }
      return;
    }

    // Ensure banner and logos are explicitly requested so UI (banner/logo) can render quickly.
    try {
      if (data.files?.banner) {
        let fname = typeof data.files.banner === 'string' ? data.files.banner : (data.files.banner.path || data.files.banner.file || data.files.banner.file_name || data.files.banner.filename || data.files.banner.name);
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
      if (data.files?.builder_logo) {
        let fname = typeof data.files.builder_logo === 'string' ? data.files.builder_logo : (data.files.builder_logo.path || data.files.builder_logo.file || data.files.builder_logo.file_name || data.files.builder_logo.filename || data.files.builder_logo.name);
        if (fname) {
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
      }
      if (data.files?.project_logo) {
        let fname = typeof data.files.project_logo === 'string' ? data.files.project_logo : (data.files.project_logo.path || data.files.project_logo.file || data.files.project_logo.file_name || data.files.project_logo.filename || data.files.project_logo.name);
        if (fname) {
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
        if (!data) return;
        const candidate = (signedUrls.banner) || resolveFileUrl(data.files?.banner, 'banners');
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

  function normalizeFilenameForUrl(name) {
    if (!name) return name;
    // This logic should EXACTLY match the `normalizeFilename` function in the upload script.
    // It replaces backslashes, trims whitespace from each path segment, and replaces spaces with underscores.
    return name.replace(/\\/g, '/').split('/').map(s => s.trim().replace(/\s+/g, '_')).join('/');
  }

  function resolveFileUrl(item, folder, fallbackName) {
    // item may be a string filename or an object with url/file/file_name/name
    if (!item) return null;

    const rawFilename = typeof item === 'string' ? item : (item.file || item.file_name || item.filename || item.name || item.path || fallbackName);

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
      const raw = (typeof itemOrString === 'string') ? itemOrString : (itemOrString.file || itemOrString.path || itemOrString.file_name || itemOrString.filename || itemOrString.name || '');
      const norm = normalizeFilenameForUrl(String(raw));
      return norm.split('/').filter(Boolean).pop() || '';
    }

    const baseFilename = filename.split('/').filter(Boolean).pop();

    const photoIndex = (data?.photos || []).findIndex(p => extractNormalizedBase(p) === baseFilename);
    const layoutIndex = (data?.layouts || []).findIndex(l => extractNormalizedBase(l) === baseFilename);
    const floorIndex = (data?.floor_plans || []).findIndex(f => extractNormalizedBase(f) === baseFilename);
    const amenityIndex = (amenitySrc || []).findIndex(a => extractNormalizedBase(a) === baseFilename);

    const keyCandidates = [
      // main file keys
      folder === 'banners' && 'banner',
      folder === 'brochures' && 'brochure',
      folder === 'logos' && (fallbackName && fallbackName.includes('builder') ? 'builder_logo' : 'project_logo'),
      // dynamic keys for small-asset caches (only include when index found)
      photoIndex >= 0 && `photo_${photoIndex}`,
      layoutIndex >= 0 && `layout_${layoutIndex}`,
      floorIndex >= 0 && `floor_${floorIndex}`,
      amenityIndex >= 0 && `amenity_${amenityIndex}`,
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
        fetchSignedUrlOnDemand(folder, normalized, null);
      } catch (e) {
        fetchSignedUrlOnDemand(folder, filename, null);
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

  // Resolve builder/project logo by checking signed URLs, data.files, data.logos array and Key_Project_details
  function resolveLogoCandidate() {
    // signedUrls override
    if (signedUrls.builder_logo) return signedUrls.builder_logo;
    if (signedUrls.project_logo) return signedUrls.project_logo;
    // data.files.*
    if (data?.files?.builder_logo) return resolveFileUrl(data.files.builder_logo, 'logos', 'builder_logo');
    if (data?.files?.project_logo) return resolveFileUrl(data.files.project_logo, 'logos', 'project_logo');
    // data.logos array common in local JSON
    if (Array.isArray(data?.logos) && data.logos.length > 0) {
      const first = data.logos[0];
      return resolveFileUrl(first, 'logos');
    }
    // Key_Project_details fields
    if (pd?.builder_logo) return resolveFileUrl(pd.builder_logo, 'logos');
    if (pd?.project_logo) return resolveFileUrl(pd.project_logo, 'logos');
    // fallback to top-level logo fields
    if (data?.logo) return data.logo;
    if (data?.project?.logo) return data.project.logo;
    return null;
  }

  // Fetch a signed URL for a specific folder/filename and merge into signedUrls state
  async function fetchSignedUrlOnDemand(folder, filename, keyHint) {
    if (!folder || !filename) return;
    const composite1 = `${folder}:${filename}`;
    const composite2 = `${folder}/${filename}`;
    if (signedUrls[composite1] || signedUrls[composite2]) return; // already have it
    const pendingKey = `${folder}::${filename}`;
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
      let candidate = typeof it === 'string' ? it : (it.path || it.file || it.file_name || it.filename || it.name || it);
      if (!candidate) return;
      // Determine a UI-friendly key hint so fetchSignedUrlOnDemand stores the URL under dynamic keys like 'layout_0'
      let keyHint = null;
      if (folder === 'photos') keyHint = `photo_${idx}`;
      if (folder === 'layouts') keyHint = `layout_${idx}`;
      if (folder === 'floor_plans') keyHint = `floor_${idx}`;
      if (folder === 'amenities') keyHint = `amenity_${idx}`;

      // If candidate includes builder/project prefix, extract folder+filename
      if (typeof candidate === 'string') {
        const parts = candidate.split('/').filter(Boolean);
        if (parts.length >= 4 && parts[0] === builderId && parts[1] === projectId) {
          const folderFromPath = parts[2];
          const filenameFromPath = parts.slice(3).join('/');
          fetchSignedUrlOnDemand(folderFromPath, normalizeFilenameForUrl(filenameFromPath), keyHint);
          return;
        }
        if (parts.length >= 2 && parts[0] === folder) {
          const filenameFromPath = parts.slice(1).join('/');
          fetchSignedUrlOnDemand(folder, normalizeFilenameForUrl(filenameFromPath), keyHint);
          return;
        }
      }
      // Fallback: ask for filename directly
      fetchSignedUrlOnDemand(folder, normalizeFilenameForUrl(String(candidate)), keyHint);
    });
  }

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto', p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 2 }}>
        <Button component={Link} to="/new-projects" startIcon={<ArrowBackIcon />}>Back</Button>
        {resolveLogoCandidate() && (
          <Box
            component="img"
            src={resolveLogoCandidate()}
            alt="builder logo"
            sx={{ height: { xs: 32, sm: 40 }, maxWidth: 120, objectFit: 'contain', display: 'block' }}
          />
        )}
      </Box>

      {loading && <Typography color="text.secondary">Loading…</Typography>}
      {error && <Box sx={{ bgcolor: '#fde2e2', color: '#8a1f1f', p: 2, borderRadius: 1 }}>{error}</Box>}

      {!loading && !error && data && (
        <Box>
          {/* Project Title & Logo */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
            {data.files?.project_logo && (
              <Box component="img" src={ signedUrls.project_logo || resolveLogoCandidate() || resolveFileUrl(data.files?.project_logo, 'logos', 'project_logo') } alt="project logo" sx={{ width: 60, height: 60, objectFit: 'contain', borderRadius: 1, p: 0.5, border: '1px solid #eee' }} />
            )}
            <Typography variant="h4" component="h1" sx={{ fontWeight: 'bold' }}>
              {pd.project_name || pd.name || data.project?.project_name || data.project?.name || 'Untitled'}
            </Typography>
          </Box>

          <Typography color="text.secondary" sx={{ mb: 2, pl: '76px' /* Align with title, accounting for logo width + gap */ }}>
            {(pd.project_location || pd.location || '')}{pd.project_city ? `, ${pd.project_city}` : ''}
          </Typography>

          {/* Description / Highlights: try several common keys so we show text when available */}
          {(pd.description || data.description || pd.highlights || data.highlights || pd.summary || data.summary || pd.overview || data.overview) && (
            <Typography variant="body1" sx={{ mb: 2, pl: '76px' }}>
              {pd.description || data.description || pd.highlights || data.highlights || pd.summary || data.summary || pd.overview || data.overview}
            </Typography>
          )}

          {/* Banner image */}
          {data.files?.banner && (
            <Box
              component="img"
              src={bannerSrc || signedUrls.banner || resolveFileUrl(data.files.banner, 'banners')}
              alt="banner"
              loading="eager"
              fetchPriority="high"
              sx={{ width: '100%', height: 'auto', maxHeight: 400, objectFit: 'cover', borderRadius: 2, mb: 4, aspectRatio: '16/7' }}
            />
          )}

          {/* Project Details Section */}
          <Box sx={{ mb: 4 }}>
            <Typography variant="h5" sx={{ mb: 2, borderBottom: 1, borderColor: 'divider', pb: 1 }}>Project Details</Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} md={4}>
                {/* Actions */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'flex-start' }}>
                  {data.files?.brochure && (
                    <Button
                      onClick={() => handleOpenPdfModal(signedUrls.brochure || resolveFileUrl(data.files.brochure, 'brochures'))}
                      startIcon={<i className="fa-solid fa-file-pdf" />}
                    >
                      Brochure
                    </Button>
                  )}
                </Box>
              </Grid>
              <Grid item xs={12} md={8}>
                {/* Property details grid */}
                <Grid container spacing={2}>
                  <Field label="Configuration" value={pd.configuration || pd.config} />
                  <Field label="Unit Sizes" value={pd.unit_sizes || pd.unitSizes || pd.unitSizes} />
                  <Field label="Total Acres" value={pd.total_acres || pd.totalAcres} />
                  <Field label="Towers" value={pd.total_towers || pd.totalTowers || pd.total_towers} />
                  <Field label="Total Units" value={pd.total_units || pd.totalUnits || pd.total_flats || pd.totalFlats} />
                  <Field label="Floors" value={pd.total_floors || pd.totalFloors} />
                  <Field label="Units / Floor" value={pd.units_per_floor || pd.units_perfloor || pd.unitsPerFloor} />
                  <Field label="Flats / acre" value={pd.flats_density || pd.density_per_acre || pd.density || pd.flatsDensity} />
                  {pd.possession_date && <Field label="Possession" value={pd.possession_date} />}
                  {pd.rera_number && <Field label="RERA" value={pd.rera_number} />}
                </Grid>
              </Grid>
            </Grid>
          </Box>

          {/* Amenities */}
          {Array.isArray(amenitySrc) && amenitySrc.length > 0 && (
            <Accordion sx={{ mb: 4 }} defaultExpanded={false} expanded={amenitiesOpen} onChange={(e, isExpanded) => { setAmenitiesOpen(isExpanded); if (isExpanded) prefetchGroup('amenities', amenitySrc); }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="h6">Amenities ({amenitySrc.length})</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Box sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
                  gap: '16px',
                }}>
                  {amenitySrc.map((amenity, idx) => {
                    const src = resolveFileUrl(amenity, 'amenities');
                    // Derive a stable key from common properties or the string value; fall back to index-based key
                    const derivedKey = (amenity && typeof amenity === 'object')
                      ? (amenity.name || amenity.path || amenity.file || amenity.file_name || amenity.filename)
                      : (typeof amenity === 'string' ? amenity : null);
                    const stableKey = derivedKey || `amenity_${idx}`;
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
                              alt={amenity.name}
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
                              title={amenity.name}
                            >
                              {amenity.name}
                            </Typography>
                          </Box>
                        ) : (
                          <Box sx={{ width: 64, height: 64, bgcolor: 'grey.100', borderRadius: '50%' }} />
                        )}
                      </React.Fragment>
                    );
                  })}
                </Box>
              </AccordionDetails>
            </Accordion>
          )}

          {/* Site Plan (Layouts) */}
          {Array.isArray(data.layouts) && data.layouts.length > 0 && (
            <Accordion sx={{ mb: 4 }} expanded={layoutsOpen} onChange={(e, isExpanded) => { setLayoutsOpen(isExpanded); if (isExpanded) prefetchGroup('layouts', data.layouts); }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="h6">Site Plan ({data.layouts.length})</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Grid container spacing={2}>
                  {data.layouts.map((l) => {
                    const src = resolveFileUrl(l, 'layouts');
                    console.log('Layout src:', src);
                    console.log('Layout src l:', l);
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
              </AccordionDetails>
            </Accordion>
          )}

          {/* Floor Plans */}
          {Array.isArray(data.floor_plans) && data.floor_plans.length > 0 && (
            <Accordion sx={{ mb: 4 }} expanded={floorPlansOpen} onChange={(e, isExpanded) => { setFloorPlansOpen(isExpanded); if (isExpanded) prefetchGroup('floor_plans', data.floor_plans); }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="h6">Floor Plans ({data.floor_plans.length})</Typography>
              </AccordionSummary>
              <AccordionDetails>
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
              </AccordionDetails>
            </Accordion>
          )}

          {/* Videos */}
          {Array.isArray(data.videos) && data.videos.length > 0 && (
            <Accordion sx={{ mb: 4 }} expanded={videosOpen} onChange={(e, isExpanded) => { setVideosOpen(isExpanded); if (isExpanded) prefetchGroup('videos', data.videos); }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="h6">Videos ({data.videos.length})</Typography>
              </AccordionSummary>
              <AccordionDetails>
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
              </AccordionDetails>
            </Accordion>
          )}

          {/* Photo Gallery */}
          {Array.isArray(data.photos) && data.photos.length > 0 && (
            <Accordion sx={{ mb: 4 }} expanded={photosOpen} onChange={(e, isExpanded) => { setPhotosOpen(isExpanded); if (isExpanded) prefetchGroup('photos', data.photos); }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="h6">Photo Gallery ({data.photos.length})</Typography>
              </AccordionSummary>
              <AccordionDetails>
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
              </AccordionDetails>
            </Accordion>
          )}

          {/* Website Link */}
          {data.files?.website && (
            <Box sx={{ mt: 4, textAlign: 'center' }}>
              <Button component="a" href={data.files.website} target="_blank" rel="noopener noreferrer" startIcon={<LanguageIcon />} variant="outlined">
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

function Field({ label, value }) {
  if (!value) return null;
  return (
    <Grid item xs={12} sm={6}>
      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase' }}>{label}</Typography>
        <Typography variant="body1" sx={{ fontWeight: 500 }}>{value}</Typography>
      </Box>
    </Grid>
  );
}
