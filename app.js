(() => {
  const db = window.PRESENTATIONS || [];
  const $ = s => document.querySelector(s);
  const grid = $('#grid'), player = $('#player'), pcanvas = $('#pcanvas'),
        pframe = $('#pframe'), shield = $('#shield'), count = $('#count'), bar = $('#bar');
  const BASE = 'presentations/';
  if (location.protocol === 'file:') $('#local-warning').hidden = false;
  const isPdf = f => /\.pdf$/i.test(f);
  const url = p => BASE + encodeURI(p.file);
  const pdfjs = window.pdfjsLib;
  if (pdfjs) pdfjs.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  const fmt = d => { const x = new Date(d);
    return isNaN(x) ? '' : x.toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' }); };

  /* ---------- Grid ---------- */
  if (!db.length) $('#empty').hidden = false;

  db.forEach(p => {
    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML = `<div class="thumb"></div>
      <div class="info"><h2></h2><p></p><span class="date"></span></div>
      <button type="button">Present</button>`;
    card.querySelector('h2').textContent = p.title || p.file;
    card.querySelector('p').textContent = p.description || '';
    const dateEl = card.querySelector('.date');
    dateEl.textContent = p.modified ? 'Modified ' + fmt(p.modified) : '';
    if (!p.modified) // fall back to the server's Last-Modified header, when available
      fetch(url(p), { method:'HEAD' }).then(r => {
        const lm = r.headers.get('Last-Modified');
        if (lm) dateEl.textContent = 'Modified ' + fmt(lm);
      }).catch(() => {});

    const thumb = card.querySelector('.thumb');
    if (isPdf(p.file)) {
      const c = document.createElement('canvas'); thumb.appendChild(c);
      if (pdfjs) pdfjs.getDocument(url(p)).promise.then(async d => {
        const pg = await d.getPage(1), v0 = pg.getViewport({ scale:1 });
        const vp = pg.getViewport({ scale: 640 / v0.width });
        c.width = vp.width; c.height = vp.height;
        await pg.render({ canvasContext:c.getContext('2d'), viewport:vp }).promise;
      }).catch(() => {});
    } else {
      const f = document.createElement('iframe');
      f.src = url(p); f.loading = 'lazy'; f.tabIndex = -1; f.title = '';
      thumb.appendChild(f);
      new ResizeObserver(() => { f.style.transform = `scale(${thumb.clientWidth / 1920})`; }).observe(thumb);
    }
    thumb.addEventListener('click', () => present(p));
    card.querySelector('button').addEventListener('click', () => present(p));
    grid.appendChild(card);
  });

  /* ---------- Player ---------- */
  let mode = null, pdf = null, page = 1, total = 0, token = 0, timer;

  function hud() {
    count.textContent = total ? `${page} / ${total}` : '';
    bar.style.width = total ? (page / total * 100) + '%' : '0';
  }
  function wake() {
    player.classList.add('show'); player.classList.remove('idle');
    clearTimeout(timer);
    timer = setTimeout(() => { player.classList.remove('show'); player.classList.add('idle'); }, 2200);
  }

  async function present(p) {
    mode = null; page = 1; total = 0; hud();
    player.hidden = false;
    try { await player.requestFullscreen(); } catch (e) {}
    player.focus();
    pcanvas.hidden = pframe.hidden = true;
    if (isPdf(p.file) && pdfjs) {
      try {
        pdf = await pdfjs.getDocument(url(p)).promise;
        mode = 'pdf'; total = pdf.numPages; pcanvas.hidden = false;
        await render();
      } catch (e) { pdf = null; }       // e.g. opened from file:// — use the browser viewer
    }
    if (!mode) {
      mode = 'frame';
      pframe.src = url(p) + (isPdf(p.file) ? '#view=Fit&toolbar=0&navpanes=0&scrollbar=0' : '');
      pframe.hidden = false;
    }
    hud(); wake();
  }

  function close() {
    player.hidden = true; mode = null; token++;
    pframe.src = 'about:blank'; pframe.hidden = pcanvas.hidden = true;
    if (pdf) { pdf.destroy(); pdf = null; }
    if (document.fullscreenElement) document.exitFullscreen();
  }

  async function render() {
    const t = ++token, pg = await pdf.getPage(page);
    if (t !== token) return;
    const w = player.clientWidth, h = player.clientHeight, v0 = pg.getViewport({ scale:1 });
    const s = Math.min(w / v0.width, h / v0.height), dpr = devicePixelRatio || 1;
    const vp = pg.getViewport({ scale: s * dpr });
    const off = document.createElement('canvas'); off.width = vp.width; off.height = vp.height;
    await pg.render({ canvasContext:off.getContext('2d'), viewport:vp }).promise;
    if (t !== token) return;
    pcanvas.width = vp.width; pcanvas.height = vp.height;
    pcanvas.style.width = vp.width / dpr + 'px'; pcanvas.style.height = vp.height / dpr + 'px';
    pcanvas.getContext('2d').drawImage(off, 0, 0);
  }

  function go(d) {
    if (mode === 'pdf') {
      const n = Math.max(1, Math.min(total, page + d));
      if (n !== page) { page = n; hud(); render(); }
    } else if (mode === 'frame') {
      pframe.contentWindow && pframe.contentWindow.postMessage({ type:'nav', dir:d }, '*');
    }
    wake();
  }

  // HTML decks report their position: parent.postMessage({type:'slide', index, total}, '*')
  addEventListener('message', e => {
    const m = e.data;
    if (mode === 'frame' && e.source === pframe.contentWindow && m && m.type === 'slide' &&
        Number.isInteger(m.index) && Number.isInteger(m.total) &&
        m.total > 0 && m.index >= 0 && m.index < m.total) {
      page = m.index + 1; total = m.total; hud();
    }
  });

  player.addEventListener('mousemove', wake);
  shield.addEventListener('mousedown', e => e.preventDefault());
  shield.addEventListener('click', e => go(e.clientX < innerWidth / 3 ? -1 : 1));
  addEventListener('resize', () => { if (mode === 'pdf') render(); });
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && !player.hidden) close(); });

  addEventListener('keydown', e => {
    if (player.hidden) return;
    const k = e.key;
    if (k === 'Escape') return close();
    if (['ArrowRight','ArrowDown','PageDown',' '].includes(k)) { e.preventDefault(); go(1); }
    else if (['ArrowLeft','ArrowUp','PageUp'].includes(k)) { e.preventDefault(); go(-1); }
    else if (k === 'Home') {
      e.preventDefault();
      if (mode === 'pdf') { page = 1; hud(); render(); wake(); }
      else if (mode === 'frame' && pframe.contentWindow) {
        pframe.contentWindow.postMessage({ type:'jump', index:0 }, '*');
        wake();
      }
    }
    else if (k === 'End') {
      e.preventDefault();
      if (mode === 'pdf') { page = total; hud(); render(); wake(); }
      else if (mode === 'frame' && pframe.contentWindow) {
        pframe.contentWindow.postMessage({ type:'jump', index:total - 1 }, '*');
        wake();
      }
    }
  });
})();
