/* Chaptera Studio — Book format + Python AI */
const jsPDF = window.jspdf && window.jspdf.jsPDF ? window.jspdf.jsPDF : null;
const RECENT_ACTIVITY_STORAGE_KEY = 'chaptera-demo-recent-activity';
const PROJECT_LIBRARY_STORAGE_KEY = 'chaptera-demo-projects';
const CURRENT_AUTHOR_STORAGE_KEY = 'chaptera-demo-current-author';
const CURRENT_DRAFT_STORAGE_KEY = 'chaptera-current-draft-meta';
const CURRENT_IMAGE_DRAFT_STORAGE_KEY = 'chaptera-current-image-draft';
const SERVER_OPEN_PROJECT_STORAGE_KEY = 'chaptera-open-project';
const DRAFT_DB_NAME = 'chaptera-drafts';
const DRAFT_DB_STORE = 'manuscripts';
const RECENT_ACTIVITY_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_SYNC_STORAGE_TEXT_CHARS = 120000;
const MAX_MANUSCRIPT_PAGES = 500;
const MAX_FILE_BYTES = 100 * 1024 * 1024;
const DRAFT_AUTOSAVE_DELAY_MS = 600;
const DOWNLOAD_RESUME_SESSION_KEY = 'chaptera-resume-download-on-return';

let selectedTemplate = 'novel';
let selectedRes = 600;
let targetLocale = 'en-US';
let lastSpellingIssues = [];
let lastPreviewIssues = [];
let lastAiIssues = [];
let lastAiResult = null;
let hasAiAnalysisRun = false;
let sortedSpellingIssues = [];
let spellFocusIndex = null;
let spellHoverIndex = null;
let previewPageIndex = 0;
let previewZoomIndex = 2;
let virtualPreviewPages = [];
let virtualPreviewLayout = null;
let virtualPreviewTotal = 0;
const PREVIEW_ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];
let skipLiveSpellCheck = true;
let activeManuscriptFilename = null;
let uploadRequestId = 0;
let uploadUiLocked = false;
let suppressPreviewSchedule = false;
let previewUpdateTimer = null;
let previewUpdateToken = 0;
let previewEditTimer = null;
let draftAutosaveTimer = null;
let syncingPreviewEdit = false;
let manuscriptPageLocked = false;
let undoStack = [];
let redoStack = [];
let hasUnconfirmedPreviewChanges = false;
let aiAbortController = null;
let aiCancelled = false;
let aiPaused = false;
let aiPausedSubText = '';
let aiPauseWaiters = [];
let downloadJobActive = false;
let currentWorkCompleted = false;
let downloadResumeTimer = null;
let lastFixHighlights = [];
let rejectedSpellIssues = [];
let pendingImageInsertSize = null;
let pendingImageInsertPageIndex = null;
let toolPreviewPopupActiveTool = null;
let toolPreviewImageDraft = null;
let imagePlacementActive = false;
let movingImageDraft = null;
let pointerImageMoveDraft = null;
let serverLibraryItems = [];
let currentWorkId = `work-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const LOCALE_LABELS = {
  'en-US': 'US American English',
  'en-GB': 'UK British English',
};

const LOCALE_OPTIONS = {
  'en-US': { flag: '🇺🇸', name: 'American', label: 'American English', sub: 'center, truck, elevator' },
  'en-GB': { flag: '🇬🇧', name: 'British', label: 'British English', sub: 'centre, lorry, lift' },
};

const SIZES = {
  '148x210': { w: 148, h: 210, unit: 'mm', label: '148×210 mm (A5)' },
  '152x229': { w: 152, h: 229, unit: 'mm', label: '152×229 mm' },
  '156x234': { w: 156, h: 234, unit: 'mm', label: '156×234 mm' },
  '170x244': { w: 170, h: 244, unit: 'mm', label: '170×244 mm' },
  '178x254': { w: 178, h: 254, unit: 'mm', label: '178×254 mm' },
  '210x297': { w: 210, h: 297, unit: 'mm', label: '210×297 mm (A4)' },
  '5x8': { w: 5, h: 8, unit: 'in', label: '5"×8" Novel' },
  '6x9': { w: 6, h: 9, unit: 'in', label: '6"×9" Trade' },
  '8.5x11': { w: 8.5, h: 11, unit: 'in', label: '8.5"×11"' },
  '5.5x8.5': { w: 5.5, h: 8.5, unit: 'in', label: '5.5"×8.5"' },
  '7x10': { w: 7, h: 10, unit: 'in', label: '7"×10"' },
  '8x8': { w: 8, h: 8, unit: 'in', label: '8"×8"' },
  '4x6': { w: 4, h: 6, unit: 'in', label: '4"×6"' },
};

const TEMPLATES = {
  novel: { bgColor: '#fffef8', chapterStyle: 'center', chapterDeco: true, dropCap: true, accentColor: '#edc108', borderDeco: false, sectionRule: false },
  academic: { bgColor: '#fff', chapterStyle: 'left', chapterDeco: false, dropCap: false, accentColor: '#edc108', borderDeco: false, sectionRule: true },
  children: { bgColor: '#fffef5', chapterStyle: 'center', chapterDeco: false, dropCap: false, accentColor: '#edc108', borderDeco: true, sectionRule: false },
  poetry: { bgColor: '#fffef8', chapterStyle: 'center', chapterDeco: true, dropCap: false, accentColor: '#edc108', borderDeco: false, sectionRule: false },
  business: { bgColor: '#fffef8', chapterStyle: 'left', chapterDeco: false, dropCap: false, accentColor: '#edc108', borderDeco: false, sectionRule: true },
  memoir: { bgColor: '#fafaf5', chapterStyle: 'center', chapterDeco: true, dropCap: true, accentColor: '#edc108', borderDeco: false, sectionRule: false },
};

const RES_NOTES = {
  300: '300 DPI — PDF export (print ready)',
  600: '600 DPI — High quality PDF export',
  1200: '1200 DPI — Ultra sharp PDF export',
};
const PDF_PAPER_WHITE = '#ffffff';
const DEFAULT_BODY_FONT = "'Crimson Pro', serif";
const DEFAULT_HEAD_FONT = "'Playfair Display', serif";
const loadedGoogleFonts = new Set();

function ensureGoogleFont(googleSpec) {
  if (!googleSpec || loadedGoogleFonts.has(googleSpec)) return;
  loadedGoogleFonts.add(googleSpec);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${googleSpec}&display=swap`;
  document.head.appendChild(link);
}

function ensureGoogleFontFromSelect(selectEl) {
  if (!selectEl) return;
  const opt = selectEl.options[selectEl.selectedIndex];
  if (opt?.dataset?.google) ensureGoogleFont(opt.dataset.google);
}

function populateFontSelect(selectEl, defaultValue) {
  if (!selectEl || typeof CHAPTERA_FONT_GROUPS === 'undefined') return;
  selectEl.innerHTML = '';
  CHAPTERA_FONT_GROUPS.forEach(group => {
    const og = document.createElement('optgroup');
    og.label = group.name;
    group.fonts.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.value;
      opt.textContent = f.label;
      if (f.google) opt.dataset.google = f.google;
      if (f.value === defaultValue) opt.selected = true;
      og.appendChild(opt);
    });
    selectEl.appendChild(og);
  });
  if (selectEl.selectedIndex < 0 && selectEl.options.length) selectEl.selectedIndex = 0;
}

function populateFontSelects() {
  populateFontSelect(document.getElementById('bodyFont'), DEFAULT_BODY_FONT);
  populateFontSelect(document.getElementById('headFont'), DEFAULT_HEAD_FONT);
  ensureGoogleFontFromSelect(document.getElementById('bodyFont'));
  ensureGoogleFontFromSelect(document.getElementById('headFont'));
}

function fontValueForFamilyName(fontName) {
  const needle = String(fontName || '').replace(/['"]/g, '').trim().toLowerCase();
  if (!needle || typeof CHAPTERA_FONT_GROUPS === 'undefined') return '';
  for (const group of CHAPTERA_FONT_GROUPS) {
    for (const font of group.fonts) {
      const label = String(font.label || '').toLowerCase();
      const firstFamily = String(font.value || '').split(',')[0].replace(/['"]/g, '').trim().toLowerCase();
      if (label === needle || firstFamily === needle) return font.value;
    }
  }
  return '';
}

function syncCustomSelectLabel(selectEl) {
  selectEl?.dispatchEvent(new Event('change', { bubbles: true }));
}

function applySavedSettings(settings = {}) {
  const setValue = (id, value) => {
    const el = document.getElementById(id);
    if (el && value !== undefined && value !== null) {
      el.value = String(value);
      if (id === 'bodyFont' || id === 'headFont') ensureGoogleFontFromSelect(el);
      syncCustomSelectLabel(el);
    }
  };
  setValue('bookSize', settings.sizeKey);
  setValue('bodyFont', settings.bodyFont);
  setValue('headFont', settings.headFont);
  setValue('fontSize', settings.fontSize);
  setValue('lineHeight', settings.lineHeight);
  setValue('textAlign', settings.textAlign);
  if (settings.res) selectRes(settings.res);
  if (settings.locale) selectLocale(settings.locale);
  syncLineHeightCustomUI();
  syncMarginCustomUI();
  syncColCountCustomUI();
}

function applyUploadedDocumentMetadata(metadata) {
  const meta = metadata || {};
  const fontValue = fontValueForFamilyName(meta.body_font);
  const bodyFont = document.getElementById('bodyFont');
  suppressPreviewSchedule = true;
  try {
    if (fontValue && bodyFont) {
      bodyFont.value = fontValue;
      ensureGoogleFontFromSelect(bodyFont);
      syncCustomSelectLabel(bodyFont);
    }

    const sourceSize = parseInt(meta.font_size, 10);
    const fontSize = document.getElementById('fontSize');
    if (fontSize && Number.isFinite(sourceSize)) {
      const clamped = Math.max(5, Math.min(15, sourceSize));
      fontSize.value = String(clamped);
      syncCustomSelectLabel(fontSize);
    }
  } finally {
    suppressPreviewSchedule = false;
  }
}

function populateFontSizeSelect() {
  const sel = document.getElementById('fontSize');
  if (!sel) return;
  sel.innerHTML = '';
  for (let n = 5; n <= 15; n++) {
    const opt = document.createElement('option');
    opt.value = String(n);
    opt.textContent = String(n);
    if (n === 11) opt.selected = true;
    sel.appendChild(opt);
  }
}

function showAttention(message) {
  const toast = document.getElementById('attentionToast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('active');
  clearTimeout(window._attentionTimer);
  window._attentionTimer = setTimeout(() => toast.classList.remove('active'), 4500);
}

function limitMessage(extra = '') {
  return `Maximum supported file is ${MAX_MANUSCRIPT_PAGES} pages and 100 MB.${extra ? ' ' + extra : ''}`;
}

function showLimitAlert(extra = '') {
  const msg = limitMessage(extra);
  showAttention('⚠ ' + msg);
  setStatus('', msg);
}

function storageGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_) {}
}

function storageRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch (_) {}
}

function openDraftDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const req = indexedDB.open(DRAFT_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DRAFT_DB_STORE)) db.createObjectStore(DRAFT_DB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Could not open draft storage'));
  });
}

async function draftDbPut(key, value) {
  const db = await openDraftDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DRAFT_DB_STORE, 'readwrite');
    tx.objectStore(DRAFT_DB_STORE).put(value, key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error('Could not save draft'));
    };
  });
}

async function draftDbGet(key) {
  const db = await openDraftDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DRAFT_DB_STORE, 'readonly');
    const req = tx.objectStore(DRAFT_DB_STORE).get(key);
    req.onsuccess = () => resolve(req.result || '');
    req.onerror = () => reject(req.error || new Error('Could not read draft'));
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  });
}

async function draftDbDelete(key) {
  const db = await openDraftDb();
  return new Promise((resolve) => {
    const tx = db.transaction(DRAFT_DB_STORE, 'readwrite');
    tx.objectStore(DRAFT_DB_STORE).delete(key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      resolve();
    };
  });
}

function getStoredTextKey(projectId = currentWorkId) {
  return `text:${projectId || currentWorkId}`;
}

function getStoredAiStateKey(projectId = currentWorkId) {
  return `ai:${projectId || currentWorkId}`;
}

function getCompactSnapshotText(text, projectId = currentWorkId) {
  const raw = String(text || '');
  return {
    text: raw.length <= MAX_SYNC_STORAGE_TEXT_CHARS ? raw : '',
    textStoredExternally: raw.length > MAX_SYNC_STORAGE_TEXT_CHARS,
    textKey: raw.length > MAX_SYNC_STORAGE_TEXT_CHARS ? getStoredTextKey(projectId) : '',
  };
}

async function persistManuscriptText(projectId, text) {
  const key = getStoredTextKey(projectId);
  try {
    await draftDbPut(key, String(text || ''));
    return key;
  } catch (_) {
    return '';
  }
}

async function readPersistedManuscriptText(item) {
  if (item?.text) return item.text;
  if (!item?.textKey) return '';
  try {
    return await draftDbGet(item.textKey);
  } catch (_) {
    return '';
  }
}

async function persistAiState(projectId = currentWorkId, state = {}) {
  const key = getStoredAiStateKey(projectId);
  try {
    await draftDbPut(key, JSON.stringify(state || {}));
    return key;
  } catch (_) {
    return '';
  }
}

async function readPersistedAiState(item) {
  const key = item?.aiStateKey;
  if (!key) return null;
  try {
    const raw = await draftDbGet(key);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function getCurrentAiState(result = lastAiResult) {
  return {
    result: result || null,
    aiIssues: lastAiIssues || [],
    previewIssues: lastPreviewIssues || [],
    spellingIssues: lastSpellingIssues || [],
    sortedSpellingIssues: sortedSpellingIssues || [],
    fixHighlights: lastFixHighlights || [],
    rejectedSpellIssues: rejectedSpellIssues || [],
    hasAiAnalysisRun: !!hasAiAnalysisRun,
    skipLiveSpellCheck: !!skipLiveSpellCheck,
    savedAt: new Date().toISOString(),
  };
}

async function saveCurrentAiState(result = lastAiResult, extra = {}) {
  if (!hasUploadedFile() || !hasManuscriptContent()) return;
  const aiStateKey = await persistAiState(currentWorkId, getCurrentAiState(result));
  await saveCurrentDraft({ aiStateKey, ...extra });
}

async function saveCurrentDraft(extra = {}) {
  if (currentWorkCompleted && !extra?.processing && !extra?.downloadProcessing && !extra?.aiJob && !extra?.downloadJob) return;
  const text = getManuscriptText();
  if (!text.trim()) return;
  const textKey = await persistManuscriptText(currentWorkId, text);
  const settings = getSettings();
  const storedPrevious = storageGet(CURRENT_DRAFT_STORAGE_KEY, {});
  const previous = (storedPrevious?.projectId || storedPrevious?.id) === currentWorkId ? storedPrevious : {};
  const draft = {
    ...previous,
    id: currentWorkId,
    projectId: currentWorkId,
    filename: activeManuscriptFilename || '',
    title: getBookDisplayName(settings),
    wordCount: text.trim().split(/\s+/).length,
    settings: getWorkSnapshot().settings,
    textKey,
    updatedAt: new Date().toISOString(),
    ...extra,
  };
  storageSet(CURRENT_DRAFT_STORAGE_KEY, draft);
  await saveProjectToServer({ ...getWorkSnapshot(extra), text, textStoredExternally: false, textKey });
}

function scheduleCurrentDraftSave(extra = {}) {
  if (currentWorkCompleted && !extra?.processing && !extra?.downloadProcessing && !extra?.aiJob && !extra?.downloadJob) return;
  if (!hasUploadedFile() || !hasManuscriptContent()) return;
  clearTimeout(draftAutosaveTimer);
  draftAutosaveTimer = setTimeout(() => {
    saveCurrentDraft(extra).catch(() => {});
  }, DRAFT_AUTOSAVE_DELAY_MS);
}

function saveCurrentDraftNow(extra = {}) {
  if (currentWorkCompleted && !extra?.processing && !extra?.downloadProcessing && !extra?.aiJob && !extra?.downloadJob) return;
  if (!hasUploadedFile() || !hasManuscriptContent()) return;
  clearTimeout(draftAutosaveTimer);
  draftAutosaveTimer = null;
  return saveCurrentDraft(extra).catch(() => {});
}

async function restoreCurrentDraft() {
  const draft = storageGet(CURRENT_DRAFT_STORAGE_KEY, null);
  if (!draft?.textKey) return false;
  if (draft.downloaded || draft.completedAt) {
    await clearCurrentDraft();
    return false;
  }
  const text = await readPersistedManuscriptText(draft);
  if (!text.trim()) return false;
  await restoreProjectForRework({ ...draft, text });
  restoreImageInsertDraft();
  setStatus('green', `Restored: ${draft.filename || draft.title || 'last manuscript'}`);
  if (draft.aiJob?.jobId) {
    resumeAiJobFromDraft(draft).catch(e => {
      setStatus('', `Background process could not resume: ${e.message}`);
    });
  }
  const shouldResumeDownload = (() => {
    try { return sessionStorage.getItem(DOWNLOAD_RESUME_SESSION_KEY) === '1'; } catch (_) { return false; }
  })() || !!draft.downloadProcessing;
  if ((draft.downloadJob?.jobId || draft.downloadJob?.format) && shouldResumeDownload) {
    try { sessionStorage.removeItem(DOWNLOAD_RESUME_SESSION_KEY); } catch (_) {}
    resumeDownloadFromDraft(draft).catch(e => {
      setStatus('', `Download could not resume: ${e.message}`);
    });
  }
  return true;
}

async function clearCurrentDraft() {
  clearTimeout(draftAutosaveTimer);
  draftAutosaveTimer = null;
  const draft = storageGet(CURRENT_DRAFT_STORAGE_KEY, null);
  if (draft?.textKey) {
    try {
      await draftDbDelete(draft.textKey);
    } catch (_) {}
  }
  if (draft?.aiStateKey) {
    try {
      await draftDbDelete(draft.aiStateKey);
    } catch (_) {}
  }
  storageRemove(CURRENT_DRAFT_STORAGE_KEY);
  clearImageInsertDraft();
}

function makeLibraryId(prefix = 'item') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getCurrentAuthor() {
  const author = storageGet(CURRENT_AUTHOR_STORAGE_KEY, null);
  if (author?.email || author?.name) return author;
  return { name: 'Guest Author', email: 'guest@chaptera.local', token: '' };
}

function setCurrentAuthor(author) {
  const clean = {
    name: (author?.name || 'Guest Author').trim() || 'Guest Author',
    email: (author?.email || 'guest@chaptera.local').trim() || 'guest@chaptera.local',
    token: (author?.token || '').trim(),
  };
  storageSet(CURRENT_AUTHOR_STORAGE_KEY, clean);
  const avatar = document.querySelector('#btnLogin .profile-avatar-initial');
  if (avatar) avatar.textContent = clean.name.slice(0, 1).toUpperCase();
  return clean;
}

function getFirstManuscriptLine(text) {
  return (text || '').split(/\r?\n/).map(line => line.trim()).find(Boolean) || '';
}

function getBookDisplayName(settings = getSettings()) {
  const firstLine = getFirstManuscriptLine(settings.text);
  return settings.title || firstLine || activeManuscriptFilename || 'Untitled manuscript';
}

function getAnalysisMetrics() {
  const result = lastAiResult || {};
  const accuracyText = document.getElementById('accPercent')?.textContent || '';
  const readText = document.getElementById('readScore')?.textContent || '';
  const issueText = document.getElementById('aiIssueCount')?.textContent || '';
  return {
    issueCount: Number(result.issue_count ?? issueText.replace(/\D/g, '')) || 0,
    spellingCount: Number(result.spelling_count ?? lastSpellingIssues.length) || 0,
    accuracyPercent: Number(result.accuracy?.percent ?? accuracyText.replace(/\D/g, '')) || 0,
    readabilityScore: String(result.readability?.score ?? (readText || '')),
  };
}

function getWorkSnapshot(extra = {}) {
  const settings = getSettings();
  const text = settings.text || '';
  const author = getCurrentAuthor();
  const now = new Date().toISOString();
  const compactText = getCompactSnapshotText(text, currentWorkId);
  const metrics = getAnalysisMetrics();
  return {
    id: currentWorkId,
    projectId: currentWorkId,
    title: getBookDisplayName(settings),
    authorName: author.name,
    authorEmail: author.email,
    filename: activeManuscriptFilename || '',
    wordCount: text.trim() ? text.trim().split(/\s+/).length : 0,
    ...compactText,
    settings: {
      sizeKey: settings.sizeKey,
      margin: settings.margin,
      cols: settings.cols,
      bodyFont: settings.bodyFont,
      headFont: settings.headFont,
      fontSize: settings.fontSize,
      lineHeight: settings.lineHeight,
      textAlign: settings.textAlign,
      res: settings.res,
      locale: settings.locale,
    },
    analyzed: hasAiAnalysisRun,
    fixed: lastFixHighlights.length > 0,
    downloaded: false,
    ...metrics,
    downloads: [],
    updatedAt: now,
    createdAt: now,
    ...extra,
  };
}

async function saveProjectToServer(project) {
  if (!project?.authorEmail || !project?.text?.trim()) return;
  try {
    await apiJson('/api/projects/save', { project, author_token: getCurrentAuthor().token || '' });
  } catch (_) {}
}

async function fetchServerProjects(author = getCurrentAuthor()) {
  try {
    const data = await apiJson('/api/projects/list', { author_email: author.email, author_token: author.token || '' }, { ignoreAi: true });
    return Array.isArray(data.projects) ? data.projects : [];
  } catch (_) {
    return [];
  }
}

function getRecentActivityItems() {
  const cutoff = Date.now() - RECENT_ACTIVITY_MAX_AGE_MS;
  const items = storageGet(RECENT_ACTIVITY_STORAGE_KEY, []);
  const fresh = items.filter(item => Date.parse(item.updatedAt || item.createdAt || '') >= cutoff);
  if (fresh.length !== items.length) storageSet(RECENT_ACTIVITY_STORAGE_KEY, fresh);
  return fresh;
}

async function saveRecentActivityItem(extra = {}) {
  if (!hasManuscriptContent()) return;
  const snapshot = getWorkSnapshot(extra);
  if (snapshot.textStoredExternally) {
    const textKey = await persistManuscriptText(snapshot.projectId, getManuscriptText());
    snapshot.textKey = textKey || snapshot.textKey;
  }
  const items = getRecentActivityItems();
  const idx = items.findIndex(item => item.id === snapshot.id);
  if (idx >= 0) {
    snapshot.createdAt = items[idx].createdAt || snapshot.createdAt;
    snapshot.downloads = extra.downloads || items[idx].downloads || snapshot.downloads;
    snapshot.downloaded = !!(extra.downloaded ?? items[idx].downloaded ?? snapshot.downloaded);
    items[idx] = { ...items[idx], ...snapshot };
  } else {
    items.unshift(snapshot);
  }
  storageSet(RECENT_ACTIVITY_STORAGE_KEY, items.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 12));
}

async function saveDownloadedProject(format, filename) {
  if (!hasManuscriptContent()) return;
  currentWorkCompleted = true;
  const formatLabel = String(format || '').toUpperCase();
  const current = getWorkSnapshot({ downloaded: true });
  if (current.textStoredExternally) {
    const textKey = await persistManuscriptText(current.projectId, getManuscriptText());
    current.textKey = textKey || current.textKey;
  }
  const projects = storageGet(PROJECT_LIBRARY_STORAGE_KEY, []);
  const idx = projects.findIndex(item => item.projectId === current.projectId);
  const existing = idx >= 0 ? projects[idx] : null;
  const downloads = [...(existing?.downloads || [])];
  downloads.unshift({ format, label: formatLabel, filename, downloadedAt: new Date().toISOString() });
  const project = {
    ...existing,
    ...current,
    downloaded: true,
    completedAt: new Date().toISOString(),
    downloads,
    createdAt: existing?.createdAt || current.createdAt,
  };
  if (idx >= 0) projects[idx] = project;
  else projects.unshift(project);
  storageSet(PROJECT_LIBRARY_STORAGE_KEY, projects.sort((a, b) => Date.parse(b.completedAt || b.updatedAt) - Date.parse(a.completedAt || a.updatedAt)).slice(0, 20));
  await saveProjectToServer({ ...project, text: getManuscriptText(), textStoredExternally: false });
  await saveRecentActivityItem({ downloaded: true, downloads });
  await clearCurrentDraft();
}

function formatShortDate(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return 'Just now';
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function renderLibraryItems(items, mode) {
  if (!items.length) {
    return `<div class="library-empty">${mode === 'recent' ? 'No activity from the last 3 days. Upload, analyze, auto-fix, or download a manuscript to see it here.' : 'No saved projects yet. Select an author account, then upload or download a manuscript to save it here.'}</div>`;
  }
  return items.map(item => {
    const missing = [];
    if (!item.analyzed) missing.push('Not analyzed');
    if (!item.fixed) missing.push('Not auto-fixed');
    if (!item.downloaded) missing.push('Not downloaded');
    const badges = missing.length
      ? missing.map(label => `<span class="library-badge library-badge--warn">${escapeHtml(label)}</span>`).join('')
      : `<span class="library-badge library-badge--ok">Completed</span>`;
    const downloads = (item.downloads || []).slice(0, 2).map(d => escapeHtml(d.label || d.format || '')).filter(Boolean).join(', ');
    const downloadMeta = downloads ? ` · Downloads: ${downloads}` : '';
    return `
      <div class="library-item">
        <div class="library-item-main">
          <div class="library-item-title">${escapeHtml(item.title || 'Untitled manuscript')}</div>
          <div class="library-item-meta">${escapeHtml(item.authorName || 'Guest Author')} · ${item.wordCount || 0} words · ${formatShortDate(item.updatedAt || item.completedAt)}${downloadMeta}</div>
          <div class="library-badges">${badges}</div>
        </div>
        <div class="library-actions">
          <button type="button" class="library-action-btn" data-library-open="${escapeHtml(item.projectId || item.id)}">Rework</button>
          ${item.downloaded ? `<button type="button" class="library-action-btn library-action-btn--icon" data-library-redownload="${escapeHtml(item.projectId || item.id)}" aria-label="Download">${downloadIconSvg()}</button>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function downloadIconSvg() {
  return `<span class="download-file-icon download-file-icon--library" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.8v11.4"/><path d="M7.2 10.8 12 15.6l4.8-4.8"/><path d="M5 15.7v2.4c0 1.2 1 2.1 2.1 2.1h9.8c1.2 0 2.1-1 2.1-2.1v-2.4"/></svg></span>`;
}

async function showLibraryModal(mode) {
  const modal = document.getElementById('libraryModal');
  const title = document.getElementById('libraryModalTitle');
  const sub = document.getElementById('libraryModalSub');
  const body = document.getElementById('libraryModalBody');
  if (!modal || !title || !sub || !body) return;
  const author = getCurrentAuthor();
  const items = mode === 'recent'
    ? getRecentActivityItems().filter(item => item.authorEmail === author.email)
    : await fetchServerProjects(author);
  if (mode !== 'recent') serverLibraryItems = items;
  title.textContent = mode === 'recent' ? 'Recent Activity' : 'My Projects';
  sub.textContent = mode === 'recent'
    ? 'Activity from the last 3 days, including incomplete, analyzed, fixed, and downloaded manuscripts.'
    : 'Projects saved under the current author account.';
  body.dataset.libraryMode = mode;
  body.innerHTML = renderLibraryItems(items, mode);
  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
  closeAllToolFlyouts();
}

async function restoreServerOpenProject() {
  const item = storageGet(SERVER_OPEN_PROJECT_STORAGE_KEY, null);
  if (!item?.projectId && !item?.id) return false;
  storageRemove(SERVER_OPEN_PROJECT_STORAGE_KEY);
  await restoreProjectForRework(item);
  await saveCurrentDraft({ restoredFromServer: true });
  return true;
}

function hideLibraryModal() {
  const modal = document.getElementById('libraryModal');
  if (!modal) return;
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
}

function closeEmbeddedSection() {
  document.getElementById('embeddedSectionModal')?.remove();
}

function openEmbeddedSection(url, label) {
  closeEmbeddedSection();
  let frameUrl = url;
  try {
    const parsed = new URL(url, window.location.origin);
    parsed.searchParams.set('embedded', '1');
    frameUrl = parsed.pathname + parsed.search + parsed.hash;
  } catch (_) {}
  const modal = document.createElement('div');
  modal.id = 'embeddedSectionModal';
  modal.className = 'embedded-section-modal';
  modal.innerHTML = `
    <div class="embedded-section-card">
      <div class="embedded-section-head">
        <strong>${escapeHtml(label || 'Section')}</strong>
        <button type="button" class="embedded-section-close" aria-label="Close section">×</button>
      </div>
      <iframe class="embedded-section-frame" src="${escapeHtml(frameUrl)}" title="${escapeHtml(label || 'Section')}"></iframe>
    </div>`;
  modal.querySelector('.embedded-section-close')?.addEventListener('click', closeEmbeddedSection);
  const frame = modal.querySelector('.embedded-section-frame');
  frame?.addEventListener('load', () => {
    try {
      const doc = frame.contentDocument;
      if (!doc || doc.getElementById('chapteraEmbeddedStyle')) return;
      const style = doc.createElement('style');
      style.id = 'chapteraEmbeddedStyle';
      style.textContent = `
        header, aside { display: none !important; }
        body { min-height: 100vh !important; overflow: auto !important; background: #fffef8 !important; }
        main { margin: 0 auto !important; padding: 24px !important; max-width: 1120px !important; }
        .md\\:pl-32 { padding-left: 24px !important; }
      `;
      doc.head.appendChild(style);
    } catch (_) {}
  });
  modal.addEventListener('click', e => {
    if (e.target === modal) closeEmbeddedSection();
  });
  document.body.appendChild(modal);
  showAttention(`${label} opened here. Download/rendering continues in the background.`);
}

function findLibraryItem(id) {
  return [...serverLibraryItems, ...getRecentActivityItems(), ...storageGet(PROJECT_LIBRARY_STORAGE_KEY, [])]
    .find(item => (item.projectId || item.id) === id);
}

async function restoreDraftAiState(item) {
  const state = await readPersistedAiState(item);
  if (!state) return false;
  lastAiResult = state.result || null;
  lastAiIssues = state.aiIssues || lastAiResult?.issues || [];
  lastPreviewIssues = state.previewIssues || [];
  lastSpellingIssues = state.spellingIssues || [];
  sortedSpellingIssues = state.sortedSpellingIssues || sortSpellingIssuesAsc(lastSpellingIssues);
  lastFixHighlights = state.fixHighlights || [];
  rejectedSpellIssues = state.rejectedSpellIssues || [];
  hasAiAnalysisRun = !!state.hasAiAnalysisRun || !!lastAiResult;
  skipLiveSpellCheck = !!state.skipLiveSpellCheck;
  if (lastAiResult) {
    renderAiPanel(lastAiResult);
  } else if (lastSpellingIssues.length || lastPreviewIssues.length) {
    renderSpellingIssuesList(lastSpellingIssues, { keepPreviewIssues: true });
  }
  return hasAiAnalysisRun || lastFixHighlights.length || lastPreviewIssues.length || lastSpellingIssues.length;
}

async function restoreProjectForRework(item) {
  if (!item) return;
  currentWorkCompleted = false;
  skipLiveSpellCheck = true;
  currentWorkId = item.projectId || item.id || makeLibraryId('work');
  const restoredText = await readPersistedManuscriptText(item);
  const sample = document.getElementById('sampleText');
  if (sample) sample.value = restoredText || '';
  if (item.settings) {
    applySavedSettings(item.settings);
  }
  activeManuscriptFilename = item.filename || `${item.title || 'project'}.txt`;
  setUploadUIState(true, activeManuscriptFilename);
  lastFixHighlights = [];
  lastSpellingIssues = [];
  lastPreviewIssues = [];
  lastAiIssues = [];
  lastAiResult = null;
  hasAiAnalysisRun = false;
  sortedSpellingIssues = [];
  rejectedSpellIssues = [];
  hideLibraryModal();
  const restoredAi = await restoreDraftAiState(item);
  if (!restoredAi) renderSpellingIssuesList([], { uploadedPending: true });
  scheduleUpdatePreview({ restored: true });
  setStatus('green', `Loaded for rework: ${item.title || 'project'}`);
}

async function redownloadLibraryItem(item) {
  if (!item) return;
  await restoreProjectForRework(item);
  const last = item.downloads?.[0]?.format || 'pdf';
  if (last === 'word') await downloadWord();
  else if (last === 'txt') await downloadTXT();
  else await downloadPDF();
}

function hasManuscriptContent() {
  return document.getElementById('sampleText').value.trim().length > 0;
}

function requireManuscriptUploaded() {
  if (hasManuscriptContent()) return true;
  showAttention('⚠ No input file detected. Please upload a manuscript (TXT, DOCX, or PDF) first.');
  setStatus('', 'Upload a file first');
  return false;
}

function requireManuscriptForDownload() {
  if (hasManuscriptContent()) return true;
  showAttention('⚠ No input file detected. Please upload a manuscript (TXT, DOCX, or PDF) first.');
  setStatus('', 'Upload a file before downloading');
  return false;
}

function mmToPx(mm) { return Math.round(mm / 25.4 * 96); }

function escapeHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function getSize() {
  const key = document.getElementById('bookSize').value;
  return SIZES[key] || SIZES['6x9'];
}

function getLineHeight() {
  const sel = document.getElementById('lineHeight');
  if (!sel) return 1.25;
  if (sel.value === 'custom') {
    const n = parseFloat(document.getElementById('lineHeightCustom')?.value);
    if (Number.isFinite(n) && n >= 0.5 && n <= 4) return n;
    return 1.6;
  }
  const preset = parseFloat(sel.value);
  return Number.isFinite(preset) ? preset : 1.25;
}

function syncLineHeightCustomUI() {
  const sel = document.getElementById('lineHeight');
  const wrap = document.getElementById('lineHeightCustomWrap');
  if (!sel || !wrap) return;
  const show = sel.value === 'custom';
  wrap.hidden = !show;
  wrap.setAttribute('aria-hidden', show ? 'false' : 'true');
}

function initLineSpacing() {
  const sel = document.getElementById('lineHeight');
  const custom = document.getElementById('lineHeightCustom');
  if (!sel) return;
  syncLineHeightCustomUI();
  sel.addEventListener('change', syncLineHeightCustomUI);
  if (custom) {
    custom.addEventListener('input', () => {
      if (sel.value === 'custom') scheduleUpdatePreview();
    });
  }
}

function getMargin() {
  const sel = document.getElementById('marginSize');
  if (!sel) return 20;
  if (sel.value === 'custom') {
    const n = parseFloat(document.getElementById('marginSizeCustom')?.value);
    if (Number.isFinite(n) && n >= 5 && n <= 50) return n;
    return 20;
  }
  const preset = parseFloat(sel.value);
  return Number.isFinite(preset) ? preset : 20;
}

function getColCount() {
  const sel = document.getElementById('colCount');
  if (!sel) return 1;
  if (sel.value === 'custom') {
    const n = parseInt(document.getElementById('colCountCustom')?.value, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 6) return n;
    return 2;
  }
  const preset = parseInt(sel.value, 10);
  return Number.isFinite(preset) ? preset : 1;
}

function syncMarginCustomUI() {
  const sel = document.getElementById('marginSize');
  const wrap = document.getElementById('marginSizeCustomWrap');
  if (!sel || !wrap) return;
  wrap.hidden = sel.value !== 'custom';
}

function syncColCountCustomUI() {
  const sel = document.getElementById('colCount');
  const wrap = document.getElementById('colCountCustomWrap');
  if (!sel || !wrap) return;
  wrap.hidden = sel.value !== 'custom';
}

function initMarginAndColumns() {
  const marginSel = document.getElementById('marginSize');
  const colSel = document.getElementById('colCount');
  syncMarginCustomUI();
  syncColCountCustomUI();
  marginSel?.addEventListener('change', syncMarginCustomUI);
  colSel?.addEventListener('change', syncColCountCustomUI);
  document.getElementById('marginSizeCustom')?.addEventListener('input', () => {
    if (marginSel?.value === 'custom') scheduleUpdatePreview();
  });
  document.getElementById('colCountCustom')?.addEventListener('input', () => {
    if (colSel?.value === 'custom') scheduleUpdatePreview();
  });
}

function getSettings() {
  const size = getSize();
  return {
    template: TEMPLATES[selectedTemplate],
    size, sizeKey: document.getElementById('bookSize').value,
    margin: getMargin(),
    marginIsCustom: document.getElementById('marginSize')?.value === 'custom',
    cols: getColCount(),
    bodyFont: document.getElementById('bodyFont').value,
    headFont: document.getElementById('headFont').value,
    fontSize: parseInt(document.getElementById('fontSize').value, 10),
    lineHeight: getLineHeight(),
    textAlign: document.getElementById('textAlign').value,
    title: '',
    author: '',
    chapter: '',
    text: document.getElementById('sampleText').value,
    res: selectedRes, locale: targetLocale,
  };
}

function resetDropdownFloat(wrap) {
  wrap.querySelectorAll('.custom-select-panel, .custom-select-menu').forEach(el => {
    el.classList.remove('is-fixed');
    el.style.cssText = '';
  });
}

function positionOpenDropdown(wrap) {
  const trigger = wrap.querySelector('.custom-select-trigger');
  const panel = wrap.querySelector('.custom-select-panel');
  const menu = wrap.querySelector('.custom-select-menu');
  const el = panel || menu;
  if (!trigger || !el) return;

  const r = trigger.getBoundingClientRect();
  const tall = el.classList.contains('custom-select-menu--tall') || wrap.classList.contains('custom-select--tall');
  const maxH = Math.min(tall ? 320 : 280, window.innerHeight * 0.55);
  const spaceBelow = window.innerHeight - r.bottom - 12;
  const spaceAbove = r.top - 12;
  // Short dropdowns (text align, margins, etc.) always open downward.
  const openUp = tall && spaceBelow < 180 && spaceAbove > spaceBelow + 40;

  el.classList.add('is-fixed');
  el.style.position = 'fixed';
  el.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - r.width - 8))}px`;
  el.style.width = `${r.width}px`;
  el.style.zIndex = '10000';
  el.style.maxHeight = `${Math.min(maxH, openUp ? spaceAbove : spaceBelow)}px`;
  el.style.overflowX = 'hidden';
  el.style.webkitOverflowScrolling = 'touch';
  el.style.top = openUp
    ? `${Math.max(8, r.top - Math.min(maxH, spaceAbove) - 4)}px`
    : `${r.bottom + 4}px`;

  if (panel && menu) {
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';
    panel.style.overflowY = 'hidden';
    menu.style.flex = '1';
    menu.style.minHeight = '0';
    menu.style.maxHeight = 'none';
    menu.style.overflowY = 'auto';
  } else {
    el.style.overflowY = 'auto';
  }
}

function cleanupOrphanDropdownPanels() {
  document.querySelectorAll('.custom-select--searchable').forEach(wrap => {
    if (!wrap.querySelector('.custom-select-panel')) {
      const orphan = document.querySelector('body > .custom-select-panel');
      if (orphan) {
        orphan.classList.remove('is-fixed');
        orphan.style.cssText = '';
        wrap.appendChild(orphan);
      }
    }
  });
  document.querySelectorAll('.custom-select:not(.custom-select--searchable)').forEach(wrap => {
    if (!wrap.querySelector('.custom-select-menu')) {
      const orphan = document.querySelector('body > .custom-select-menu');
      if (orphan) {
        orphan.classList.remove('is-fixed');
        orphan.style.cssText = '';
        wrap.appendChild(orphan);
      }
    }
  });
  document.querySelectorAll('body > .custom-select-panel, body > .custom-select-menu').forEach(el => {
    el.classList.remove('is-fixed');
    el.style.cssText = '';
    const fallback = document.querySelector('.custom-select');
    if (fallback) fallback.appendChild(el);
  });
}

function getSettingsScrollEl() {
  return document.querySelector('.tool-rail-item.is-open .tool-flyout')
    || document.querySelector('.settings-panel');
}

function preserveSettingsScrollTop() {
  const panel = getSettingsScrollEl();
  return panel ? panel.scrollTop : 0;
}

function restoreSettingsScrollTop(top) {
  const panel = getSettingsScrollEl();
  if (!panel) return;
  panel.scrollTop = top;
  requestAnimationFrame(() => { panel.scrollTop = top; });
}

function closeAllCustomDropdowns() {
  document.querySelectorAll('.custom-select.open').forEach(dd => {
    dd.classList.remove('open');
    resetDropdownFloat(dd);
    const trigger = dd.querySelector('.custom-select-trigger');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
    if (dd.classList.contains('custom-select--searchable')) {
      const search = dd.querySelector('.font-search-input');
      const menu = dd.querySelector('.custom-select-menu');
      if (search) search.value = '';
      if (menu) filterFontMenu(menu, '');
    }
  });
  document.querySelectorAll('.custom-select:not(.open) .custom-select-panel, .custom-select:not(.open) .custom-select-menu').forEach(el => {
    el.classList.remove('is-fixed');
    el.style.cssText = '';
  });
}

function isInsideOpenDropdown(el) {
  if (!el || !el.closest) return false;
  return !!el.closest('.custom-select.open');
}

function handleOutsideDropdownClick(e) {
  if (isInsideOpenDropdown(e.target)) return;
  closeAllCustomDropdowns();
}

function handleSettingsPanelScroll(e) {
  const t = e.target;
  if (t.closest && t.closest('.custom-select-panel, .custom-select-menu')) return;
  closeAllCustomDropdowns();
}

function openCustomDropdown(wrap) {
  closeAllCustomDropdowns();
  const flyoutItem = wrap.closest('.tool-rail-item');
  if (flyoutItem && !flyoutItem.classList.contains('is-open')) {
    openToolFlyout(flyoutItem);
  }
  wrap.classList.add('open');
  const trigger = wrap.querySelector('.custom-select-trigger');
  if (trigger) trigger.setAttribute('aria-expanded', 'true');
  positionOpenDropdown(wrap);
  const menu = wrap.querySelector('.custom-select-menu');
  if (menu) animateDropdownOptions(menu);
  const search = wrap.querySelector('.font-search-input');
  if (search) setTimeout(() => search.focus(), 60);
}

function filterFontMenu(menu, query) {
  const q = query.trim().toLowerCase();
  let visibleCount = 0;
  menu.querySelectorAll('.custom-select-option').forEach(li => {
    const label = (li.textContent || '').toLowerCase();
    const value = (li.getAttribute('data-value') || '').toLowerCase();
    const match = !q || label.includes(q) || value.includes(q);
    li.classList.toggle('hidden-by-search', !match);
    if (match) visibleCount++;
  });
  menu.querySelectorAll('.custom-select-group').forEach(group => {
    let sibling = group.nextElementSibling;
    let anyVisible = false;
    while (sibling && !sibling.classList.contains('custom-select-group')) {
      if (sibling.classList.contains('custom-select-option') && !sibling.classList.contains('hidden-by-search')) {
        anyVisible = true;
        break;
      }
      sibling = sibling.nextElementSibling;
    }
    group.classList.toggle('hidden-by-search', !anyVisible);
  });
  const empty = menu.querySelector('.font-search-empty');
  if (empty) {
    const showEmpty = q.length > 0 && visibleCount === 0;
    empty.classList.toggle('visible', showEmpty);
    empty.setAttribute('aria-hidden', showEmpty ? 'false' : 'true');
  }
}

function animateDropdownOptions(menu) {
  menu.querySelectorAll('.custom-select-option').forEach((el, i) => {
    el.style.animationDelay = `${Math.min(i * 0.04, 0.28)}s`;
  });
}

function updateLocaleHeaderUI(loc) {
  const meta = LOCALE_OPTIONS[loc];
  if (!meta) return;
  const flagEl = document.getElementById('headerLocaleFlag');
  const labelEl = document.getElementById('headerLocaleLabel');
  if (flagEl) flagEl.textContent = meta.flag;
  if (labelEl) labelEl.textContent = meta.label;
  document.querySelectorAll('.header-locale-option').forEach(opt => {
    const on = opt.dataset.locale === loc;
    opt.classList.toggle('selected', on);
  });
  syncProofreadLocaleUI(loc);
}

function syncProofreadLocaleUI(loc) {
  document.querySelectorAll('[data-proof-locale]').forEach(btn => {
    const on = btn.dataset.proofLocale === loc;
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

function selectLocale(loc) {
  targetLocale = loc;
  updateLocaleHeaderUI(loc);
  if (hasManuscriptContent() && hasAiAnalysisRun && !skipLiveSpellCheck) refreshSpellingPreview();
}

function initHeaderMenus() {
  document.querySelectorAll('.header-dropdown').forEach(dropdown => {
    const trigger = dropdown.querySelector('.header-action-btn');
    trigger?.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      const willOpen = !dropdown.classList.contains('is-open');
      document.querySelectorAll('.header-dropdown.is-open').forEach(open => {
        if (open !== dropdown) open.classList.remove('is-open');
      });
      dropdown.classList.toggle('is-open', willOpen);
    });
    dropdown.addEventListener('click', e => e.stopPropagation());
  });
  document.addEventListener('click', () => {
    document.querySelectorAll('.header-dropdown.is-open').forEach(open => open.classList.remove('is-open'));
  });

  document.querySelectorAll('.header-locale-option').forEach(opt => {
    opt.addEventListener('click', e => {
      e.stopPropagation();
      selectLocale(opt.dataset.locale);
      opt.closest('.header-dropdown')?.classList.remove('is-open');
    });
  });

  document.querySelectorAll('.header-dl-option').forEach(opt => {
    opt.addEventListener('click', e => {
      e.stopPropagation();
      opt.closest('.header-dropdown')?.classList.remove('is-open');
      if (!requireManuscriptForDownload()) return;
      const fmt = opt.dataset.format;
      if (fmt === 'pdf') downloadPDF();
      else if (fmt === 'txt') downloadTXT();
      else if (fmt === 'word') downloadWord();
    });
  });
}

function enhanceSelectToCustomDropdown(nativeSelect) {
  if (nativeSelect.dataset.customSelect === '1') return;
  nativeSelect.dataset.customSelect = '1';
  nativeSelect.classList.add('ui-select-native');

  const wrap = document.createElement('div');
  wrap.className = 'custom-select';
  if (nativeSelect.id === 'bookSize') wrap.classList.add('custom-select--tall');

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'custom-select-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  if (nativeSelect.id) trigger.setAttribute('aria-labelledby', nativeSelect.id + '-label');

  const valueSpan = document.createElement('span');
  valueSpan.className = 'custom-select-value';

  const chevron = document.createElement('span');
  chevron.className = 'custom-select-chevron';
  chevron.setAttribute('aria-hidden', 'true');

  trigger.appendChild(valueSpan);
  trigger.appendChild(chevron);

  const menu = document.createElement('ul');
  menu.className = 'custom-select-menu';
  menu.setAttribute('role', 'listbox');
  if (nativeSelect.id === 'bookSize') menu.classList.add('custom-select-menu--tall');

  function syncTriggerLabel() {
    const opt = nativeSelect.options[nativeSelect.selectedIndex];
    valueSpan.textContent = opt ? opt.textContent.trim() : '';
  }

  function syncOptionStates() {
    menu.querySelectorAll('.custom-select-option').forEach(li => {
      const on = li.getAttribute('data-value') === nativeSelect.value;
      li.classList.toggle('selected', on);
      li.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  function buildMenu() {
    menu.innerHTML = '';
    Array.from(nativeSelect.children).forEach(child => {
      if (child.tagName === 'OPTGROUP') {
        const group = document.createElement('li');
        group.className = 'custom-select-group';
        group.textContent = child.label;
        menu.appendChild(group);
        Array.from(child.children).forEach(opt => appendOption(opt));
      } else if (child.tagName === 'OPTION') {
        appendOption(child);
      }
    });
  }

  function appendOption(opt) {
    const li = document.createElement('li');
    li.className = 'custom-select-option';
    li.setAttribute('data-value', opt.value);
    li.textContent = opt.textContent.trim();
    li.setAttribute('role', 'option');
    li.addEventListener('click', e => {
      e.stopPropagation();
      nativeSelect.value = opt.value;
      syncTriggerLabel();
      syncOptionStates();
      closeAllCustomDropdowns();
      nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      nativeSelect.dispatchEvent(new Event('input', { bubbles: true }));
    });
    menu.appendChild(li);
  }

  const parent = nativeSelect.parentNode;
  parent.insertBefore(wrap, nativeSelect);
  wrap.appendChild(nativeSelect);
  wrap.appendChild(trigger);
  wrap.appendChild(menu);

  buildMenu();
  syncTriggerLabel();
  syncOptionStates();

  trigger.addEventListener('mousedown', e => e.preventDefault());
  trigger.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    if (wrap.classList.contains('open')) closeAllCustomDropdowns();
    else openCustomDropdown(wrap);
  });

  wrap.addEventListener('click', e => e.stopPropagation());
  menu.addEventListener('mousedown', e => e.stopPropagation());
  menu.addEventListener('wheel', e => e.stopPropagation(), { passive: true });

  nativeSelect.addEventListener('change', () => {
    syncTriggerLabel();
    syncOptionStates();
  });
}

function enhanceFontSelectToSearchableDropdown(nativeSelect) {
  if (nativeSelect.dataset.customSelect === '1') return;
  nativeSelect.dataset.customSelect = '1';
  nativeSelect.classList.add('ui-select-native');

  const wrap = document.createElement('div');
  wrap.className = 'custom-select custom-select--searchable';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'custom-select-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');

  const valueSpan = document.createElement('span');
  valueSpan.className = 'custom-select-value';
  const chevron = document.createElement('span');
  chevron.className = 'custom-select-chevron';
  chevron.setAttribute('aria-hidden', 'true');
  trigger.appendChild(valueSpan);
  trigger.appendChild(chevron);

  const panel = document.createElement('div');
  panel.className = 'custom-select-panel';

  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'font-search-input';
  search.placeholder = 'Search fonts…';
  search.setAttribute('autocomplete', 'off');
  search.setAttribute('aria-label', 'Search fonts');

  const menu = document.createElement('ul');
  menu.className = 'custom-select-menu';
  menu.setAttribute('role', 'listbox');

  panel.appendChild(search);
  panel.appendChild(menu);

  function syncTriggerLabel() {
    const opt = nativeSelect.options[nativeSelect.selectedIndex];
    valueSpan.textContent = opt ? opt.textContent.trim() : '';
  }

  function syncOptionStates() {
    menu.querySelectorAll('.custom-select-option').forEach(li => {
      const on = li.dataset.value === nativeSelect.value;
      li.classList.toggle('selected', on);
      li.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  function pickOption(opt) {
    nativeSelect.value = opt.value;
    syncTriggerLabel();
    syncOptionStates();
    if (opt.dataset.google) ensureGoogleFont(opt.dataset.google);
    closeAllCustomDropdowns();
    nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    nativeSelect.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function appendOption(opt) {
    const li = document.createElement('li');
    li.className = 'custom-select-option';
    li.setAttribute('data-value', opt.value);
    li.textContent = opt.textContent.trim();
    li.setAttribute('role', 'option');
    if (opt.dataset.google) li.setAttribute('data-google', opt.dataset.google);
    li.addEventListener('click', e => {
      e.stopPropagation();
      pickOption(opt);
    });
    menu.appendChild(li);
  }

  function buildMenu() {
    menu.innerHTML = '';
    Array.from(nativeSelect.children).forEach(child => {
      if (child.tagName === 'OPTGROUP') {
        const group = document.createElement('li');
        group.className = 'custom-select-group';
        group.textContent = child.label;
        menu.appendChild(group);
        Array.from(child.children).forEach(opt => appendOption(opt));
      } else if (child.tagName === 'OPTION') {
        appendOption(child);
      }
    });
    const empty = document.createElement('li');
    empty.className = 'font-search-empty';
    empty.textContent = 'No fonts found';
    empty.setAttribute('aria-hidden', 'true');
    menu.appendChild(empty);
  }

  const parent = nativeSelect.parentNode;
  parent.insertBefore(wrap, nativeSelect);
  wrap.appendChild(nativeSelect);
  wrap.appendChild(trigger);
  wrap.appendChild(panel);

  buildMenu();
  syncTriggerLabel();
  syncOptionStates();

  trigger.addEventListener('mousedown', e => e.preventDefault());
  trigger.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    if (wrap.classList.contains('open')) closeAllCustomDropdowns();
    else openCustomDropdown(wrap);
  });

  search.addEventListener('input', () => filterFontMenu(menu, search.value));
  search.addEventListener('mousedown', e => e.stopPropagation());
  search.addEventListener('click', e => e.stopPropagation());
  search.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeAllCustomDropdowns();
    e.stopPropagation();
  });

  panel.addEventListener('mousedown', e => e.stopPropagation());
  panel.addEventListener('click', e => e.stopPropagation());
  menu.addEventListener('mousedown', e => e.stopPropagation());
  menu.addEventListener('wheel', e => e.stopPropagation(), { passive: true });

  wrap.addEventListener('click', e => e.stopPropagation());

  nativeSelect.addEventListener('change', () => {
    syncTriggerLabel();
    syncOptionStates();
  });
}

function initCustomSelects() {
  document.querySelectorAll('select.ui-select').forEach(sel => {
    if (sel.id === 'bodyFont' || sel.id === 'headFont') {
      enhanceFontSelectToSearchableDropdown(sel);
    } else {
      enhanceSelectToCustomDropdown(sel);
    }
  });
  document.addEventListener('click', handleOutsideDropdownClick);
  window.addEventListener('resize', () => {
    closeAllCustomDropdowns();
    closeAllToolFlyouts();
  });
  document.querySelectorAll('.tool-flyout').forEach(el => {
    el.addEventListener('scroll', handleSettingsPanelScroll, true);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeAllCustomDropdowns();
  });
}

function selectRes(val) {
  selectedRes = val;
  document.querySelectorAll('.res-pill').forEach(p => p.classList.remove('selected'));
  const pill = document.getElementById('res-' + val);
  if (pill) pill.classList.add('selected');
  const note = document.getElementById('resNote');
  if (note) note.textContent = RES_NOTES[val];
}

function setStatus(type, msg) {
  document.getElementById('statusText').textContent = msg;
  document.getElementById('statusDot').className = 'status-dot' + (type === 'green' ? ' green' : '');
}

const THEME_STORAGE_KEY = 'chaptera-theme';

function getStoredTheme() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function applyTheme(theme) {
  const isDark = theme === 'dark';
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  try {
    localStorage.setItem(THEME_STORAGE_KEY, isDark ? 'dark' : 'light');
  } catch {}
  const btn = document.getElementById('themeToggleBtn');
  if (btn) {
    btn.classList.toggle('is-dark', isDark);
    btn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
    btn.setAttribute('aria-label', isDark ? 'Dark mode on' : 'Dark mode off');
    btn.title = isDark ? 'Dark mode on' : 'Dark mode off';
  }
}

function initThemeToggle() {
  applyTheme(getStoredTheme());
  document.getElementById('themeToggleBtn')?.addEventListener('click', () => {
    applyTheme(getStoredTheme() === 'dark' ? 'light' : 'dark');
  });
}

function positionToolFlyout(item) {
  const btn = item.querySelector('.tool-rail-btn');
  const flyout = item.querySelector('.tool-flyout');
  if (!btn || !flyout) return;
  let r = btn.getBoundingClientRect();
  if (!r.width && !r.height) {
    r = document.getElementById('btnToolOptions')?.getBoundingClientRect() || r;
  }
  const maxH = Math.min(580, window.innerHeight - 76);
  flyout.style.maxHeight = `${maxH}px`;
  const flyoutH = Math.min(flyout.scrollHeight, maxH);
  let top = r.top;
  if (top + flyoutH > window.innerHeight - 12) {
    top = Math.max(64, window.innerHeight - flyoutH - 12);
  }
  flyout.style.top = `${top}px`;
  flyout.style.left = `${Math.max(88, r.right - 2)}px`;
}

function closeAllToolFlyouts(exceptItem = null) {
  document.querySelectorAll('.tool-rail-item.is-open').forEach(item => {
    if (exceptItem && item === exceptItem) return;
    item.classList.remove('is-open');
    item.querySelector('.tool-rail-btn')?.setAttribute('aria-expanded', 'false');
    item.querySelectorAll('.custom-select.open').forEach(wrap => {
      wrap.classList.remove('open');
      const trigger = wrap.querySelector('.custom-select-trigger');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
      resetDropdownFloat(wrap);
    });
  });
  if (!exceptItem && !toolPreviewImageDraft) hideToolPreviewPopup();
}

function openToolFlyout(item) {
  closeAllToolFlyouts(item);
  positionToolFlyout(item);
  item.classList.add('is-open');
  item.querySelector('.tool-rail-btn')?.setAttribute('aria-expanded', 'true');
  const tool = item.dataset.tool;
  toolPreviewPopupActiveTool = tool === 'image' ? tool : null;
  if (!toolPreviewImageDraft) hideToolPreviewPopup();
}

function getPageLayoutPx(s) {
  const settings = s || getSettings();
  const size = settings.size || getSize();
  const inchMargin = { 15: 0.75, 20: 1, 25: 1.25 };
  let pw;
  let ph;
  let mg;
  if (size.unit === 'mm') {
    pw = mmToPx(size.w);
    ph = mmToPx(size.h);
    mg = mmToPx(settings.margin);
  } else {
    pw = Math.round(size.w * 96);
    ph = Math.round(size.h * 96);
    if (settings.marginIsCustom) mg = mmToPx(settings.margin);
    else mg = Math.round((inchMargin[settings.margin] || 1) * 96);
  }
  return { pw, ph, mg, contentWidth: Math.max(80, pw - 2 * mg) };
}

function getToolPreviewMiniScale(pw) {
  return Math.min(0.28, 380 / Math.max(pw, 200));
}

function renderToolPreviewPopupPage(options = {}) {
  const host = document.getElementById('toolPreviewPopupPage');
  const titleEl = document.getElementById('toolPreviewPopupTitle');
  if (!host) return;

  const s = getSettings();
  const { pw, ph, mg, contentWidth } = getPageLayoutPx(s);
  const miniScale = getToolPreviewMiniScale(pw);
  const miniW = Math.round(pw * miniScale);
  const miniH = Math.round(ph * miniScale);

  if (options.imageSize) {
    const size = options.imageSize;
    const ratio = MANUSCRIPT_IMAGE_SIZE[size] || 1;
    const imgW = Math.round(contentWidth * ratio * miniScale);
    const src = sanitizeImageDataUrl(options.imageSrc || '');
    const label = MANUSCRIPT_IMAGE_LABELS[size] || size;
    const imgBlock = src
      ? `<img class="tool-preview-drag-image" draggable="true" src="${src}" alt="Drag image to page" title="Drag image to the page" style="width:${imgW}px;max-width:100%;height:auto;display:inline-block;cursor:grab;" />`
      : `<div class="tool-preview-img-placeholder" style="width:${imgW}px;height:${Math.round(imgW * 0.62)}px;">Image here</div>`;
    host.innerHTML = `
      <div class="tool-preview-mini-wrap" style="width:${miniW}px;height:${miniH}px;">
        <div class="tool-preview-mini-page" style="width:${pw}px;height:${ph}px;padding:${mg}px;transform:scale(${miniScale});transform-origin:top left;font-family:${s.bodyFont};">
          <p style="margin:0 0 10px;font-size:${s.fontSize}pt;line-height:${s.lineHeight};text-align:${s.textAlign};color:#bbb;">Manuscript text…</p>
          <div style="text-align:center;line-height:0;">${imgBlock}</div>
      </div>`;
    if (titleEl) titleEl.textContent = `Image preview — ${label}`;
    return;
  }

  const pages = document.querySelectorAll('#bookPages .book-page');
  const page = pages[previewPageIndex] || pages[0];
  if (page && page.querySelector('.book-page-body, [style*="flex"]')) {
    host.innerHTML = `
      <div class="tool-preview-mini-wrap" style="width:${miniW}px;height:${miniH}px;">
        <div class="tool-preview-mini-clone" style="width:${pw}px;transform:scale(${miniScale});transform-origin:top left;">${page.innerHTML}</div>
      </div>`;
  } else if (hasManuscriptContent()) {
    host.innerHTML = `
      <div class="tool-preview-mini-wrap" style="width:${miniW}px;height:${miniH}px;">
        <div class="tool-preview-mini-page" style="width:${pw}px;height:${ph}px;padding:${mg}px;transform:scale(${miniScale});transform-origin:top left;font-family:${s.bodyFont};font-size:${s.fontSize}pt;line-height:${s.lineHeight};color:#999;display:flex;align-items:center;justify-content:center;">Updating…</div>
      </div>`;
  } else {
    host.innerHTML = '<p class="tool-preview-empty">Upload a manuscript to see the page preview.</p>';
  }

  const titles = {
    layout: 'Layout preview',
    typography: 'Formatting preview',
    image: 'Image Insert preview',
  };
  if (titleEl) titleEl.textContent = titles[options.tool] || 'Page preview';
}

function showToolPreviewPopup(options = {}) {
  const popup = document.getElementById('toolPreviewPopup');
  const foot = document.getElementById('toolPreviewPopupFoot');
  if (!popup) return;
  renderToolPreviewPopupPage(options);
  const showImageActions = Boolean(options.imageSize);
  if (foot) foot.hidden = !showImageActions;
  const insertBtn = document.getElementById('toolPreviewPopupInsert');
  if (insertBtn) insertBtn.disabled = !options.imageSrc;
  popup.hidden = false;
  popup.setAttribute('aria-hidden', 'false');
  popup.classList.add('active');
}

function hideToolPreviewPopup() {
  const popup = document.getElementById('toolPreviewPopup');
  if (!popup) return;
  exitImagePlacementMode();
  popup.classList.remove('active');
  popup.hidden = true;
  popup.setAttribute('aria-hidden', 'true');
  toolPreviewPopupActiveTool = null;
  document.querySelectorAll('.image-size-option.is-preview-active').forEach(el => {
    el.classList.remove('is-preview-active');
  });
}

function clearImageInsertDraft() {
  toolPreviewImageDraft = null;
  pendingImageInsertSize = null;
  pendingImageInsertPageIndex = null;
  storageRemove(CURRENT_IMAGE_DRAFT_STORAGE_KEY);
}

function saveImageInsertDraft() {
  if (toolPreviewImageDraft?.size && toolPreviewImageDraft.src) {
    storageSet(CURRENT_IMAGE_DRAFT_STORAGE_KEY, {
      projectId: currentWorkId,
      size: toolPreviewImageDraft.size,
      src: toolPreviewImageDraft.src,
      updatedAt: new Date().toISOString(),
    });
  } else {
    storageRemove(CURRENT_IMAGE_DRAFT_STORAGE_KEY);
  }
}

function restoreImageInsertDraft() {
  const draft = storageGet(CURRENT_IMAGE_DRAFT_STORAGE_KEY, null);
  if (!draft?.size || !draft.src) return;
  if (draft.projectId && draft.projectId !== currentWorkId) {
    storageRemove(CURRENT_IMAGE_DRAFT_STORAGE_KEY);
    return;
  }
  toolPreviewImageDraft = { size: draft.size, src: draft.src };
  pendingImageInsertSize = draft.size;
}

function syncToolPreviewPopupIfOpen() {
  const popup = document.getElementById('toolPreviewPopup');
  if (!popup || popup.hidden || !popup.classList.contains('active')) return;
  if (toolPreviewImageDraft?.size) {
    showToolPreviewPopup({
      tool: 'image',
      imageSize: toolPreviewImageDraft.size,
      imageSrc: toolPreviewImageDraft.src || '',
    });
  } else if (toolPreviewPopupActiveTool) {
    showToolPreviewPopup({ tool: toolPreviewPopupActiveTool });
  }
}

function toggleProofreadToolList(forceOpen = null) {
  const rail = document.querySelector('.tool-rail');
  const btn = document.getElementById('btnToolOptions');
  if (!rail) return false;
  const nextOpen = forceOpen === null ? !rail.classList.contains('proof-tools-open') : !!forceOpen;
  rail.classList.toggle('proof-tools-open', nextOpen);
  btn?.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
  if (btn) btn.title = nextOpen ? 'Hide layout tools' : 'Show layout tools';
  if (!nextOpen) closeAllToolFlyouts();
  return nextOpen;
}

function initToolRail() {
  let hoverTimer = null;
  document.querySelectorAll('.tool-rail-item').forEach(item => {
    const btn = item.querySelector('.tool-rail-btn');
    const flyout = item.querySelector('.tool-flyout');
    if (!btn || !flyout) return;

    item.addEventListener('mouseenter', () => {
      clearTimeout(hoverTimer);
      if (item.dataset.tool === 'proofread') return;
      if (item.dataset.tool === 'upload' && showUploadCancelOption()) return;
      openToolFlyout(item);
    });

    item.addEventListener('mouseleave', (e) => {
      if (item.contains(e.relatedTarget)) return;
      hoverTimer = setTimeout(() => {
        if (item.querySelector('.custom-select.open')) return;
        item.classList.remove('is-open');
        btn.setAttribute('aria-expanded', 'false');
        const openItem = document.querySelector('.tool-rail-item.is-open');
        if (!openItem && !toolPreviewImageDraft) hideToolPreviewPopup();
      }, 220);
    });

    flyout.addEventListener('mouseenter', () => clearTimeout(hoverTimer));

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (item.dataset.tool === 'proofread') {
        if (!hasManuscriptContent() && canAcceptNewUpload()) {
          const fileInput = document.getElementById('manuscriptFile');
          if (fileInput && !fileInput.disabled) fileInput.click();
          setStatus('', 'Choose a manuscript file to begin');
          return;
        }
        toggleProofreadToolList();
        return;
      }
      if (item.classList.contains('is-open')) closeAllToolFlyouts();
      else openToolFlyout(item);
    });

    flyout.addEventListener('mousedown', e => e.stopPropagation());
  });

  document.addEventListener('click', (e) => {
    if (e.target.closest('.tool-rail-item')) return;
    if (e.target.closest('.custom-select.open, .custom-select-menu.is-fixed, .custom-select-panel.is-fixed')) return;
    closeAllToolFlyouts();
  });
}

const PAGE_BREAK_MARKER = '\f';
const MANUSCRIPT_IMAGE_RE = /\[\[IMAGE:(quarter|half|full)(?::(\d+):(-?\d+(?:\.\d+)?):(-?\d+(?:\.\d+)?))?\]\]([\s\S]*?)\[\[\/IMAGE\]\]/g;
const MANUSCRIPT_IMAGE_SIZE = { quarter: 0.25, half: 0.5, full: 1 };
const MANUSCRIPT_IMAGE_LABELS = {
  quarter: 'Quarter size',
  half: 'Half size',
  full: 'Full size',
};
const IMAGE_INSERT_MAX_BYTES = 5 * 1024 * 1024;

function hasManuscriptImages(text = getManuscriptText()) {
  MANUSCRIPT_IMAGE_RE.lastIndex = 0;
  const found = MANUSCRIPT_IMAGE_RE.test(String(text || ''));
  MANUSCRIPT_IMAGE_RE.lastIndex = 0;
  return found;
}

/** Detect if manuscript already contains its own page numbers. */
function manuscriptHasPageNumbers(text) {
  if (!text || !text.trim()) return false;
  const pageNumRe = /^\s*(?:page\s*)?\d{1,4}\s*$|^\s*[—–\-]\s*\d{1,4}\s*[—–\-]\s*$/i;
  let count = 0;
  for (const line of text.split(/\n/)) {
    if (pageNumRe.test(line.trim())) count++;
  }
  if (count >= 2) return true;
  if (count >= 1 && text.includes(PAGE_BREAK_MARKER)) return true;
  return false;
}

function getPageMeasurer(pw, mg, typography) {
  let el = document.getElementById('chapteraPageMeasurer');
  if (!el) {
    el = document.createElement('div');
    el.id = 'chapteraPageMeasurer';
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = 'position:absolute;left:-99999px;top:0;visibility:hidden;pointer-events:none;box-sizing:border-box;';
    document.body.appendChild(el);
  }
  el.style.width = `${pw - 2 * mg}px`;
  el.style.fontFamily = typography.bodyFont;
  el.style.fontSize = `${typography.fontSize}pt`;
  el.style.lineHeight = String(typography.lineHeight);
  return el;
}

function measureBlockHeight(measurer, html) {
  measurer.innerHTML = html;
  return measurer.offsetHeight;
}

function buildHeaderHtml(s, tpl, fs) {
  const title = s.title
    ? escapeHtml(s.title)
    : '<span style="color:#ccc;font-style:italic;">Book title</span>';
  const author = s.author
    ? escapeHtml(s.author)
    : '<span style="color:#ccc;font-style:italic;">Author name</span>';
  const chapter = s.chapter
    ? escapeHtml(s.chapter)
    : '<span style="color:#ccc;font-style:italic;">Chapter title</span>';
  return (
    `<div class="book-title-line" style="text-align:center;margin-bottom:14px;font-family:${s.headFont};font-size:${fs + 10}pt;font-weight:700;color:${tpl.accentColor};line-height:1.25;">${title}</div>` +
    `<div class="book-page-header" style="text-align:center;font-size:${fs - 2}pt;color:#666;text-transform:uppercase;border-bottom:1px solid #ddd;padding-bottom:6px;margin-bottom:12px;font-family:${s.headFont};">${author}</div>` +
    `<div style="text-align:center;margin-bottom:12px;"><div style="color:${tpl.accentColor};letter-spacing:0.15em;font-size:${fs - 2}pt;">✦ ✦ ✦</div>` +
    `<div style="font-family:${s.headFont};font-size:${fs + 6}pt;font-weight:700;color:${tpl.accentColor};">${chapter}</div></div>`
  );
}

function buildParaHtml(paraText, issues, paraStart, forExport, fs, textAlign, colStyle, focusIssue) {
  const body = forExport
    ? formatInlineManuscript(paraText).replace(/\n/g, '<br>')
    : highlightPreviewText(paraText, issues, paraStart, focusIssue);
  const paraEnd = paraStart + String(paraText || '').length;
  return `<p class="book-body-p" data-para-start="${paraStart}" data-para-end="${paraEnd}" style="margin:0 0 ${fs * 0.35}px;text-align:${textAlign};${colStyle}">${body}</p>`;
}

function getManuscriptContentWidth(s) {
  const size = s.size || getSize();
  const inchMargin = { 15: 0.75, 20: 1, 25: 1.25 };
  let pw;
  let mg;
  if (size.unit === 'mm') {
    pw = mmToPx(size.w);
    mg = mmToPx(s.margin);
  } else {
    pw = Math.round(size.w * 96);
    if (s.marginIsCustom) mg = mmToPx(s.margin);
    else mg = Math.round((inchMargin[s.margin] || 1) * 96);
  }
  return Math.max(80, pw - 2 * mg);
}

function sanitizeImageDataUrl(src) {
  if (!src || !/^data:image\//i.test(String(src).trim())) return '';
  return String(src).trim().replace(/"/g, '&quot;');
}

function buildImageHtml(size, src, contentWidth, fs, markerStart = null, markerEnd = null) {
  const safeSrc = sanitizeImageDataUrl(src);
  const rangeAttrs = Number.isFinite(markerStart) && Number.isFinite(markerEnd)
    ? ` data-image-start="${markerStart}" data-image-end="${markerEnd}"`
    : '';
  if (!safeSrc) {
    return `<div class="book-image-block"${rangeAttrs} draggable="true" style="margin:0 0 ${Math.round(fs * 0.5)}px;text-align:center;color:#999;font-size:${Math.max(8, fs - 2)}pt;"><button type="button" class="book-image-delete" title="Delete image" aria-label="Delete image">×</button>[Invalid image]</div>`;
  }
  const ratio = MANUSCRIPT_IMAGE_SIZE[size] || 1;
  const widthPx = Math.max(40, Math.round(contentWidth * ratio));
  const marginBottom = Math.round(fs * 0.5);
  return `<div class="book-image-block"${rangeAttrs} draggable="true" title="Drag to move image" style="margin:0 0 ${marginBottom}px;text-align:center;line-height:0;cursor:grab;"><button type="button" class="book-image-delete" title="Delete image" aria-label="Delete image">×</button><img src="${safeSrc}" alt="" style="width:${widthPx}px;max-width:100%;height:auto;display:inline-block;pointer-events:none;" /></div>`;
}

function getImageMarker(size, dataUrl) {
  return `[[IMAGE:${size}]]${dataUrl}[[/IMAGE]]`;
}

function getPlacedImageMarker(size, dataUrl, placement) {
  const page = Number.isFinite(placement?.page) ? Math.max(0, Math.round(placement.page)) : 0;
  const x = Number.isFinite(placement?.x) ? Math.max(0, Math.min(100, placement.x)).toFixed(2) : '50.00';
  const y = Number.isFinite(placement?.y) ? Math.max(0, Math.min(100, placement.y)).toFixed(2) : '50.00';
  return `[[IMAGE:${size}:${page}:${x}:${y}]]${dataUrl}[[/IMAGE]]`;
}

function buildPlacedImageHtml(size, src, contentWidth, markerStart, markerEnd, placement) {
  const safeSrc = sanitizeImageDataUrl(src);
  const rangeAttrs = Number.isFinite(markerStart) && Number.isFinite(markerEnd)
    ? ` data-image-start="${markerStart}" data-image-end="${markerEnd}"`
    : '';
  if (!safeSrc) return '';
  const ratio = MANUSCRIPT_IMAGE_SIZE[size] || 1;
  const widthPx = Math.max(40, Math.round(contentWidth * ratio));
  const x = Number.isFinite(placement?.x) ? Math.max(0, Math.min(100, placement.x)) : 50;
  const y = Number.isFinite(placement?.y) ? Math.max(0, Math.min(100, placement.y)) : 50;
  return `<div class="book-image-block"${rangeAttrs} draggable="true" title="Drag to move image" style="position:absolute;left:${x}%;top:${y}%;transform:translate(-50%,-50%);z-index:4;text-align:center;line-height:0;cursor:grab;"><button type="button" class="book-image-delete" title="Delete image" aria-label="Delete image">×</button><img src="${safeSrc}" alt="" style="width:${widthPx}px;max-width:100%;height:auto;display:inline-block;pointer-events:none;" /></div>`;
}

function getPlacedImagesForPage(pageIndex, contentWidth) {
  const text = getManuscriptText();
  const images = [];
  MANUSCRIPT_IMAGE_RE.lastIndex = 0;
  let match;
  while ((match = MANUSCRIPT_IMAGE_RE.exec(text)) !== null) {
    const size = match[1];
    const page = match[2] != null ? parseInt(match[2], 10) : 0;
    if (page !== pageIndex) continue;
    images.push(buildPlacedImageHtml(
      size,
      (match[5] || '').trim(),
      contentWidth,
      match.index,
      match.index + match[0].length,
      { x: parseFloat(match[3] || '50'), y: parseFloat(match[4] || '50') },
    ));
  }
  MANUSCRIPT_IMAGE_RE.lastIndex = 0;
  return images.filter(Boolean).join('');
}

function normalizeEditableText(text) {
  return String(text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\s+$/g, '');
}

function getManuscriptText() {
  return document.getElementById('sampleText')?.value || '';
}

function setManuscriptText(text) {
  const ta = document.getElementById('sampleText');
  if (ta) ta.value = String(text || '');
}

function pushUndoState() {
  const current = getManuscriptText();
  if (undoStack[undoStack.length - 1] === current) return;
  undoStack.push(current);
  if (undoStack.length > 80) undoStack.shift();
  redoStack = [];
}

function restoreManuscriptHistory(stackFrom, stackTo) {
  if (!stackFrom.length) return false;
  stackTo.push(getManuscriptText());
  const previous = stackFrom.pop();
  setManuscriptText(previous);
  manuscriptPageLocked = previous.includes(PAGE_BREAK_MARKER);
  clearAnalysisForManualEdit();
  setChangesEditedMessage();
  scheduleUpdatePreview({ immediate: true });
  setStatus('green', 'Preview edit restored');
  return true;
}

function undoPreviewEdit() {
  return restoreManuscriptHistory(undoStack, redoStack);
}

function redoPreviewEdit() {
  return restoreManuscriptHistory(redoStack, undoStack);
}

function serializePreviewBlock(block) {
  if (!block) return '';
  if (block.type === 'image' && block.size && block.src) return getImageMarker(block.size, block.src);
  if (block.type === 'para') return normalizeEditableText(block.plain || '');
  return '';
}

function serializePreviewPageBlocks(pageBlocks) {
  return (pageBlocks || [])
    .map(serializePreviewBlock)
    .filter(Boolean)
    .join('\n\n');
}

function lockCurrentPreviewPages() {
  if (manuscriptPageLocked || getManuscriptText().includes(PAGE_BREAK_MARKER)) {
    manuscriptPageLocked = true;
    return;
  }
  if (!virtualPreviewPages.length) return;
  const pagesText = virtualPreviewPages.map(serializePreviewPageBlocks);
  if (!pagesText.some(t => t.trim())) return;
  setManuscriptText(pagesText.join(PAGE_BREAK_MARKER));
  manuscriptPageLocked = true;
}

function getPageSectionRange(pageIndex = previewPageIndex) {
  const text = getManuscriptText();
  const sections = text.split(PAGE_BREAK_MARKER);
  const idx = Math.max(0, Math.min(sections.length - 1, Number(pageIndex) || 0));
  let start = 0;
  for (let i = 0; i < idx; i++) start += sections[i].length + PAGE_BREAK_MARKER.length;
  return { start, end: start + sections[idx].length };
}

function getCurrentVisiblePreviewPageIndex() {
  const visiblePage = Array.from(document.querySelectorAll('#bookPages .book-page'))
    .find(page => page.offsetParent !== null && page.style.display !== 'none');
  const domIdx = parseInt(visiblePage?.dataset.pageIndex || '', 10);
  if (Number.isFinite(domIdx)) return domIdx;
  const jumpVal = parseInt(document.getElementById('previewPageJumpInput')?.value || '', 10);
  if (Number.isFinite(jumpVal)) return Math.max(0, jumpVal - 1);
  return previewPageIndex;
}

function clearAnalysisForManualEdit() {
  lastFixHighlights = [];
  lastSpellingIssues = [];
  lastPreviewIssues = [];
  lastAiIssues = [];
  hasAiAnalysisRun = false;
  skipLiveSpellCheck = true;
  sortedSpellingIssues = [];
  rejectedSpellIssues = [];
  spellFocusIndex = null;
  spellHoverIndex = null;
  const acc = document.getElementById('accPercent');
  const read = document.getElementById('readScore');
  const issues = document.getElementById('aiIssueCount');
  const spelling = document.getElementById('changeCount');
  const badge = document.getElementById('accuracyBadge');
  if (acc) acc.textContent = '--';
  if (read) read.textContent = '--';
  if (issues) issues.textContent = '0';
  if (spelling) spelling.textContent = '0';
  if (badge) badge.style.display = 'none';
}

function setChangesEditedMessage() {
  const list = document.getElementById('changesList');
  markPreviewNeedsConfirm();
  if (!list) return;
  list.innerHTML = '<p style="font-size:0.8rem;color:var(--muted);padding:12px;text-align:center;">Manuscript edited. Click <strong>Analyze with AI</strong> to check again.</p>';
}

function setPreviewConfirmState(pending) {
  hasUnconfirmedPreviewChanges = !!pending;
  const btn = document.getElementById('previewConfirmBtn');
  if (!btn) return;
  btn.disabled = !hasUnconfirmedPreviewChanges;
  btn.classList.toggle('is-pending', hasUnconfirmedPreviewChanges);
}

function markPreviewNeedsConfirm() {
  setPreviewConfirmState(true);
}

function confirmPreviewChanges() {
  setPreviewConfirmState(false);
  setStatus('green', 'Preview changes saved and confirmed');
  showAttention('Preview changes saved. You can run Analyze now.');
}

function syncPreviewBeforeExport() {
  document.querySelectorAll('.book-page-body[contenteditable="true"]').forEach(body => {
    syncEditablePreviewBody(body);
    body.contentEditable = 'false';
    body.classList.remove('is-editing');
  });
  setPreviewConfirmState(false);
}

function requirePreviewConfirmed() {
  if (!hasUnconfirmedPreviewChanges) return true;
  showAttention('⚠ Save & Confirm preview changes before running Analyze.');
  setStatus('', 'Save & Confirm preview changes before Analyze');
  document.getElementById('previewConfirmBtn')?.classList.add('attention-pulse');
  setTimeout(() => document.getElementById('previewConfirmBtn')?.classList.remove('attention-pulse'), 900);
  return false;
}

function replaceManuscriptRange(start, end, replacement) {
  const ta = document.getElementById('sampleText');
  if (!ta) return false;
  const text = ta.value || '';
  const s = Math.max(0, Math.min(text.length, Number(start)));
  const e = Math.max(s, Math.min(text.length, Number(end)));
  ta.value = text.slice(0, s) + replacement + text.slice(e);
  return true;
}

function syncEditablePreviewBody(body) {
  if (syncingPreviewEdit || !body) return;
  const page = body.closest('.book-page');
  const pageIndex = parseInt(page?.dataset.pageIndex || String(previewPageIndex), 10);
  pushUndoState();
  lockCurrentPreviewPages();
  const range = getPageSectionRange(pageIndex);
  const start = range.start;
  const end = range.end;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return;
  const nextText = normalizeEditableText(body.innerText);
  if (!replaceManuscriptRange(start, end, nextText)) return;
  clearAnalysisForManualEdit();
  setChangesEditedMessage();
  scheduleCurrentDraftSave({ edited: true });
  clearTimeout(previewEditTimer);
  previewEditTimer = setTimeout(() => {
    syncingPreviewEdit = true;
    scheduleUpdatePreview({ immediate: true });
    syncingPreviewEdit = false;
  }, 650);
  setStatus('green', 'Preview edited — click Analyze with AI to recheck');
}

function countTextBeforeNode(root, node, offset) {
  let count = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current;
  while ((current = walker.nextNode())) {
    if (current === node) return count + offset;
    count += current.nodeValue.length;
  }
  return count;
}

function getCaretRangeFromPoint(x, y) {
  if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
  if (document.caretPositionFromPoint) {
    const pos = document.caretPositionFromPoint(x, y);
    if (!pos) return null;
    const range = document.createRange();
    range.setStart(pos.offsetNode, pos.offset);
    range.collapse(true);
    return range;
  }
  return null;
}

function getPreviewTextOffsetFromPoint(body, x, y) {
  const range = getCaretRangeFromPoint(x, y);
  const page = body?.closest('.book-page');
  const pageStart = parseInt(page?.dataset.textStart || '0', 10);
  if (!body || !Number.isFinite(pageStart)) return 0;
  if (!range || !body.contains(range.startContainer)) {
    const rect = body.getBoundingClientRect();
    return y > rect.top + rect.height / 2
      ? parseInt(page?.dataset.textEnd || pageStart, 10)
      : pageStart;
  }

  const para = range.startContainer.parentElement?.closest?.('[data-para-start]');
  if (para && body.contains(para)) {
    const paraStart = parseInt(para.dataset.paraStart || String(pageStart), 10);
    return paraStart + countTextBeforeNode(para, range.startContainer, range.startOffset);
  }

  return pageStart + countTextBeforeNode(body, range.startContainer, range.startOffset);
}

function exitImagePlacementMode() {
  imagePlacementActive = false;
  movingImageDraft = null;
  pointerImageMoveDraft = null;
  document.body.classList.remove('image-placement-active');
}

function enterImagePlacementMode() {
  if (!toolPreviewImageDraft?.size || !toolPreviewImageDraft.src) return;
  imagePlacementActive = true;
  document.body.classList.add('image-placement-active');
  setStatus('green', 'Drag the image preview onto the page, or click where it should appear');
  showAttention('Drag the image preview onto the page, or click the preview page to place it.');
}

async function insertManuscriptImageAtOffset(size, dataUrl, offset) {
  const ta = document.getElementById('sampleText');
  if (!ta) return;
  pushUndoState();
  lockCurrentPreviewPages();
  const text = ta.value || '';
  const at = Math.max(0, Math.min(text.length, Number.isFinite(offset) ? offset : text.length));
  const before = text.slice(0, at);
  const after = text.slice(at);
  const needsBefore = before.trim() ? '\n\n' : '';
  const needsAfter = after.trim() ? '\n\n' : '';
  ta.value = before.replace(/\s+$/g, '') + needsBefore + getImageMarker(size, dataUrl) + needsAfter + after.replace(/^\s+/g, '');
  clearAnalysisForManualEdit();
  setChangesEditedMessage();
  await saveCurrentDraftNow({ edited: true });
  scheduleUpdatePreview({ immediate: true });
  const label = MANUSCRIPT_IMAGE_LABELS[size] || size;
  setStatus('green', `Image placed (${label})`);
  showAttention(`Image placed (${label}).`);
  exitImagePlacementMode();
  clearImageInsertDraft();
  hideToolPreviewPopup();
}

async function insertImageMarkerTextAtOffset(marker, offset, sourceRange = null) {
  const ta = document.getElementById('sampleText');
  if (!ta || !marker) return;
  pushUndoState();
  const sourceMarker = sourceRange
    ? String(ta.value || '').slice(sourceRange.start, sourceRange.end)
    : '';
  lockCurrentPreviewPages();
  let text = ta.value || '';
  let at = Math.max(0, Math.min(text.length, Number.isFinite(offset) ? offset : text.length));
  if (sourceRange && Number.isFinite(sourceRange.start) && Number.isFinite(sourceRange.end)) {
    let start = Math.max(0, Math.min(text.length, sourceRange.start));
    let end = Math.max(start, Math.min(text.length, sourceRange.end));
    if (text.slice(start, end) !== sourceMarker && sourceMarker) {
      const found = text.indexOf(sourceMarker);
      if (found >= 0) {
        start = found;
        end = found + sourceMarker.length;
      }
    }
    text = text.slice(0, start).replace(/\s+$/g, '') + text.slice(end).replace(/^\s+/g, '');
    if (at > end) at -= (end - start);
    else if (at > start) at = start;
  }
  const before = text.slice(0, at);
  const after = text.slice(at);
  const needsBefore = before.trim() ? '\n\n' : '';
  const needsAfter = after.trim() ? '\n\n' : '';
  ta.value = before.replace(/\s+$/g, '') + needsBefore + marker + needsAfter + after.replace(/^\s+/g, '');
  clearAnalysisForManualEdit();
  setChangesEditedMessage();
  await saveCurrentDraftNow({ edited: true });
  scheduleUpdatePreview({ immediate: true });
  setStatus('green', sourceRange ? 'Image moved' : 'Image inserted');
  showAttention(sourceRange ? 'Image moved.' : 'Image inserted on this page.');
  exitImagePlacementMode();
  clearImageInsertDraft();
  hideToolPreviewPopup();
}

async function insertPlacedImageMarker(marker, sourceRange = null) {
  const ta = document.getElementById('sampleText');
  if (!ta || !marker) return;
  pushUndoState();
  let text = ta.value || '';
  if (sourceRange && Number.isFinite(sourceRange.start) && Number.isFinite(sourceRange.end)) {
    const start = Math.max(0, Math.min(text.length, sourceRange.start));
    const end = Math.max(start, Math.min(text.length, sourceRange.end));
    text = text.slice(0, start).replace(/\s+$/g, '') + text.slice(end).replace(/^\s+/g, '');
  }
  const sep = text.trim() ? '\n\n' : '';
  ta.value = text.replace(/\s+$/g, '') + sep + marker;
  clearAnalysisForManualEdit();
  setChangesEditedMessage();
  await saveCurrentDraftNow({ edited: true });
  scheduleUpdatePreview({ immediate: true });
  setStatus('green', sourceRange ? 'Image moved' : 'Image placed');
  showAttention(sourceRange ? 'Image moved.' : 'Image placed on this page.');
  exitImagePlacementMode();
  clearImageInsertDraft();
  hideToolPreviewPopup();
}

async function deletePreviewImageBlock(block) {
  if (!block) return;
  const start = parseInt(block.dataset.imageStart || '', 10);
  const end = parseInt(block.dataset.imageEnd || '', 10);
  const text = getManuscriptText();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
  pushUndoState();
  setManuscriptText(text.slice(0, start).replace(/\s+$/g, '') + text.slice(end).replace(/^\s+/g, ''));
  clearAnalysisForManualEdit();
  setChangesEditedMessage();
  await saveCurrentDraftNow({ edited: true });
  scheduleUpdatePreview({ immediate: true });
  setStatus('green', 'Image deleted');
  showAttention('Image deleted.');
}

function getImageDraftFromBlock(block) {
  if (!block) return null;
  const start = parseInt(block.dataset.imageStart || '', 10);
  const end = parseInt(block.dataset.imageEnd || '', 10);
  const text = getManuscriptText();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const marker = text.slice(start, end);
  MANUSCRIPT_IMAGE_RE.lastIndex = 0;
  if (!MANUSCRIPT_IMAGE_RE.test(marker)) {
    MANUSCRIPT_IMAGE_RE.lastIndex = 0;
    return null;
  }
  MANUSCRIPT_IMAGE_RE.lastIndex = 0;
  return { marker, sourceRange: { start, end } };
}

async function insertManuscriptImageOnCurrentPage(size, dataUrl) {
  lockCurrentPreviewPages();
  const targetPage = Number.isFinite(pendingImageInsertPageIndex)
    ? pendingImageInsertPageIndex
    : getCurrentVisiblePreviewPageIndex();
  const range = getPageSectionRange(targetPage);
  await insertImageMarkerTextAtOffset(getImageMarker(size, dataUrl), range.start);
  pendingImageInsertPageIndex = null;
}

async function placeDraftImageOnPreview(e) {
  const draft = movingImageDraft || toolPreviewImageDraft;
  if (!draft?.src && !draft?.marker) return false;
  const body = e.target.closest?.('.book-page-body');
  if (!body) return false;
  e.preventDefault();
  e.stopPropagation();
  const page = body.closest('.book-page');
  const pageIndex = parseInt(page?.dataset.pageIndex || String(previewPageIndex), 10);
  const rect = body.getBoundingClientRect();
  const placement = {
    page: Number.isFinite(pageIndex) ? pageIndex : previewPageIndex,
    x: ((e.clientX - rect.left) / Math.max(1, rect.width)) * 100,
    y: ((e.clientY - rect.top) / Math.max(1, rect.height)) * 100,
  };
  if (draft.marker) {
    const match = String(draft.marker || '').match(/^\[\[IMAGE:(quarter|half|full)(?::\d+:-?\d+(?:\.\d+)?:-?\d+(?:\.\d+)?)?\]\]([\s\S]*?)\[\[\/IMAGE\]\]$/);
    const marker = match ? getPlacedImageMarker(match[1], match[2], placement) : draft.marker;
    await insertPlacedImageMarker(marker, draft.sourceRange);
  } else {
    await insertPlacedImageMarker(getPlacedImageMarker(draft.size, draft.src, placement));
  }
  return true;
}

function appendParagraphBlocks(blocks, sectionText, fullText, issues, forExport, fs, textAlign, colStyle, focusIssue, searchFromRef) {
  const paras = sectionText.split(/\n\n+/);
  paras.forEach((para) => {
    const pt = para.trim();
    if (!pt) {
      searchFromRef.value += para.length + 2;
      return;
    }
    const paraStart = fullText.indexOf(pt, searchFromRef.value);
    blocks.push({
      type: 'para',
      plain: pt,
      html: buildParaHtml(pt, issues, paraStart >= 0 ? paraStart : searchFromRef.value, forExport, fs, textAlign, colStyle, focusIssue),
      paraStart: paraStart >= 0 ? paraStart : searchFromRef.value,
    });
    searchFromRef.value = (paraStart >= 0 ? paraStart : searchFromRef.value) + pt.length + 2;
  });
}

function appendSectionBlocks(blocks, sectionText, fullText, issues, forExport, fs, textAlign, colStyle, focusIssue, contentWidth, searchFromRef) {
  const imageRe = /\[\[IMAGE:(quarter|half|full)(?::(\d+):(-?\d+(?:\.\d+)?):(-?\d+(?:\.\d+)?))?\]\]([\s\S]*?)\[\[\/IMAGE\]\]/g;
  let lastIndex = 0;
  let match;
  while ((match = imageRe.exec(sectionText)) !== null) {
    const before = sectionText.slice(lastIndex, match.index);
    if (before.trim()) appendParagraphBlocks(blocks, before, fullText, issues, forExport, fs, textAlign, colStyle, focusIssue, searchFromRef);
    const markerStart = fullText.indexOf(match[0], searchFromRef.value);
    const imageStart = markerStart >= 0 ? markerStart : searchFromRef.value;
    const imageEnd = imageStart + match[0].length;
    if (match[2] == null) {
      blocks.push({
        type: 'image',
        size: match[1],
        src: (match[5] || '').trim(),
        markerStart: imageStart,
        markerEnd: imageEnd,
      });
    }
    searchFromRef.value = imageEnd;
    lastIndex = match.index + match[0].length;
  }
  const after = sectionText.slice(lastIndex);
  if (after.trim()) appendParagraphBlocks(blocks, after, fullText, issues, forExport, fs, textAlign, colStyle, focusIssue, searchFromRef);
}

function preserveManuscriptImages(text) {
  const images = [];
  const preserveRanges = [];
  const stripped = String(text || '').replace(MANUSCRIPT_IMAGE_RE, (match) => {
    const idx = images.length;
    const placeholder = `__CHAPTERA_IMG_${idx}__`;
    images.push(match);
    return `\n\n${placeholder}\n\n`;
  });
  images.forEach((_, idx) => {
    const marker = `__CHAPTERA_IMG_${idx}__`;
    let pos = stripped.indexOf(marker);
    while (pos >= 0) {
      preserveRanges.push({ start: pos, end: pos + marker.length });
      pos = stripped.indexOf(marker, pos + marker.length);
    }
  });
  return { stripped, images, preserveRanges };
}

function restoreManuscriptImages(text, images) {
  let out = String(text || '');
  (images || []).forEach((img, idx) => {
    const marker = `__CHAPTERA_IMG_${idx}__`;
    out = out.split(marker).join(img);
    out = out.replace(new RegExp(`_*\\s*CHAPTERA\\s*[_-]?\\s*IMG\\s*[_-]?\\s*${idx}\\s*_*`, 'gi'), img);
  });
  return out;
}

async function insertManuscriptImage(size, dataUrl) {
  const ta = document.getElementById('sampleText');
  if (!ta) return;
  const marker = getImageMarker(size, dataUrl);
  const sep = ta.value.trim() ? '\n\n' : '';
  ta.value = ta.value + sep + marker;
  clearAnalysisForManualEdit();
  setChangesEditedMessage();
  await saveCurrentDraftNow({ edited: true });
  scheduleUpdatePreview({ immediate: true });
  const label = MANUSCRIPT_IMAGE_LABELS[size] || size;
  setStatus('green', `Image inserted (${label})`);
  showAttention(`Image inserted at ${label}.`);
  exitImagePlacementMode();
  clearImageInsertDraft();
  hideToolPreviewPopup();
}

function previewImageInsertSize(size) {
  if (!size) return;
  pendingImageInsertSize = size;
  toolPreviewImageDraft = { size, src: toolPreviewImageDraft?.size === size ? toolPreviewImageDraft.src : '' };
  saveImageInsertDraft();
  document.querySelectorAll('.image-size-option').forEach(el => {
    el.classList.toggle('is-preview-active', el.dataset.imageSize === size);
  });
  showToolPreviewPopup({
    tool: 'image',
    imageSize: size,
    imageSrc: toolPreviewImageDraft.src || '',
  });
}

function loadImageInsertFile(file) {
  const size = pendingImageInsertSize || toolPreviewImageDraft?.size;
  if (!file || !size) return;
  if (!file.type.startsWith('image/')) {
    showAttention('Please choose an image file (PNG, JPG, GIF, or WebP).');
    return;
  }
  if (file.size > IMAGE_INSERT_MAX_BYTES) {
    showAttention('Image is too large. Maximum size is 5 MB.');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result !== 'string') return;
    toolPreviewImageDraft = { size, src: reader.result };
    pendingImageInsertSize = size;
    saveImageInsertDraft();
    showToolPreviewPopup({
      tool: 'image',
      imageSize: size,
      imageSrc: reader.result,
    });
    enterImagePlacementMode();
  };
  reader.onerror = () => showAttention('Could not read the selected image file.');
  reader.readAsDataURL(file);
}

function initImageInsert() {
  const fileInput = document.getElementById('imageInsertFile');
  document.querySelectorAll('[data-image-size]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!requireManuscriptUploaded()) return;
      pendingImageInsertPageIndex = getCurrentVisiblePreviewPageIndex();
      previewImageInsertSize(btn.dataset.imageSize);
      fileInput?.click();
    });
  });

  fileInput?.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    loadImageInsertFile(file);
  });

  document.getElementById('toolPreviewPopupClose')?.addEventListener('click', hideToolPreviewPopup);
  document.getElementById('toolPreviewPopupChoose')?.addEventListener('click', () => {
    if (!requireManuscriptUploaded()) return;
    pendingImageInsertPageIndex = getCurrentVisiblePreviewPageIndex();
    fileInput?.click();
  });
  document.getElementById('toolPreviewPopupInsert')?.addEventListener('click', () => {
    const draft = toolPreviewImageDraft;
    if (!draft?.size || !draft.src) return;
    insertPlacedImageMarker(getPlacedImageMarker(draft.size, draft.src, {
      page: getCurrentVisiblePreviewPageIndex(),
      x: 50,
      y: 50,
    })).catch(e => setStatus('', e.message));
  });
  document.getElementById('toolPreviewPopupPage')?.addEventListener('dragstart', (e) => {
    if (!e.target.closest?.('.tool-preview-drag-image') || !toolPreviewImageDraft?.src) return;
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', 'chaptera-image-draft');
    enterImagePlacementMode();
  });
}

function initToolPreviewPopup() {
  document.getElementById('toolPreviewPopup')?.addEventListener('click', (e) => {
    if (e.target.id === 'toolPreviewPopup') hideToolPreviewPopup();
  });
}

function showAuthModal() {
  const modal = document.getElementById('authModal');
  if (!modal) return;
  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
  closeAllToolFlyouts();
}

function hideAuthModal() {
  const modal = document.getElementById('authModal');
  if (!modal) return;
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
}

function initAuthModal() {
  setCurrentAuthor(getCurrentAuthor());
  document.getElementById('authModalClose')?.addEventListener('click', hideAuthModal);
  document.getElementById('authModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'authModal') hideAuthModal();
  });
  document.getElementById('registerSubmit')?.addEventListener('click', async () => {
    try {
      const data = await apiJson('/api/auth/register', {
        name: document.getElementById('registerName')?.value,
        email: document.getElementById('registerEmail')?.value,
        password: document.getElementById('registerPassword')?.value,
      });
      const author = setCurrentAuthor(data.author || {});
      hideAuthModal();
      showAttention(`Registered: ${author.name}. Projects will save under this author.`);
    } catch (e) {
      showAttention(e.message || 'Registration failed.');
    }
  });
  document.getElementById('loginSubmit')?.addEventListener('click', async () => {
    try {
      const data = await apiJson('/api/auth/login', {
        email: document.getElementById('loginEmail')?.value,
        password: document.getElementById('loginPassword')?.value,
      });
      const author = setCurrentAuthor(data.author || {});
      hideAuthModal();
      showAttention(`Logged in: ${author.name}. My Projects will show this author's saved work.`);
    } catch (e) {
      showAttention(e.message || 'Login failed.');
    }
  });
}

function initLibraryModal() {
  document.getElementById('libraryModalClose')?.addEventListener('click', hideLibraryModal);
  document.getElementById('libraryModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'libraryModal') hideLibraryModal();
  });
  document.getElementById('libraryModalBody')?.addEventListener('click', async (e) => {
    const openBtn = e.target.closest?.('[data-library-open]');
    const downloadBtn = e.target.closest?.('[data-library-redownload]');
    if (openBtn) {
      await restoreProjectForRework(findLibraryItem(openBtn.dataset.libraryOpen));
      return;
    }
    if (downloadBtn) {
      await redownloadLibraryItem(findLibraryItem(downloadBtn.dataset.libraryRedownload));
    }
  });
}

function initEditablePreview() {
  const stack = document.getElementById('bookPages');
  if (!stack) return;

  stack.addEventListener('keydown', (e) => {
    const inEditablePage = e.target.closest?.('.book-page-body');
    if (!inEditablePage) return;
    const key = String(e.key || '').toLowerCase();
    if ((e.ctrlKey || e.metaKey) && key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undoPreviewEdit();
    } else if ((e.ctrlKey || e.metaKey) && (key === 'y' || (key === 'z' && e.shiftKey))) {
      e.preventDefault();
      redoPreviewEdit();
    }
  });

  stack.addEventListener('input', (e) => {
    const body = e.target.closest?.('.book-page-body[contenteditable="true"]');
    if (!body) return;
    syncEditablePreviewBody(body);
  });

  stack.addEventListener('paste', (e) => {
    const body = e.target.closest?.('.book-page-body[contenteditable="true"]');
    if (!body) return;
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain') || '';
    document.execCommand('insertText', false, text);
  });

  stack.addEventListener('click', (e) => {
    const deleteBtn = e.target.closest?.('.book-image-delete');
    if (deleteBtn) {
      e.preventDefault();
      e.stopPropagation();
      deletePreviewImageBlock(deleteBtn.closest('.book-image-block')).catch(err => setStatus('', err.message));
      return;
    }
    const imageBlock = e.target.closest?.('.book-image-block');
    if (imageBlock) {
      document.querySelectorAll('.book-image-block.is-selected').forEach(el => {
        if (el !== imageBlock) el.classList.remove('is-selected');
      });
      imageBlock.classList.add('is-selected');
      return;
    }
    if (!imagePlacementActive) return;
    placeDraftImageOnPreview(e).catch(err => setStatus('', err.message));
  });

  stack.addEventListener('pointerdown', (e) => {
    const imageBlock = e.target.closest?.('.book-image-block');
    if (imageBlock && !e.target.closest?.('.book-image-delete')) {
      pointerImageMoveDraft = {
        draft: getImageDraftFromBlock(imageBlock),
        startX: e.clientX,
        startY: e.clientY,
      };
      return;
    }
    if (imagePlacementActive || e.target.closest?.('.book-image-block, .book-image-delete')) return;
    const body = e.target.closest?.('.book-page-body.is-editable-preview');
    if (!body) return;
    body.contentEditable = 'true';
    body.classList.add('is-editing');
    requestAnimationFrame(() => body.focus());
  });

  stack.addEventListener('focusout', (e) => {
    const body = e.target.closest?.('.book-page-body.is-editable-preview');
    if (!body) return;
    if (body.contains(e.relatedTarget)) return;
    body.contentEditable = 'false';
    body.classList.remove('is-editing');
  });

  stack.addEventListener('dragstart', (e) => {
    const block = e.target.closest?.('.book-image-block');
    if (!block) return;
    movingImageDraft = getImageDraftFromBlock(block);
    if (!movingImageDraft) return;
    imagePlacementActive = true;
    document.body.classList.add('image-placement-active');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', 'chaptera-existing-image');
  });

  stack.addEventListener('dragover', (e) => {
    if (!imagePlacementActive || (!toolPreviewImageDraft?.src && !movingImageDraft?.marker)) return;
    if (!e.target.closest?.('.book-page-body')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = movingImageDraft ? 'move' : 'copy';
  });

  stack.addEventListener('drop', (e) => {
    if (!imagePlacementActive) return;
    placeDraftImageOnPreview(e).catch(err => setStatus('', err.message));
  });

  stack.addEventListener('pointerup', (e) => {
    if (!pointerImageMoveDraft?.draft) return;
    const moved = Math.abs(e.clientX - pointerImageMoveDraft.startX) + Math.abs(e.clientY - pointerImageMoveDraft.startY) > 8;
    const body = e.target.closest?.('.book-page-body');
    if (moved && body) {
      movingImageDraft = pointerImageMoveDraft.draft;
      imagePlacementActive = true;
      document.body.classList.add('image-placement-active');
      placeDraftImageOnPreview(e).catch(err => setStatus('', err.message));
    }
    pointerImageMoveDraft = null;
  });
}

function splitParagraphToFit(measurer, plainText, maxH, paraStyle, textAlign, colStyle) {
  const chunks = [];
  const words = plainText.split(/\s+/).filter(Boolean);
  if (!words.length) return chunks;
  let current = '';
  for (const word of words) {
    const trial = current ? `${current} ${word}` : word;
    const h = measureBlockHeight(
      measurer,
      `<p style="margin:0 0 4px;text-align:${textAlign};${colStyle}">${escapeHtml(trial)}</p>`
    );
    if (h > maxH && current) {
      chunks.push(current);
      current = word;
    } else {
      current = trial;
    }
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [plainText];
}

/** Build flat list of content blocks from manuscript (respects Word/page breaks). */
function buildContentBlocks(s, text, issues, forExport, tpl, focusIssue = null) {
  const fs = s.fontSize;
  const colStyle = s.cols > 1 ? `column-count:${s.cols};column-gap:${Math.round(fs * 1.8)}px;` : '';
  const contentWidth = getManuscriptContentWidth(s);
  const blocks = [];
  const searchFromRef = { value: 0 };

  const fullText = text || '';
  const sections = fullText.split(PAGE_BREAK_MARKER);
  let sectionOffset = 0;
  sections.forEach((section, secIdx) => {
    if (secIdx > 0) blocks.push({ type: 'break' });

    if (secIdx === 0 && (s.author || s.chapter || s.title)) {
      blocks.push({ type: 'header', html: buildHeaderHtml(s, tpl, fs) });
    }

    searchFromRef.value = sectionOffset;
    appendSectionBlocks(blocks, section, fullText, issues, forExport, fs, s.textAlign, colStyle, focusIssue, contentWidth, searchFromRef);
    sectionOffset += section.length + (secIdx < sections.length - 1 ? PAGE_BREAK_MARKER.length : 0);
  });

  return blocks;
}

function paginateBlocks(blocks, layout) {
  const { measurer, contentHeight, paraStyle, textAlign, colStyle, issues, forExport, fs, maxPages = Infinity } = layout;
  const pages = [];
  let current = [];
  let used = 0;
  let truncated = false;

  function pageLimit() {
    return contentHeight;
  }

  function flush() {
    if (current.length) pages.push(current);
    current = [];
    used = 0;
  }

  function reachedLimit() {
    return pages.length >= maxPages;
  }

  function addBlock(block, html, height) {
    const limit = pageLimit();
    if (height > limit && block.type === 'para') {
      const parts = splitParagraphToFit(measurer, block.plain, limit, paraStyle, textAlign, colStyle);
      let partOffset = block.paraStart;
      parts.forEach((part, i) => {
        if (reachedLimit()) {
          truncated = true;
          return;
        }
        const partStart = partOffset;
        const partHtml = buildParaHtml(part, issues, partStart, forExport, fs, textAlign, colStyle);
        partOffset += part.length + (i < parts.length - 1 ? 1 : 0);
        const partH = measureBlockHeight(measurer, partHtml);
        if (used + partH > pageLimit() && current.length) flush();
        current.push({ type: 'para', plain: part, html: partHtml, paraStart: partStart, paraEnd: partStart + part.length });
        used += partH;
        if (i < parts.length - 1) flush();
      });
      return;
    }
    if (reachedLimit()) {
      truncated = true;
      return;
    }
    if (used + height > pageLimit() && current.length) flush();
    if (reachedLimit()) {
      truncated = true;
      return;
    }
    const pageBlock = { ...block, html };
    if (block.type === 'para') pageBlock.paraEnd = block.paraStart + (block.plain || '').length;
    current.push(pageBlock);
    used += height;
  }

  blocks.forEach((block) => {
    if (reachedLimit()) {
      truncated = true;
      return;
    }
    if (block.type === 'break') {
      flush();
      return;
    }
    const html = block.html || '';
    const h = measureBlockHeight(measurer, html);
    addBlock(block, html, h);
  });

  flush();
  if (!pages.length) pages.push([]);
  pages.truncated = truncated;
  return pages;
}

function buildBookPageElement(pageBlocks, idx, layout) {
  const { pw, ph, mg, pageBg, typography, showPageNumbers, editable } = layout;
  const pageNumH = showPageNumbers ? 28 : 0;
  const pageEl = document.createElement('div');
  pageEl.className = 'book-page';
  pageEl.style.width = `${pw}px`;
  pageEl.style.height = `${ph}px`;
  pageEl.style.background = pageBg;
  pageEl.style.padding = `${mg}px`;
  pageEl.style.fontFamily = typography.bodyFont;
  pageEl.style.fontSize = `${typography.fontSize}pt`;
  pageEl.style.lineHeight = String(typography.lineHeight);
  pageEl.style.color = '#000';
  pageEl.style.position = 'relative';
  pageEl.style.boxSizing = 'border-box';
  pageEl.style.display = 'flex';
  pageEl.style.flexDirection = 'column';
  pageEl.dataset.pageIndex = String(idx);

  const ranges = pageBlocks
    .filter(b => Number.isFinite(b.paraStart) && Number.isFinite(b.paraEnd))
    .map(b => [b.paraStart, b.paraEnd]);
  if (ranges.length) {
    pageEl.dataset.textStart = String(Math.min(...ranges.map(r => r[0])));
    pageEl.dataset.textEnd = String(Math.max(...ranges.map(r => r[1])));
  }

  if (showPageNumbers) {
    const header = document.createElement('div');
    header.className = 'book-page-header-num';
    header.textContent = `- ${idx + 1} -`;
    header.style.fontFamily = typography.bodyFont;
    header.style.fontSize = `${typography.fontSize}pt`;
    header.style.color = '#000';
    pageEl.appendChild(header);
  }

  const body = document.createElement('div');
  body.className = 'book-page-body';
  body.style.flex = '1';
  body.style.minHeight = '0';
  body.style.height = `${ph - 2 * mg - pageNumH}px`;
  body.style.overflow = 'hidden';
  body.style.position = 'relative';
  if (editable) {
    body.contentEditable = 'false';
    body.classList.add('is-editable-preview');
    body.spellcheck = false;
    body.setAttribute('role', 'textbox');
    body.setAttribute('aria-label', `Editable manuscript page ${idx + 1}`);
  }
  body.innerHTML = pageBlocks.map(b => b.html || '').join('') + getPlacedImagesForPage(idx, pw - 2 * mg);
  pageEl.appendChild(body);
  return pageEl;
}

function renderVirtualPreviewPage(index = previewPageIndex) {
  if (!virtualPreviewLayout || !virtualPreviewPages.length) return;
  const { container } = virtualPreviewLayout;
  previewPageIndex = Math.max(0, Math.min(index, virtualPreviewPages.length - 1));
  container.innerHTML = '';
  container.className = 'book-pages-stack';
  container.appendChild(buildBookPageElement(
    virtualPreviewPages[previewPageIndex] || [],
    previewPageIndex,
    virtualPreviewLayout
  ));
}

function renderBookPages(pages, layout) {
  if (layout.virtual) {
    virtualPreviewPages = pages;
    virtualPreviewLayout = layout;
    virtualPreviewTotal = pages.length;
    renderVirtualPreviewPage(previewPageIndex);
    return pages.length;
  }
  virtualPreviewPages = [];
  virtualPreviewLayout = null;
  virtualPreviewTotal = 0;
  return renderAllBookPages(pages, layout);
}

function renderAllBookPages(pages, layout) {
  const { container, pw, ph, mg, pageBg, typography, showPageNumbers, editable } = layout;
  container.innerHTML = '';
  container.className = 'book-pages-stack';

  const pageNumH = showPageNumbers ? 28 : 0;

  pages.forEach((pageBlocks, idx) => {
    const pageEl = document.createElement('div');
    pageEl.className = 'book-page';
    pageEl.style.width = `${pw}px`;
    pageEl.style.height = `${ph}px`;
    pageEl.style.background = pageBg;
    pageEl.style.padding = `${mg}px`;
    pageEl.style.fontFamily = typography.bodyFont;
    pageEl.style.fontSize = `${typography.fontSize}pt`;
    pageEl.style.lineHeight = String(typography.lineHeight);
    pageEl.style.color = '#000';
    pageEl.style.position = 'relative';
    pageEl.style.boxSizing = 'border-box';
    pageEl.style.display = 'flex';
    pageEl.style.flexDirection = 'column';
    const ranges = pageBlocks
      .filter(b => Number.isFinite(b.paraStart) && Number.isFinite(b.paraEnd))
      .map(b => [b.paraStart, b.paraEnd]);
    if (ranges.length) {
      pageEl.dataset.textStart = String(Math.min(...ranges.map(r => r[0])));
      pageEl.dataset.textEnd = String(Math.max(...ranges.map(r => r[1])));
    }

    if (showPageNumbers) {
      const header = document.createElement('div');
      header.className = 'book-page-header-num';
      header.textContent = `— ${idx + 1} —`;
      header.style.fontFamily = typography.bodyFont;
      header.style.fontSize = `${typography.fontSize}pt`;
      header.style.color = '#000';
      pageEl.appendChild(header);
    }

    const body = document.createElement('div');
    body.className = 'book-page-body';
    body.style.flex = '1';
    body.style.minHeight = '0';
    body.style.height = `${ph - 2 * mg - pageNumH}px`;
    body.style.overflow = 'hidden';
    body.style.position = 'relative';
    if (editable) {
      body.contentEditable = 'false';
      body.classList.add('is-editable-preview');
      body.spellcheck = false;
      body.setAttribute('role', 'textbox');
      body.setAttribute('aria-label', `Editable manuscript page ${idx + 1}`);
    }
    body.innerHTML = pageBlocks.map(b => b.html || '').join('') + getPlacedImagesForPage(idx, pw - 2 * mg);

    pageEl.appendChild(body);
    container.appendChild(pageEl);
  });

  return pages.length;
}

function spellIssueKey(iss) {
  return `${iss.start}|${iss.end}|${iss.text || ''}`;
}

function isSpellIssueRejected(iss) {
  return rejectedSpellIssues.some(r => r.start === iss.start && r.end === iss.end && r.text === iss.text);
}

function filterRejectedSpellingIssues(issues) {
  return (issues || []).filter(i => !isSpellIssueRejected(i));
}

function filterRejectedPreviewIssues(issues) {
  return (issues || []).filter(i => {
    if (i.type === 'spelling' || i.type === 'vocabulary' || !i.type) {
      return !isSpellIssueRejected(i);
    }
    return true;
  });
}

function getPreserveRangesForFix() {
  return rejectedSpellIssues.map(({ start, end }) => ({ start, end }));
}

function updateSpellingIssueCounts() {
  const count = sortedSpellingIssues.length;
  document.getElementById('changeCount').textContent = String(count);
  const aiCount = document.getElementById('aiIssueCount');
  if (aiCount) {
    const otherCount = (lastAiIssues || []).filter(
      i => i.type !== 'spelling' && i.type !== 'vocabulary'
    ).length;
    aiCount.textContent = String(count + otherCount);
  }
}

function rejectSpellingIssue(idx) {
  const iss = sortedSpellingIssues[idx];
  if (!iss || isSpellIssueRejected(iss)) return;

  rejectedSpellIssues.push({ start: iss.start, end: iss.end, text: iss.text || '' });
  lastSpellingIssues = filterRejectedSpellingIssues(lastSpellingIssues);
  lastPreviewIssues = filterRejectedPreviewIssues(lastPreviewIssues);
  sortedSpellingIssues = filterRejectedSpellingIssues(sortedSpellingIssues);

  if (spellFocusIndex === idx) spellFocusIndex = null;
  else if (spellFocusIndex != null && spellFocusIndex > idx) spellFocusIndex -= 1;
  if (spellHoverIndex === idx) spellHoverIndex = null;
  else if (spellHoverIndex != null && spellHoverIndex > idx) spellHoverIndex -= 1;

  renderSpellingIssuesList(sortedSpellingIssues, { keepFocus: true });
  updateSpellingIssueCounts();
  scheduleUpdatePreview();
  saveCurrentAiState(lastAiResult).catch(() => {});
  showAttention(`Kept "${iss.text}" — auto-fix will not change this word`);
}

function sortSpellingIssuesAsc(issues) {
  return [...(issues || [])]
    .filter(i => i.type === 'spelling' || i.type === 'vocabulary' || !i.type)
    .sort((a, b) => (a.start || 0) - (b.start || 0) || (a.end || 0) - (b.end || 0));
}

function getSpellFocusIssue() {
  const idx = spellHoverIndex != null ? spellHoverIndex : spellFocusIndex;
  if (idx == null || idx < 0) return null;
  return sortedSpellingIssues[idx] || null;
}

function scrollToSpellMark(idx) {
  const iss = sortedSpellingIssues[idx];
  if (!iss) return;
  navigateToIssuePage(iss);
  requestAnimationFrame(() => {
    document.querySelectorAll('.spell-error-active').forEach(el => el.classList.remove('spell-error-active'));
    const mark = document.querySelector(`mark[data-spell-start="${iss.start}"]`);
    if (mark) {
      mark.classList.add('spell-error-active');
      mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
}

function findPreviewPageIndexForIssue(iss) {
  const start = Number(iss?.start);
  const end = Number(iss?.end ?? start + String(iss?.text || '').length);
  if (!Number.isFinite(start)) return -1;
  const exactMark = document.querySelector(
    `mark[data-issue-start="${start}"][data-issue-end="${end}"], mark[data-spell-start="${start}"]`
  );
  const exactPage = exactMark?.closest?.('.book-page');
  if (exactPage) {
    const virtualIdx = parseInt(exactPage.dataset.pageIndex, 10);
    if (Number.isFinite(virtualIdx)) return virtualIdx;
    const exactIdx = Array.from(document.querySelectorAll('#bookPages .book-page')).indexOf(exactPage);
    if (exactIdx >= 0) return exactIdx;
  }
  if (virtualPreviewPages.length) {
    let fallback = -1;
    for (let i = 0; i < virtualPreviewPages.length; i++) {
      const ranges = virtualPreviewPages[i]
        .filter(b => Number.isFinite(b.paraStart) && Number.isFinite(b.paraEnd))
        .map(b => [b.paraStart, b.paraEnd]);
      if (!ranges.length) continue;
      const pageStart = Math.min(...ranges.map(r => r[0]));
      const pageEnd = Math.max(...ranges.map(r => r[1]));
      if (start >= pageStart && start <= pageEnd) return i;
      if (fallback < 0 && end >= pageStart && start <= pageEnd) fallback = i;
    }
    return fallback;
  }
  const pages = Array.from(document.querySelectorAll('#bookPages .book-page'));
  let fallback = -1;
  for (let i = 0; i < pages.length; i++) {
    const pageStart = Number(pages[i].dataset.textStart);
    const pageEnd = Number(pages[i].dataset.textEnd);
    if (!Number.isFinite(pageStart) || !Number.isFinite(pageEnd)) continue;
    if (start >= pageStart && start <= pageEnd) return i;
    if (fallback < 0 && end >= pageStart && start <= pageEnd) fallback = i;
  }
  return fallback;
}

function pulsePreviewPage(index) {
  const pages = document.querySelectorAll('#bookPages .book-page');
  const page = virtualPreviewTotal ? pages[0] : pages[index];
  if (!page) return;
  page.classList.remove('page-locate-pulse');
  void page.offsetWidth;
  page.classList.add('page-locate-pulse');
  setTimeout(() => page.classList.remove('page-locate-pulse'), 1400);
}

function navigateToIssuePage(iss) {
  const pageIdx = findPreviewPageIndexForIssue(iss);
  if (pageIdx < 0) return false;
  showPreviewPage(pageIdx);
  pulsePreviewPage(pageIdx);
  setStatus('', `Located on page ${pageIdx + 1}`);
  return true;
}

function updateSpellingListActiveState() {
  document.querySelectorAll('.spelling-list-item').forEach(el => {
    const i = parseInt(el.dataset.spellIdx, 10);
    el.classList.toggle('active', spellFocusIndex === i || spellHoverIndex === i);
  });
}

function bindSpellingListHandlers() {
  document.querySelectorAll('.spelling-list-item').forEach(el => {
    const idx = parseInt(el.dataset.spellIdx, 10);
    el.querySelector('.spelling-keep-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      rejectSpellingIssue(idx);
    });
    el.addEventListener('mouseenter', () => {
      spellHoverIndex = idx;
      updatePreview();
      scrollToSpellMark(idx);
      updateSpellingListActiveState();
    });
    el.addEventListener('mouseleave', () => {
      spellHoverIndex = null;
      updatePreview();
      updateSpellingListActiveState();
      if (spellFocusIndex != null) scrollToSpellMark(spellFocusIndex);
    });
    el.addEventListener('click', () => {
      spellFocusIndex = idx;
      spellHoverIndex = null;
      updatePreview();
      scrollToSpellMark(idx);
      updateSpellingListActiveState();
    });
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      el.click();
    });
  });
}

function bindOtherIssueHandlers(issues) {
  document.querySelectorAll('.issue-item[data-issue-idx]').forEach(el => {
    const idx = parseInt(el.dataset.issueIdx, 10);
    const issue = issues[idx];
    const locate = () => {
      document.querySelectorAll('.issue-item.active').forEach(item => item.classList.remove('active'));
      el.classList.add('active');
      if (!navigateToIssuePage(issue)) {
        showAttention('Could not locate this issue in the current preview.');
      }
    };
    el.addEventListener('click', locate);
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      locate();
    });
  });
}

function renderSpellingIssuesList(issues, options = {}) {
  sortedSpellingIssues = sortSpellingIssuesAsc(filterRejectedSpellingIssues(issues));
  lastSpellingIssues = sortedSpellingIssues;
  if (!options.keepPreviewIssues) lastPreviewIssues = sortedSpellingIssues;
  if (!options.keepFocus) {
    spellFocusIndex = null;
    spellHoverIndex = null;
  }
  document.getElementById('changeCount').textContent = sortedSpellingIssues.length;

  const list = document.getElementById('changesList');
  if (options.uploadedPending) {
    list.innerHTML = '<p style="font-size:0.8rem;color:var(--muted);padding:12px;text-align:center;">File loaded. Click <strong>Analyze with AI</strong> to check spelling &amp; grammar.</p>';
    return;
  }
  if (!sortedSpellingIssues.length) {
    list.innerHTML = '<p style="font-size:0.8rem;color:var(--success);padding:8px;">✓ No spelling mistakes found.</p>';
    return;
  }

  list.innerHTML = '<p style="font-size:0.68rem;color:var(--muted);margin:0 0 8px;padding:0 4px;">Mistakes in order (top → bottom). Hover or click to locate. Click <strong>Cancel</strong> to keep your word — auto-fix will skip it.</p>' +
    sortedSpellingIssues.map((iss, idx) => {
      const isVocab = iss.type === 'vocabulary';
      const tag = isVocab ? 'VOCAB' : 'SPELL';
      return `
      <div class="spelling-list-item ${isVocab ? 'vocabulary' : ''}" data-spell-idx="${idx}" role="button" tabindex="0">
        <div class="spelling-list-item-body">
          <span class="issue-num">#${idx + 1}</span>
          <strong style="font-size:0.62rem;color:${isVocab ? '#edc108' : '#d32f2f'};">${tag}</strong>
          <span class="change-from">${escapeHtml(iss.text || '')}</span>
          ${iss.suggestion ? ` → <span class="change-to">${escapeHtml(iss.suggestion)}</span>` : ''}
        </div>
        <button type="button" class="spelling-keep-btn" title="Keep original word — auto-fix will not change this">Cancel</button>
      </div>`;
    }).join('');

  bindSpellingListHandlers();
}

function highlightPreviewText(text, issues, paraStart = 0, focusIssue = null) {
  if (lastFixHighlights.length) {
    return highlightFixGreen(text, lastFixHighlights, paraStart);
  }
  return highlightSpellingRed(text, issues, paraStart, focusIssue);
}

function mergeAdjacentRanges(ranges) {
  if (!ranges.length) return [];
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const out = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const prev = out[out.length - 1];
    const cur = sorted[i];
    if (cur.start <= prev.end + 1) {
      prev.end = Math.max(prev.end, cur.end);
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

function computeChangeRangesSimple(before, after, baseOffset = 0) {
  const ranges = [];
  let i = 0;
  let j = 0;
  while (j < after.length) {
    if (i < before.length && before[i] === after[j]) {
      i++;
      j++;
      continue;
    }
    const startJ = j;
    while (j < after.length && (i >= before.length || before[i] !== after[j])) {
      j++;
      if (i < before.length) i++;
    }
    if (j > startJ) ranges.push({ start: baseOffset + startJ, end: baseOffset + j });
  }
  return ranges;
}

function computeChangeRangesByParagraph(before, after, baseOffset = 0) {
  const bParas = before.split(/\n\n/);
  const aParas = after.split(/\n\n/);
  const ranges = [];
  let offset = baseOffset;
  const maxLen = Math.max(bParas.length, aParas.length);
  for (let idx = 0; idx < maxLen; idx++) {
    const b = bParas[idx] ?? '';
    const a = aParas[idx] ?? '';
    if (b !== a) ranges.push(...computeChangeRangesSimple(b, a, offset));
    offset += a.length + (idx < maxLen - 1 ? 2 : 0);
  }
  return mergeAdjacentRanges(ranges);
}

function computeChangeRanges(before, after, baseOffset = 0) {
  if (before === after) return [];
  if (before.length > 80000 || after.length > 80000) {
    return computeChangeRangesByParagraph(before, after, baseOffset);
  }
  return mergeAdjacentRanges(computeChangeRangesSimple(before, after, baseOffset));
}

function formatInlineManuscript(text, state = { bold: false }) {
  let html = '';
  let i = 0;
  while (i < text.length) {
    const marker = text.indexOf('**', i);
    if (marker < 0) {
      html += escapeHtml(text.slice(i));
      break;
    }
    html += escapeHtml(text.slice(i, marker));
    html += state.bold ? '</strong>' : '<strong>';
    state.bold = !state.bold;
    i = marker + 2;
  }
  return html;
}

function highlightFixGreen(text, fixes, paraStart = 0) {
  const local = (fixes || [])
    .filter(f => f.start < paraStart + text.length && f.end > paraStart)
    .map(f => ({
      start: Math.max(0, f.start - paraStart),
      end: Math.min(text.length, f.end - paraStart),
    }))
    .filter(f => f.end > f.start)
    .sort((a, b) => a.start - b.start);

  if (!local.length) return escapeHtml(text).replace(/\n/g, '<br>');

  let html = '';
  let pos = 0;
  for (const fix of local) {
    if (fix.start < pos) continue;
    html += escapeHtml(text.slice(pos, fix.start));
    html += `<mark class="spell-fix-green" title="Auto-fixed">${escapeHtml(text.slice(fix.start, fix.end))}</mark>`;
    pos = fix.end;
  }
  html += escapeHtml(text.slice(pos));
  return html.replace(/\n/g, '<br>');
}

function highlightSpellingRed(text, issues, paraStart = 0, focusIssue = null) {
  let spelling = (issues || [])
    .filter(i => {
      const end = i.end ?? (i.start + (i.text || '').length);
      return i.start < paraStart + text.length && end > paraStart;
    })
    .map(i => {
      const end = i.end ?? (i.start + (i.text || '').length);
      return {
        start: Math.max(0, i.start - paraStart),
        end: Math.min(text.length, end - paraStart),
        globalStart: i.start,
        globalEnd: end,
        suggestion: i.suggestion || '',
        message: i.message || '',
        type: i.type || 'spelling',
      };
    })
    .filter(i => i.end > i.start)
    .sort((a, b) => a.start - b.start);

  if (!spelling.length) return formatInlineManuscript(text).replace(/\n/g, '<br>');

  let html = '';
  let pos = 0;
  for (const iss of spelling) {
    if (iss.start < pos) continue;
    html += escapeHtml(text.slice(pos, iss.start));
    const title = escapeHtml((iss.message || 'Spelling') + (iss.suggestion ? ' → ' + iss.suggestion : ''));
    const activeClass = focusIssue && iss.globalStart === focusIssue.start && iss.globalEnd === focusIssue.end
      ? ' spell-error-active'
      : '';
    html += `<mark class="spell-error-red${activeClass}" data-spell-start="${iss.globalStart}" data-issue-start="${iss.globalStart}" data-issue-end="${iss.globalEnd}" data-issue-type="${escapeHtml(iss.type)}" title="${title}">${escapeHtml(text.slice(iss.start, iss.end))}</mark>`;
    pos = iss.end;
  }
  html += escapeHtml(text.slice(pos));
  return html.replace(/\n/g, '<br>');
}

function updatePreviewNav() {
  const countLabel = document.getElementById('previewPageCount');
  const prev = document.getElementById('previewPrevBtn');
  const next = document.getElementById('previewNextBtn');
  const jumpInput = document.getElementById('previewPageJumpInput');
  const pages = document.querySelectorAll('#bookPages .book-page');
  const total = Math.max(1, virtualPreviewTotal || pages.length || 1);
  const current = total ? previewPageIndex + 1 : 1;
  if (countLabel) countLabel.textContent = `/ ${total}`;
  if (prev) prev.disabled = previewPageIndex <= 0;
  if (next) next.disabled = previewPageIndex >= total - 1;
  if (jumpInput) {
    jumpInput.max = String(total);
    jumpInput.min = '1';
    jumpInput.value = String(current);
    jumpInput.classList.remove('is-invalid');
  }
}

function goToPreviewPageNumber(raw) {
  const pages = document.querySelectorAll('#bookPages .book-page');
  const total = virtualPreviewTotal || pages.length;
  if (!total) return false;
  const pageNum = parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(pageNum)) return false;
  const targetPage = Math.max(1, Math.min(pageNum, total));
  showPreviewPage(targetPage - 1);
  return true;
}

function submitPreviewPageJump() {
  const jumpInput = document.getElementById('previewPageJumpInput');
  if (!jumpInput) return;
  if (goToPreviewPageNumber(jumpInput.value)) return;
  jumpInput.classList.add('is-invalid');
  jumpInput.value = String(previewPageIndex + 1);
  jumpInput.select();
}

function showPreviewPage(index) {
  const pages = document.querySelectorAll('#bookPages .book-page');
  if (virtualPreviewTotal && virtualPreviewLayout) {
    renderVirtualPreviewPage(index);
    updatePreviewNav();
    scheduleFitPreview();
    return;
  }
  if (!pages.length) return;
  previewPageIndex = Math.max(0, Math.min(index, pages.length - 1));
  pages.forEach((p, i) => { p.style.display = i === previewPageIndex ? 'flex' : 'none'; });
  updatePreviewNav();
  scheduleFitPreview();
}

function initPreviewNav() {
  document.getElementById('previewPrevBtn')?.addEventListener('click', () => showPreviewPage(previewPageIndex - 1));
  document.getElementById('previewNextBtn')?.addEventListener('click', () => showPreviewPage(previewPageIndex + 1));

  const jumpInput = document.getElementById('previewPageJumpInput');
  jumpInput?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    submitPreviewPageJump();
  });
  jumpInput?.addEventListener('blur', () => {
    if (!jumpInput.value.trim()) {
      jumpInput.value = String(previewPageIndex + 1);
      return;
    }
    submitPreviewPageJump();
  });
  jumpInput?.addEventListener('input', () => jumpInput.classList.remove('is-invalid'));
}

function getPreviewZoomMultiplier() {
  return PREVIEW_ZOOM_STEPS[previewZoomIndex] ?? 1;
}

function updatePreviewZoomUI() {
  const label = document.getElementById('previewZoomLabel');
  const out = document.getElementById('previewZoomOutBtn');
  const inn = document.getElementById('previewZoomInBtn');
  const pct = Math.round(getPreviewZoomMultiplier() * 100);
  if (label) label.textContent = `${pct}%`;
  if (out) out.disabled = previewZoomIndex <= 0;
  if (inn) inn.disabled = previewZoomIndex >= PREVIEW_ZOOM_STEPS.length - 1;
}

function setPreviewZoomIndex(idx) {
  previewZoomIndex = Math.max(0, Math.min(PREVIEW_ZOOM_STEPS.length - 1, idx));
  scheduleFitPreview();
}

function initPreviewZoom() {
  document.getElementById('previewZoomOutBtn')?.addEventListener('click', () => {
    setPreviewZoomIndex(previewZoomIndex - 1);
  });
  document.getElementById('previewZoomInBtn')?.addEventListener('click', () => {
    setPreviewZoomIndex(previewZoomIndex + 1);
  });
  document.getElementById('previewZoomResetBtn')?.addEventListener('click', () => {
    setPreviewZoomIndex(PREVIEW_ZOOM_STEPS.indexOf(1));
  });

  const scrollEl = document.querySelector('.preview-scroll');
  scrollEl?.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    setPreviewZoomIndex(previewZoomIndex + (e.deltaY < 0 ? 1 : -1));
  }, { passive: false });
}

function fitPreviewToContainer() {
  const scrollEl = document.querySelector('.preview-scroll');
  const stack = document.getElementById('bookPages');
  const fit = document.getElementById('previewFit');
  if (!scrollEl || !stack || !fit) return;

  stack.style.transform = '';
  stack.style.transformOrigin = '';
  stack.style.width = '';
  fit.style.width = '';
  fit.style.height = '';

  const pages = stack.querySelectorAll('.book-page');
  const page = pages[previewPageIndex] || pages[0];
  if (!page) return;

  const availW = scrollEl.clientWidth - 32;
  const availH = scrollEl.clientHeight - 24;
  const pageW = page.offsetWidth;
  const pageH = page.offsetHeight;
  if (availW < 80 || availH < 80 || pageW < 1 || pageH < 1) return;

  const fitScale = Math.min(1, availW / pageW, availH / pageH);
  const userMult = getPreviewZoomMultiplier();
  const scale = fitScale * userMult;

  fit.style.width = `${Math.ceil(pageW * scale)}px`;
  fit.style.height = `${Math.ceil(pageH * scale)}px`;
  stack.style.width = `${pageW}px`;
  stack.style.transformOrigin = 'top center';
  stack.style.transform = `scale(${scale})`;

  scrollEl.classList.toggle('preview-scroll--zoomed', userMult > 1.001);
  updatePreviewZoomUI();
}

function scheduleFitPreview() {
  requestAnimationFrame(() => requestAnimationFrame(fitPreviewToContainer));
}

function showPreviewLoading(msg) {
  if (document.body.classList.contains('ai-busy')) return;
  const ov = document.getElementById('previewLoadingOverlay');
  if (!ov) return;
  const textEl = ov.querySelector('.preview-loading-text');
  if (textEl) textEl.textContent = msg || 'Updating preview…';
  ov.classList.add('active');
  ov.setAttribute('aria-hidden', 'false');
}

function hidePreviewLoading() {
  const ov = document.getElementById('previewLoadingOverlay');
  if (!ov) return;
  ov.classList.remove('active');
  ov.setAttribute('aria-hidden', 'true');
}

function scheduleUpdatePreview(options = {}) {
  if (suppressPreviewSchedule) return;
  if (options.forExport) {
    updatePreview(options);
    return;
  }
  if (options.immediate) {
    updatePreview(options);
    return;
  }

  const token = ++previewUpdateToken;
  clearTimeout(previewUpdateTimer);
  const text = document.getElementById('sampleText')?.value || '';
  const showLoader = text.length > 4000;

  if (showLoader) showPreviewLoading('Updating preview…');

  previewUpdateTimer = setTimeout(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (token !== previewUpdateToken) {
          hidePreviewLoading();
          return;
        }
        updatePreview(options);
        hidePreviewLoading();
      });
    });
  }, showLoader ? 50 : 0);
}

function updatePreview(options = {}) {
  const savedScroll = preserveSettingsScrollTop();
  const stack = document.getElementById('bookPages');
  const fit = document.getElementById('previewFit');
  if (stack) stack.style.transform = '';
  if (fit) {
    fit.style.height = '';
    fit.classList.remove('preview-fit--empty');
  }
  const forExport = options.forExport === true;
  const s = getSettings();
  const size = s.size;
  const tpl = s.template;
  const text = s.text;
  const issues = options.issues || lastPreviewIssues || lastSpellingIssues;
  const focusIssue = options.forExport ? null : getSpellFocusIssue();

  const inchMargin = { 15: 0.75, 20: 1, 25: 1.25 };
  let pw, ph, mg;
  if (size.unit === 'mm') {
    pw = mmToPx(size.w); ph = mmToPx(size.h);
    mg = mmToPx(s.margin);
  } else {
    pw = Math.round(size.w * 96); ph = Math.round(size.h * 96);
    if (s.marginIsCustom) mg = mmToPx(s.margin);
    else mg = Math.round((inchMargin[s.margin] || 1) * 96);
  }

  document.getElementById('previewSizeLabel').innerHTML = '<strong>' + size.label + '</strong>';

  const container = document.getElementById('bookPages');
  const fs = s.fontSize;
  const pageBg = forExport ? PDF_PAPER_WHITE : '#ffffff';
  const showPageNumbers = !manuscriptHasPageNumbers(text);
  const pageNumH = showPageNumbers ? 28 : 0;
  const contentHeight = ph - 2 * mg - pageNumH;
  const typography = { bodyFont: s.bodyFont, fontSize: fs, lineHeight: s.lineHeight };
  const measurer = getPageMeasurer(pw, mg, typography);
  const blocksPreview = buildContentBlocks(s, text, issues, forExport, tpl, focusIssue);

  const hasContent = text.trim().length > 0 || s.author || s.chapter || s.title;

  if (!hasContent && !forExport) {
    if (fit) fit.classList.add('preview-fit--empty');
    container.classList.add('is-empty-preview');
    container.innerHTML = `
      <div class="landing-upload-state" id="landingUploadDropzone" role="button" tabindex="0" aria-label="Upload manuscript">
          <div style="font-size:2.5rem;margin-bottom:12px;opacity:0.5;">📖</div>
          <p class="landing-upload-title">Upload Manuscript</p>
          <p class="landing-upload-sub">TXT, DOCX, or PDF</p>
      </div>`;
    document.getElementById('pageDimInfo').textContent = 'Page: ' + size.label;
    restoreSettingsScrollTop(savedScroll);
    previewPageIndex = 0;
    virtualPreviewPages = [];
    virtualPreviewLayout = null;
    virtualPreviewTotal = 0;
    updatePreviewNav();
    scheduleFitPreview();
    syncToolPreviewPopupIfOpen();
    return;
  }

  container.classList.remove('is-empty-preview');

  const blocks = blocksPreview;
  if (!text.trim() && blocks.length === 1 && blocks[0].type === 'header') {
    blocks.push({
      type: 'para',
      plain: '',
      html: `<p style="text-align:center;color:#ccc;font-style:italic;margin-top:2rem;font-size:${fs}pt;">Manuscript text will show here…</p>`,
      paraStart: 0,
    });
  }

  const colStyle = s.cols > 1 ? `column-count:${s.cols};column-gap:${Math.round(fs * 1.8)}px;` : '';
  const pages = paginateBlocks(blocks, {
    measurer,
    contentHeight,
    paraStyle: '',
    textAlign: s.textAlign,
    colStyle,
    issues,
    forExport,
    fs,
    maxPages: Infinity,
  });

  const pageCount = renderBookPages(pages, {
    container,
    pw,
    ph,
    mg,
    pageBg,
    typography,
    showPageNumbers,
    editable: !forExport,
    virtual: !forExport,
  });

  document.getElementById('pageDimInfo').textContent =
    pages.truncated ? `${pageCount}+ pages · ${size.label}` : (pageCount > 1 ? `${pageCount} pages · ${size.label}` : `Page 1 · ${size.label}`);
  restoreSettingsScrollTop(savedScroll);
  if (forExport) {
    document.querySelectorAll('#bookPages .book-page').forEach(p => { p.style.display = 'flex'; });
  } else {
    previewPageIndex = Math.min(previewPageIndex, Math.max(0, pageCount - 1));
    showPreviewPage(previewPageIndex);
    scheduleFitPreview();
  }
  syncToolPreviewPopupIfOpen();
}

async function apiJson(path, body, options = {}) {
  let res;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
      body: body instanceof FormData ? body : JSON.stringify(body),
      signal: options.signal,
    });
  } catch (e) {
    if (e.name === 'AbortError' || options.signal?.aborted) throw new Error('Cancelled');
    throw new Error('Cannot reach Chaptera backend. Start the app server and try again.');
  }
  let data;
  try {
    data = await res.json();
  } catch (_) {
    throw new Error(res.ok ? 'Invalid server response' : `Request failed (${res.status})`);
  }
  if (!res.ok) throw new Error(data.error || 'Server error');
  return data;
}

async function startServerAiJob(kind, payload, options = {}) {
  const started = await apiJson('/api/job/start', { kind, ...payload }, options);
  if (!started.job_id) throw new Error('Could not start background job');
  return started.job_id;
}

async function pollServerAiJob(jobId, options = {}) {
  while (true) {
    if (!options.ignoreAi) ensureAiActive();
    const data = await apiJson('/api/job/status', { job_id: jobId }, options);
    if (data.status === 'done') return data.result || {};
    if (data.status === 'error') throw new Error(data.error || 'Background job failed');
    if (!options.ignoreAi) await waitWhileAiPaused();
    await new Promise(resolve => setTimeout(resolve, 900));
  }
}

function beginAiTask() {
  aiCancelled = false;
  setAiPaused(false);
  aiAbortController = new AbortController();
  return aiAbortController.signal;
}

function ensureAiActive() {
  if (aiCancelled) throw new Error('Cancelled');
}

function setAiPaused(paused) {
  aiPaused = !!paused;
  const ov = document.getElementById('aiProcessOverlay');
  const btn = document.getElementById('aiProcessPauseBtn');
  const title = document.getElementById('aiProcessTitle');
  const sub = document.getElementById('aiProcessSub');
  ov?.classList.toggle('is-paused', aiPaused);
  if (btn) btn.textContent = aiPaused ? 'Resume' : 'Pause';
  if (aiPaused) {
    aiPausedSubText = sub?.textContent || aiPausedSubText;
    if (title) title.textContent = 'Paused';
    if (sub) sub.textContent = 'Paused. Click Resume to continue.';
  } else {
    if (title && ov?.classList.contains('is-processing')) title.textContent = 'Processing';
    if (sub && aiPausedSubText) sub.textContent = aiPausedSubText;
    aiPauseWaiters.splice(0).forEach(resolve => resolve());
  }
}

function toggleAiPaused() {
  if (aiCancelled) return;
  setAiPaused(!aiPaused);
}

async function waitWhileAiPaused() {
  while (aiPaused && !aiCancelled) {
    await new Promise(resolve => aiPauseWaiters.push(resolve));
  }
  ensureAiActive();
}

function cancelAiProcessing() {
  aiCancelled = true;
  setAiPaused(false);
  aiAbortController?.abort();
  aiAbortController = null;
  hideAiProcessing();
  showAttention('Processing cancelled.');
  setStatus('', 'Cancelled');
}

function setAiCancelVisible(visible) {
  const btn = document.getElementById('aiProcessCancelBtn');
  if (!btn) return;
  btn.hidden = !visible;
}

function setAiPauseVisible(visible) {
  const btn = document.getElementById('aiProcessPauseBtn');
  if (!btn) return;
  btn.hidden = !visible;
  if (!visible) setAiPaused(false);
}

async function refreshSpellingPreview() {
  if (skipLiveSpellCheck || !hasAiAnalysisRun) return;
  const text = document.getElementById('sampleText').value;
  if (!text.trim()) {
    lastSpellingIssues = [];
    lastPreviewIssues = [];
    sortedSpellingIssues = [];
    spellFocusIndex = null;
    spellHoverIndex = null;
    updatePreview();
    renderSpellingIssuesList([]);
    return;
  }
  try {
    const data = await apiJson('/api/preview-check', { text, locale: targetLocale });
    if (skipLiveSpellCheck || !hasAiAnalysisRun) return;
    renderSpellingIssuesList(data.spelling_issues || []);
    updatePreview();
    if (sortedSpellingIssues.length) {
      setStatus('', `${sortedSpellingIssues.length} spelling mistake(s) — hover list to locate each`);
    }
  } catch (e) {
    updatePreview();
  }
}

function stripManuscriptImageMarkers(text) {
  return String(text || '').replace(MANUSCRIPT_IMAGE_RE, ' ');
}

function keywordHits(text, words) {
  return words.reduce((count, word) => count + (text.includes(word) ? 1 : 0), 0);
}

function inferBookProfile(text, data = {}) {
  const clean = stripManuscriptImageMarkers(text).toLowerCase();
  const wordCount = clean.match(/\b[a-z']+\b/g)?.length || 0;
  const grade = Number(data.readability?.grade);
  const score = Number(data.readability?.score);
  let audience = 'General readers';
  let ageCategory = 'Age 16+';
  if (wordCount < 1200) audience = 'Short-form readers';
  if (Number.isFinite(grade)) {
    if (grade <= 2) { audience = 'Early readers'; ageCategory = 'Age 5-7'; }
    else if (grade <= 4) { audience = 'Children / young readers'; ageCategory = 'Age 8-10'; }
    else if (grade <= 7) { audience = 'Middle grade readers'; ageCategory = 'Age 10-13'; }
    else if (grade <= 10) { audience = 'Young adult and general readers'; ageCategory = 'Age 13-17'; }
    else { audience = 'Adult / advanced readers'; ageCategory = 'Age 18+'; }
  } else if (Number.isFinite(score)) {
    if (score >= 90) { audience = 'Children / easy readers'; ageCategory = 'Age 7-10'; }
    else if (score >= 75) { audience = 'Middle grade readers'; ageCategory = 'Age 10-13'; }
    else if (score >= 60) { audience = 'Young adult and general readers'; ageCategory = 'Age 13-17'; }
    else if (score < 45) { audience = 'Adult / advanced readers'; ageCategory = 'Age 18+'; }
  }

  const genreScores = [
    ['Romance', ['love', 'heart', 'kiss', 'marriage', 'relationship', 'wedding', 'romantic']],
    ['Mystery / Thriller', ['murder', 'detective', 'clue', 'crime', 'secret', 'suspect', 'police', 'investigation']],
    ['Fantasy', ['kingdom', 'magic', 'dragon', 'wizard', 'spell', 'sword', 'prophecy', 'realm']],
    ['Science Fiction', ['space', 'planet', 'robot', 'alien', 'future', 'technology', 'galaxy', 'ship']],
    ['Horror', ['ghost', 'blood', 'death', 'dark', 'fear', 'scream', 'haunted', 'nightmare']],
    ['Self-help / Motivational', ['success', 'habit', 'mindset', 'goal', 'confidence', 'productivity', 'motivation']],
    ['Business / Finance', ['business', 'market', 'customer', 'company', 'profit', 'sales', 'investment', 'finance']],
    ['Academic / Educational', ['research', 'study', 'students', 'learning', 'chapter', 'theory', 'assignment', 'education']],
    ['Memoir / Biography', ['i was born', 'my childhood', 'my father', 'my mother', 'family', 'remember', 'journey']],
    ['Children / School Story', ['school', 'teacher', 'homework', 'friends', 'playground', 'classroom', 'children']],
  ].map(([label, words]) => ({ label, score: keywordHits(clean, words) }))
    .sort((a, b) => b.score - a.score);

  const best = genreScores[0];
  const genre = best && best.score > 0 ? best.label : 'General fiction / non-fiction';
  const confidence = best && best.score >= 4 ? 'High' : (best && best.score > 0 ? 'Medium' : 'Low');
  const lengthType = wordCount >= 50000 ? 'Full-length book' : (wordCount >= 15000 ? 'Novella / short book' : 'Short manuscript');
  return { audience, ageCategory, genre, confidence, lengthType, wordCount };
}

function buildBookProfileHtml(text, data = {}) {
  const profile = inferBookProfile(text, data);
  return `
    <div class="book-profile-card">
      <div class="book-profile-title">Book Profile</div>
      <div class="book-profile-row"><span>Who can read</span><strong>${escapeHtml(profile.ageCategory)} · ${escapeHtml(profile.audience)}</strong></div>
      <div class="book-profile-row"><span>Genre</span><strong>${escapeHtml(profile.genre)}</strong></div>
      <div class="book-profile-row"><span>Length</span><strong>${escapeHtml(profile.lengthType)} · ${profile.wordCount.toLocaleString()} words</strong></div>
      <div class="book-profile-note">Auto generated from manuscript language and readability. Confidence: ${escapeHtml(profile.confidence)}.</div>
    </div>`;
}

function appendBookProfileToPanel(data = {}) {
  const list = document.getElementById('changesList');
  if (!list) return;
  list.insertAdjacentHTML('beforeend', buildBookProfileHtml(getManuscriptText(), data));
}

function renderAiPanel(data) {
  lastAiResult = data || null;
  const acc = data.accuracy || {};
  document.getElementById('accPercent').textContent = (acc.percent ?? '—') + (acc.percent != null ? '%' : '');
  document.getElementById('readScore').textContent = data.readability?.score ?? '—';
  document.getElementById('aiIssueCount').textContent = data.issue_count ?? 0;
  const ab = document.getElementById('accuracyBadge');
  if (acc.percent != null) {
    ab.style.display = 'inline';
    ab.textContent = 'Accuracy: ' + acc.percent + '%';
  }

  lastAiIssues = data.issues || [];
  const list = document.getElementById('changesList');

  if (lastFixHighlights.length) {
    skipLiveSpellCheck = true;
    sortedSpellingIssues = [];
    lastSpellingIssues = [];
    lastPreviewIssues = [];
    document.getElementById('changeCount').textContent = String(lastFixHighlights.length);
    list.innerHTML = `<p style="font-size:0.8rem;color:var(--success);padding:8px;">✓ ${lastFixHighlights.length} correction(s) applied — green highlights in preview</p>`;
    appendBookProfileToPanel(data);
    scheduleUpdatePreview();
    return;
  }

  skipLiveSpellCheck = false;
  const spellOnly = (data.spelling_issues && data.spelling_issues.length)
    ? data.spelling_issues
    : (data.issues || []).filter(i => i.type === 'spelling' || i.type === 'vocabulary');
  const otherIssues = lastAiIssues.filter(i => i.type !== 'spelling' && i.type !== 'vocabulary');
  lastPreviewIssues = filterRejectedPreviewIssues([...spellOnly, ...otherIssues])
    .sort((a, b) => (a.start || 0) - (b.start || 0) || (a.end || 0) - (b.end || 0));

  if (!spellOnly.length && !otherIssues.length) {
    list.innerHTML = '<p style="font-size:0.8rem;color:var(--success);padding:8px;">✓ No issues found!</p>';
    sortedSpellingIssues = [];
    lastSpellingIssues = [];
    document.getElementById('changeCount').textContent = '0';
    appendBookProfileToPanel(data);
    scheduleUpdatePreview();
    return;
  }

  if (spellOnly.length) {
    renderSpellingIssuesList(spellOnly, { keepPreviewIssues: true });
    lastSpellingIssues = sortedSpellingIssues;
  } else {
    sortedSpellingIssues = [];
    lastSpellingIssues = [];
    document.getElementById('changeCount').textContent = '0';
    list.innerHTML = '';
  }

  if (otherIssues.length) {
    const visibleOtherIssues = otherIssues;
    const extra = visibleOtherIssues.map((iss, idx) => `
      <div class="issue-item ${iss.type}" data-issue-idx="${idx}" role="button" tabindex="0">
        <strong style="font-size:0.65rem;text-transform:uppercase;">${iss.type}</strong>
        <div>${escapeHtml(iss.message)}</div>
        ${iss.suggestion ? `<div class="issue-sug">→ ${escapeHtml(iss.suggestion)}</div>` : ''}
      </div>
    `).join('');
    list.insertAdjacentHTML('beforeend', '<p style="font-size:0.68rem;color:var(--muted);margin:12px 0 6px;">Other issues</p>' + extra);
    bindOtherIssueHandlers(visibleOtherIssues);
  }
  appendBookProfileToPanel(data);
  scheduleUpdatePreview();
}

function showAiProcessing(title, sub, pageCurrent = 0, pageTotal = 0) {
  const ov = document.getElementById('aiProcessOverlay');
  const spinner = document.getElementById('aiProcessSpinner');
  const check = document.getElementById('aiProcessCheck');
  document.getElementById('aiProcessTitle').textContent = title || 'Processing';
  document.getElementById('aiProcessSub').textContent = sub || 'Please wait…';
  updateAiProcessProgress(pageCurrent, pageTotal, sub);
  setAiCancelVisible(true);
  setAiPauseVisible(true);
  spinner.style.display = '';
  check.hidden = true;
  check.setAttribute('aria-hidden', 'true');
  ov.classList.add('active', 'is-processing');
  ov.classList.remove('is-completed');
  ov.setAttribute('aria-hidden', 'false');
  document.body.classList.add('ai-busy');
  document.getElementById('loadingBar').classList.add('active');
}

function updateAiProcessProgress(current, total, sub) {
  if (aiPaused) {
    if (sub) aiPausedSubText = sub;
    return;
  }
  const pageEl = document.getElementById('aiProcessPage');
  const bar = document.getElementById('aiProcessBarFill');
  const subEl = document.getElementById('aiProcessSub');
  const safeTotal = Math.max(1, total || 1);
  const safeCurrent = Math.max(0, Math.min(current, safeTotal));
  if (pageEl) {
    pageEl.textContent = total > 0
      ? `Page ${safeCurrent || 1} / ${safeTotal}`
      : 'Preparing…';
  }
  if (bar) {
    const pct = total > 0 ? Math.round((safeCurrent / safeTotal) * 100) : 8;
    bar.style.width = `${Math.max(8, Math.min(100, pct))}%`;
  }
  if (sub && subEl) subEl.textContent = sub;
}

function getManuscriptPageTotal(text) {
  const previewPages = document.querySelectorAll('#bookPages .book-page').length;
  const estimatedPages = getApproxSourcePageCount(text) || 1;
  if (previewPages > 1 && text.trim()) return Math.max(previewPages, estimatedPages);
  return estimatedPages;
}

function getApproxSourcePageCount(text) {
  if (!text || !text.trim()) return 0;
  if (text.includes(PAGE_BREAK_MARKER)) return text.split(PAGE_BREAK_MARKER).length;
  return estimatePageCountFromWords(text);
}

function estimatePageCountFromWords(text) {
  const words = text.match(/\b\w+\b/g)?.length || 0;
  return Math.max(1, Math.ceil(words / 320));
}

function getLimitCheckedPageCount(text) {
  const pages = getManuscriptPageTotal(text);
  if (pages > MAX_MANUSCRIPT_PAGES) {
    showLimitAlert(`This manuscript is about ${pages} pages.`);
    return 0;
  }
  return pages;
}

function updateCurrentDraftAiJobProgress(page, total) {
  const draft = storageGet(CURRENT_DRAFT_STORAGE_KEY, null);
  if (!draft?.aiJob?.jobId) return;
  storageSet(CURRENT_DRAFT_STORAGE_KEY, {
    ...draft,
    aiJob: {
      ...draft.aiJob,
      page,
      total,
      progressUpdatedAt: new Date().toISOString(),
    },
    processing: true,
    updatedAt: new Date().toISOString(),
  });
}

function startProgressTicker(pageTotal, labelFn, intervalMs = 280, startAt = 0, persistProgress = false) {
  let page = Math.max(0, Math.min(pageTotal - 1, startAt || 0));
  const step = Math.max(1, Math.ceil(pageTotal / 24));
  updateAiProcessProgress(page, pageTotal, labelFn(page, pageTotal));
  const id = setInterval(() => {
    if (aiPaused) return;
    page = Math.min(pageTotal - 1, page + step);
    updateAiProcessProgress(page, pageTotal, labelFn(page, pageTotal));
    if (persistProgress) updateCurrentDraftAiJobProgress(page, pageTotal);
  }, intervalMs);
  return () => clearInterval(id);
}

async function analyzeChunksWithProgress(fullText, locale) {
  const signal = beginAiTask();
  const pageTotal = getManuscriptPageTotal(fullText);
  showAiProcessing('Processing', 'Analyzing spelling, grammar & readability…', 0, pageTotal);
  const stopTick = startProgressTicker(pageTotal, (p, t) => `Analyzing page ${p + 1} of ${t}…`, 280, 0, true);
  const preserved = preserveManuscriptImages(fullText);
  try {
    ensureAiActive();
    const payload = {
      text: preserved.stripped,
      locale,
      preserve_text: true,
      fast: false,
    };
    const jobId = await startServerAiJob('analyze', payload, { signal });
    await saveCurrentDraft({
      aiJob: { kind: 'analyze', jobId, locale, startedAt: new Date().toISOString() },
      processing: true,
    });
    const data = await pollServerAiJob(jobId, { signal });
    await waitWhileAiPaused();
    stopTick();
    updateAiProcessProgress(pageTotal, pageTotal, 'Complete!');
    await saveCurrentDraft({ aiJob: null, processing: false, analyzed: true });
    return data;
  } catch (err) {
    stopTick();
    throw err;
  }
}

async function fixChunksWithProgress(fullText, locale) {
  const signal = beginAiTask();
  const pageTotal = getManuscriptPageTotal(fullText);
  showAiProcessing('Processing', 'Applying spelling & grammar fixes…', 0, pageTotal);
  const stopTick = startProgressTicker(pageTotal, (p, t) => `Fixing page ${p + 1} of ${t}…`, 280, 0, true);
  const preserved = preserveManuscriptImages(fullText);
  try {
    ensureAiActive();
    const before = preserved.stripped;
    const payload = {
      text: preserved.stripped,
      locale,
      fast: true,
      preserve: [...getPreserveRangesForFix(), ...preserved.preserveRanges],
    };
    const jobId = await startServerAiJob('fix', payload, { signal });
    await saveCurrentDraft({
      aiJob: { kind: 'fix', jobId, locale, before, images: preserved.images, startedAt: new Date().toISOString() },
      processing: true,
    });
    const data = await pollServerAiJob(jobId, { signal });
    await waitWhileAiPaused();
    stopTick();
    updateAiProcessProgress(pageTotal, pageTotal, 'Complete!');
    const after = restoreManuscriptImages(data.text || before, preserved.images);
    const highlights = computeChangeRanges(before, data.text || before, 0);
    await saveCurrentDraft({ aiJob: null, processing: false, analyzed: true, fixed: true });
    return { ...data, text: after, fix_highlights: highlights };
  } catch (err) {
    stopTick();
    throw err;
  }
}

async function showAiCompleted(title, sub, delayMs = 450) {
  const ov = document.getElementById('aiProcessOverlay');
  const spinner = document.getElementById('aiProcessSpinner');
  const check = document.getElementById('aiProcessCheck');
  ov.classList.remove('is-processing');
  ov.classList.add('is-completed');
  setAiCancelVisible(false);
  setAiPauseVisible(false);
  spinner.style.display = 'none';
  check.hidden = false;
  check.setAttribute('aria-hidden', 'false');
  document.getElementById('aiProcessTitle').textContent = title || 'Completed';
  document.getElementById('aiProcessPage').textContent = 'Done';
  document.getElementById('aiProcessSub').textContent = sub || 'Done!';
  document.getElementById('aiProcessBarFill').style.width = '100%';
  await new Promise(r => setTimeout(r, delayMs));
  hideAiProcessing();
}

function hideAiProcessing() {
  const ov = document.getElementById('aiProcessOverlay');
  ov.classList.remove('active', 'is-processing', 'is-completed');
  ov.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('ai-busy');
  document.getElementById('loadingBar').classList.remove('active');
  setAiCancelVisible(false);
  setAiPauseVisible(false);
  aiAbortController = null;
  const bar = document.getElementById('aiProcessBarFill');
  if (bar) bar.style.width = '0%';
}

async function openSectionDuringProcessing(url, label) {
  if (document.body.classList.contains('ai-busy') || downloadJobActive) {
    try {
      saveCurrentDraft({ processing: true, downloadProcessing: downloadJobActive }).catch(() => {});
    } catch (_) {}
    openEmbeddedSection(url, label);
    return;
  }
  window.location.href = url;
  setStatus('green', label);
}

async function resumeAiJobFromDraft(draft) {
  const job = draft?.aiJob;
  if (!job?.jobId) return;
  const text = getManuscriptText();
  const pageTotal = getManuscriptPageTotal(text);
  const isFix = job.kind === 'fix';
  const title = isFix ? 'Resuming Auto Fix' : 'Resuming Analyze';
  const sub = isFix ? 'Background fixes are still running…' : 'Background analysis is still running…';
  showAiProcessing(title, sub, 0, pageTotal);
  const stopTick = startProgressTicker(pageTotal, (p, t) => `${title}: page ${p + 1} of ${t}…`, 500, job.page || 0, true);
  try {
    const data = await pollServerAiJob(job.jobId);
    stopTick();
    updateAiProcessProgress(pageTotal, pageTotal, 'Complete!');
    if (isFix) {
      const before = job.before || text;
      const fixed = restoreManuscriptImages(data.text || before, job.images || []);
      document.getElementById('sampleText').value = fixed;
      lastFixHighlights = computeChangeRanges(before, data.text || before, 0);
      lastSpellingIssues = [];
      lastPreviewIssues = [];
      sortedSpellingIssues = [];
      hasAiAnalysisRun = true;
      await showAiCompleted('Completed', 'Background fixes applied.');
      renderAiPanel({ ...data, text: fixed, fix_highlights: lastFixHighlights });
      await saveCurrentAiState(lastAiResult, { aiJob: null, processing: false, analyzed: true, fixed: true });
      setStatus('green', 'Background fixes completed');
    } else {
      hasAiAnalysisRun = true;
    saveRecentActivityItem({ analyzed: true });
    await showAiCompleted('Completed', `${data.issue_count ?? 0} issue(s) found · ${data.accuracy?.percent ?? '—'}% accuracy`);
    renderAiPanel(data);
    await saveCurrentAiState(data, { aiJob: null, processing: false, analyzed: true });
      setStatus('green', `Background analysis completed — ${data.issue_count ?? 0} issues`);
    }
  } catch (e) {
    stopTick();
    hideAiProcessing();
    if (e.message === 'Cancelled' || aiCancelled) return;
    await saveCurrentDraft({ aiJob: null, processing: false });
    throw e;
  }
}

async function runPythonAI() {
  const savedScroll = preserveSettingsScrollTop();
  closeAllCustomDropdowns();
  if (!requireManuscriptUploaded()) return;
  if (!requirePreviewConfirmed()) return;
  const text = document.getElementById('sampleText').value.trim();
  setStatus('', 'AI analyzing…');
  try {
    lastFixHighlights = [];
    rejectedSpellIssues = [];
    const data = await analyzeChunksWithProgress(text, targetLocale);
    hasAiAnalysisRun = true;
    saveRecentActivityItem({ analyzed: true });
    await showAiCompleted('Completed', `${data.issue_count} issue(s) found · ${data.accuracy?.percent}% accuracy`);
    renderAiPanel(data);
    await saveCurrentAiState(data, { analyzed: true, aiJob: null, processing: false });
    setStatus('green', `AI done — ${data.issue_count} issues · ${data.accuracy?.percent}% accuracy`);
  } catch (e) {
    hideAiProcessing();
    if (e.message === 'Cancelled' || aiCancelled) {
      setStatus('', 'Analysis cancelled');
      return;
    }
    showAttention('⚠ AI analysis failed: ' + e.message);
    setStatus('', 'AI error: ' + e.message + ' — Run: python app.py');
  } finally {
    restoreSettingsScrollTop(savedScroll);
  }
}

async function applyPythonFix() {
  const savedScroll = preserveSettingsScrollTop();
  closeAllCustomDropdowns();
  if (!requireManuscriptUploaded()) return;
  if (!requirePreviewConfirmed()) return;
  if (!hasAiAnalysisRun) {
    showAttention('Please click Analyze first, then use Auto Fix.');
    setStatus('', 'Run Analyze before Auto Fix');
    return;
  }
  const text = document.getElementById('sampleText').value;
  setStatus('', 'Applying corrections…');
  try {
    const data = await fixChunksWithProgress(text, targetLocale);
    const fixed = data.text || text;
    document.getElementById('sampleText').value = fixed;
    lastFixHighlights = data.fix_highlights || [];
    lastSpellingIssues = [];
    lastPreviewIssues = [];
    sortedSpellingIssues = [];
    saveRecentActivityItem({ analyzed: true, fixed: true });
    const keptCount = rejectedSpellIssues.length;
    rejectedSpellIssues = [];
    skipLiveSpellCheck = true;
    const doneMsg = keptCount
      ? `Fixes applied — ${keptCount} word(s) kept as you chose`
      : 'All fixes applied — corrected words highlighted in green';
    await showAiCompleted('Completed', doneMsg);
    renderAiPanel(data);
    await saveCurrentAiState(data, { analyzed: true, fixed: true, aiJob: null, processing: false });
    setStatus('green', doneMsg);
  } catch (e) {
    hideAiProcessing();
    if (e.message === 'Cancelled' || aiCancelled) {
      setStatus('', 'Auto-fix cancelled');
      return;
    }
    showAttention('⚠ Auto-fix failed: ' + e.message);
    setStatus('', 'Fix failed: ' + e.message);
  } finally {
    restoreSettingsScrollTop(savedScroll);
  }
}

async function runAutoProofReadFlow() {
  closeAllToolFlyouts();
  if (!requireManuscriptUploaded()) return;
  if (!requirePreviewConfirmed()) return;
  showAttention('Auto Proof Read started: analyze, then auto-fix.');
  setStatus('', 'Auto Proof Read running...');
  await runPythonAI();
  if (aiCancelled) return;
  await applyPythonFix();
}

function openProofreadWorkflowTool(toolName) {
  const item = document.querySelector(`.tool-rail-item[data-tool="${toolName}"]`);
  if (!item) return false;
  openToolFlyout(item);
  return true;
}

function initProofreadPanelControls() {
  document.querySelectorAll('[data-proof-action]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      const action = btn.dataset.proofAction;
      if (action === 'upload') {
        if (!canAcceptNewUpload()) {
          showUploadCancelOption();
          showAttention('A manuscript is already loaded. Use Upload > Cancel file to remove it.');
          setStatus('', 'Use Upload > Cancel file to replace file');
          return;
        }
        closeAllToolFlyouts();
        const fileInput = document.getElementById('manuscriptFile');
        if (fileInput && !fileInput.disabled) fileInput.click();
        return;
      }
      if (action === 'layout') {
        openProofreadWorkflowTool('layout');
        return;
      }
      if (action === 'formatting') {
        openProofreadWorkflowTool('typography');
        return;
      }
      if (action === 'image') {
        openProofreadWorkflowTool('image');
        return;
      }
      if (action === 'analyze') {
        closeAllToolFlyouts();
        runPythonAI();
        return;
      }
      if (action === 'fix') {
        closeAllToolFlyouts();
        applyPythonFix();
      }
    });
  });

  document.querySelectorAll('[data-proof-locale]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      selectLocale(btn.dataset.proofLocale);
    });
  });

  document.querySelectorAll('[data-proof-download]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      if (!requireManuscriptForDownload()) return;
      const fmt = btn.dataset.proofDownload;
      if (fmt === 'pdf') downloadPDF();
      else if (fmt === 'word') downloadWord();
      else if (fmt === 'txt') downloadTXT();
    });
  });
}

function hasUploadedFile() {
  return activeManuscriptFilename !== null;
}

function canAcceptNewUpload() {
  return !hasUploadedFile() && !hasManuscriptContent() && !uploadUiLocked;
}

function setUploadUIState(hasFile, filename) {
  const uploadSection = document.getElementById('uploadSection');
  const uploadPicker = document.getElementById('uploadPicker');
  const uploadFileRow = document.getElementById('uploadFileRow');
  const uploadFileName = document.getElementById('uploadFileName');
  const uploadLoadedNote = document.getElementById('uploadLoadedNote');
  const uploadLoadedFileName = document.getElementById('uploadLoadedFileName');
  const manuscriptFile = document.getElementById('manuscriptFile');

  activeManuscriptFilename = hasFile ? (filename || 'File uploaded') : null;

  uploadSection?.classList.toggle('state-loaded', !!hasFile);

  if (uploadPicker) {
    uploadPicker.hidden = !!hasFile;
    uploadPicker.style.display = hasFile ? 'none' : '';
  }
  if (uploadFileRow) {
    uploadFileRow.hidden = !hasFile;
    uploadFileRow.style.display = hasFile ? 'flex' : 'none';
  }
  if (uploadFileName) {
    uploadFileName.textContent = hasFile ? ('✓ ' + activeManuscriptFilename) : '';
  }
  if (uploadLoadedNote) {
    uploadLoadedNote.hidden = !hasFile;
  }
  if (uploadLoadedFileName) {
    uploadLoadedFileName.textContent = hasFile ? activeManuscriptFilename : '';
  }
  if (manuscriptFile) {
    manuscriptFile.disabled = !!hasFile;
    manuscriptFile.value = '';
  }
}

function showUploadCancelOption() {
  if (!hasUploadedFile()) return false;
  const uploadItem = document.querySelector('.tool-rail-item[data-tool="upload"]');
  if (!uploadItem) return false;
  setUploadUIState(true, activeManuscriptFilename);
  openToolFlyout(uploadItem);
  return true;
}

async function clearUploadedManuscript() {
  uploadRequestId += 1;
  uploadUiLocked = true;
  currentWorkCompleted = false;
  clearTimeout(draftAutosaveTimer);
  currentWorkId = makeLibraryId('work');
  lastFixHighlights = [];
  manuscriptPageLocked = false;
  undoStack = [];
  redoStack = [];
  setPreviewConfirmState(false);

  try {
    await clearCurrentDraft();
    const sample = document.getElementById('sampleText');
    if (sample) sample.value = '';
    setUploadUIState(false);

    skipLiveSpellCheck = true;
    lastSpellingIssues = [];
    lastPreviewIssues = [];
    lastAiIssues = [];
    hasAiAnalysisRun = false;
    sortedSpellingIssues = [];
    rejectedSpellIssues = [];
    spellFocusIndex = null;
    spellHoverIndex = null;

    const acc = document.getElementById('accPercent');
    const read = document.getElementById('readScore');
    const issues = document.getElementById('aiIssueCount');
    const changes = document.getElementById('changeCount');
    const badge = document.getElementById('accuracyBadge');
    if (acc) acc.textContent = '—';
    if (read) read.textContent = '—';
    if (issues) issues.textContent = '0';
    if (changes) changes.textContent = '0';
    if (badge) badge.style.display = 'none';

    renderSpellingIssuesList([]);
    const changesList = document.getElementById('changesList');
    if (changesList) {
      changesList.innerHTML =
        '<p style="font-size:0.8rem;color:var(--muted);padding:12px;text-align:center;">Upload your manuscript to begin.</p>';
    }
    scheduleUpdatePreview();
    setStatus('green', 'Upload your manuscript to begin');
  } catch (err) {
    setUploadUIState(false);
  } finally {
    setTimeout(() => { uploadUiLocked = false; }, 350);
  }
}

function setUploadProcessing(active, filename) {
  const zone = document.getElementById('uploadZone');
  const overlay = document.getElementById('uploadProcessingOverlay');
  const nameEl = document.getElementById('uploadProcessingName');
  if (zone) zone.classList.toggle('is-processing', !!active);
  if (overlay) overlay.hidden = !active;
  if (nameEl) nameEl.textContent = active && filename ? filename : '';
  if (active) {
    const uploadItem = document.querySelector('.tool-rail-item[data-tool="upload"]');
    if (uploadItem) openToolFlyout(uploadItem);
  }
}

async function handleFile(file) {
  if (!canAcceptNewUpload()) return;
  currentWorkCompleted = false;
  const ok = /\.(txt|docx?|pdf)$/i.test(file.name);
  if (!ok) { setStatus('', 'Use TXT, DOCX, or PDF'); return; }
  if (file.size > MAX_FILE_BYTES) {
    showLimitAlert();
    return;
  }
  const requestId = ++uploadRequestId;
  const fd = new FormData();
  fd.append('file', file);
  fd.append('locale', targetLocale);
  setUploadProcessing(true, file.name);
  document.getElementById('loadingBar').classList.add('active');
  setStatus('', `Processing: ${file.name}…`);
  try {
    const data = await apiJson('/api/upload', fd);
    if (requestId !== uploadRequestId) return;
    document.getElementById('sampleText').value = data.text || '';
    currentWorkId = makeLibraryId('work');
    clearImageInsertDraft();
    manuscriptPageLocked = false;
    undoStack = [];
    redoStack = [];
    setPreviewConfirmState(false);
    applyUploadedDocumentMetadata(data.metadata);
    setUploadUIState(true, data.filename || file.name);
    await saveCurrentDraft({ filename: data.filename || file.name });
    saveRecentActivityItem({ filename: data.filename || file.name });
    skipLiveSpellCheck = true;
    lastSpellingIssues = [];
    lastPreviewIssues = [];
    lastAiIssues = [];
    hasAiAnalysisRun = false;
    sortedSpellingIssues = [];
    rejectedSpellIssues = [];
    spellFocusIndex = null;
    spellHoverIndex = null;
    document.getElementById('accPercent').textContent = '—';
    document.getElementById('readScore').textContent = '—';
    document.getElementById('aiIssueCount').textContent = '0';
    renderSpellingIssuesList([], { uploadedPending: true });
    const pageCount = parseInt(data.metadata?.page_count, 10);
    const pageInfo = Number.isFinite(pageCount) ? ` (${pageCount} pages)` : '';
    setStatus('green', `Loaded: ${file.name}${pageInfo} — click Analyze with AI`);
    scheduleUpdatePreview({ upload: true });
  } catch (e) {
    if (requestId === uploadRequestId) {
      showAttention('⚠ ' + (e.message || 'Upload failed'));
      setStatus('', e.message);
    }
  } finally {
    if (requestId === uploadRequestId) {
      setUploadProcessing(false);
      document.getElementById('loadingBar').classList.remove('active');
    }
  }
}

function showDl(msg, pct) {
  downloadJobActive = true;
  document.getElementById('dlOverlay').classList.add('active');
  document.getElementById('dlText').textContent = msg;
  document.getElementById('dlProgressFill').style.width = pct + '%';
}
function hideDl() {
  downloadJobActive = false;
  clearTimeout(downloadResumeTimer);
  downloadResumeTimer = null;
  setTimeout(() => document.getElementById('dlOverlay').classList.remove('active'), 400);
}

function base64ToBlob(data, mime) {
  const binary = atob(data || '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime || 'application/octet-stream' });
}

function triggerBlobDownload(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename || 'download';
  a.click();
  URL.revokeObjectURL(a.href);
}

async function startBackgroundExport(format, filename) {
  const jobId = await startServerAiJob('export', {
    format,
    payload: exportPayload(),
  });
  await saveCurrentDraft({
    downloadJob: { kind: 'export', format, filename, jobId, startedAt: new Date().toISOString() },
    downloadProcessing: true,
  });
  return jobId;
}

async function finishBackgroundExport(format, filename, result) {
  const blob = base64ToBlob(result.data, result.mime);
  if (blob.size > MAX_FILE_BYTES) {
    hideDl();
    showLimitAlert();
    return;
  }
  const finalName = result.filename || filename;
  triggerBlobDownload(blob, finalName);
  await saveDownloadedProject(format, finalName);
  hideDl();
  setStatus('green', `${format === 'word' ? 'Word file' : format.toUpperCase()} downloaded: ${finalName}`);
}

async function downloadServerExport(format, filename, label) {
  showDl(`${label} generating in background...`, 18);
  const jobId = await startBackgroundExport(format, filename);
  showDl(`${label} generating in background...`, 45);
  const result = await pollServerAiJob(jobId, { ignoreAi: true });
  showDl('Saving download...', 92);
  await finishBackgroundExport(format, filename, result);
}

async function resumeDownloadFromDraft(draft) {
  const job = draft?.downloadJob;
  if (!job) return;
  showDl(`Resuming ${String(job.format || 'download').toUpperCase()} download...`, job.jobId ? 45 : 12);
  if (job.jobId) {
    const result = await pollServerAiJob(job.jobId, { ignoreAi: true });
    await finishBackgroundExport(job.format, job.filename, result);
    return;
  }
  if (job.format === 'pdf') {
    downloadResumeTimer = setTimeout(() => downloadPDF().catch(e => {
      hideDl();
      setStatus('', e.message);
    }), 250);
  } else if (job.format === 'png') {
    downloadResumeTimer = setTimeout(() => downloadPNG({ resumed: true }).catch(e => {
      hideDl();
      setStatus('', e.message);
    }), 250);
  }
}

/** Refresh preview for export (no red marks) and return all page elements */
function buildExportPages() {
  updatePreview({ forExport: true, issues: [] });
  return Array.from(document.querySelectorAll('#bookPages .book-page'));
}

function buildExportPageData() {
  const s = getSettings();
  const size = s.size;
  const tpl = s.template;
  const text = s.text;
  const inchMargin = { 15: 0.75, 20: 1, 25: 1.25 };
  let pw, ph, mg;
  if (size.unit === 'mm') {
    pw = mmToPx(size.w);
    ph = mmToPx(size.h);
    mg = mmToPx(s.margin);
  } else {
    pw = Math.round(size.w * 96);
    ph = Math.round(size.h * 96);
    mg = s.marginIsCustom ? mmToPx(s.margin) : Math.round((inchMargin[s.margin] || 1) * 96);
  }

  const fs = s.fontSize;
  const showPageNumbers = !manuscriptHasPageNumbers(text);
  const pageNumH = showPageNumbers ? 28 : 0;
  const typography = { bodyFont: s.bodyFont, fontSize: fs, lineHeight: s.lineHeight };
  const measurer = getPageMeasurer(pw, mg, typography);
  const blocks = buildContentBlocks(s, text, [], true, tpl, null);
  const colStyle = s.cols > 1 ? `column-count:${s.cols};column-gap:${Math.round(fs * 1.8)}px;` : '';
  const pages = paginateBlocks(blocks, {
    measurer,
    contentHeight: ph - 2 * mg - pageNumH,
    paraStyle: '',
    textAlign: s.textAlign,
    colStyle,
    issues: [],
    forExport: true,
    fs,
  });
  return {
    pages,
    size,
    settings: s,
    layout: { pw, ph, mg, pageBg: PDF_PAPER_WHITE, typography, showPageNumbers },
  };
}

function pdfMarginUnits(s, size) {
  if (size.unit === 'mm') return s.margin;
  if (s.marginIsCustom) return s.margin / 25.4;
  const inchMargin = { 15: 0.75, 20: 1, 25: 1.25 };
  return inchMargin[s.margin] || 1;
}

function pdfPtToUnit(pt, size) {
  return size.unit === 'mm' ? pt * 25.4 / 72 : pt / 72;
}

function stripInlineMarkers(text) {
  return String(text || '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
}

function addPdfWrappedText(pdf, text, x, y, maxWidth, lineGap, options = {}) {
  const clean = stripInlineMarkers(text);
  if (!clean) return y;
  const lines = pdf.splitTextToSize(clean, maxWidth);
  pdf.text(lines, x, y, options);
  return y + (lines.length * lineGap);
}

function getPdfBaseFont(fontName) {
  const f = String(fontName || '').toLowerCase();
  if (f.includes('courier') || f.includes('mono')) return 'courier';
  if (f.includes('arial') || f.includes('helvetica') || f.includes('century') || f.includes('gothic')) return 'helvetica';
  return 'times';
}

function addPdfImageBlock(pdf, block, x, y, maxWidth, pageBottom) {
  const src = sanitizeImageDataUrl(block?.src || '');
  if (!src) return y;
  try {
    const props = pdf.getImageProperties(src);
    const ratio = MANUSCRIPT_IMAGE_SIZE[block.size] || 1;
    const imgW = Math.max(maxWidth * 0.2, maxWidth * ratio);
    const imgH = imgW * (props.height / Math.max(1, props.width));
    if (y + imgH > pageBottom) return y;
    pdf.addImage(src, props.fileType || 'JPEG', x + ((maxWidth - imgW) / 2), y, imgW, imgH, undefined, 'FAST');
    return y + imgH;
  } catch (_) {
    return y;
  }
}

function drawTextPdfPage(pdf, pageBlocks, index, exportData) {
  const { size, settings: s, layout } = exportData;
  const margin = pdfMarginUnits(s, size);
  const pageW = size.w;
  const pageH = size.h;
  const fontSize = s.fontSize || 11;
  const lineGap = pdfPtToUnit(fontSize * (s.lineHeight || 1.25), size);
  const paraGap = pdfPtToUnit(fontSize * 0.35, size);
  const maxWidth = Math.max(pdfPtToUnit(fontSize * 4, size), pageW - (margin * 2));
  let y = margin;

  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, pageW, pageH, 'F');
  pdf.setTextColor(0, 0, 0);
  const baseFont = getPdfBaseFont(s.bodyFont);
  pdf.setFont(baseFont, 'normal');
  pdf.setFontSize(fontSize);

  if (layout.showPageNumbers) {
    pdf.text(`- ${index + 1} -`, pageW / 2, y, { align: 'center' });
    y += lineGap + paraGap;
  }

  for (const block of pageBlocks) {
    if (block.type === 'header') {
      if (s.title) {
        pdf.setFont(baseFont, 'bold');
        pdf.setFontSize(fontSize + 6);
        y = addPdfWrappedText(pdf, s.title, pageW / 2, y, maxWidth, pdfPtToUnit((fontSize + 6) * 1.25, size), { align: 'center' });
        y += paraGap;
      }
      if (s.author) {
        pdf.setFont(baseFont, 'normal');
        pdf.setFontSize(fontSize);
        y = addPdfWrappedText(pdf, s.author.toUpperCase(), pageW / 2, y, maxWidth, lineGap, { align: 'center' });
        y += paraGap;
      }
      if (s.chapter) {
        pdf.setFont(baseFont, 'bold');
        pdf.setFontSize(fontSize + 4);
        y = addPdfWrappedText(pdf, s.chapter, pageW / 2, y + paraGap, maxWidth, pdfPtToUnit((fontSize + 4) * 1.25, size), { align: 'center' });
        y += paraGap;
      }
      pdf.setFont(baseFont, 'normal');
      pdf.setFontSize(fontSize);
      continue;
    }

    if (block.type === 'image') {
      y = addPdfImageBlock(pdf, block, margin, y, maxWidth, pageH - margin);
      y += paraGap;
      continue;
    }

    if (block.type !== 'para') continue;
    const align = s.textAlign === 'center' || s.textAlign === 'right' ? s.textAlign : 'left';
    const x = align === 'center' ? pageW / 2 : (align === 'right' ? pageW - margin : margin);
    y = addPdfWrappedText(pdf, block.plain || '', x, y, maxWidth, lineGap, { align });
    y += paraGap;
  }
}

function getPdfPlacedImagesForPage(pageIndex) {
  const text = getManuscriptText();
  const images = [];
  MANUSCRIPT_IMAGE_RE.lastIndex = 0;
  let match;
  while ((match = MANUSCRIPT_IMAGE_RE.exec(text)) !== null) {
    const page = match[2] != null ? parseInt(match[2], 10) : 0;
    if (page !== pageIndex) continue;
    images.push({
      size: match[1],
      x: parseFloat(match[3] || '50'),
      y: parseFloat(match[4] || '50'),
      src: (match[5] || '').trim(),
    });
  }
  MANUSCRIPT_IMAGE_RE.lastIndex = 0;
  return images;
}

function drawPlacedPdfImages(pdf, pageIndex, exportData) {
  const { size, settings: s, layout } = exportData;
  const images = getPdfPlacedImagesForPage(pageIndex);
  if (!images.length) return;
  const margin = pdfMarginUnits(s, size);
  const fontSize = s.fontSize || 11;
  const lineGap = pdfPtToUnit(fontSize * (s.lineHeight || 1.25), size);
  const paraGap = pdfPtToUnit(fontSize * 0.35, size);
  const pageW = size.w;
  const pageH = size.h;
  const contentW = Math.max(pdfPtToUnit(fontSize * 4, size), pageW - (margin * 2));
  const headerH = layout.showPageNumbers ? lineGap + paraGap : 0;
  const contentH = Math.max(1, pageH - (margin * 2) - headerH);
  images.forEach(img => {
    const src = sanitizeImageDataUrl(img.src);
    if (!src) return;
    try {
      const props = pdf.getImageProperties(src);
      const ratio = MANUSCRIPT_IMAGE_SIZE[img.size] || 1;
      const imgW = Math.max(contentW * 0.12, contentW * ratio);
      const imgH = imgW * (props.height / Math.max(1, props.width));
      const centerX = margin + (Math.max(0, Math.min(100, img.x)) / 100) * contentW;
      const centerY = margin + headerH + (Math.max(0, Math.min(100, img.y)) / 100) * contentH;
      pdf.addImage(src, props.fileType || 'JPEG', centerX - imgW / 2, centerY - imgH / 2, imgW, imgH, undefined, 'FAST');
    } catch (_) {}
  });
}

function getPdfExportScale(res, pageCount) {
  const requested = res / 96;
  if (pageCount >= 250) return Math.min(requested, 1.45);
  if (pageCount >= 120) return Math.min(requested, 1.7);
  if (pageCount >= 50) return Math.min(requested, 2.05);
  return Math.min(requested, 2.45);
}

function getEffectivePdfDpi(scale) {
  return Math.round(scale * 96);
}

function getExportRenderHost() {
  let host = document.getElementById('chapteraPdfRenderHost');
  if (!host) {
    host = document.createElement('div');
    host.id = 'chapteraPdfRenderHost';
    host.style.cssText = 'position:fixed;left:-100000px;top:0;width:auto;height:auto;overflow:visible;pointer-events:none;background:#fff;';
    document.body.appendChild(host);
  }
  host.innerHTML = '';
  return host;
}

async function renderExportPageCanvas(pageBlocks, index, layout, scale) {
  const host = getExportRenderHost();
  const pageEl = buildBookPageElement(pageBlocks, index, { ...layout, container: host });
  host.replaceChildren(pageEl);
  if (document.fonts?.ready) {
    try { await document.fonts.ready; } catch (_) {}
  }
  await new Promise(r => requestAnimationFrame(r));
  const canvas = await html2canvas(pageEl, {
    scale,
    useCORS: true,
    backgroundColor: PDF_PAPER_WHITE,
    logging: false,
    foreignObjectRendering: false,
    imageTimeout: 0,
  });
  return canvas;
}

function exportPayload() {
  const s = getSettings();
  return {
    text: s.text,
    title: s.title,
    author: s.author,
    chapter: s.chapter,
    font_size: s.fontSize,
    body_font: s.bodyFont,
    line_height: s.lineHeight,
    text_align: s.textAlign,
    margin: s.margin,
    page_width: s.size.w,
    page_height: s.size.h,
    page_unit: s.size.unit,
    size_key: s.sizeKey,
  };
}

async function downloadBlobFromApi(url, filename, loadingMsg) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(exportPayload()),
  });
  if (!res.ok) {
    let err = 'Export failed';
    try { err = (await res.json()).error || err; } catch (_) {}
    throw new Error(err);
  }
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function downloadTXT() {
  if (!requireManuscriptForDownload()) return;
  syncPreviewBeforeExport();
  const s = getSettings();
  try {
    if (!getLimitCheckedPageCount(s.text)) return;
    const name = ((s.title || 'manuscript').replace(/\s+/g, '_') || 'manuscript') + '.txt';
    await downloadServerExport('txt', name, 'TXT file');
  } catch (e) {
    hideDl();
    setStatus('', e.message);
  }
}

async function downloadWord() {
  if (!requireManuscriptForDownload()) return;
  syncPreviewBeforeExport();
  const s = getSettings();
  try {
    if (!getLimitCheckedPageCount(s.text)) return;
    const name = ((s.title || 'manuscript').replace(/\s+/g, '_') || 'manuscript') + '.docx';
    await downloadServerExport('word', name, 'Word document');
  } catch (e) {
    hideDl();
    setStatus('', e.message);
  }
}

async function downloadFormattedPdf(filename) {
  if (!jsPDF) throw new Error('PDF export library is not available');
  showDl('Preparing PDF pages...', 12);
  const exportData = buildExportPageData();
  const { pages, size, layout } = exportData;
  if (pages.length > MAX_MANUSCRIPT_PAGES) {
    hideDl();
    showLimitAlert(`This manuscript is about ${pages.length} pages.`);
    return;
  }
  const pdf = new jsPDF({
    orientation: size.w > size.h ? 'landscape' : 'portrait',
    unit: size.unit === 'in' ? 'in' : 'mm',
    format: [size.w, size.h],
    compress: true,
  });
  const total = Math.max(1, pages.length);
  const scale = getPdfExportScale(getSettings().res || selectedRes || 300, total);
  for (let idx = 0; idx < pages.length; idx += 1) {
    const pageBlocks = pages[idx];
    if (idx > 0) pdf.addPage([size.w, size.h], size.w > size.h ? 'landscape' : 'portrait');
    showDl(`Rendering PDF page ${idx + 1} of ${total}...`, Math.min(90, 15 + Math.round(((idx + 1) / total) * 75)));
    const canvas = await renderExportPageCanvas(pageBlocks, idx, layout, scale);
    const imageData = canvas.toDataURL('image/jpeg', 0.92);
    pdf.addImage(imageData, 'JPEG', 0, 0, size.w, size.h, undefined, 'FAST');
  }
  const blob = pdf.output('blob');
  if (blob.size > MAX_FILE_BYTES) {
    hideDl();
    showLimitAlert();
    return;
  }
  triggerBlobDownload(blob, filename);
  await saveDownloadedProject('pdf', filename);
  updatePreview();
  hideDl();
  setStatus('green', `PDF downloaded: ${filename}`);
}

async function downloadPDF() {
  if (!requireManuscriptForDownload()) return;
  syncPreviewBeforeExport();
  const s = getSettings();
  try {
    if (!getLimitCheckedPageCount(s.text)) return;
    const name = ((s.title || 'book').replace(/\s+/g, '_') || 'book') + '_' + s.sizeKey + '.pdf';
    await downloadFormattedPdf(name);
  } catch (e) {
    hideDl();
    setStatus('', e.message);
  }
}
async function downloadPNG(options = {}) {
  const s = getSettings();
  showDl('Rendering PNG…', 30);
  const filename = ((s.title || 'book').replace(/\s+/g, '_') || 'book') + '.png';
  if (!options.resumed) {
    await saveCurrentDraft({
      downloadJob: { kind: 'client', format: 'png', filename, startedAt: new Date().toISOString() },
      downloadProcessing: true,
    });
  }
  const pages = buildExportPages();
  const page = pages[0] || document.querySelector('#bookPages .book-page');
  const canvas = await html2canvas(page, { scale: s.res / 96, useCORS: true, backgroundColor: PDF_PAPER_WHITE });
  const a = document.createElement('a');
  a.download = filename;
  a.href = canvas.toDataURL('image/png');
  a.click();
  await saveDownloadedProject('png', a.download);
  updatePreview();
  hideDl();
  setStatus('green', 'PNG downloaded (white background)');
}

function initBottomControls() {
  document.querySelectorAll('.res-pill').forEach(pill => {
    pill.addEventListener('click', e => {
      e.stopPropagation();
      closeAllCustomDropdowns();
      const val = parseInt(pill.dataset.res || pill.id.replace('res-', ''), 10);
      if (val) selectRes(val);
    });
  });

  document.getElementById('btnAnalyze')?.addEventListener('click', e => {
    e.stopPropagation();
    runPythonAI();
  });
  document.getElementById('btnAutoFix')?.addEventListener('click', e => {
    e.stopPropagation();
    applyPythonFix();
  });
  document.getElementById('btnToolOptions')?.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    toggleProofreadToolList();
  });
  try {
    initProofreadPanelControls();
  } catch (e) {
    console.warn('Chaptera proofread controls skipped:', e);
  }
  document.getElementById('btnRecentActivity')?.addEventListener('click', e => {
    e.stopPropagation();
    openSectionDuringProcessing('/recent-activity', 'Recent Activity');
  });
  document.getElementById('btnMyProjects')?.addEventListener('click', e => {
    e.stopPropagation();
    openSectionDuringProcessing('/my-projects', 'My Projects');
  });
  document.getElementById('btnSettings')?.addEventListener('click', e => {
    e.stopPropagation();
    openSectionDuringProcessing('/settings', 'Settings');
  });
  document.getElementById('btnHelpSupport')?.addEventListener('click', e => {
    e.stopPropagation();
    openSectionDuringProcessing('/help-support', 'Help & Support');
  });
  document.getElementById('previewConfirmBtn')?.addEventListener('click', e => {
    e.stopPropagation();
    confirmPreviewChanges();
  });
  document.getElementById('btnLogin')?.addEventListener('click', e => {
    e.stopPropagation();
    showAuthModal();
  });
}

function initStudio() {
  const initStep = fn => {
    try { fn(); } catch (e) { console.warn('Chaptera init skipped a step:', e); }
  };
  initStep(cleanupOrphanDropdownPanels);
  initStep(populateFontSelects);
  initStep(populateFontSizeSelect);
  initStep(initHeaderMenus);
  initStep(initThemeToggle);
  initStep(initToolRail);
  initStep(() => updateLocaleHeaderUI(targetLocale));
  initStep(initCustomSelects);
  initStep(initLineSpacing);
  initStep(initMarginAndColumns);
  initStep(initBottomControls);
  initStep(initImageInsert);
  initStep(initToolPreviewPopup);
  initStep(initAuthModal);
  initStep(initLibraryModal);
  initStep(initEditablePreview);
  initStep(initPreviewNav);
  initStep(initPreviewZoom);
  initStep(() => setUploadUIState(false));

  const uploadSection = document.getElementById('uploadSection');
  const uz = document.getElementById('uploadZone');
  const fi = document.getElementById('manuscriptFile');
  const openFilePicker = () => {
    if (!canAcceptNewUpload()) {
      if (showUploadCancelOption()) {
        showAttention('A manuscript is already loaded. Use Cancel file before uploading another.');
      }
      return;
    }
    if (fi && !fi.disabled) {
      try {
        fi.click();
        return;
      } catch (_) {}
    }
    const tempInput = document.createElement('input');
    tempInput.type = 'file';
    tempInput.accept = '.txt,.doc,.docx,.pdf,text/plain,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    tempInput.style.position = 'fixed';
    tempInput.style.left = '-9999px';
    tempInput.style.top = '0';
    document.body.appendChild(tempInput);
    tempInput.addEventListener('change', e => {
      const picked = e.target.files && e.target.files[0];
      tempInput.remove();
      if (picked && canAcceptNewUpload()) handleFile(picked);
    }, { once: true });
    tempInput.click();
  };

  uploadSection?.addEventListener('click', e => {
    if (!hasUploadedFile()) return;
    if (e.target.closest('#uploadCancelBtn')) return;
    e.preventDefault();
    e.stopPropagation();
  }, true);

  if (uz) {
    uz.addEventListener('click', e => {
      if (!canAcceptNewUpload()) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      e.preventDefault();
      openFilePicker();
    });
    uz.addEventListener('dragover', e => {
      if (!canAcceptNewUpload()) return;
      e.preventDefault();
      uz.classList.add('drag');
    });
    uz.addEventListener('dragleave', () => uz.classList.remove('drag'));
    uz.addEventListener('drop', e => {
      e.preventDefault();
      uz.classList.remove('drag');
      if (!canAcceptNewUpload()) return;
      if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });
  }
  if (fi) {
    fi.addEventListener('click', e => {
      if (!canAcceptNewUpload()) {
        e.preventDefault();
        e.stopPropagation();
      }
    });
    fi.addEventListener('change', e => {
      const picked = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!picked || !canAcceptNewUpload()) return;
      handleFile(picked);
    });
  }
  document.getElementById('bookPages')?.addEventListener('click', e => {
    if (!e.target.closest('#landingUploadDropzone')) return;
    e.preventDefault();
    openFilePicker();
  });
  document.getElementById('bookPages')?.addEventListener('keydown', e => {
    if (!e.target.closest('#landingUploadDropzone')) return;
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    openFilePicker();
  });
  document.getElementById('bookPages')?.addEventListener('dragover', e => {
    const dropzone = e.target.closest('#landingUploadDropzone');
    if (!dropzone || !canAcceptNewUpload()) return;
    e.preventDefault();
    dropzone.classList.add('drag');
  });
  document.getElementById('bookPages')?.addEventListener('dragleave', e => {
    e.target.closest('#landingUploadDropzone')?.classList.remove('drag');
  });
  document.getElementById('bookPages')?.addEventListener('drop', e => {
    const dropzone = e.target.closest('#landingUploadDropzone');
    if (!dropzone) return;
    e.preventDefault();
    dropzone.classList.remove('drag');
    if (!canAcceptNewUpload()) return;
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });

  ['bookSize','marginSize','marginSizeCustom','colCount','colCountCustom','bodyFont','headFont','fontSize','lineHeight','lineHeightCustom','textAlign'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => {
      scheduleUpdatePreview();
      scheduleCurrentDraftSave({ edited: true });
    });
    if (el) el.addEventListener('change', () => {
      scheduleUpdatePreview();
      scheduleCurrentDraftSave({ edited: true });
    });
  });
  document.getElementById('sampleText')?.addEventListener('input', () => {
    clearAnalysisForManualEdit();
    scheduleCurrentDraftSave({ edited: true });
  });
  window.addEventListener('beforeunload', () => {
    if (hasUploadedFile() && hasManuscriptContent()) saveCurrentDraftNow({ edited: true });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && hasUploadedFile() && hasManuscriptContent()) {
      saveCurrentDraftNow({ edited: true });
    }
  });
  ['bodyFont', 'headFont'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => ensureGoogleFontFromSelect(el));
  });

  window.addEventListener('resize', () => scheduleFitPreview());

  const cancelBtn = document.getElementById('uploadCancelBtn');
  cancelBtn?.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    clearUploadedManuscript();
  }, true);

  document.getElementById('aiProcessCancelBtn')?.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    cancelAiProcessing();
  });
  document.getElementById('aiProcessPauseBtn')?.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    toggleAiPaused();
  });

  (async () => {
    try {
      const health = await fetch('/api/health');
      if (!health.ok) throw new Error('Backend not ready');
      const restoredFromServer = await restoreServerOpenProject();
      if (restoredFromServer) return;
      const restored = await restoreCurrentDraft();
      if (restored) return;
    } catch (e) {
      console.warn('Chaptera restore skipped:', e);
    }
    setStatus('green', 'Upload your manuscript to begin');
    updatePreview();
    const changesList = document.getElementById('changesList');
    if (changesList) {
      changesList.innerHTML =
        '<p style="font-size:0.8rem;color:var(--muted);padding:12px;text-align:center;">Upload your manuscript to begin.</p>';
    }
  })();

  window.selectRes = selectRes;
  window.runPythonAI = runPythonAI;
  window.applyPythonFix = applyPythonFix;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initStudio, { once: true });
} else {
  initStudio();
}
