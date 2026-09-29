const $ = id => document.getElementById(id);
let token = sessionStorage.getItem('cad-review-token') || '';
let session = null;
let index = 0;
let saving = false;
let editMode = false;
let viewSuffix = '';
let guestMode = false;
let sessionAttempt = 0;
const imagesLoaded = { 'query-image': false, 'candidate-image': false };

function guestStorageKey() { return `cad-review-guest:${session.protocol_hash}`; }

function saveGuestRating(pair, grade, evidence) {
  const rating = { grade, evidence, version: (session.ratings[pair.pair_id]?.version || 0) + 1 };
  const next = { ...session.ratings, [pair.pair_id]: rating };
  localStorage.setItem(guestStorageKey(), JSON.stringify(next));
  session.ratings = next;
  return rating;
}

function imagesReady() { return imagesLoaded['query-image'] && imagesLoaded['candidate-image']; }

function refreshGradeButtons() {
  if (!session?.pairs.length) return;
  const saved = Boolean(session.ratings[session.pairs[index].pair_id]);
  for (const button of $('grade-options').children)
    button.disabled = saving || session.locked || !imagesReady() || (saved && !editMode);
}

function showImages(pair) {
  imagesLoaded['query-image'] = imagesLoaded['candidate-image'] = false;
  $('image-error').hidden = true;
  $('query-image').src = `/renders/${pair.query_id}${viewSuffix}.webp`;
  $('candidate-image').src = `/renders/${pair.candidate_id}${viewSuffix}.webp`;
  $('view-primary').classList.toggle('active', !viewSuffix);
  $('alternate-view').classList.toggle('active', Boolean(viewSuffix));
  $('view-primary').setAttribute('aria-pressed', String(!viewSuffix));
  $('alternate-view').setAttribute('aria-pressed', String(Boolean(viewSuffix)));
  for (const button of $('grade-options').children) button.disabled = true;
}

function error(message) {
  $('global-error').textContent = message;
  $('global-error').hidden = !message;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
    cache: 'no-store',
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || `Request failed (${response.status})`);
  return value;
}

function roleName(role) {
  return { rater_a: 'Independent expert A', rater_b: 'Independent expert B',
    adjudication: 'Disagreement adjudication' }[role] || 'Review';
}

function firstUnrated(start = 0) {
  if (!session?.pairs.length) return -1;
  start = ((start % session.pairs.length) + session.pairs.length) % session.pairs.length;
  for (let offset = 0; offset < session.pairs.length; offset++) {
    const i = (start + offset) % session.pairs.length;
    if (!session.ratings[session.pairs[i].pair_id]) return i;
  }
  return -1;
}

function nextUnratedAfter(current) {
  if (!session?.pairs.length) return -1;
  for (let offset = 1; offset < session.pairs.length; offset++) {
    const i = (current + offset) % session.pairs.length;
    if (!session.ratings[session.pairs[i].pair_id]) return i;
  }
  return -1;
}

function setStatus(message, isError = false) {
  $('save-status').textContent = message;
  $('save-status').style.color = isError ? '#9a3c29' : '#4e7e71';
}

function showProgress() {
  const total = session.pairs.length;
  const done = session.pairs.filter(pair => session.ratings[pair.pair_id]).length;
  $('progress-text').textContent = `${done.toLocaleString()} of ${total.toLocaleString()} pairs ${guestMode ? 'saved here' : 'saved'}`;
  const percent = total ? (done === total ? 100 : Math.min(99, Math.round(100 * done / total))) : 0;
  $('progress-percent').textContent = `${percent}%`;
  $('progress-fill').style.width = `${percent}%`;
  $('progress-fill').parentElement.setAttribute('aria-valuenow', String(percent));
  $('export-own').disabled = !(total && done === total) || saving;
  $('all-done').hidden = done !== total || total === 0;
  $('review-content').hidden = !total;
  if (!total && session.role === 'adjudication') {
    $('all-done').hidden = false;
    $('all-done').querySelector('h3').textContent = session.independent_complete
      ? 'No disagreements require adjudication' : 'Adjudication is not open yet';
    $('all-done').querySelector('p').textContent = session.independent_complete
      ? 'The independent grades agree on every pair.'
      : 'This list opens when both independent experts have completed ratings.';
  }
}

function draftKey(pair) { return `cad-review-draft:${session.role}:${pair.pair_id}`; }

function renderPair() {
  if (!session?.pairs.length) return;
  index = Math.max(0, Math.min(index, session.pairs.length - 1));
  const pair = session.pairs[index];
  const current = session.ratings[pair.pair_id];
  editMode = false;
  localStorage.setItem(`cad-review-position:${session.role}`, String(index));
  const queryNumber = session.pairs.findIndex(p => p.query_id === pair.query_id) + 1;
  $('query-count').textContent = `· query ${queryNumber}`;
  $('review-title').textContent = `Pair ${index + 1} of ${session.pairs.length}`;
  $('pair-index').textContent = `PAIR ${String(index + 1).padStart(4, '0')}`;
  showImages(pair);
  $('evidence').value = current?.evidence ?? localStorage.getItem(draftKey(pair)) ?? '';
  $('evidence').disabled = Boolean(current);
  $('edit-rating').hidden = !current || session.locked;
  $('grade-hint').textContent = current
    ? `This rating is saved${guestMode ? ' in this browser' : ''}. Choose “Edit saved rating” to revise it.`
    : `Select a rating to save ${guestMode ? 'in this browser' : 'this pair'} and continue automatically.`;
  $('prior-ratings').hidden = session.role !== 'adjudication';
  if (session.role === 'adjudication') {
    const [a, b] = session.comparison[pair.pair_id];
    $('prior-ratings').textContent = `Independent grades: expert A = ${a}; expert B = ${b}. Record the adjudicated grade below.`;
  }
  $('grade-options').replaceChildren();
  for (const [grade, description] of Object.entries(session.rubric)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'grade-button' + (current?.grade === Number(grade) ? ' selected' : '') + (current ? ' locked' : '');
    button.setAttribute('aria-pressed', String(current?.grade === Number(grade)));
    button.disabled = session.locked || Boolean(current) || saving || !imagesReady();
    button.innerHTML = `<span class="grade-number">${grade}</span><span></span>`;
    button.lastElementChild.textContent = description;
    button.addEventListener('click', () => submitGrade(Number(grade)));
    $('grade-options').append(button);
  }
  $('previous').disabled = saving || index === 0;
  $('next-unrated').disabled = saving || nextUnratedAfter(index) < 0;
  showProgress();
}

async function submitGrade(grade) {
  if (saving || !session?.pairs.length) return;
  if (!imagesReady()) { setStatus('Wait for both CAD views to load before grading.', true); return; }
  const pair = session.pairs[index];
  const old = session.ratings[pair.pair_id];
  if (old && !editMode) return;
  saving = true;
  setStatus('Saving…');
  for (const button of $('grade-options').children) button.disabled = true;
  $('previous').disabled = $('next-unrated').disabled = true;
  try {
    if (guestMode) {
      saveGuestRating(pair, grade, $('evidence').value.trim());
    } else {
      const result = await api('/api/grade', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pair_id: pair.pair_id, grade,
          evidence: $('evidence').value.trim(), expected_version: old?.version || 0 }),
      });
      session.ratings[pair.pair_id] = result.saved;
    }
    localStorage.removeItem(draftKey(pair));
    setStatus(guestMode ? 'Saved in this browser' : 'Saved on server');
    const next = firstUnrated(index + 1);
    if (next >= 0) index = next;
    renderPair();
  } catch (failure) {
    setStatus(failure.message, true);
    if (/another session|Independent ratings are closed/.test(failure.message)) {
      await openSession();
    } else {
      for (const button of $('grade-options').children) button.disabled = false;
      $('previous').disabled = index === 0;
      $('next-unrated').disabled = nextUnratedAfter(index) < 0;
    }
  } finally {
    saving = false;
    refreshGradeButtons();
    $('previous').disabled = index === 0;
    $('next-unrated').disabled = nextUnratedAfter(index) < 0;
    showProgress();
  }
}

async function download(role) {
  try {
    error('');
    let blob;
    if (guestMode) {
      const cell = value => {
        const text = String(value ?? '');
        return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
      };
      const lines = ['pair_id,query_asset,candidate_asset,grade,evidence'];
      for (const pair of session.pairs) {
        const rating = session.ratings[pair.pair_id];
        lines.push([pair.pair_id, `${pair.query_id}.stp`, `${pair.candidate_id}.stp`,
          rating?.grade ?? '', rating?.evidence ?? ''].map(cell).join(','));
      }
      blob = new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/csv' });
    } else {
      const response = await fetch(`/api/export?role=${encodeURIComponent(role)}`,
        { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      if (!response.ok) throw new Error((await response.json()).error || 'Export failed');
      blob = await response.blob();
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `${role === 'guest' ? 'guest-review' : role}.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  } catch (failure) { error(failure.message); }
}

async function openSession() {
  const attempt = ++sessionAttempt;
  try {
    error('');
    const loaded = await api('/api/session');
    if (attempt !== sessionAttempt) return;
    session = loaded;
    guestMode = false;
    $('login').hidden = true;
    $('guest-notice').hidden = true;
    if (loaded.role === 'export') {
      $('review').hidden = true;
      $('admin').hidden = false;
      $('admin-status').textContent = `Expert A: ${loaded.completed_a}/${loaded.total}; expert B: ${loaded.completed_b}/${loaded.total}; disagreements: ${loaded.disagreements}; adjudicated: ${loaded.adjudicated}.`;
      return;
    }
    $('admin').hidden = true;
    $('review').hidden = false;
    $('role-label').textContent = roleName(loaded.role);
    const remembered = Number(localStorage.getItem(`cad-review-position:${loaded.role}`));
    const next = firstUnrated(Number.isInteger(remembered) && remembered >= 0 ? remembered : 0);
    index = next >= 0 ? next : (Number.isInteger(remembered) ? remembered : 0);
    setStatus('All saved');
    showProgress();
    renderPair();
  } catch (failure) {
    if (attempt !== sessionAttempt) return;
    error(failure.message);
    $('login').hidden = false;
    $('review').hidden = $('admin').hidden = true;
  }
}

async function openGuest() {
  const attempt = ++sessionAttempt;
  try {
    error('');
    const response = await fetch('/guest-sample.json');
    if (!response.ok) throw new Error('Guest review is unavailable. Please try again later.');
    const sample = await response.json();
    if (attempt !== sessionAttempt) return;
    let ratings = {};
    try { ratings = JSON.parse(localStorage.getItem(`cad-review-guest:${sample.protocol_hash}`) || '{}'); }
    catch { ratings = {}; }
    session = { ...sample, role: 'guest', ratings, comparison: {}, locked: false };
    guestMode = true;
    token = '';
    sessionStorage.removeItem('cad-review-token');
    $('login').hidden = $('admin').hidden = true;
    $('review').hidden = false;
    $('guest-notice').hidden = false;
    $('role-label').textContent = 'Guest preview · browser only';
    $('export-own').textContent = 'Download guest CSV ↓';
    $('all-done').querySelector('p').textContent = 'Your guest ratings are saved in this browser. Download a CSV if you want to keep a copy.';
    index = Math.max(0, firstUnrated(0));
    setStatus('Saved in this browser');
    renderPair();
  } catch (failure) { if (attempt === sessionAttempt) error(failure.message); }
}

function signOut() {
  sessionAttempt++;
  token = ''; session = null; guestMode = false;
  sessionStorage.removeItem('cad-review-token');
  $('access-code').value = '';
  $('login').hidden = false;
  $('review').hidden = $('admin').hidden = true;
  $('guest-notice').hidden = true;
  $('export-own').textContent = 'Download annotation CSV ↓';
  $('all-done').querySelector('p').textContent = 'Your work is saved. You can revisit pairs or export a complete review file.';
  error('');
}

$('login-form').addEventListener('submit', async event => {
  event.preventDefault();
  token = $('access-code').value.trim();
  sessionStorage.setItem('cad-review-token', token);
  await openSession();
});
$('skip-login').addEventListener('click', openGuest);
$('sign-out').addEventListener('click', signOut);
$('admin-sign-out').addEventListener('click', signOut);
$('previous').addEventListener('click', () => { if (!saving && index > 0) { index--; renderPair(); } });
$('next-unrated').addEventListener('click', () => {
  const next = nextUnratedAfter(index); if (!saving && next >= 0) { index = next; renderPair(); }
});
$('edit-rating').addEventListener('click', () => {
  if (!window.confirm('Revise this saved grade? The earlier value will be replaced and the change versioned.')) return;
  editMode = true;
  $('evidence').disabled = false;
  refreshGradeButtons();
  setStatus('Editing saved rating');
});
$('evidence').addEventListener('input', () => {
  if (session?.pairs.length && !session.ratings[session.pairs[index].pair_id])
    localStorage.setItem(draftKey(session.pairs[index]), $('evidence').value);
});
$('export-own').addEventListener('click', () => download(session.role));
$('alternate-view').addEventListener('click', () => {
  if (!session?.pairs.length || saving) return;
  viewSuffix = '_B';
  showImages(session.pairs[index]);
});
$('view-primary').addEventListener('click', () => {
  if (!session?.pairs.length || saving) return;
  viewSuffix = '';
  showImages(session.pairs[index]);
});
for (const button of document.querySelectorAll('[data-export]'))
  button.addEventListener('click', () => download(button.dataset.export));
for (const id of ['query-image', 'candidate-image']) {
  $(id).tabIndex = 0;
  $(id).addEventListener('click', () => { $('zoom-image').src = $(id).src; $('zoom-dialog').showModal(); });
  $(id).addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); $(id).click(); }
  });
  $(id).addEventListener('load', () => {
    imagesLoaded[id] = true;
    refreshGradeButtons();
  });
  $(id).addEventListener('error', () => {
    imagesLoaded[id] = false;
    $('image-error').hidden = false;
    for (const button of $('grade-options').children) button.disabled = true;
  });
}
$('close-zoom').addEventListener('click', () => $('zoom-dialog').close());
document.addEventListener('keydown', event => {
  if (!session || session.role === 'export' || $('zoom-dialog').open) return;
  if (['TEXTAREA', 'INPUT'].includes(document.activeElement?.tagName)) return;
  if (event.key >= '0' && event.key <= '3') submitGrade(Number(event.key));
  if (event.key === 'ArrowLeft' && index > 0 && !saving) { index--; renderPair(); }
  if (event.key === 'ArrowRight' && !saving) {
    const next = nextUnratedAfter(index); if (next >= 0) { index = next; renderPair(); }
  }
});
if (token) openSession();
