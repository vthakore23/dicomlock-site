// ============================================
// DicomLock - Interactions
// ============================================

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// --- Navbar: subtle background once scrolled ---
const navbar = document.getElementById('navbar');
if (navbar) {
  const onScroll = () => navbar.classList.toggle('scrolled', window.scrollY > 32);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

// --- Mobile nav toggle ---
const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');
if (navToggle && navLinks) {
  const setOpen = (open) => {
    navLinks.classList.toggle('open', open);
    navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  navToggle.addEventListener('click', () => {
    setOpen(navToggle.getAttribute('aria-expanded') !== 'true');
  });
  navLinks.addEventListener('click', (e) => {
    if (e.target.closest('a')) setOpen(false);
  });
  document.addEventListener('click', (e) => {
    if (!navLinks.contains(e.target) && !navToggle.contains(e.target)) setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setOpen(false);
  });
}

// --- Reveal cards on scroll ---
const revealTargets = document.querySelectorAll(
  '.threat-card, .check-item, .evidence-card, .pipeline-step, .callout, .stat, .anatomy'
);
revealTargets.forEach(el => el.classList.add('fade-in'));
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
revealTargets.forEach(el => revealObserver.observe(el));

// ============================================
// Interactive scanner
// ============================================

const SAMPLES = {
  clean: {
    file: 'ct_chest.dcm',
    checks: [
      ['preamble / polyglot', 'clean', 'pass'],
      ['element length bounds', 'valid', 'pass'],
      ['sequence depth', 'ok (3)', 'pass'],
      ['private tag payload', 'none', 'pass'],
      ['codec CVE exposure', 'none', 'pass'],
    ],
    verdict: 'clean',
    fixes: [],
  },
  polyglot: {
    file: 'polyglot.dcm',
    checks: [
      ['preamble / polyglot', 'ELF header', 'fail'],
      ['element length bounds', 'valid', 'pass'],
      ['sequence depth', 'ok (2)', 'pass'],
      ['private tag payload', 'exe signature', 'fail'],
      ['codec CVE exposure', 'none', 'pass'],
    ],
    verdict: 'quarantine',
    fixes: [
      { label: 'preamble / polyglot', value: 'zeroed' },
      { label: 'private tag payload', value: 'stripped' },
    ],
  },
  bomb: {
    file: 'length_bomb.dcm',
    checks: [
      ['preamble / polyglot', 'clean', 'pass'],
      ['element length bounds', 'declares 4 GB', 'fail'],
      ['sequence depth', 'ok', 'pass'],
      ['private tag payload', 'none', 'pass'],
      ['codec CVE exposure', 'none', 'pass'],
    ],
    verdict: 'quarantine',
    fixes: [{ label: 'element length bounds', value: 'rebuilt' }],
  },
  nested: {
    file: 'nested.dcm',
    checks: [
      ['preamble / polyglot', 'clean', 'pass'],
      ['element length bounds', 'valid', 'pass'],
      ['sequence depth', 'depth 214', 'fail'],
      ['private tag payload', 'none', 'pass'],
      ['codec CVE exposure', 'none', 'pass'],
    ],
    verdict: 'quarantine',
    fixes: [{ label: 'sequence depth', value: 'rebuilt' }],
  },
  video: {
    file: 'video.dcm',
    checks: [
      ['preamble / polyglot', 'clean', 'pass'],
      ['element length bounds', 'valid', 'pass'],
      ['sequence depth', 'ok (4)', 'pass'],
      ['private tag payload', 'none', 'pass'],
      ['codec CVE exposure', 'H.264 / FFmpeg', 'fail'],
    ],
    verdict: 'quarantine',
    fixes: [{ label: 'codec CVE exposure', value: 'transcoded' }],
  },
};

const scanner = document.getElementById('scanner');
const filesEl = document.getElementById('scannerFiles');
const resultsEl = document.getElementById('scannerResults');
const verdictEl = document.getElementById('verdict');
const disarmBtn = document.getElementById('disarmBtn');

let runToken = 0;
let currentKey = 'clean';
let timers = [];

function clearTimers() {
  timers.forEach(t => clearTimeout(t));
  timers = [];
}

function setVerdict(state, text) {
  verdictEl.textContent = text;
  verdictEl.className = 'verdict show ' + state;
}

function buildRow([label, value, status]) {
  const row = document.createElement('div');
  row.className = 's-result' + (status === 'fail' ? ' is-fail' : '');
  row.dataset.label = label;
  const l = document.createElement('span');
  l.className = 's-label';
  l.textContent = label;
  const s = document.createElement('span');
  s.className = 's-status ' + status;
  s.textContent = value;
  row.append(l, s);
  return row;
}

function runScan(key) {
  const sample = SAMPLES[key];
  if (!sample || !scanner) return;
  currentKey = key;
  runToken += 1;
  const token = runToken;
  clearTimers();

  // active chip
  filesEl.querySelectorAll('.file-chip').forEach(c => {
    c.classList.toggle('is-active', c.dataset.sample === key);
  });

  // reset
  verdictEl.className = 'verdict';
  verdictEl.textContent = '';
  disarmBtn.hidden = true;
  disarmBtn.disabled = false;
  disarmBtn.firstChild && (disarmBtn.childNodes[0].nodeValue = 'Disarm and rebuild ');
  resultsEl.innerHTML = '';

  const rows = sample.checks.map(buildRow);
  rows.forEach(r => resultsEl.appendChild(r));

  if (reduceMotion) {
    rows.forEach(r => r.classList.add('show'));
    finishScan(sample, token);
    return;
  }

  scanner.classList.add('scanning');
  rows.forEach((row, i) => {
    timers.push(setTimeout(() => {
      if (token !== runToken) return;
      row.classList.add('show');
    }, 280 + i * 235));
  });
  timers.push(setTimeout(() => {
    if (token !== runToken) return;
    scanner.classList.remove('scanning');
    finishScan(sample, token);
  }, 1600));
}

function finishScan(sample, token) {
  if (token !== runToken) return;
  if (sample.verdict === 'clean') {
    setVerdict('clean', 'verdict: clean');
    disarmBtn.hidden = true;
  } else {
    const n = sample.checks.filter(c => c[2] === 'fail').length;
    setVerdict('alert', `verdict: quarantine (${n} finding${n > 1 ? 's' : ''})`);
    disarmBtn.hidden = false;
  }
}

function runDisarm() {
  const sample = SAMPLES[currentKey];
  if (!sample || !sample.fixes || !sample.fixes.length) return;
  const token = runToken;
  disarmBtn.disabled = true;
  disarmBtn.childNodes[0].nodeValue = 'Rebuilding ';

  const apply = () => {
    if (token !== runToken) return;
    sample.fixes.forEach(fix => {
      const row = resultsEl.querySelector(`.s-result[data-label="${fix.label}"]`);
      if (!row) return;
      row.classList.remove('is-fail');
      row.classList.add('is-fixed');
      const status = row.querySelector('.s-status');
      status.className = 's-status pass';
      status.textContent = fix.value;
    });
    setVerdict('clean', `verdict: clean · ${sample.file.replace('.dcm', '.clean.dcm')}`);
    disarmBtn.hidden = true;
  };

  if (reduceMotion) { apply(); return; }
  scanner.classList.add('scanning');
  timers.push(setTimeout(() => {
    scanner.classList.remove('scanning');
    apply();
  }, 850));
}

if (scanner) {
  filesEl.addEventListener('click', (e) => {
    const chip = e.target.closest('.file-chip');
    if (chip) runScan(chip.dataset.sample);
  });
  disarmBtn.addEventListener('click', runDisarm);
  runScan('clean');
}

// ============================================
// Anatomy byte-map
// ============================================

const ANATOMY = {
  preamble: ['Preamble · 128 bytes', 'Arbitrary bytes at offset 0. The polyglot vector: an executable header can hide here (CVE-2019-11687).'],
  dicm: ['DICM · 4-byte magic', 'The format marker at offset 128. Permissive parsers skip a bad value and read the file anyway.'],
  meta: ['File Meta · group 0002', 'Holds the TransferSyntaxUID, which decides the byte order and which codec decodes the pixels.'],
  elements: ['Data Elements', 'Each is a tag, VR, length, and value. The length is attacker-controlled, which enables amplification and parser desync.'],
  pixel: ['Pixel Data · 7FE0,0010', 'Native or encapsulated fragments. Encapsulation routes data through libjpeg, OpenJPEG, or FFmpeg-class codecs.'],
};

const anatomyBar = document.getElementById('anatomyBar');
const anatomyCaption = document.getElementById('anatomyCaption');

if (anatomyBar && anatomyCaption) {
  const acTitle = anatomyCaption.querySelector('.ac-title');
  const acText = anatomyCaption.querySelector('.ac-text');
  const segs = [...anatomyBar.querySelectorAll('.seg')];

  const selectTab = (seg, { focus = false } = {}) => {
    const info = ANATOMY[seg.dataset.info];
    if (!info) return;
    segs.forEach(s => {
      const on = s === seg;
      s.classList.toggle('is-active', on);
      s.setAttribute('aria-selected', on ? 'true' : 'false');
      s.tabIndex = on ? 0 : -1;
    });
    anatomyCaption.setAttribute('aria-labelledby', seg.id);
    acTitle.textContent = info[0];
    acText.textContent = info[1];
    if (focus) seg.focus();
  };

  anatomyBar.addEventListener('click', (e) => {
    const seg = e.target.closest('.seg');
    if (seg) selectTab(seg);
  });

  anatomyBar.addEventListener('keydown', (e) => {
    const i = segs.indexOf(document.activeElement);
    if (i === -1) return;
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = segs[(i + 1) % segs.length];
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = segs[(i - 1 + segs.length) % segs.length];
    else if (e.key === 'Home') next = segs[0];
    else if (e.key === 'End') next = segs[segs.length - 1];
    if (!next) return;
    e.preventDefault();
    selectTab(next, { focus: true });
  });
}

// ============================================
// Copy install command
// ============================================

const copyBtn = document.getElementById('copyBtn');
const install = document.getElementById('install');
if (copyBtn && install) {
  copyBtn.addEventListener('click', async () => {
    const text = install.dataset.copy;
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
    }
    copyBtn.textContent = 'Copied';
    copyBtn.classList.add('copied');
    setTimeout(() => {
      copyBtn.textContent = 'Copy';
      copyBtn.classList.remove('copied');
    }, 1600);
  });
}

// ============================================
// Stats count-up
// ============================================

function animateCount(el) {
  if (el.dataset.counted) return;
  const raw = el.textContent.trim();
  const m = raw.match(/^([\d,]+)(.*)$/);
  if (!m) return;
  el.dataset.counted = '1';
  const target = parseInt(m[1].replace(/,/g, ''), 10);
  const suffix = m[2] || '';
  if (reduceMotion || target === 0) return; // leave the authored value untouched
  const duration = 1100;
  const start = performance.now();
  const format = (n) => Math.round(n).toLocaleString('en-US') + suffix;
  const tick = (now) => {
    const p = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = format(target * eased);
    if (p < 1) requestAnimationFrame(tick);
    else el.textContent = raw; // restore exact authored grouping + suffix
  };
  requestAnimationFrame(tick);
}

const statsBar = document.querySelector('.stats-bar');
if (statsBar) {
  const statsObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.querySelectorAll('.stat-number').forEach(animateCount);
      statsObserver.unobserve(entry.target);
    });
  }, { threshold: 0.4 });
  statsObserver.observe(statsBar);
}
