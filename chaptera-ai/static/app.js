const $ = (id) => document.getElementById(id);

function setStatus(msg) {
  $('status').textContent = msg;
}

function showLoading(on) {
  $('loading').hidden = !on;
}

function getLocale() {
  return $('locale').value;
}

function getText() {
  return $('manuscript').value;
}

function renderResult(data) {
  if (data.text) $('manuscript').value = data.text;
  $('highlights').innerHTML = data.highlights_html || '<p class="muted">No highlights.</p>';

  const acc = data.accuracy || {};
  $('accPercent').textContent = (acc.percent ?? '—') + '%';
  $('accLabel').textContent = acc.label || '';
  $('accMeter').style.width = (acc.percent || 0) + '%';
  $('accMeta').textContent = acc.word_count
    ? `${acc.total_issues} issues · ${acc.errors_per_1000} per 1000 words · ${acc.word_count} words`
    : '';

  const read = data.readability || {};
  $('readScore').textContent = read.score ?? '—';
  $('readGrade').textContent = 'Grade level: ' + (read.grade ?? '—');

  $('chipAccuracy').textContent = 'Accuracy: ' + (acc.percent ?? '—') + '%';
  $('chipRead').textContent = 'Readability: ' + (read.score ?? '—');
  $('chipIssues').textContent = 'Issues: ' + (data.issue_count ?? 0);
  $('issueCount').textContent = data.issue_count ?? 0;

  const counts = data.counts || {};
  $('statsGrid').innerHTML = ['spelling', 'grammar', 'clarity', 'duplicate', 'character']
    .map((t) => `
      <div class="stat-box">
        <strong>${counts[t] || 0}</strong>
        <span>${t}</span>
      </div>
    `).join('');

  const chapters = data.chapters || [];
  $('chapterList').innerHTML = chapters.length
    ? chapters.map((ch) => `
        <div class="chapter-item">
          <strong>${escapeHtml(ch.title)}</strong>
          Readability ${ch.readability?.score ?? '—'} · ${ch.issue_count} issues · ${ch.word_count} words
        </div>
      `).join('')
    : '<p class="muted">No chapter headings detected.</p>';

  const issues = data.issues || [];
  $('issueList').innerHTML = issues.length
    ? issues.slice(0, 150).map((iss, i) => `
        <div class="issue-card ${iss.type}" data-start="${iss.start}">
          <div class="issue-type">${iss.type}</div>
          <div class="issue-msg">${escapeHtml(iss.message)}</div>
          ${iss.suggestion ? `<div class="issue-sug">→ ${escapeHtml(iss.suggestion)}</div>` : ''}
        </div>
      `).join('')
  : '<p class="muted">No issues — excellent manuscript!</p>';

  document.querySelectorAll('.issue-card').forEach((el) => {
    el.addEventListener('click', () => {
      const start = +el.dataset.start;
      const ta = $('manuscript');
      ta.focus();
      ta.setSelectionRange(start, start + 30);
    });
  });

  if (data.filename) {
    $('fileName').textContent = '✓ ' + data.filename;
  }

  setStatus(`Analysis complete — ${data.issue_count} issue(s) · ${data.locale_label || ''}`);
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

async function api(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
    body: body instanceof FormData ? body : JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function analyze() {
  const text = getText().trim();
  if (!text) {
    setStatus('Enter or upload manuscript text first.');
    return;
  }
  showLoading(true);
  try {
    const data = await api('/api/analyze', { text, locale: getLocale() });
    renderResult(data);
  } catch (e) {
    setStatus('Error: ' + e.message);
  } finally {
    showLoading(false);
  }
}

async function applyFixes() {
  const text = getText().trim();
  if (!text) return;
  showLoading(true);
  try {
    const data = await api('/api/fix', { text, locale: getLocale() });
    renderResult(data);
    setStatus('Auto-fixes applied and manuscript re-analyzed.');
  } catch (e) {
    setStatus('Error: ' + e.message);
  } finally {
    showLoading(false);
  }
}

async function uploadFile(file) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('locale', getLocale());
  showLoading(true);
  try {
    const data = await api('/api/upload', fd);
    renderResult(data);
  } catch (e) {
    setStatus('Upload error: ' + e.message);
  } finally {
    showLoading(false);
  }
}

$('btnAnalyze').addEventListener('click', analyze);
$('btnFix').addEventListener('click', applyFixes);

const uz = $('uploadZone');
const fi = $('fileInput');
uz.addEventListener('click', () => fi.click());
uz.addEventListener('dragover', (e) => { e.preventDefault(); uz.classList.add('drag'); });
uz.addEventListener('dragleave', () => uz.classList.remove('drag'));
uz.addEventListener('drop', (e) => {
  e.preventDefault();
  uz.classList.remove('drag');
  if (e.dataTransfer.files[0]) uploadFile(e.dataTransfer.files[0]);
});
fi.addEventListener('change', (e) => {
  if (e.target.files[0]) uploadFile(e.target.files[0]);
});

fetch('/api/health')
  .then((r) => r.json())
  .then(() => setStatus('Chaptera AI Python server ready'))
  .catch(() => setStatus('Cannot reach server — run: python app.py'));
