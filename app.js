'use strict';
(() => {
  const CFG = { WA: '2349068771239', EMAIL: 'sales@vweldcore.com.ng', VERSION: '6.0', DB: 'VWELDCORE_DB', STORE: 'assessments' };
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  };
  // Escape anything inserted as HTML (stops injection from imported files).
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeImg = s => (typeof s === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s)) ? s : '';
  const fileSafe = s => String(s).replace(/[^\w-]+/g, '_').slice(0, 40);
  let toastT;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2800); }

  // ---------- IndexedDB (same DB and store as earlier versions, so old reports still load) ----------
  let dbp = null;
  function db() {
    if (dbp === null) {
      dbp = new Promise((res, rej) => {
        const q = indexedDB.open(CFG.DB, 1);
        q.onupgradeneeded = e => { const d = e.target.result; if (d.objectStoreNames.contains(CFG.STORE) === false) d.createObjectStore(CFG.STORE, { keyPath: 'id' }); };
        q.onsuccess = () => res(q.result);
        q.onerror = () => { dbp = null; rej(q.error); };
      });
    }
    return dbp;
  }
  async function dbAll() {
    const d = await db();
    return new Promise((res, rej) => {
      const r = d.transaction(CFG.STORE, 'readonly').objectStore(CFG.STORE).getAll();
      r.onsuccess = () => res(r.result.sort((a, b) => (b.ts || 0) - (a.ts || 0)));
      r.onerror = () => rej(r.error);
    });
  }
  async function write(fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction(CFG.STORE, 'readwrite');
      fn(t.objectStore(CFG.STORE));
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
  }
  const dbPut = item => write(s => s.put(item));
  const dbDel = id => write(s => s.delete(id));

  // ---------- State ----------
  let allRecs = [], objUrls = [];
  let photo = '', videoBlob = null, videoName = '', gps = 'Not captured';
  let step = 1, sigDirty = false, sigSized = false, cur = null;
  const FIELDS = ['engName', 'engPhone', 'clientName', 'location', 'serviceType', 'unitType', 'capacity', 'gasType', 'powerPhase', 'suctionPsi', 'dischargePsi', 'amps', 'voltage', 'boxTemp', 'compStatus', 'notes'];
  const STEP_NAMES = ['Client & site', 'Equipment', 'Readings', 'Photos & sign-off'];
  const ROUTES = ['home', 'inspect', 'saved', 'guide', 'more'];

  async function loadRecs() { try { allRecs = await dbAll(); } catch (e) { allRecs = []; } updateCounts(); }
  function updateCounts() {
    const n = allRecs.length, b = $('#navCount');
    b.textContent = n > 99 ? '99+' : n; b.hidden = n === 0;
  }

  // ---------- Router ----------
  function go() {
    const r = (location.hash.replace(/^#\/?/, '') || 'home').split('/')[0];
    show(ROUTES.indexOf(r) >= 0 ? r : 'home');
  }
  function show(r) {
    if (document.body.classList.contains('booting')) return;
    const prev = cur; cur = r;
    const dir = prev === null ? 0 : Math.sign(ROUTES.indexOf(r) - ROUTES.indexOf(prev));
    $$('.page').forEach(p => p.classList.remove('active'));
    const pg = $('#page-' + r);
    pg.style.setProperty('--dx', (dir * 34) + 'px');
    Array.from(pg.children).forEach((el, i) => el.style.setProperty('--i', i));
    pg.classList.add('active');
    $$('.nav a').forEach(a => a.classList.toggle('active', a.dataset.r === r));
    $('#tbTitle').textContent = pg.dataset.title;
    window.scrollTo({ top: 0 });
    if (r === 'home') renderHome();
    if (r === 'saved') renderRecords();
    if (r === 'inspect') setStep(step, true);
  }

  // ---------- Home ----------
  function countUp(el, to) {
    if (reduce || to === 0) { el.textContent = to; return; }
    const t0 = performance.now();
    const f = now => { const k = Math.min(1, (now - t0) / 700); el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(f); };
    requestAnimationFrame(f);
  }
  async function renderHome() {
    await loadRecs();
    const p = store.get('vw-profile', {}), h = new Date().getHours();
    $('#greet').textContent = h < 12 ? 'Good morning' : (h < 17 ? 'Good afternoon' : 'Good evening');
    $('#heroName').textContent = p.engName ? p.engName : 'Field Engineer';
    const today = new Date().toDateString();
    countUp($('#stTotal'), allRecs.length);
    countUp($('#stPending'), allRecs.filter(r => r.exported !== true).length);
    countUp($('#stToday'), allRecs.filter(r => r.ts && new Date(r.ts).toDateString() === today).length);
    const r = allRecs[0];
    $('#lastBody').innerHTML = r === undefined
      ? '<div class="mut sm">No inspections yet. Tap <b>Start New Inspection</b> to record your first site assessment.</div>'
      : `<div class="rec-top"><strong>${esc(r.client)}</strong><span class="badge">${esc(r.id)}</span></div>
         <div class="mut sm" style="margin-top:4px">${esc(r.date)} &bull; ${esc(r.unitType)} ${esc(r.capacity)}</div>
         <a class="btn btn-outline sm" href="#/saved">Open saved reports →</a>`;
  }
  // ---- end part 1 ----

  // ---------- Inspect: draft, steps, validation ----------
  function saveDraft() {
    const d = {}; FIELDS.forEach(f => { d[f] = $('#' + f).value; }); d.gps = gps;
    store.set('vw-draft', d);
    store.set('vw-profile', { engName: $('#engName').value.trim(), engPhone: $('#engPhone').value.trim() });
  }
  function loadDraft() {
    const d = store.get('vw-draft', null), p = store.get('vw-profile', {});
    if (d !== null) FIELDS.forEach(f => { if (d[f] !== undefined) $('#' + f).value = d[f]; });
    if ($('#engName').value === '' && p.engName) $('#engName').value = p.engName;
    if ($('#engPhone').value === '' && p.engPhone) $('#engPhone').value = p.engPhone;
    if (d !== null && d.gps && d.gps !== 'Not captured') { gps = d.gps; $('#gpsBtn').textContent = '✅ ' + gps; }
  }
  function setStep(n, quiet) {
    step = Math.min(4, Math.max(1, n));
    $$('.step').forEach(s => s.classList.toggle('active', Number(s.dataset.step) === step));
    $('#stepNo').textContent = step;
    $('#stepName').textContent = STEP_NAMES[step - 1];
    $('#stepBar').style.width = (step * 25) + '%';
    $$('#stepDots span').forEach((d, i) => { d.classList.toggle('on', i === step - 1); d.classList.toggle('done', i < step - 1); });
    $('#btnBack').style.display = step === 1 ? 'none' : '';
    $('#stepActions').classList.toggle('first', step === 1);
    const nx = $('#btnNext');
    nx.textContent = step === 4 ? '💾 Save Assessment' : 'Next →';
    nx.className = 'btn ' + (step === 4 ? 'btn-ok' : 'btn-primary');
    if (step === 4) sizeCanvas();
    if (quiet !== true) window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function validate(n) {
    let ok = true;
    if (n === 1) ['engName', 'clientName'].forEach(id => { const el = $('#' + id), bad = el.value.trim() === ''; el.classList.toggle('bad', bad); if (bad) ok = false; });
    if (ok === false) { toast('Fill in the required fields'); const f = $('#page-inspect .bad'); if (f) f.focus(); }
    return ok;
  }

  // Signature pad
  const cv = $('#sigPad'), cx = cv.getContext('2d');
  let drawing = false;
  function sizeCanvas() {
    if (sigSized || cv.clientWidth === 0) return;
    cv.width = cv.clientWidth; cv.height = 140;
    cx.lineWidth = 2.8; cx.lineCap = 'round'; cx.lineJoin = 'round'; cx.strokeStyle = '#00005c';
    sigSized = true;
  }
  function pos(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * (cv.width / r.width), y: (e.clientY - r.top) * (cv.height / r.height) }; }
  cv.addEventListener('pointerdown', e => { sizeCanvas(); drawing = true; cv.setPointerCapture(e.pointerId); const p = pos(e); cx.beginPath(); cx.moveTo(p.x, p.y); cx.lineTo(p.x + 0.1, p.y); cx.stroke(); sigDirty = true; });
  cv.addEventListener('pointermove', e => { if (drawing) { const p = pos(e); cx.lineTo(p.x, p.y); cx.stroke(); } });
  ['pointerup', 'pointercancel'].forEach(ev => cv.addEventListener(ev, () => { drawing = false; }));
  function clearSig() { cx.clearRect(0, 0, cv.width, cv.height); sigDirty = false; }

  // GPS, photo, video
  function getGPS() {
    const b = $('#gpsBtn'); b.textContent = 'Locating...';
    if (navigator.geolocation === undefined) { b.textContent = '⚠️ No GPS'; return; }
    navigator.geolocation.getCurrentPosition(
      p => { gps = p.coords.latitude.toFixed(5) + ', ' + p.coords.longitude.toFixed(5); b.textContent = '✅ ' + gps; saveDraft(); },
      () => { b.textContent = '⚠️ GPS off'; toast('Enable phone location / GPS'); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }
  function processPhoto(e) {
    const f = e.target.files[0]; if (f === undefined) return;
    const url = URL.createObjectURL(f), img = new Image();
    img.onload = () => {
      const sc = Math.min(900 / img.width, 1), c = document.createElement('canvas');
      c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      photo = c.toDataURL('image/jpeg', 0.7); URL.revokeObjectURL(url);
      const p = $('#photoPreview'); p.src = photo; p.hidden = false;
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast('Could not read that photo'); };
    img.src = url;
  }
  function processVideo(e) {
    const f = e.target.files[0]; if (f === undefined) return;
    videoBlob = f; videoName = f.name || ('video_' + Date.now() + '.mp4');
    const v = $('#videoPreview'); if (v.src) URL.revokeObjectURL(v.src);
    v.src = URL.createObjectURL(f); v.hidden = false;
    $('#videoInfo').textContent = '✅ Video ready (' + (f.size / 1048576).toFixed(1) + ' MB)';
  }
  function resetForm() {
    FIELDS.forEach(f => { const el = $('#' + f); if (el.tagName === 'SELECT') el.selectedIndex = 0; else el.value = ''; });
    const p = store.get('vw-profile', {});
    $('#engName').value = p.engName || ''; $('#engPhone').value = p.engPhone || '';
    photo = ''; videoBlob = null; videoName = ''; gps = 'Not captured';
    $('#gpsBtn').textContent = '📍 Capture GPS';
    $('#photoPreview').hidden = true; $('#photoIn').value = '';
    const v = $('#videoPreview'); if (v.src) URL.revokeObjectURL(v.src); v.removeAttribute('src'); v.hidden = true;
    $('#videoIn').value = ''; $('#videoInfo').textContent = '';
    clearSig(); store.del('vw-draft');
  }

  async function save() {
    if (validate(1) === false) { setStep(1); return; }
    if (sigDirty === false && confirm('No client signature captured. Save anyway?') === false) return;
    const v = id => $('#' + id).value.trim();
    const rec = {
      id: 'VW-' + Date.now().toString(36).toUpperCase(), ts: Date.now(), date: new Date().toLocaleString('en-NG'),
      engName: v('engName'), engPhone: v('engPhone'), client: v('clientName'), location: v('location'), gps,
      serviceType: v('serviceType'), unitType: v('unitType'), capacity: v('capacity'), gasType: v('gasType'),
      powerPhase: v('powerPhase'), suctionPsi: v('suctionPsi'), dischargePsi: v('dischargePsi'), amps: v('amps'),
      voltage: v('voltage'), boxTemp: v('boxTemp'), compStatus: v('compStatus'), notes: v('notes'),
      photo, videoBlob, videoName, signature: sigDirty ? cv.toDataURL('image/png') : '', exported: false
    };
    try { await dbPut(rec); } catch (e) { toast('Save failed: phone storage may be full'); return; }
    resetForm(); setStep(1, true);
    toast('✅ Saved offline: ' + rec.id);
    location.hash = '#/saved';
  }
  // ---- end part 2 ----

  // ---------- Saved ----------
  function recHTML(r, vu) {
    const ph = safeImg(r.photo);
    return `<div class="rec">
      <div class="rec-top"><strong>${esc(r.client)}</strong><span class="badge${r.exported === true ? ' ok' : ''}">${esc(r.id)}</span></div>
      <div class="sm" style="color:var(--blue2);margin-top:3px">Engineer: ${esc(r.engName || 'N/A')} (${esc(r.engPhone || '-')})</div>
      <div class="mut sm" style="margin:4px 0">${esc(r.date)} &bull; ${esc(r.unitType)} (${esc(r.capacity)})</div>
      <div class="sm">Gas <b>${esc(r.gasType)}</b> | Amps <b>${esc(r.amps || '-')}A</b> | Temp <b>${esc(r.boxTemp || '-')}°C</b></div>
      <div class="mut sm" style="margin-top:4px">${esc(r.notes || '')}</div>
      ${ph ? `<img src="${ph}" class="preview" alt="Site photo">` : ''}${vu ? `<video src="${vu}" class="preview" controls playsinline></video>` : ''}
      <div class="row">
        <button class="btn btn-gold sm" data-act="print" data-id="${esc(r.id)}">📄 PDF Job Card</button>
        <button class="btn btn-primary sm" data-act="share" data-id="${esc(r.id)}">📲 Share Data</button>
      </div>
      <div class="row">
        ${vu ? `<button class="btn btn-ok sm" data-act="video" data-id="${esc(r.id)}">🎥 Share Video</button>` : '<div></div>'}
        <button class="btn btn-danger sm" data-act="del" data-id="${esc(r.id)}">Delete</button>
      </div></div>`;
  }
  async function renderRecords() {
    await loadRecs();
    const q = $('#search').value.trim().toLowerCase();
    const list = allRecs.filter(r => q === '' || [r.client, r.id, r.engName, r.location].join(' ').toLowerCase().indexOf(q) >= 0);
    objUrls.forEach(u => URL.revokeObjectURL(u)); objUrls = [];
    const box = $('#recordsList');
    if (list.length === 0) { box.innerHTML = `<div class="card empty">${q ? 'No matching reports.' : 'No assessments saved yet.<br><a class="btn btn-gold sm" href="#/inspect">+ Start an inspection</a>'}</div>`; return; }
    box.innerHTML = list.map(r => {
      const vu = r.videoBlob instanceof Blob ? URL.createObjectURL(r.videoBlob) : '';
      if (vu) objUrls.push(vu);
      return recHTML(r, vu);
    }).join('');
  }
  async function markExported(id) { const r = allRecs.find(x => x.id === id); if (r && r.exported !== true) { r.exported = true; await dbPut(r); updateCounts(); } }

  async function printCard(id) {
    const r = allRecs.find(x => x.id === id); if (r === undefined) return;
    const ph = safeImg(r.photo), sg = safeImg(r.signature);
    $('#print-sheet').innerHTML = `
    <div style="border:2px solid #00005c;padding:16px;border-radius:8px;font-family:Arial,sans-serif;color:#000">
      <div style="display:flex;justify-content:space-between;gap:10px;border-bottom:3px solid #ffe600;padding-bottom:10px">
        <div style="display:flex;gap:10px;align-items:center">
          <img src="icons/icon-192.png" style="height:54px;width:54px;border-radius:8px" alt="">
          <div><h2 style="margin:0;color:#00005c;font-size:18px">VWELDCORE INNOVATIONS NIG LTD</h2>
          <div style="font-size:11px">RC 8909233 &bull; Olota Junction, Abule Egba, Lagos<br>+234 906 877 1239 &bull; sales@vweldcore.com.ng</div></div>
        </div>
        <div style="text-align:right;font-size:12px"><strong style="color:#00005c;font-size:14px">FIELD JOB CARD</strong><br>ID: ${esc(r.id)}<br>${esc(r.date)}</div>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-top:12px;font-size:13px" border="1" cellpadding="6">
        <tr><td><b>Client / Facility:</b> ${esc(r.client)}</td><td><b>Location / GPS:</b> ${esc(r.location)} (${esc(r.gps)})</td></tr>
        <tr><td><b>Field Engineer:</b> ${esc(r.engName || '-')} (${esc(r.engPhone || '-')})</td><td><b>Service Type:</b> ${esc(r.serviceType)}</td></tr>
        <tr><td><b>Equipment:</b> ${esc(r.unitType)} (${esc(r.capacity)})</td><td><b>Gas / Power:</b> ${esc(r.gasType)} / ${esc(r.powerPhase)}</td></tr>
        <tr><td><b>Pressures:</b> Suction ${esc(r.suctionPsi || '-')} PSI | Discharge ${esc(r.dischargePsi || '-')} PSI</td><td><b>Electrical / Temp:</b> ${esc(r.amps || '-')}A | ${esc(r.voltage || '-')}V | ${esc(r.boxTemp || '-')}°C</td></tr>
        <tr><td colspan="2"><b>Compressor Status:</b> ${esc(r.compStatus)}</td></tr>
        <tr><td colspan="2"><b>Observations &amp; Parts Required:</b><br>${esc(r.notes || 'None')}</td></tr>
      </table>
      ${ph ? `<div style="margin-top:10px"><b>Site Photo:</b><br><img src="${ph}" style="max-height:180px;border:1px solid #ccc"></div>` : ''}
      <div style="margin-top:16px;display:flex;justify-content:space-between;align-items:flex-end">
        <div><b>Client / Site Sign-Off:</b><br>${sg ? `<img src="${sg}" style="height:60px;border-bottom:1px solid #000">` : '<div style="height:60px;width:200px;border-bottom:1px solid #000"></div>'}</div>
        <div style="font-size:11px;color:#555">Generated offline via VWELDCORE Field Inspector</div>
      </div>
    </div>`;
    await sleep(400);
    window.print();
  }
  async function shareOne(id) {
    const r = allRecs.find(x => x.id === id); if (r === undefined) return;
    const { videoBlob: _v, ...clean } = r;
    const summary = ['*VWELDCORE INNOVATIONS NIG LTD (RC 8909233)*', '*FIELD ASSESSMENT: ' + r.id + '*', 'Engineer: ' + r.engName + ' (' + r.engPhone + ')', 'Date: ' + r.date, 'Client: ' + r.client,
      'Location: ' + r.location + ' (' + r.gps + ')', 'Service: ' + r.serviceType, 'Unit: ' + r.unitType + ' (' + r.capacity + ')', 'Gas: ' + r.gasType + ' | Power: ' + r.powerPhase,
      'Readings: Suction ' + r.suctionPsi + ' PSI | Discharge ' + r.dischargePsi + ' PSI | ' + r.amps + 'A | ' + r.voltage + 'V | Temp ' + r.boxTemp + '°C', 'Compressor: ' + r.compStatus, 'Notes: ' + r.notes].join('\n');
    const file = new File([JSON.stringify(clean, null, 2)], r.id + '_' + fileSafe(r.client) + '.json', { type: 'application/json' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ title: 'VWELDCORE Report ' + r.id, text: summary, files: [file] });
      else window.open('https://wa.me/?text=' + encodeURIComponent(summary), '_blank', 'noopener');
      await markExported(id);
    } catch (e) { if (e && e.name !== 'AbortError') toast('Share failed'); }
  }
  async function shareVid(id) {
    const r = allRecs.find(x => x.id === id);
    if (r === undefined || (r.videoBlob instanceof Blob) === false) return;
    const file = new File([r.videoBlob], r.id + '_' + (r.videoName || 'fault.mp4'), { type: r.videoBlob.type || 'video/mp4' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ title: 'VWELDCORE Video ' + r.id, text: 'Fault video by ' + r.engName + ' for ' + r.client + ' (' + r.id + ')', files: [file] });
      else toast('This browser cannot share files directly');
    } catch (e) { if (e && e.name !== 'AbortError') toast('Share failed'); }
  }
  async function delRec(id) { if (confirm('Delete this record permanently?')) { await dbDel(id); renderRecords(); toast('Deleted'); } }
  // ---- end part 3 ----

  // ---------- Export / import (imports are sanitized) ----------
  async function exportAll() {
    await loadRecs();
    if (allRecs.length === 0) { toast('No records to export'); return; }
    const clean = allRecs.map(({ videoBlob, ...rest }) => rest);
    const name = 'VWELDCORE_Backup_' + new Date().toISOString().slice(0, 10) + '.json';
    const file = new File([JSON.stringify(clean, null, 2)], name, { type: 'application/json' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ title: 'VWELDCORE Field Backup', files: [file] });
      else { const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
    } catch (e) { if (e && e.name !== 'AbortError') toast('Export failed'); return; }
    for (const r of allRecs) { if (r.exported !== true) { r.exported = true; await dbPut(r); } }
    await loadRecs(); toast('Exported ✔');
  }
  function cleanRecord(x) {
    if (x === null || typeof x !== 'object') return null;
    if (typeof x.id !== 'string' || /^VW-[A-Za-z0-9]{3,12}$/.test(x.id) === false) return null;
    const s = (v, n) => String(v == null ? '' : v).slice(0, n || 120);
    return {
      id: x.id, ts: Number(x.ts) || 0, date: s(x.date, 60), engName: s(x.engName, 80), engPhone: s(x.engPhone, 30), client: s(x.client),
      location: s(x.location, 160), gps: s(x.gps, 60), serviceType: s(x.serviceType, 80), unitType: s(x.unitType, 80), capacity: s(x.capacity, 60),
      gasType: s(x.gasType, 40), powerPhase: s(x.powerPhase, 60), suctionPsi: s(x.suctionPsi, 12), dischargePsi: s(x.dischargePsi, 12),
      amps: s(x.amps, 12), voltage: s(x.voltage, 12), boxTemp: s(x.boxTemp, 12), compStatus: s(x.compStatus, 60), notes: s(x.notes, 3000),
      photo: safeImg(x.photo), signature: safeImg(x.signature), videoName: '', exported: true
    };
  }
  function importFile(e) {
    const f = e.target.files[0]; if (f === undefined) return;
    if (f.size > 40 * 1048576) { toast('File too large'); return; }
    const rd = new FileReader();
    rd.onload = async () => {
      try {
        const data = JSON.parse(rd.result), items = Array.isArray(data) ? data : [data];
        await loadRecs();
        const have = new Set(allRecs.map(r => r.id));
        let added = 0;
        for (const it of items) { const c = cleanRecord(it); if (c !== null && have.has(c.id) === false) { await dbPut(c); have.add(c.id); added++; } }
        toast('✅ Imported ' + added + ' new report(s)');
        e.target.value = ''; location.hash = '#/saved'; renderRecords();
      } catch (err) { toast('Invalid VWELDCORE JSON file'); }
    };
    rd.readAsText(f);
  }

  // ---------- Install, share, update ----------
  let deferred = null;
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); deferred = e;
    let dismissed = false; try { dismissed = sessionStorage.getItem('vw-dismiss') !== null; } catch (x) { /* ignore */ }
    if (standalone() === false && dismissed === false) setTimeout(() => { $('#installBanner').hidden = false; }, 3500);
  });
  window.addEventListener('appinstalled', () => { $('#installBanner').hidden = true; toast('App installed ✔'); });
  async function installApp() {
    if (standalone()) { toast('App is already installed'); return; }
    if (deferred === null) { alert("In Chrome tap the menu (⋮), then 'Install app' or 'Add to Home screen'."); return; }
    deferred.prompt(); await deferred.userChoice; deferred = null; $('#installBanner').hidden = true;
  }
  async function shareApp() {
    const url = new URL('./', location.href).href;
    try {
      if (navigator.share) await navigator.share({ title: 'VWELDCORE Field Inspector', text: 'Install the VWELDCORE Field Inspector app (works offline):', url });
      else { await navigator.clipboard.writeText(url); toast('Link copied. Paste it in WhatsApp'); }
    } catch (e) { /* cancelled */ }
  }
  async function checkUpdate() {
    if ('serviceWorker' in navigator === false) { toast('Updates need a newer browser'); return; }
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg === undefined) { toast('Open the app online once first'); return; }
    try { await reg.update(); toast('Checked. Close and reopen the app to apply any update'); } catch (e) { toast('You are offline'); }
  }

  // ---------- Quote request ----------
  function quote() {
    const g = id => $('#' + id).value.trim();
    let ok = true;
    ['qName', 'qPhone', 'qDetails'].forEach(id => { const el = $('#' + id), bad = el.value.trim() === ''; el.classList.toggle('bad', bad); if (bad) ok = false; });
    if (ok === false) { toast('Fill in the required fields'); return null; }
    return { cat: g('qCat'), text: ['RFQ from VWELDCORE Field App', 'Name: ' + g('qName'), 'Company: ' + g('qCompany'), 'Phone: ' + g('qPhone'), 'Category: ' + g('qCat'), 'Location: ' + g('qLoc'), 'Details: ' + g('qDetails')].join('\n') };
  }

  // ---------- Wiring ----------
  const isField = el => /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && el.type !== 'file';
  function wire() {
    $('#nav').addEventListener('click', () => { try { navigator.vibrate(8); } catch (e) { /* ignore */ } });
    $('#btnNext').addEventListener('click', () => { if (step < 4) { if (validate(step)) setStep(step + 1); } else save(); });
    $('#btnBack').addEventListener('click', () => setStep(step - 1));
    $$('#stepDots span').forEach((d, i) => d.addEventListener('click', () => { if (i + 1 < step) setStep(i + 1); }));
    $('#gpsBtn').addEventListener('click', getGPS);
    $('#photoIn').addEventListener('change', processPhoto);
    $('#videoIn').addEventListener('change', processVideo);
    $('#btnClearSig').addEventListener('click', clearSig);
    $('#page-inspect').addEventListener('input', e => { e.target.classList.remove('bad'); saveDraft(); });
    $('#search').addEventListener('input', renderRecords);
    $('#recordsList').addEventListener('click', e => {
      const b = e.target.closest('[data-act]'); if (b === null) return;
      const id = b.dataset.id, a = b.dataset.act;
      if (a === 'print') printCard(id); else if (a === 'share') shareOne(id); else if (a === 'video') shareVid(id); else if (a === 'del') delRec(id);
    });
    $('#btnExport').addEventListener('click', exportAll);
    $('#importIn').addEventListener('change', importFile);
    $('#btnInstall').addEventListener('click', installApp);
    $('#btnBannerInstall').addEventListener('click', installApp);
    $('#btnBannerClose').addEventListener('click', () => { $('#installBanner').hidden = true; try { sessionStorage.setItem('vw-dismiss', '1'); } catch (e) { /* ignore */ } });
    $('#btnShareApp').addEventListener('click', shareApp);
    $('#btnUpdate').addEventListener('click', checkUpdate);
    $('#btnQWa').addEventListener('click', () => { const q = quote(); if (q) window.open('https://wa.me/' + CFG.WA + '?text=' + encodeURIComponent(q.text), '_blank', 'noopener'); });
    $('#btnQMail').addEventListener('click', () => { const q = quote(); if (q) location.href = 'mailto:' + CFG.EMAIL + '?subject=' + encodeURIComponent('RFQ - ' + q.cat) + '&body=' + encodeURIComponent(q.text); });
    // Hide the bottom bar while the keyboard is open so it never covers inputs
    document.addEventListener('focusin', e => { if (isField(e.target)) document.body.classList.add('kb'); });
    document.addEventListener('focusout', () => setTimeout(() => { const a = document.activeElement; if (a === null || isField(a) === false) document.body.classList.remove('kb'); }, 120));
    const net = () => { const on = navigator.onLine; $('#net').classList.toggle('off', on === false); $('#netTxt').textContent = on ? 'Online' : 'Offline'; };
    window.addEventListener('online', net); window.addEventListener('offline', net); net();
    window.addEventListener('hashchange', go);
  }

  function reveal() {
    document.body.classList.remove('booting');
    document.body.classList.add('app-ready');
    $('#splash').classList.add('hide');
    go();
    setTimeout(() => { const s = $('#splash'); if (s) s.remove(); }, 900);
  }

  $('#appVer').textContent = CFG.VERSION;
  wire(); loadDraft(); setStep(1, true); loadRecs();
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(err => console.warn('SW registration failed', err)));
  window.addEventListener('load', () => setTimeout(reveal, reduce ? 300 : 2400));
})();
