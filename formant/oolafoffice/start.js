(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  /* Safari's Lockdown Mode takes IndexedDB away (the name is undefined), which Recent Files, unsaved
     versions and opening files from here need */
  const noStorage = typeof indexedDB === 'undefined';
  if (noStorage) alert('oolafOffice keeps Recent Files and unsaved changes in this browser, and Safari\'s Lockdown Mode turns that off.\n\n' +
    'To allow it for this site only: tap aA in the address bar, tap Website Settings, and turn off Lockdown Mode. Safari reloads the page.');
  const h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag);
    for (const k in attrs || {}) if (attrs[k] != null) el.setAttribute(k, attrs[k]);
    el.append(...kids.filter((k) => k != null));
    return el;
  };
  const COLOR = { quire: 'var(--quire)', ledger: 'var(--ledger)', lectern: 'var(--lectern)' };

  /* app pictures: a page with lines, a grid, a slide; small for Create, large when a file has no thumbnail */
  function picture(app, ext) {
    const c = { quire: '#2a64c8', ledger: '#1f8a4c', lectern: '#e0682d' }[app];
    let art;
    if (app === 'ledger') art = `<rect x="14" y="22" width="52" height="54" fill="#fff" stroke="${c}"/><path d="M14 31h52M14 40h52M14 49h52M14 58h52M14 67h52M30 22v54M48 22v54" stroke="${c}" stroke-opacity=".55"/><rect x="14" y="22" width="52" height="9" fill="${c}" fill-opacity=".25"/>`;
    else if (app === 'lectern') art = `<rect x="12" y="28" width="56" height="40" rx="2" fill="${c}" fill-opacity=".14" stroke="${c}"/><rect x="18" y="34" width="44" height="8" fill="${c}"/><path d="M20 50h40M20 57h30" stroke="${c}" stroke-width="3" stroke-linecap="round" stroke-opacity=".6"/>`;
    else art = `<path d="M18 26h44M18 34h44M18 42h44M18 50h44M18 58h30" stroke="${c}" stroke-width="3" stroke-linecap="round"/>`;
    const badge = ext ? `<rect x="40" y="76" width="38" height="16" rx="3" fill="${c}"/><text x="59" y="88" font-family="Tahoma, sans-serif" font-size="10" font-weight="bold" fill="#fff" text-anchor="middle">${ext.toUpperCase().slice(0, 4)}</text>` : '';
    return `<svg viewBox="0 0 80 100" width="${ext ? 80 : 24}" height="${ext ? 100 : 30}" aria-hidden="true"><path d="M4 2h54l18 18v76H4z" fill="#fff" stroke="#8ea3c4"/><path d="M58 2v18h18" fill="#e3ebf8" stroke="#8ea3c4"/>${art}${badge}</svg>`;
  }
  for (const el of document.querySelectorAll('[data-icon]')) el.innerHTML = picture(el.dataset.icon);

  const status = (text) => { $('status').textContent = text || ''; };

  /* links to apps open in a new window when installed, so this start page stays */
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-go]');
    if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
    e.preventDefault();
    VO.go(a.href);
  });

  /* ---------- opening files: Open File..., drop, the operating system (installed app) */
  async function openFile(file) {
    status('');
    if (!file) return;
    if (!(await VO.handoff(file))) status(`oolafOffice can't open “${file.name}”. It opens documents (.docx, .doc, .rtf), spreadsheets (.xlsx, .xls, .csv) and presentations (.pptx).`);
  }
  $('picker').accept = VO.accept();
  $('open').addEventListener('click', () => { $('picker').value = ''; $('picker').click(); });
  $('picker').addEventListener('change', () => openFile($('picker').files[0]));
  let depth = 0;
  const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  document.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; depth++; $('drop').hidden = false; });
  document.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; $('drop').hidden = true; } });
  document.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
  document.addEventListener('drop', (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth = 0; $('drop').hidden = true; openFile(e.dataTransfer.files[0]); });
  VO.host.onFiles((files) => openFile(files[0]));   // Open with, a double-click on a file

  /* ---------- Recent Files */
  const day = (t) => new Date(t).toDateString();
  const when = (t) => {
    const time = new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (day(t) === day(Date.now())) return 'Today, ' + time;
    if (day(t) === day(Date.now() - 86400000)) return 'Yesterday, ' + time;
    return new Date(t).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
  };
  let urls = [];
  async function render() {
    let list = [];
    if (!noStorage) try { list = await VO.recent.list(); } catch (e) { status('Recent Files are not available in this browser (' + e.message + ').'); }
    if (view !== 'recent') return;   // switched to Create File meanwhile
    for (const u of urls) URL.revokeObjectURL(u);
    urls = [];
    const grid = $('grid');
    grid.replaceChildren(...list.map((e) => {
      const thumb = h('div', { class: 'thumb' });
      if (e.thumb) { const u = URL.createObjectURL(e.thumb); urls.push(u); thumb.append(h('img', { src: u, alt: '' })); }
      else thumb.innerHTML = picture(e.app, VO.ext(e.name));
      /* a document with unsaved changes opens at its unsaved version; × then discards those changes */
      const rm = h('button', { class: 'rm', type: 'button', title: e.draft ? 'Discard the unsaved changes' : 'Remove from list', 'aria-label': (e.draft ? 'Discard the unsaved changes to ' : 'Remove from the list: ') + e.name }, '×');
      rm.addEventListener('click', async () => {
        if (e.draft) { if (confirm(`Discard the unsaved changes to “${e.name}”?` + (e.file ? ' The saved version stays in the list.' : ''))) await VO.recent.discardDraft(e.key); }
        else await VO.recent.remove(e.key);
        render();
      });
      const app = VO.APPS[e.app] || { name: e.app };
      const dot = h('i'); dot.style.background = COLOR[e.app] || '#888';
      return h('div', { class: 'doc', title: `${e.name}\n${app.name}` + (e.file ? ` · ${(e.size / 1024).toFixed(0)} KB` : '') + ` · ${new Date(e.time).toLocaleString()}` + (e.draft ? '\nUnsaved changes' : '') },
        thumb,
        h('a', { class: 'name', href: VO.url(e.app, e.draft ? { recent: e.key, draft: true } : { recent: e.key }), 'data-go': '' }, e.name),
        h('div', { class: 'meta' }, dot, app.name + ' · ' + when(e.time)),
        e.draft ? h('span', { class: 'unsaved' }, e.file ? 'Unsaved changes' : 'Never saved') : null,
        e.draft && e.file ? h('a', { class: 'alt', href: VO.url(e.app, { recent: e.key }), 'data-go': '', title: 'Open the version saved before the changes' }, 'Saved version') : null,
        rm);
    }));
    grid.hidden = !list.length;
    $('empty').hidden = !!list.length;
    $('clear').hidden = !list.length;
  }
  const clearRecent = async () => {
    if (!confirm('Remove all files from the Recent Files list? The files on your computer are not touched.')) return false;
    await VO.recent.clear(); render();
    return true;
  };
  $('clear').addEventListener('click', clearRecent);
  VO.onRecentChange(() => { if (view === 'recent') render(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && view === 'recent') render(); });

  /* ---------- Create File: Blank and the templates of each app (common/templates.json, made by tools/templates.mjs) */
  const KIND = { quire: 'Documents', ledger: 'Spreadsheets', lectern: 'Presentations' };
  let gallery = null;
  async function renderGallery() {
    if (gallery) return;
    gallery = $('gallery');
    let cat = {};
    try { cat = await (await fetch('common/templates.json')).json(); } catch (e) { status('The templates could not be loaded.'); }
    for (const app of Object.keys(KIND)) {
      const list = cat[app] || [{ id: '', name: 'Blank', img: null }];
      gallery.append(h('h2', null, h('span', { 'data-icon': app }), KIND[app], h('small', null, '· ' + VO.APPS[app].name)),
        h('div', { class: 'grid' }, ...list.map((t) => {
          const thumb = h('div', { class: 'thumb' });
          if (t.img) thumb.append(h('img', { src: t.img, alt: '', loading: 'lazy' })); else thumb.innerHTML = picture(app);
          return h('div', { class: 'doc', title: t.id ? `New ${VO.APPS[app].kind.toLowerCase()} from “${t.name}”` : `New blank ${VO.APPS[app].kind.toLowerCase()}` },
            thumb, h('a', { class: 'name', href: VO.url(app, t.id ? { template: t.id } : { new: true }), 'data-go': '' }, t.name));
        })));
    }
    for (const el of gallery.querySelectorAll('[data-icon]')) el.innerHTML = picture(el.dataset.icon);
  }

  /* ---------- the two views: Recent Files (default) and Create File (#create), so Back goes between them */
  let view = '';
  function show() {
    view = location.hash === '#create' ? 'create' : 'recent';
    $('viewtitle').textContent = view === 'create' ? 'Create File' : 'Recent Files';
    $('recentbtn').classList.toggle('on', view === 'recent'); $('recentbtn').setAttribute('aria-pressed', view === 'recent');
    $('createbtn').classList.toggle('on', view === 'create'); $('createbtn').setAttribute('aria-pressed', view === 'create');
    status('');
    if (view === 'create') { $('grid').hidden = $('empty').hidden = $('clear').hidden = true; $('gallery').hidden = false; renderGallery(); }
    else { $('gallery').hidden = true; render(); }
  }
  $('recentbtn').addEventListener('click', () => { if (location.hash) history.pushState(null, '', location.pathname + location.search); show(); });
  $('createbtn').addEventListener('click', () => { if (location.hash !== '#create') location.hash = 'create'; else show(); });
  window.addEventListener('hashchange', show);
  window.addEventListener('popstate', show);
  show();

  /* ---------- install, about */
  let installEvent = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; $('install').hidden = false; });
  window.addEventListener('appinstalled', () => { installEvent = null; $('install').hidden = true; });
  $('install').addEventListener('click', async () => { if (!installEvent) return; installEvent.prompt(); await installEvent.userChoice; installEvent = null; $('install').hidden = true; });
  document.querySelectorAll('.version').forEach((el) => { el.textContent = VO.VERSION; });
  $('about').addEventListener('click', () => $('aboutdlg').showModal());
  $('osslink').addEventListener('click', (e) => { e.preventDefault(); VO.showLicenses(); });
  /* Themes: the suite's looks (common/looks.css); choosing one changes every open window of the suite */
  const BODY = '<div class="lk-body"><div class="lk-canvas"><div class="lk-page"><p></p><p></p><p></p><p></p><p></p><p></p></div></div>'
    + '<div class="lk-pane"><em></em><u></u><u></u><s></s><u></u></div></div><div class="lk-status"></div>';
  const MOCK = '<div class="lk-menu"><span>File</span><span>Edit</span><span>View</span><span>Insert</span></div>'
    + '<div class="lk-tb"><i></i><i></i><i></i><b></b><i></i><i></i><i></i></div>'
    + BODY;
  const grp = (icons) => '<div class="lk-rgrp"><div>' + icons + '</div><p></p></div>';
  const RIBBON = '<div class="lk-rbar"><span>File</span><span class="on">Home</span><span>Insert</span><span>View</span></div>'
    + '<div class="lk-rpanel">' + grp('<i class="big"></i><i></i><i></i>') + grp('<i></i><i></i><i></i><i></i><i></i>') + grp('<i></i><i></i><i></i>') + grp('<i class="big"></i>') + '</div>'
    + BODY;
  const drawLooks = () => {
    const list = $('looklist');
    list.textContent = '';
    for (const l of VO.look.list()) {
      const mock = h('div', { class: 'lk-mock', 'data-look': l.id, 'aria-hidden': 'true' });
      mock.innerHTML = l.layout === 'ribbon' ? RIBBON : MOCK;
      const card = h('button', { class: 'lk-card', type: 'button', 'aria-pressed': String(l.id === VO.look.get()) }, mock, h('b', null, l.name), h('small', null, l.note));
      card.addEventListener('click', () => VO.look.set(l.id));
      list.append(card);
    }
  };
  $('themes').addEventListener('click', () => { drawLooks(); $('themesdlg').showModal(); });

  /* Optional cache progress (unused in the extension copy): a bar while resources are cached; after an update,
     a button to reload this page in the new version. */
  const mb = (bytes) => (bytes / 1048576).toFixed(1);
  window.addEventListener('vo-cache', (e) => {
    const d = e.detail || {};
    $('caching').hidden = d.state !== 'progress';
    $('cachingreload').hidden = !(d.state === 'done' && d.update);
    if (d.state !== 'progress') return;
    $('cachingtext').textContent = d.update ? 'Updating cached resources' : 'Caching resources for offline use';
    $('cachingsize').textContent = d.total ? `${mb(d.received || 0)} of ${mb(d.total)} MB` : d.received ? `${mb(d.received)} MB` : '';
    $('cachingbar').value = d.progress || 0;
  });
  $('cachingreload').addEventListener('click', () => location.reload());

  /* Updates (desktop app): an Update button, or once a day a dialog, when updater/current.json asks for it */
  const download = () => VO.host.openUrl(VO.updateUrl()).catch((e) => status(String(e)));
  $('update').addEventListener('click', download);
  $('updatedlg').addEventListener('close', () => { if ($('updatedlg').returnValue === 'download') download(); });
  if (VO.host.kind === 'desktop') {
    VO.checkUpdate().then(({ ask, news }) => {
      if (!ask) return;
      $('updatenews').replaceChildren(...news.flatMap((n) => [h('b', null, n.version), h('p', null, n.text)]));
      $('updatenews').hidden = !news.length;
      $('update').hidden = false;
      const today = new Date().toDateString();
      if (ask === 'dialog' && localStorage.getItem('oolafoffice.updateAsked') !== today) {
        try { localStorage.setItem('oolafoffice.updateAsked', today); } catch (e) { /* asks again next time */ }
        $('updatedlg').showModal();
      }
    }).catch((e) => console.info('update check:', e.message));   // offline: nothing to show
  }

  /* Settings: what applies to every app. UI size is the desktop app's zoom (VO.host); on the web the browser's own */
  const fontInfo = () => {
    const n = VO.localFonts.list().length;
    $('fontbtns').hidden = !VO.localFonts.supported();
    $('fontforget').hidden = !n;
    $('fontload').textContent = n ? 'Reload fonts on this computer' : 'Load fonts on this computer';
    $('fontinfo').textContent = n ? `The Font boxes also list the ${n} fonts installed on this computer.`
      : VO.localFonts.supported() ? 'The Font boxes list the frequently used Office fonts and the document\'s own. They can also list the fonts installed on this computer, once you allow it.'
        : 'The Font boxes list the frequently used Office fonts and the document\'s own.';
  };
  const recentInfo = async () => {
    let list = [];
    if (!noStorage) try { list = await VO.recent.list(); } catch (e) { /* shown as none */ }
    const drafts = list.filter((e) => e.draft).length;
    let size = '';
    try { const est = navigator.storage && await navigator.storage.estimate(); if (est && est.usage) size = `, about ${(est.usage / 1048576).toFixed(1)} MB`; } catch (e) { /* no estimate */ }
    $('recentinfo').textContent = noStorage ? 'Recent Files are not available here.'
      : !list.length ? 'The list is empty.'
        : `${list.length} ${list.length === 1 ? 'file' : 'files'}${drafts ? ` (${drafts} with unsaved changes)` : ''}${size}, kept ${VO.host.kind === 'desktop' ? 'by oolafOffice on this computer' : 'in this browser'}.`;
    $('recentclear').hidden = !list.length;
  };
  $('settings').addEventListener('click', async () => {
    const scale = await VO.host.uiScale().catch(() => null);
    $('scalerow').hidden = scale === null;
    $('scaleweb').hidden = scale !== null;
    if (scale !== null) $('uiscale').value = String(scale);
    fontInfo();
    await recentInfo();
    $('settingsdlg').showModal();
  });
  $('uiscale').addEventListener('change', () => VO.host.setUiScale(+$('uiscale').value).catch((e) => status(String(e))));
  $('fontload').addEventListener('click', async () => {
    try { await VO.localFonts.load(); } catch (e) { $('fontinfo').textContent = 'The fonts on this computer could not be listed' + (e.name === 'NotAllowedError' || e.name === 'SecurityError' ? ': permission was not given.' : ': ' + (e.message || e)); return; }
    fontInfo();
  });
  $('fontforget').addEventListener('click', () => { VO.localFonts.forget(); fontInfo(); });
  $('recentclear').addEventListener('click', async () => { if (await clearRecent()) recentInfo(); });
  window.addEventListener('vo-look', drawLooks);
})();
