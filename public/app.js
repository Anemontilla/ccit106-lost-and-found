(function () {
  'use strict';

  const API = '/api';
  const THEME_KEY = 'cspc-theme';
  const authView = document.getElementById('auth-view');
  const appView = document.getElementById('app-view');
  const pageContent = document.getElementById('page-content');
  const sidebar = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebar-overlay');
  const menuButton = document.getElementById('menu-button');
  const reportDialog = document.getElementById('report-dialog');
  const confirmDialog = document.getElementById('confirm-dialog');
  const reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
  let currentUser = null;
  let currentPage = 'home';
  let confirmationResolver = null;
  let restoreFocus = null;
  let previewUrl = null;

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      }[char];
    });
  }

  function icon(name, className) {
    return '<svg class="i' + (className ? ' ' + className : '') + '" aria-hidden="true"><use href="#i-' +
      escapeHtml(name) + '"></use></svg>';
  }

  function setTheme(theme, persist) {
    const activeTheme = theme === 'light' ? 'light' : 'dark';
    const paint = function () {
      document.documentElement.setAttribute('data-theme', activeTheme);
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', activeTheme === 'light' ? '#e8eefb' : '#030d2e');
      document.querySelectorAll('[data-theme-toggle]').forEach(function (button) {
        button.setAttribute('aria-checked', String(activeTheme === 'dark'));
        button.setAttribute('aria-label', activeTheme === 'dark' ? 'Dark theme' : 'Light theme');
        button.setAttribute('title', activeTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
      });
    };
    if (document.startViewTransition && !reduceMotion) {
      document.startViewTransition(paint);
    } else if (!reduceMotion) {
      document.documentElement.classList.add('theme-anim');
      paint();
      window.setTimeout(function () {
        document.documentElement.classList.remove('theme-anim');
      }, 380);
    } else {
      paint();
    }
    if (persist) {
      try {
        window.localStorage.setItem(THEME_KEY, activeTheme);
      } catch (error) {
        // The current page still uses the selected theme if storage is unavailable.
      }
    }
  }

  function getSavedTheme() {
    try {
      const current = window.localStorage.getItem(THEME_KEY);
      if (current === 'light' || current === 'dark') return current;
      const legacy = window.localStorage.getItem('lost-found-theme');
      return legacy === 'light' || legacy === 'dark' ? legacy : null;
    } catch (error) {
      return null;
    }
  }

  function showToast(message, type) {
    const toast = document.createElement('div');
    const kind = type === 'error' ? 'error' : 'success';
    toast.className = 'toast toast--' + kind;
    toast.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    toast.innerHTML = icon(kind === 'error' ? 'alert' : 'check', 'toast__icon') +
      '<span class="toast__text"></span><button class="toast__close" type="button" aria-label="Dismiss notification">' +
      icon('x') + '</button>';
    toast.querySelector('.toast__text').textContent = message;
    const dismiss = function () {
      if (!toast.isConnected || toast.classList.contains('is-leaving')) return;
      toast.classList.add('is-leaving');
      window.setTimeout(function () { toast.remove(); }, 300);
    };
    let timer = window.setTimeout(dismiss, 5000);
    toast.addEventListener('mouseenter', function () { window.clearTimeout(timer); });
    toast.addEventListener('mouseleave', function () {
      timer = window.setTimeout(dismiss, 2400);
    });
    toast.querySelector('.toast__close').addEventListener('click', dismiss);
    document.getElementById('toasts').appendChild(toast);
  }

  function setBanner(id, message) {
    const banner = document.getElementById(id);
    if (!banner) return;
    banner.querySelector('span').textContent = message;
    banner.hidden = !message;
  }

  function setBusy(button, busy) {
    button.disabled = busy;
    button.classList.toggle('is-busy', busy);
    if (busy) button.setAttribute('aria-busy', 'true');
    else button.removeAttribute('aria-busy');
  }

  async function api(path, options) {
    const opts = options || {};
    const headers = { ...opts.headers };
    if (opts.body && !(opts.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    const response = await fetch(API + path, {
      credentials: 'include',
      ...opts,
      headers,
    });
    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await response.json() : null;
    if (response.status === 401 && path !== '/auth/login') showAuth('login');
    if (!response.ok) {
      const error = new Error(data && data.error ? data.error : 'Request failed. Please try again.');
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function showAuth(panel) {
    currentUser = null;
    appView.hidden = true;
    authView.hidden = false;
    document.body.classList.add('auth-body');
    document.getElementById('skip-link').href = '#auth-view';
    document.getElementById('login-panel').hidden = panel !== 'login';
    document.getElementById('signup-panel').hidden = panel !== 'signup';
    const signingUp = panel === 'signup';
    document.getElementById('auth-headline').innerHTML = signingUp
      ? 'A desk for<br>the whole campus.'
      : 'Lost on campus.<br>Found again.';
    document.getElementById('auth-lede').textContent = signingUp
      ? 'Register once with your ID number. After that, reporting, browsing and claiming stay in one place.'
      : 'Report a missing belonging, turn in something you found, and follow a claim until it is back with its owner.';
    setBanner('auth-error', '');
    closeSidebar();
  }

  function isManagement() {
    return Boolean(currentUser &&
      (currentUser.role === 'Management' || currentUser.is_staff));
  }

  function updateTopbarAction(page) {
    const button = document.getElementById('topbar-report-button');
    const type = page === 'lost' || page === 'found' ? page : null;
    button.hidden = !type;
    if (!type) return;
    const label = type === 'lost' ? 'Report a lost item' : 'Turn in a found item';
    button.dataset.openReport = type;
    button.setAttribute('aria-label', label);
    button.querySelector('span').textContent = label;
  }

  function showApp(user) {
    currentUser = user;
    authView.hidden = true;
    appView.hidden = false;
    document.body.classList.remove('auth-body');
    document.getElementById('skip-link').href = '#page-content';
    const username = user.username || 'CSPC member';
    document.getElementById('user-avatar').textContent = username.slice(0, 1).toUpperCase();
    document.getElementById('sidebar-username').textContent = username;
    document.getElementById('sidebar-role').textContent = isManagement() ? 'Management' : 'CSPC member';
    document.getElementById('management-nav').hidden = !isManagement();
    currentPage = 'home';
    renderPage(currentPage);
  }

  function syncScrollLock() {
    const isOpen = Boolean(document.querySelector('.dialog.is-open, .sidebar.is-open'));
    document.body.classList.toggle('nav-lock', isOpen);
  }

  function openSidebar() {
    sidebar.classList.add('is-open');
    sidebarOverlay.classList.add('is-open');
    menuButton.setAttribute('aria-expanded', 'true');
    syncScrollLock();
    const first = sidebar.querySelector('a, button');
    if (first) first.focus({ preventScroll: true });
  }

  function closeSidebar(restoreFocus) {
    if (!sidebar || !sidebar.classList.contains('is-open')) return;
    sidebar.classList.remove('is-open');
    sidebarOverlay.classList.remove('is-open');
    menuButton.setAttribute('aria-expanded', 'false');
    syncScrollLock();
    if (restoreFocus && menuButton) menuButton.focus({ preventScroll: true });
  }

  function openDialog(dialog, focusTarget) {
    restoreFocus = document.activeElement;
    dialog.classList.add('is-open');
    dialog.setAttribute('aria-hidden', 'false');
    syncScrollLock();
    if (focusTarget) focusTarget.focus();
  }

  function closeDialog(dialog) {
    dialog.classList.remove('is-open');
    dialog.setAttribute('aria-hidden', 'true');
    syncScrollLock();
    if (restoreFocus && typeof restoreFocus.focus === 'function') restoreFocus.focus();
    restoreFocus = null;
  }

  function resetPreview() {
    const preview = document.getElementById('upload-preview');
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      previewUrl = null;
    }
    preview.removeAttribute('src');
    preview.classList.remove('is-visible');
    document.getElementById('upload-area-text').textContent = 'Drop a photo or click to browse';
  }

  function openReport(type) {
    const form = document.getElementById('report-form');
    form.reset();
    resetPreview();
    document.getElementById('report-type').value = type;
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    const today = now.toISOString().slice(0, 10);
    document.getElementById('report-date').value = today;
    document.getElementById('report-date').max = today;
    document.getElementById('report-title').textContent =
      type === 'lost' ? 'Report a lost item' : 'Turn in a found item';
    document.getElementById('report-subtitle').textContent =
      type === 'lost' ? 'Add details to help your belongings find their way home.' :
        'Add details so the owner can recognize and reclaim the item.';
    setBanner('report-error', '');
    openDialog(reportDialog, document.getElementById('report-name'));
  }

  function closeReport() {
    if (!reportDialog.classList.contains('is-open')) return;
    closeDialog(reportDialog);
    document.getElementById('report-form').reset();
    resetPreview();
  }

  function requestConfirmation(title, message, buttonText) {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    document.querySelector('[data-confirm-accept]').textContent = buttonText || 'Continue';
    openDialog(confirmDialog, document.querySelector('[data-confirm-accept]'));
    return new Promise(function (resolve) {
      confirmationResolver = resolve;
    });
  }

  function finishConfirmation(confirmed) {
    closeDialog(confirmDialog);
    if (confirmationResolver) {
      const resolve = confirmationResolver;
      confirmationResolver = null;
      resolve(confirmed);
    }
  }

  function statusClass(status) {
    const normalized = String(status || '').toLowerCase();
    return ['open', 'claimed', 'resolved'].includes(normalized) ? normalized : 'unknown';
  }

  function formatDate(value) {
    if (!value) return '';
    const raw = String(value);
    const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw + 'T00:00:00' : raw);
    if (Number.isNaN(date.getTime())) return escapeHtml(raw);
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
  }

  function formatSince(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return minutes + 'm ago';
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + 'h ago';
    const days = Math.floor(hours / 24);
    return days < 7 ? days + 'd ago' : formatDate(value);
  }

  function emptyArt(kind) {
    const art = '<svg class="art" viewBox="0 0 160 120" aria-hidden="true" focusable="false">' +
      '<ellipse class="art-glow" cx="80" cy="66" rx="62" ry="40"/>';
    if (kind === 'ticket') {
      return art + '<path class="art-line art-dash" d="M34 34H126V52A8 8 0 0 0 126 68V86H34V68A8 8 0 0 0 34 52Z"/>' +
        '<circle class="art-fill" cx="62" cy="60" r="13"/><circle class="art-line art-accent" cx="62" cy="60" r="13"/>' +
        '<path class="art-line art-accent" d="m56.5 60.5 4.2 4.2 7-8.2"/></svg>';
    }
    if (kind === 'clear') {
      return art + '<circle class="art-line art-dash" cx="80" cy="62" r="30"/><circle class="art-fill" cx="80" cy="62" r="20"/>' +
        '<circle class="art-line art-accent" cx="80" cy="62" r="20"/><path class="art-line art-accent" d="m71.5 62.5 6.5 6.5 11-13"/></svg>';
    }
    if (kind === 'tag') {
      return art + '<path class="art-line art-dash" d="M42 36q0-8 8-8h40l28 30-28 30H50q-8 0-8-8z"/>' +
        '<circle class="art-line" cx="56" cy="58" r="4.5"/><path class="art-line art-soft" d="M70 52h26M70 64h17"/>' +
        '<circle class="art-fill" cx="112" cy="86" r="15"/><circle class="art-line art-accent" cx="112" cy="86" r="15"/>' +
        '<path class="art-line art-accent" d="m123.5 97.5 11 11"/></svg>';
    }
    return art + '<rect class="art-line" x="34" y="26" width="92" height="70" rx="8"/>' +
      '<rect class="art-fill" x="44" y="38" width="24" height="28" rx="3"/>' +
      '<rect class="art-line art-soft" x="44" y="38" width="24" height="28" rx="3"/>' +
      '<rect class="art-line art-dash" x="76" y="38" width="24" height="28" rx="3"/>' +
      '<rect class="art-line art-dash" x="44" y="72" width="24" height="16" rx="3"/>' +
      '<rect class="art-line art-dash" x="76" y="72" width="24" height="16" rx="3"/></svg>';
  }

  function emptyState(title, message, action, kind) {
    return '<section class="panel"><div class="empty empty--page">' + emptyArt(kind || 'board') +
      '<h2 class="empty__title">' + title + '</h2><p class="empty__text">' + message + '</p>' +
      (action ? '<div class="empty__actions">' + action + '</div>' : '') + '</div></section>';
  }

  function isImageAvailable(item) {
    return item.has_image === true || item.has_image === 1 || item.has_image === '1';
  }

  function itemCard(type, item) {
    const status = statusClass(item.status);
    const itemId = Number(item.item_id);
    const image = isImageAvailable(item)
      ? '<img src="' + API + '/items/' + type + '/' + itemId + '/image" alt="Photo of ' +
        escapeHtml(item.name) + '" loading="lazy" decoding="async">'
      : '<div class="item-card__ph">' + icon(type === 'lost' ? 'tag-lost' : 'tag-found') + '<span>No photo</span></div>';
    let action;
    if (item.status === 'Open') {
      action = '<button class="btn btn--primary btn--block" type="button" data-action="claim" data-type="' +
        type + '" data-id="' + itemId + '">Claim item</button>';
    } else if (item.status === 'Claimed' && isManagement()) {
      action = '<button class="btn btn--success btn--block" type="button" data-action="resolve" data-type="' +
        type + '" data-id="' + itemId + '">Mark resolved</button>';
    } else if (item.status === 'Claimed') {
      action = '<p class="stub-note">' + icon('clock') + 'Waiting for management to verify this claim.</p>';
    } else {
      action = '<p class="stub-note stub-note--done">' + icon('check') + 'This item has been resolved.</p>';
    }
    const claimedBy = item.claimed_by_username
      ? '<li>' + icon('user') + '<span>Claimed by ' + escapeHtml(item.claimed_by_username) + '</span></li>'
      : '';
    return '<article class="item-card item-card--' + type + '" id="' + type + '-' + itemId +
      '" data-status="' + status + '"><div class="item-card__in">' +
      '<div class="item-card__media' + (isImageAvailable(item) ? '' : ' is-empty') + '">' + image +
      '<span class="type-tab type-tab--' + type + '">' + icon(type === 'lost' ? 'tag-lost' : 'tag-found') +
      (type === 'lost' ? 'Lost' : 'Found') + '</span>' +
      '<span class="status status--' + status + ' item-card__status">' + escapeHtml(item.status) + '</span></div>' +
      '<div class="item-card__body"><h2 class="item-card__name">' + escapeHtml(item.name) +
      '</h2><p class="item-card__desc">' + escapeHtml(item.description) + '</p>' +
      '<ul class="item-card__meta"><li>' + icon('pin') + '<span title="' + escapeHtml(item.location) +
      '">' + escapeHtml(item.location) + '</span></li><li>' + icon('calendar') + '<span>' +
      (type === 'lost' ? 'Lost ' : 'Found ') + formatDate(item.item_date) + '</span></li>' + claimedBy +
      '</ul></div><div class="item-card__stub">' + action + '</div></div></article>';
  }

  async function loadItems(type) {
    const data = await api('/items/' + type);
    return data.items;
  }

  function filterControls(items, type) {
    function count(status) {
      return items.filter(function (item) { return item.status === status; }).length;
    }
    return '<div class="toolbar"><div class="segmented" data-filter-bar role="group" aria-label="Filter by status">' +
      '<button class="segmented__btn is-active" type="button" data-filter="all" aria-pressed="true">All<span class="count">' +
      items.length + '</span></button><button class="segmented__btn" type="button" data-filter="open" aria-pressed="false">' +
      '<i class="dot dot--open"></i>Open<span class="count">' + count('Open') + '</span></button>' +
      '<button class="segmented__btn" type="button" data-filter="claimed" aria-pressed="false">' +
      '<i class="dot dot--claimed"></i>Claimed<span class="count">' + count('Claimed') + '</span></button>' +
      '<button class="segmented__btn" type="button" data-filter="resolved" aria-pressed="false">' +
      '<i class="dot dot--resolved"></i>Resolved<span class="count">' + count('Resolved') + '</span></button>' +
      '</div></div><p class="filter-empty" data-filter-empty>No ' + type + ' items with this status.</p>';
  }

  async function renderItemsPage(type) {
    const label = type === 'lost' ? 'Lost' : 'Found';
    const items = await loadItems(type);
    document.getElementById('topbar-title').textContent = label + ' items';
    const header = '<header class="page-head"><div class="page-head__copy">' +
      '<h1 class="page-head__title">' + (type === 'lost' ? 'Missing on campus' : 'Waiting to be claimed') + '</h1>' +
      '<p class="page-head__lede">' + (type === 'lost'
        ? 'Belongings students have reported lost. If one is yours, submit a claim.'
        : 'Things turned in around campus. Recognize yours? Claim it and wait for verification.') + '</p></div>' +
      '<form class="search" id="board-search-form" role="search">' + icon('search', 'search__icon') +
      '<label class="sr-only" for="board-search">Search the board</label>' +
      '<input id="board-search" name="q" type="search" placeholder="Search items" autocomplete="off" data-search-hotkey>' +
      '<button class="btn btn--primary btn--sm" type="submit">Search</button></form></header>';
    if (!items.length) {
      pageContent.innerHTML = header + emptyState(
        'No ' + type + ' items yet',
        type === 'lost' ? 'Be the first to report something missing on campus.' :
          'Found something on campus? Turn it in so its owner can claim it.',
        '<button class="btn btn--primary" type="button" data-action="report" data-type="' + type + '">' +
        (type === 'lost' ? 'Report lost item' : 'Turn in found item') + '</button>',
        'board'
      );
      return;
    }
    pageContent.innerHTML = header + filterControls(items, type) +
      '<div class="items-grid" data-filter-group>' +
      items.map(function (item) { return itemCard(type, item); }).join('') + '</div>';
  }

  function recordRow(type, item, clickable) {
    const target = clickable
      ? ' href="#" data-page="' + type + '" data-scroll-item="' + type + '-' + Number(item.item_id) + '"'
      : '';
    const image = isImageAvailable(item)
      ? '<img src="' + API + '/items/' + type + '/' + Number(item.item_id) + '/image" alt="" loading="lazy">'
      : icon(type === 'lost' ? 'tag-lost' : 'tag-found');
    return '<a class="record"' + target + '><span class="record__thumb record__thumb--' + type + '">' +
      image + '</span><span class="record__main"><span class="record__title">' + escapeHtml(item.name) +
      '</span><span class="record__meta"><span class="type-label type-label--' + type + '">' +
      (type === 'lost' ? 'Lost' : 'Found') + '</span><span class="record__loc">' +
      escapeHtml(item.location) + '</span><span>' + formatDate(item.item_date) + '</span></span></span>' +
      '<span class="status status--' + statusClass(item.status) + '">' + escapeHtml(item.status) + '</span>' +
      icon('chevron', 'record__go') + '</a>';
  }

  function claimRow(item) {
    const isResolved = item.status === 'Resolved';
    const image = isImageAvailable(item)
      ? '<img src="' + API + '/items/' + item.type + '/' + Number(item.item_id) + '/image" alt="" loading="lazy">'
      : icon('tag');
    return '<div class="record record--static"><span class="record__thumb record__thumb--claim">' + image +
      '</span><span class="record__main"><span class="record__title">' + escapeHtml(item.name) +
      '</span><span class="record__meta"><span class="record__state' + (isResolved ? ' record__state--done' : '') +
      '">' + icon(isResolved ? 'check' : 'clock') + (isResolved ? 'Marked returned' : 'Waiting for verification') +
      '</span></span></span><span class="status status--' + statusClass(item.status) + '">' +
      escapeHtml(item.status) + '</span></div>';
  }

  function reportAction(type, title, hint, iconName) {
    return '<button class="ticket ticket--' + type + '" type="button" data-action="report" data-type="' + type + '">' +
      '<span class="ticket__stub">' + icon(iconName) + '</span><span class="ticket__body">' +
      '<span class="ticket__title">' + title + '</span><span class="ticket__hint">' + hint +
      '</span></span>' + icon('chevron', 'ticket__go') + '</button>';
  }

  async function renderUserHome() {
    const [lost, found] = await Promise.all([loadItems('lost'), loadItems('found')]);
    const ownLost = lost.filter(function (item) { return Number(item.reported_by) === Number(currentUser.id); });
    const ownFound = found.filter(function (item) { return Number(item.reported_by) === Number(currentUser.id); });
    const claims = lost.map(function (item) { return { ...item, type: 'lost' }; })
      .concat(found.map(function (item) { return { ...item, type: 'found' }; }))
      .filter(function (item) { return Number(item.claimed_by) === Number(currentUser.id); });
    const waiting = claims.filter(function (item) { return item.status === 'Claimed'; }).length;
    document.getElementById('topbar-title').textContent = 'My Desk';

    const stat = function (title, items, note) {
      return '<div class="stat"><dt>' + title + '</dt><dd><span class="stat__n">' + items.length +
        '</span><span class="stat__note">' + (items.length
          ? '<i class="dot dot--open"></i>' + note(items)
          : 'None yet') + '</span></dd></div>';
    };
    const reports = ownLost.map(function (item) { return recordRow('lost', item, true); })
      .concat(ownFound.map(function (item) { return recordRow('found', item, true); })).join('');
    const claimItems = claims.map(claimRow).join('');
    pageContent.innerHTML =
      '<section class="hero" aria-labelledby="hero-title"><figure class="hero__photo">' +
      '<img src="/img/cspc_campus.jpg" alt="CSPC Multi-Purpose Building I" fetchpriority="high">' +
      '<figcaption>' + icon('pin') + 'Multi-Purpose Building I</figcaption></figure><div class="hero__copy">' +
      '<h1 class="hero__title" id="hero-title">Welcome back, <span class="hero__name">' +
      escapeHtml(currentUser.username) + '</span></h1><p class="hero__lede">Looking for something? Search the lost board, or start a report below.</p>' +
      '<form class="search" id="home-search-form" role="search">' + icon('search', 'search__icon') +
      '<label class="sr-only" for="home-search">Search lost items</label>' +
      '<input id="home-search" type="search" name="q" placeholder="Search lost items by name, description or place" autocomplete="off" data-search-hotkey>' +
      '<kbd class="search__kbd" aria-hidden="true">/</kbd><button class="btn btn--primary" type="submit">Search</button></form>' +
      '<dl class="hero__stats" aria-label="Your activity">' +
      stat('Lost reports', ownLost, function (items) { return items.filter(function (i) { return i.status === 'Open'; }).length + ' open'; }) +
      stat('Found reports', ownFound, function (items) { return items.filter(function (i) { return i.status === 'Open'; }).length + ' open'; }) +
      stat('Claims', claims, function () { return waiting ? waiting + ' awaiting verification' : 'None waiting'; }) +
      '</dl></div></section>' +
      '<section class="tickets" aria-label="Quick actions">' +
      reportAction('lost', 'Report a lost item', 'Tell us what went missing', 'tag-lost') +
      reportAction('found', 'Turn in a found item', 'Help it reach its owner', 'tag-found') +
      '<a class="ticket ticket--board" href="#" data-page="lost"><span class="ticket__stub">' + icon('board') +
      '</span><span class="ticket__body"><span class="ticket__title">Browse the board</span>' +
      '<span class="ticket__hint">See everything reported</span></span>' + icon('chevron', 'ticket__go') + '</a>' +
      '</section><div class="split"><section class="panel" aria-labelledby="reports-heading">' +
      '<header class="panel__head"><div><h2 class="panel__title" id="reports-heading">Items you reported</h2>' +
      '<p class="panel__note">Lost and found reports attached to your account.</p></div><div class="panel__actions">' +
      '<a class="btn btn--ghost btn--sm" href="#" data-page="lost">Lost board</a>' +
      '<a class="btn btn--ghost btn--sm" href="#" data-page="found">Found board</a></div></header>' +
      (reports ? '<div class="records">' + reports + '</div>' :
        '<div class="empty">' + emptyArt('tag') + '<h3 class="empty__title">Nothing reported yet</h3>' +
        '<p class="empty__text">When you report a lost or found item, it shows up here so you can follow it.</p>' +
        '<div class="empty__actions"><button class="btn btn--primary btn--sm" type="button" data-action="report" data-type="lost">Report lost item</button>' +
        '<button class="btn btn--ghost btn--sm" type="button" data-action="report" data-type="found">Turn in found item</button></div></div>') +
      '</section><section class="panel" aria-labelledby="claims-heading"><header class="panel__head"><div>' +
      '<h2 class="panel__title" id="claims-heading">Your claims</h2><p class="panel__note">Management verifies each claim before an item is returned.</p>' +
      '</div></header>' + (claimItems ? '<div class="records">' + claimItems + '</div>' :
        '<div class="empty">' + emptyArt('ticket') + '<h3 class="empty__title">No claims yet</h3>' +
        '<p class="empty__text">If you recognize a belonging on the board, claim it and track it here.</p>' +
        '<div class="empty__actions"><a class="btn btn--primary btn--sm" href="#" data-page="found">Browse found items</a></div></div>') +
      '</section></div>';
  }

  function managerRecord(entry) {
    const type = entry.type;
    const item = entry.item;
    const target = type + '-' + Number(item.item_id);
    const image = isImageAvailable(item)
      ? '<img src="' + API + '/items/' + type + '/' + Number(item.item_id) + '/image" alt="" loading="lazy">'
      : icon(type === 'lost' ? 'tag-lost' : 'tag-found');
    return '<a class="record" href="#" data-page="' + type + '" data-scroll-item="' + target +
      '"><span class="record__thumb record__thumb--' + type + '">' + image +
      '</span><span class="record__main"><span class="record__title">' + escapeHtml(item.name) +
      '</span><span class="record__meta"><span class="type-label type-label--' + type + '">' +
      (type === 'lost' ? 'Lost' : 'Found') + '</span><span class="record__loc">' +
      escapeHtml(item.location) + '</span><span>' + formatSince(item.created_at) + '</span></span></span>' +
      '<span class="status status--' + statusClass(item.status) + '">' + escapeHtml(item.status) + '</span>' +
      icon('chevron', 'record__go') + '</a>';
  }

  async function renderManagement() {
    const [lost, found] = await Promise.all([loadItems('lost'), loadItems('found')]);
    const entries = lost.map(function (item) { return { type: 'lost', item: item }; })
      .concat(found.map(function (item) { return { type: 'found', item: item }; }))
      .sort(function (a, b) { return new Date(b.item.created_at) - new Date(a.item.created_at); });
    const pending = entries.filter(function (entry) { return entry.item.status === 'Claimed'; });
    const open = entries.filter(function (entry) { return entry.item.status === 'Open'; });
    const resolved = entries.filter(function (entry) { return entry.item.status === 'Resolved'; });
    document.getElementById('topbar-title').textContent = 'Management Dashboard';
    const pendingRows = pending.map(function (entry) {
      const item = entry.item;
      const itemUrl = entry.type + '-' + Number(item.item_id);
      const image = isImageAvailable(item)
        ? '<img src="' + API + '/items/' + entry.type + '/' + Number(item.item_id) + '/image" alt="" loading="lazy">'
        : icon(entry.type === 'lost' ? 'tag-lost' : 'tag-found');
      const requester = item.claimed_by_username || 'Unknown user';
      return '<tr><td data-label="Item"><a class="cell-item" href="#" data-page="' + entry.type +
        '" data-scroll-item="' + itemUrl + '"><span class="record__thumb record__thumb--' + entry.type +
        '">' + image + '</span><span class="cell-item__text"><span class="record__title">' +
        escapeHtml(item.name) + '</span><span class="cell-item__meta"><span class="type-label type-label--' +
        entry.type + '">' + (entry.type === 'lost' ? 'Lost' : 'Found') + '</span><span class="record__loc">' +
        escapeHtml(item.location) + '</span></span></span></a></td><td data-label="Claimed by"><span class="cell-user">' +
        '<span class="mini-avatar" aria-hidden="true">' + escapeHtml(requester.slice(0, 1).toUpperCase()) +
        '</span>' + escapeHtml(requester) + '</span></td><td class="table__action">' +
        '<button class="btn btn--success btn--sm" type="button" data-action="resolve" data-type="' +
        entry.type + '" data-id="' + Number(item.item_id) + '">' + icon('check') + 'Mark resolved</button></td></tr>';
    }).join('');
    const recent = entries.slice(0, 10).map(managerRecord).join('');
    pageContent.innerHTML =
      '<header class="page-head page-head--ops"><div class="page-head__copy">' +
      (pending.length
        ? '<h1 class="page-head__title">' + pending.length + ' claim' + (pending.length === 1 ? '' : 's') + ' waiting for verification</h1>' +
          '<p class="page-head__lede">Verify the claimant, hand the item over, then mark the record resolved.</p>'
        : '<h1 class="page-head__title">The desk is clear</h1><p class="page-head__lede">No claims are waiting. The counts below are live records in the system.</p>') +
      '</div><div class="page-head__actions"><a class="btn btn--primary" href="#" data-page="lost">' +
      icon('tag-lost') + 'Lost items</a><a class="btn btn--ghost" href="#" data-page="found">' +
      icon('tag-found') + 'Found items</a></div></header>' +
      '<dl class="kpis" aria-label="System summary"><div class="kpi kpi--lost"><dt>Lost reports</dt><dd>' +
      lost.length + '</dd></div><div class="kpi kpi--found"><dt>Found reports</dt><dd>' + found.length +
      '</dd></div><div class="kpi kpi--open"><dt>Open items</dt><dd>' + open.length +
      '</dd></div><div class="kpi kpi--claimed' + (pending.length ? ' is-alert' : '') +
      '"><dt>Pending claims</dt><dd>' + pending.length + '</dd></div><div class="kpi kpi--resolved"><dt>Resolved</dt><dd>' +
      resolved.length + '</dd></div></dl><div class="split split--ops">' +
      '<section class="panel" aria-labelledby="pending-heading"><header class="panel__head"><div>' +
      '<h2 class="panel__title" id="pending-heading">Claims awaiting verification</h2>' +
      '<p class="panel__note">Resolve a claim only after the item has been returned.</p></div>' +
      (pending.length ? '<span class="status status--claimed">' + pending.length + ' pending</span>' : '') +
      '</header>' + (pending.length
        ? '<div class="table-wrap"><table class="table"><thead><tr><th scope="col">Item</th><th scope="col">Claimed by</th><th scope="col"><span class="sr-only">Action</span></th></tr></thead><tbody>' +
          pendingRows + '</tbody></table></div>'
        : '<div class="empty">' + emptyArt('clear') + '<h3 class="empty__title">Nothing waiting</h3>' +
          '<p class="empty__text">New claims appear here as soon as a student submits one.</p></div>') +
      '</section><section class="panel" aria-labelledby="recent-heading"><header class="panel__head"><div>' +
      '<h2 class="panel__title" id="recent-heading">Latest reports</h2><p class="panel__note">The most recent lost and found records.</p>' +
      '</div></header>' + (recent ? '<div class="records">' + recent + '</div>' :
        '<div class="empty">' + emptyArt('board') + '<h3 class="empty__title">No reports yet</h3>' +
        '<p class="empty__text">Lost and found reports will be listed here as they come in.</p></div>') +
      '</section></div>';
  }

  async function renderSearch(query) {
    document.getElementById('topbar-title').textContent = 'Search';
    const safeQuery = escapeHtml(query || '');
    let resultMarkup = '<div class="empty">' + emptyArt('search') + '<h2 class="empty__title">Start with a word</h2>' +
      '<p class="empty__text">Search looks through item names, descriptions and locations.</p></div>';
    if (query) {
      const data = await api('/search?q=' + encodeURIComponent(query));
      const lost = data.results.lost || [];
      const found = data.results.found || [];
      const matches = lost.map(function (item) { return itemCard('lost', item); })
        .concat(found.map(function (item) { return itemCard('found', item); })).join('');
      resultMarkup = matches
        ? '<p class="page-head__lede">' + (lost.length + found.length) + ' matching item(s).</p>' +
          '<div class="items-grid">' + matches + '</div>'
        : '<section class="panel"><div class="empty empty--page">' + emptyArt('search') +
          '<h2 class="empty__title">No match for &ldquo;' + safeQuery + '&rdquo;</h2>' +
          '<p class="empty__text">Try a shorter name, a detail, or a campus location.</p></div></section>';
    }
    pageContent.innerHTML = '<header class="page-head"><div class="page-head__copy">' +
      '<h1 class="page-head__title">Search lost and found items</h1>' +
      '<p class="page-head__lede">Look up a name, a detail from the description, or a location.</p></div></header>' +
      '<form class="search search--lg" id="search-form" role="search">' + icon('search', 'search__icon') +
      '<label class="sr-only" for="search-query">Search items</label><input id="search-query" name="q" type="search" value="' +
      safeQuery + '" placeholder="Search items" autocomplete="off" data-search-hotkey><button class="btn btn--primary" type="submit">Search</button></form>' +
      '<div class="search-results">' + resultMarkup + '</div>';
  }

  function pageError(error) {
    pageContent.innerHTML = '<section class="panel"><div class="empty empty--page">' + emptyArt('board') +
      '<h2 class="empty__title">Could not load this page</h2><p class="empty__text">' +
      escapeHtml(error.message) + '</p><button class="btn btn--primary" type="button" data-action="retry">Try again</button></div></section>';
  }

  async function renderPage(page, query) {
    if (!currentUser) return;
    if (page === 'management' && !isManagement()) {
      page = 'home';
      showToast('Management access is required for that page.', 'error');
    }
    updateTopbarAction(page);
    currentPage = page;
    document.querySelectorAll('.nav__link[data-page]').forEach(function (link) {
      link.classList.toggle('is-active', link.dataset.page === page);
    });
    closeSidebar();
    document.getElementById('scroll-area').scrollTop = 0;
    try {
      if (page === 'lost' || page === 'found') await renderItemsPage(page);
      else if (page === 'management') await renderManagement();
      else if (page === 'search') await renderSearch(query || '');
      else await renderUserHome();
      if (window.pendingScrollItem) {
        const target = document.getElementById(window.pendingScrollItem);
        window.pendingScrollItem = null;
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } catch (error) {
      pageError(error);
    }
  }

  document.getElementById('login-form').addEventListener('submit', async function (event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('[type="submit"]');
    setBanner('auth-error', '');
    setBusy(button, true);
    try {
      const fields = new FormData(form);
      const data = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          identifier: fields.get('identifier'),
          password: fields.get('password'),
        }),
      });
      form.reset();
      showApp(data.user);
    } catch (error) {
      setBanner('auth-error', error.message);
    } finally {
      setBusy(button, false);
    }
  });

  document.getElementById('signup-form').addEventListener('submit', async function (event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('[type="submit"]');
    setBanner('auth-error', '');
    setBusy(button, true);
    try {
      const fields = new FormData(form);
      await api('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({
          username: fields.get('username'),
          id_number: fields.get('id_number'),
          password: fields.get('password'),
        }),
      });
      const idNumber = fields.get('id_number');
      form.reset();
      showAuth('login');
      document.getElementById('login-identifier').value = idNumber;
      showToast('Account created. You can now sign in with your ID number.');
    } catch (error) {
      setBanner('auth-error', error.message);
    } finally {
      setBusy(button, false);
    }
  });

  document.getElementById('report-form').addEventListener('submit', async function (event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('[type="submit"]');
    const type = document.getElementById('report-type').value;
    setBanner('report-error', '');
    setBusy(button, true);
    try {
      await api('/items/' + type, { method: 'POST', body: new FormData(form) });
      closeReport();
      showToast(type === 'lost' ? 'Your lost item was reported.' : 'Your found item was reported.');
      await renderPage(currentPage);
    } catch (error) {
      setBanner('report-error', error.message);
    } finally {
      setBusy(button, false);
    }
  });

  document.addEventListener('submit', function (event) {
    const form = event.target;
    if (!['search-form', 'home-search-form', 'board-search-form'].includes(form.id)) return;
    event.preventDefault();
    const query = String(new FormData(form).get('q') || '').trim();
    renderPage('search', query);
  });

  async function handleAction(action) {
    if (action.dataset.action === 'report') {
      openReport(action.dataset.type);
      return;
    }
    if (action.dataset.action === 'logout') {
      try {
        await api('/auth/logout', { method: 'POST' });
      } catch (error) {
        showToast(error.message, 'error');
      } finally {
        showAuth('login');
      }
      return;
    }
    if (action.dataset.action === 'claim' || action.dataset.action === 'resolve') {
      const resolving = action.dataset.action === 'resolve';
      const confirmed = await requestConfirmation(
        resolving ? 'Resolve this item?' : 'Claim this item?',
        resolving
          ? 'Mark this item as resolved after it has been returned to the claimant.'
          : 'Management will verify your claim before the item is returned.',
        resolving ? 'Mark resolved' : 'Submit claim'
      );
      if (!confirmed) return;
      try {
        await api('/items/' + action.dataset.type + '/' + action.dataset.id + '/' +
          (resolving ? 'resolve' : 'claim'), { method: 'POST' });
        showToast(resolving ? 'Item marked as resolved.' : 'Claim submitted. Management will verify the item.');
        await renderPage(currentPage);
      } catch (error) {
        showToast(error.message, 'error');
      }
      return;
    }
    if (action.dataset.action === 'retry') renderPage(currentPage);
  }

  document.addEventListener('click', function (event) {
    const target = event.target instanceof Element ? event.target : event.target.parentElement;
    if (!target) return;
    const themeButton = target.closest('[data-theme-toggle]');
    if (themeButton) {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      setTheme(next, true);
      return;
    }
    const authSwitch = target.closest('[data-auth-switch]');
    if (authSwitch) {
      event.preventDefault();
      showAuth(authSwitch.dataset.authSwitch);
      return;
    }
    const reportTrigger = target.closest('[data-open-report]');
    if (reportTrigger) {
      openReport(reportTrigger.dataset.openReport);
      return;
    }
    const closeButton = target.closest('[data-close-dialog]');
    if (closeButton) {
      if (closeButton.dataset.closeDialog === 'report-dialog') closeReport();
      return;
    }
    if (target.closest('[data-confirm-cancel]')) {
      finishConfirmation(false);
      return;
    }
    if (target.closest('[data-confirm-accept]')) {
      finishConfirmation(true);
      return;
    }
    if (target === confirmDialog || target === reportDialog) {
      if (target === confirmDialog) finishConfirmation(false);
      else closeReport();
      return;
    }
    const pageLink = target.closest('[data-page]');
    if (pageLink) {
      event.preventDefault();
      const scrollItem = pageLink.dataset.scrollItem;
      window.pendingScrollItem = scrollItem || null;
      renderPage(pageLink.dataset.page);
      return;
    }
    const filterButton = target.closest('[data-filter]');
    if (filterButton) {
      const bar = filterButton.closest('[data-filter-bar]');
      bar.querySelectorAll('[data-filter]').forEach(function (button) {
        const active = button === filterButton;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
      });
      let shown = 0;
      document.querySelectorAll('[data-filter-group] [data-status]').forEach(function (card) {
        const match = filterButton.dataset.filter === 'all' ||
          card.dataset.status === filterButton.dataset.filter;
        card.classList.toggle('is-filtered-out', !match);
        if (match) shown += 1;
      });
      const empty = document.querySelector('[data-filter-empty]');
      if (empty) empty.classList.toggle('is-visible', shown === 0);
      return;
    }
    const action = target.closest('[data-action]');
    if (action) handleAction(action);
  });

  const imageInput = document.getElementById('report-image');
  const uploadArea = document.getElementById('upload-area');
  imageInput.addEventListener('change', function () {
    const file = imageInput.files && imageInput.files[0];
    const preview = document.getElementById('upload-preview');
    if (!file) {
      resetPreview();
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      imageInput.value = '';
      setBanner('report-error', 'Image must be 5 MB or smaller.');
      resetPreview();
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) {
      imageInput.value = '';
      setBanner('report-error', 'Only JPEG, PNG, GIF or WebP images are allowed.');
      resetPreview();
      return;
    }
    setBanner('report-error', '');
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(file);
    preview.src = previewUrl;
    preview.classList.add('is-visible');
    document.getElementById('upload-area-text').textContent = file.name;
  });

  uploadArea.addEventListener('dragover', function (event) {
    event.preventDefault();
    uploadArea.classList.add('is-drag');
  });
  uploadArea.addEventListener('dragleave', function (event) {
    if (!uploadArea.contains(event.relatedTarget)) uploadArea.classList.remove('is-drag');
  });
  uploadArea.addEventListener('drop', function (event) {
    event.preventDefault();
    uploadArea.classList.remove('is-drag');
    const file = event.dataTransfer && event.dataTransfer.files[0];
    if (!file) return;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    imageInput.files = transfer.files;
    imageInput.dispatchEvent(new Event('change', { bubbles: true }));
  });

  menuButton.addEventListener('click', function () {
    if (sidebar.classList.contains('is-open')) closeSidebar(true);
    else openSidebar();
  });
  sidebarOverlay.addEventListener('click', closeSidebar);
  document.getElementById('logout-button').addEventListener('click', function () {
    handleAction({ dataset: { action: 'logout' } });
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === '/' && currentUser &&
        !event.metaKey && !event.ctrlKey && !event.altKey &&
        !event.target.matches('input, textarea, select, [contenteditable="true"]') &&
        !document.querySelector('.dialog.is-open')) {
      const searchInput = document.querySelector('[data-search-hotkey]') ||
        document.getElementById('search-query');
      if (searchInput) {
        event.preventDefault();
        searchInput.focus();
        searchInput.select();
      }
    }
    if (event.key === 'Escape') {
      if (confirmDialog.classList.contains('is-open')) {
        finishConfirmation(false);
        return;
      }
      if (reportDialog.classList.contains('is-open')) {
        closeReport();
        return;
      }
      closeSidebar(true);
      return;
    }
    if (event.key === 'Tab') {
      const dialog = document.querySelector('.dialog.is-open');
      const scope = dialog || (sidebar.classList.contains('is-open') ? sidebar : null);
      if (!scope) return;
      const nodes = Array.from(scope.querySelectorAll(focusableSelector))
        .filter(function (node) { return node.offsetParent !== null; });
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  const systemTheme = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)');
  if (systemTheme && !getSavedTheme()) {
    const onSystemThemeChange = function (event) {
      if (!getSavedTheme()) setTheme(event.matches ? 'light' : 'dark', false);
    };
    if (systemTheme.addEventListener) systemTheme.addEventListener('change', onSystemThemeChange);
    else if (systemTheme.addListener) systemTheme.addListener(onSystemThemeChange);
  }
  window.addEventListener('storage', function (event) {
    if (event.key === THEME_KEY && (event.newValue === 'light' || event.newValue === 'dark')) {
      setTheme(event.newValue, false);
    }
  });
  if (window.matchMedia) {
    const desktopLayout = window.matchMedia('(min-width: 1024px)');
    const onLayoutChange = function (event) {
      if (event.matches) closeSidebar(false);
    };
    if (desktopLayout.addEventListener) desktopLayout.addEventListener('change', onLayoutChange);
    else if (desktopLayout.addListener) desktopLayout.addListener(onLayoutChange);
  }

  document.querySelectorAll('input[type="password"]').forEach(function (input) {
    const wrapper = document.createElement('div');
    wrapper.className = 'pw';
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pw__btn';
    button.setAttribute('aria-label', 'Show password');
    button.setAttribute('aria-pressed', 'false');
    button.innerHTML = '<svg class="i" aria-hidden="true"><use href="#i-eye"></use></svg>';
    wrapper.appendChild(button);
    button.addEventListener('click', function () {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      button.setAttribute('aria-pressed', String(show));
      button.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      button.querySelector('use').setAttribute('href', show ? '#i-eye-off' : '#i-eye');
      input.focus();
    });
  });
  setTheme(document.documentElement.getAttribute('data-theme'), false);

  api('/auth/me')
    .then(function (data) { showApp(data.user); })
    .catch(function (error) {
      showAuth('login');
      if (error.status && error.status !== 401) showToast(error.message, 'error');
    });
})();
