import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
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
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState("");

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
        // Attempt to fetch local data first
        const localResp = await fetch(`/data/${builderId}/${projectId}/${projectId}-details.json`);
        const contentType = localResp.headers.get('content-type');
        if (
          localResp.ok &&
          contentType?.includes('application/json')
        ) {
          const json = await localResp.json();
          if (alive) {
            const newData = { ...json, _isLocal: true };
            setData(newData);
          }
        } else {
          // Fallback to Firebase function
          const fbResp = await fetch(`${FIREBASE_FUNCTIONS_URL}/project_details/${builderId}/${projectId}`);
          if (!fbResp.ok) {
            // Try to read the response text for debugging
            const text = await fbResp.text();
            throw new Error(`HTTP ${fbResp.status}: ${text.substring(0, 200)}`);
          }
          const json = await fbResp.json();
          if (alive) setData(json);
        }
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
    if (!data || data._isLocal) return;
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
    (data.amenities || []).forEach((a, i) => addIf(`amenity_${i}`, 'amenities', a));

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

    const rawFilename = typeof item === 'string' ? item : (item.file || item.file_name || item.filename || item.name || item.path || fallbackName);

    if (typeof rawFilename === 'string' && rawFilename.startsWith('http')) {
      return rawFilename;
    }

    // For local data, construct the path to the image
    if (data?._isLocal) {
      // Handle paths like '../media/logos/myhome_logo.png'
      if (rawFilename.startsWith('../')) {
        // This assumes it goes up one level from the project folder to the builder folder
        return `/data/${builderId}/${rawFilename.substring(3)}`;
      }
      // Handle normal paths like 'media/amenities/outdoor_gym.png'
      return `/data/${builderId}/${projectId}/${rawFilename}`;
    }

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
      `amenity_${(data?.amenities || []).findIndex((a) => (normalizeFilenameForUrl(a.file || a.path || a) === filename))}`,
    ].filter(Boolean);

    for (const k of keyCandidates) {
      if (k && signedUrls[k]) return signedUrls[k];
    }

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

  function getYouTubeId(videoUrl) {
    if (!videoUrl) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = videoUrl.match(regExp);
    if (match && match[2].length === 11) {
      return match[2];
    }
    return null;
  }

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto', p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 2 }}>
        <Button component={Link} to="/new-projects" startIcon={<ArrowBackIcon />}>Back</Button>
        {data?.files?.builder_logo && (
          <Box
            component="img"
            src={signedUrls.builder_logo || resolveFileUrl(data.files.builder_logo, 'logos', 'builder_logo')}
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
              <Box component="img" src={resolveFileUrl(data.files.project_logo, 'logos', 'project_logo')} alt="project logo" sx={{ width: 60, height: 60, objectFit: 'contain', borderRadius: 1, p: 0.5, border: '1px solid #eee' }} />
            )}
            <Typography variant="h4" component="h1" sx={{ fontWeight: 'bold' }}>
              {data.project?.project_name || data.project?.name || 'Untitled'}
            </Typography>
          </Box>

          <Typography color="text.secondary" sx={{ mb: 2, pl: '76px' /* Align with title, accounting for logo width + gap */ }}>
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
                  <Field label="Configuration" value={data.project?.configuration || data.project?.config} />
                  <Field label="Unit Sizes" value={data.project?.unit_sizes || data.project?.unitSizes} />
                  <Field label="Total Acres" value={data.project?.total_acres || data.project?.totalAcres} />
                  <Field label="Towers" value={data.project?.total_towers || data.project?.totalTowers} />
                  <Field label="Total Units" value={data.project?.total_units || data.project?.totalUnits} />
                  <Field label="Floors" value={data.project?.total_floors || data.project?.totalFloors} />
                  <Field label="Units / Floor" value={data.project?.units_perfloor || data.project?.unitsPerFloor} />
                  <Field label="Density/acre" value={data.project?.project_density} />
                  {data.project?.possession_date && <Field label="Possession" value={data.project.possession_date} />}
                  {data.project?.rera_number && <Field label="RERA" value={data.project.rera_number} />}
                </Grid>
              </Grid>
            </Grid>
          </Box>

          {/* Amenities */}
          {Array.isArray(data.amenities) && data.amenities.length > 0 && (
            <Box sx={{ mb: 4 }}>
              <Typography variant="h5" sx={{ mb: 2, borderBottom: 1, borderColor: 'divider', pb: 1 }}>Amenities</Typography>
              <Box sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
                gap: '16px',
              }}>
                {data.amenities.map((amenity) => {
                  const src = resolveFileUrl(amenity, 'amenities');
                  return (
                    <React.Fragment key={amenity.name}>
                      {src ? (
                        <Box
                          sx={{ textAlign: 'center', cursor: 'pointer' }}
                          onClick={() => handleOpenModal(src)}
                        >
                          <Box
                            component="img"
                            src={src}
                            alt={amenity.name}
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
            </Box>
          )}

          {/* Site Plan (Layouts) */}
          {Array.isArray(data.layouts) && data.layouts.length > 0 && (
            <Box sx={{ mb: 4 }}>
              <Typography variant="h5" sx={{ mb: 2, borderBottom: 1, borderColor: 'divider', pb: 1 }}>Site Plan</Typography>
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
                    <Grid item key={f.id || f.path || (f.file || Math.random())} xs={6} sm={4} md={3}>
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

          {/* Videos */}
          {Array.isArray(data.videos) && data.videos.length > 0 && (
            <Box sx={{ mb: 4 }}>
              <Typography variant="h5" sx={{ mb: 2, borderBottom: 1, borderColor: 'divider', pb: 1 }}>Videos</Typography>
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
            </Box>
          )}

          {/* Photo Gallery */}
          {Array.isArray(data.photos) && data.photos.length > 0 && (
            <Box sx={{ mb: 4 }}>
              <Typography variant="h5" sx={{ mb: 2, borderBottom: 1, borderColor: 'divider', pb: 1 }}>Photo Gallery</Typography>
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
