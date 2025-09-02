import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import Modal from '@mui/material/Modal';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import LanguageIcon from '@mui/icons-material/Language';
import { FIREBASE_FUNCTIONS_URL, FIREBASE_STORAGE_URL } from '../components/constants';

export default function ProjectDetailView() {
  const { builderId, projectId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [signedUrls, setSignedUrls] = useState({});
  const [modalOpen, setModalOpen] = useState(false);
  const [modalImageUrl, setModalImageUrl] = useState('');

  const handleOpenModal = (imageUrl) => {
    setModalImageUrl(imageUrl);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setModalImageUrl('');
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setError('');
      try {
        const resp = await fetch(`${FIREBASE_FUNCTIONS_URL}/project_details/${builderId}/${projectId}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const json = await resp.json();
        if (alive) setData(json);
      } catch (e) {
        if (alive) setError(String(e?.message || e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [builderId, projectId]);

  // Fetch signed URLs for main files (banner, brochure, logos) and a small set of assets
  useEffect(() => {
    if (!data) return;
    let alive = true;
    const toFetch = [];

    const addIf = (key, folder, value) => {
      if (!value) return;
      // Handle both string filenames and objects with a `path` or `file` property
      const fname = typeof value === 'string' ? value : (value.path || value.file || value.file_name || value.filename || value.name);
      if (fname) toFetch.push({ key, folder, filename: fname });
    };

    addIf('banner', 'banners', data.files?.banner);
    addIf('brochure', 'brochures', data.files?.brochure);
    addIf('builder_logo', 'logos', data.files?.builder_logo);
    addIf('project_logo', 'logos', data.files?.project_logo);

    // Fetch signed URLs for all photos, layouts, and floor plans that are rendered.
    (data.photos || []).forEach((p, i) => addIf(`photo_${i}`, 'photos', p));
    (data.layouts || []).forEach((l, i) => addIf(`layout_${i}`, 'layouts', l));
    (data.floor_plans || []).forEach((f, i) => addIf(`floor_${i}`, 'floor_plans', f));

    if (toFetch.length === 0) return;

    (async () => {
      const map = {};
      await Promise.all(toFetch.map(async (it) => {
        try {
          const url = `${FIREBASE_FUNCTIONS_URL}/signed_url?folder=${encodeURIComponent(it.folder)}&builderId=${encodeURIComponent(builderId)}&projectId=${encodeURIComponent(projectId)}&file=${encodeURIComponent(it.filename)}`;
          const r = await fetch(url);
          if (!r.ok) throw new Error(`signed_url ${r.status}`);
          const j = await r.json();
          if (alive && j && j.url) map[it.key] = j.url;
        } catch (err) {
          // ignore failures; UI will fallback to direct storage url
        }
      }));
      if (alive) setSignedUrls((s) => ({ ...s, ...map }));
    })();

    return () => { alive = false; };
  }, [data, builderId, projectId]);

  function normalizeFilenameForUrl(name) {
    if (!name) return name;
    // This logic should EXACTLY match the `normalizeFilename` function in the upload script.
    // It replaces backslashes, trims whitespace from each path segment, and replaces spaces with underscores.
    return name.replace(/\\/g, '/').split('/').map(s => s.trim().replace(/\s+/g, '_')).join('/');
  }

  function resolveFileUrl(item, folder, fallbackName) {
    // item may be a string filename or an object with url/file/file_name/name
    if (!item) return null;
    // prefer previously-fetched signed URL
    const rawFilename = typeof item === 'string' ? item : (item.file || item.file_name || item.filename || item.name || item.path || fallbackName);
    
    // Normalize the filename to match how it's stored in GCS by the upload script.
    const filename = normalizeFilenameForUrl(rawFilename);

    const keyCandidates = [
      // main file keys
      folder === 'banners' && 'banner',
      folder === 'brochures' && 'brochure',
      folder === 'logos' && (fallbackName && fallbackName.includes('builder') ? 'builder_logo' : 'project_logo'),
      // dynamic keys for small-asset caches
      `photo_${(data?.photos || []).findIndex((p) => (normalizeFilenameForUrl(p.file || p.path || p) === filename))}`,
      `layout_${(data?.layouts || []).findIndex((l) => (normalizeFilenameForUrl(l.file || l.path || l) === filename))}`,
      `floor_${(data?.floor_plans || []).findIndex((f) => (normalizeFilenameForUrl(f.file || f.path || f) === filename))}`,
    ].filter(Boolean);

    for (const k of keyCandidates) {
      if (k && signedUrls[k]) return signedUrls[k];
    }

    if (typeof item === 'string' && item.startsWith('http')) return item;
    // fallback to direct storage public URL
    if (filename) {
      // The path must match the structure used in the upload script: <builderId>/<projectId>/<folder>/<filename>
      const objectPath = `${builderId}/${projectId}/${folder}/${filename}`;
      // The object path needs to be URL-encoded, but without encoding the path separators ('/').
      const encodedObjectPath = objectPath.split('/').map(encodeURIComponent).join('/');
      return `${FIREBASE_STORAGE_URL}/${encodedObjectPath}?alt=media`;
    }
    return null;
  }

  function getYouTubeId() {
    // prefer files.youtube_id then project.youtube_id then videos array
    if (!data) return null;
    const youtubeId = data.files?.youtube_id || data.project?.youtube_id || data.project?.youtube || data.files?.youtube || null;
    if (youtubeId) return youtubeId;
    const videos = Array.isArray(data.videos) ? data.videos : [];
    for (const v of videos) {
      if (!v) continue;
      if (v.youtube_id) return v.youtube_id;
      if (v.url && typeof v.url === 'string' && v.url.includes('youtube')) {
        const m = v.url.match(/(?:v=|embed\/|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
        if (m) return m[1];
      }
    }
    return null;
  }

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto', p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <Button component={Link} to="/new-projects" startIcon={<ArrowBackIcon />}>
          Back
        </Button>
      </Box>

      {loading && <Typography color="text.secondary">Loading…</Typography>}
      {error && <Box sx={{ bgcolor: '#fde2e2', color: '#8a1f1f', p: 2, borderRadius: 1 }}>{error}</Box>}

      {!loading && !error && data && (
        <Box>
          {/* Project Title */}
          <Typography variant="h4" component="h1" sx={{ mb: 1, fontWeight: 'bold' }}>
            {data.project?.project_name || data.project?.name || 'Untitled'}
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            {(data.project?.project_location || data.project?.location || '')}{data.project?.project_city ? `, ${data.project?.project_city}` : ''}
          </Typography>

          {/* Banner image */}
          {data.files?.banner && (
            <Box component="img" src={resolveFileUrl(data.files.banner, 'banners')} alt="banner" sx={{ width: '100%', height: 'auto', maxHeight: 400, objectFit: 'cover', borderRadius: 2, mb: 4 }} />
          )}

          {/* Project Details Section */}
          <Box sx={{ mb: 4 }}>
            <Typography variant="h5" sx={{ mb: 2, borderBottom: 1, borderColor: 'divider', pb: 1 }}>Project Details</Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} md={4}>
                {/* Logos and Actions */}
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2 }}>
                  {data.files?.builder_logo && (
                    <Box component="img" src={resolveFileUrl(data.files.builder_logo, 'logos', 'builder_logo')} alt="builder logo" sx={{ width: 80, height: 80, objectFit: 'contain', borderRadius: 1, p: 0.5, border: '1px solid #eee' }} />
                  )}
                  {data.files?.project_logo && (
                    <Box component="img" src={resolveFileUrl(data.files.project_logo, 'logos', 'project_logo')} alt="project logo" sx={{ width: 80, height: 80, objectFit: 'contain', borderRadius: 1, p: 0.5, border: '1px solid #eee' }} />
                  )}
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'flex-start' }}>
                  {data.files?.brochure && (
                    <Button component="a" href={resolveFileUrl(data.files.brochure, 'brochures')} startIcon={<i className="fa-solid fa-file-pdf" />}>
                      Brochure
                    </Button>
                  )}
                </Box>
              </Grid>
              <Grid item xs={12} md={8}>
                {/* Property details grid */}
                <Grid container spacing={2}>
                  <Field label="Configuration" value={data.project?.configuration || data.project?.config} />
                  <Field label="Unit Sizes" value={data.project?.unit_sizes || data.project?.unitSizes} />
                  <Field label="Total Acres" value={data.project?.total_acres || data.project?.totalAcres} />
                  <Field label="Towers" value={data.project?.total_towers || data.project?.totalTowers} />
                  <Field label="Total Units" value={data.project?.total_units || data.project?.totalUnits} />
                  <Field label="Floors" value={data.project?.total_floors || data.project?.totalFloors} />
                  <Field label="Units / Floor" value={data.project?.units_perfloor || data.project?.unitsPerFloor} />
                  <Field label="Density/acre" value={data.project?.desnsity_per_acre || data.project?.density_per_acre || data.project?.densityPerAcre} />
                  {data.project?.possession_date && <Field label="Possession" value={data.project.possession_date} />}
                  {data.project?.rera_number && <Field label="RERA" value={data.project.rera_number} />}
                </Grid>
              </Grid>
            </Grid>
          </Box>

          {/* Site Plan (Layouts) */}
          {Array.isArray(data.layouts) && data.layouts.length > 0 && (
            <Box sx={{ mb: 4 }}>
              <Typography variant="h5" sx={{ mb: 2, borderBottom: 1, borderColor: 'divider', pb: 1 }}>Site Plan</Typography>
              <Grid container spacing={2}>
                {data.layouts.map((l) => {
                  const src = resolveFileUrl(l, 'layouts');
                  return (
                    <Grid key={l.id || l.path || (l.file || l.file_name || Math.random())} item xs={6} sm={4} md={3}>
                      {src ? (
                        <Box
                          component="img"
                          src={src}
                          alt={l.caption || 'layout'}
                          sx={{ width: '100%', height: 'auto', objectFit: 'cover', borderRadius: 1, border: '1px solid #ddd', cursor: 'pointer' }}
                          onClick={() => handleOpenModal(src)}
                        />
                      ) : (
                        <Box sx={{ width: '100%', pt: '100%', bgcolor: 'grey.100', borderRadius: 1 }} />
                      )}
                    </Grid>
                  );
                })}
              </Grid>
            </Box>
          )}

          {/* Floor Plans */}
          {Array.isArray(data.floor_plans) && data.floor_plans.length > 0 && (
            <Box sx={{ mb: 4 }}>
              <Typography variant="h5" sx={{ mb: 2, borderBottom: 1, borderColor: 'divider', pb: 1 }}>Floor Plans</Typography>
              <Grid container spacing={2}>
                {data.floor_plans.map((f) => {
                  const src = resolveFileUrl(f, 'floor_plans');
                  return (
                    <Grid key={f.id || f.path || (f.file || Math.random())} item xs={6} sm={4} md={3}>
                      {src ? (
                        <Box
                          component="img"
                          src={src}
                          alt={f.caption || 'floor plan'}
                          sx={{ width: '100%', height: 'auto', objectFit: 'cover', borderRadius: 1, border: '1px solid #ddd', cursor: 'pointer' }}
                          onClick={() => handleOpenModal(src)}
                        />
                      ) : (
                        <Box sx={{ width: '100%', pt: '100%', bgcolor: 'grey.100', borderRadius: 1 }} />
                      )}
                    </Grid>
                  );
                })}
              </Grid>
            </Box>
          )}

          {/* Gallery (Video & Photos) */}
          <Box>
            <Typography variant="h5" sx={{ mb: 2, borderBottom: 1, borderColor: 'divider', pb: 1 }}>Gallery</Typography>
            {getYouTubeId() && (
              <Box sx={{ position: 'relative', width: '100%', pb: '56.25%', mb: 2, borderRadius: 2, overflow: 'hidden' }}>
                <iframe
                  title="project-video"
                  src={`https://www.youtube.com/embed/${getYouTubeId()}?rel=0`}
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </Box>
            )}
            {Array.isArray(data.photos) && data.photos.length > 0 && (
              <Grid container spacing={2}>
                {data.photos.map((p) => {
                  const src = resolveFileUrl(p, 'photos');
                  return (
                    <Grid key={p.id || p.path || (p.file || p.file_name || Math.random())} item xs={6} sm={4} md={3}>
                      {src ? (
                        <Box
                          component="img"
                          src={src}
                          alt={p.caption || 'photo'}
                          sx={{ width: '100%', height: 'auto', objectFit: 'cover', borderRadius: 1, border: '1px solid #ddd', cursor: 'pointer' }}
                          onClick={() => handleOpenModal(src)}
                        />
                      ) : (
                        <Box sx={{ width: '100%', pt: '100%', bgcolor: 'grey.100', borderRadius: 1 }} />
                      )}
                    </Grid>
                  );
                })}
              </Grid>
            )}
          </Box>

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
        aria-labelledby="image-modal-title"
        aria-describedby="image-modal-description"
        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
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
