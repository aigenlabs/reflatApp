// Shared chip bar styles used across the app (SearchBar, ListingIntake)
// Single-line, no-scroll (used on Intake)
export const chipbarNoScroll = {
  display: 'flex',
  flexWrap: 'nowrap',
  alignItems: 'center',
  alignContent: 'center',
  gap: 6,
  padding: '0 8px 2px',
  margin: '-2px 0 0',
  overflowX: 'hidden',
};

// Scrollable chipbar (used on New Projects)
export const chipbarScrollable = {
  display: 'flex',
  flexWrap: 'nowrap',
  alignItems: 'center',
  alignContent: 'center',
  gap: 6,
  padding: '0 8px 2px',
  margin: '-2px 0 0',
  overflowX: 'auto',
  whiteSpace: 'nowrap',
  WebkitOverflowScrolling: 'touch',
};

export const chip = {
  border: '1px solid #e9ecef',
  background: '#f8f9fa',
  borderRadius: 999,
  padding: '6px 10px',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  fontSize: '.9rem',
  color: '#495057',
  whiteSpace: 'nowrap',
  lineHeight: 1.2,
  flex: '0 0 auto',
};

export const chipDisabled = { opacity: 0.6, cursor: 'not-allowed' };

export const chipPrimary = {
  background: '#e7f1ff',
  color: '#0d6efd',
  borderColor: '#d7e7ff',
  fontWeight: 600,
};

export const chipDanger = {
  color: '#d9534f',
  fontWeight: 600,
};
