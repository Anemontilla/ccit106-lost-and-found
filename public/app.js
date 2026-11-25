(function () {
  'use strict';

  const API = '/api';
  const authView = document.getElementById('auth-view');
  const appView = document.getElementById('app-view');
  const pageContent = document.getElementById('page-content');
  const sidebar = document.getElementById('appSidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  const mobileToggle = document.getElementById('mobileMenuToggle');
  const reportModal = document.getElementById('report-modal');
  const confirmDialog = document.getElementById('confirmDialog');
  let currentUser = null;
  let currentPage = 'home';
  let currentFilter = 'all';
  let confirmationResolver = null;

  function setTheme(theme) {
    const activeTheme = theme === 'light' ? 'light' : 'dark';
    document.body.dataset.theme = activeTheme;
    document.querySelectorAll('[data-theme-choice]').forEach(function (button) {
      const active = button.dataset.themeChoice === activeTheme;
      button.setAttribute('aria-pressed', String(active));
      button.classList.toggle('is-selected', active);
    });
    window.localStorage.setItem('lost-found-theme', activeTheme);
  }

  setTheme(window.localStorage.getItem('lost-found-theme') || 'dark');

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
    const data = contentType.includes('application/json')
      ? await response.json()
      : null;

    if (response.status === 401 && path !== '/auth/login') {
      showAuth('login');
    }
    if (!response.ok) {
      throw new Error(data && data.error ? data.error : 'Request failed. Please try again.');
    }
    return data;
  }

  function showAlert(message, type) {
    const wrapper = currentUser
      ? document.getElementById('alerts-wrapper')
      : document.getElementById('auth-notice');
    const alert = document.createElement('div');
    alert.className = 'alert ' + (type === 'error' ? 'alert-error' : 'alert-success');
    alert.setAttribute('role', type === 'error' ? 'alert' : 'status');
    alert.innerHTML = (type === 'error'
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m20 6-11 11-5-5"/></svg>') +
      '<span></span>';
    alert.querySelector('span').textContent = message;
    wrapper.replaceChildren(alert);
    window.setTimeout(function () {
      if (alert.isConnected) alert.remove();
    }, 5200);
  }

  function showAuth(panel) {
    currentUser = null;
    appView.hidden = true;
    authView.hidden = false;
    document.body.classList.add('auth-body');
    document.getElementById('login-panel').hidden = panel !== 'login';
    document.getElementById('signup-panel').hidden = panel !== 'signup';
    closeSidebar();
  }

  function showApp(user) {
    currentUser = user;
    authView.hidden = true;
    appView.hidden = false;
    document.body.classList.remove('auth-body');
    document.getElementById('user-avatar').textContent = user.username.slice(0, 1).toUpperCase();
    document.getElementById('sidebar-username').textContent = user.username;
    document.getElementById('sidebar-role').textContent =
      user.role === 'Management' || user.is_staff ? 'Management' : 'Student';
    document.getElementById('management-link').hidden =
      user.role !== 'Management' && !user.is_staff;
    document.getElementById('nav-section-primary').textContent =
      user.role === 'Management' || user.is_staff ? 'Management' : 'Campus';
    document.getElementById('auth-notice').replaceChildren();
    currentPage = 'home';
    renderPage(currentPage);
  }

  function closeSidebar() {
    if (!sidebar) return;
    sidebar.classList.remove('is-open');
    sidebarOverlay.hidden = true;
    sidebarOverlay.classList.remove('is-open');
    document.body.classList.remove('nav-lock');
    mobileToggle.setAttribute('aria-expanded', 'false');
  }

  function openReport(type) {
    const form = document.getElementById('report-form');
    form.reset();
    document.getElementById('report-type').value = type;
    document.getElementById('upload-area-text').textContent = 'Drop a photo or click to browse';
    document.getElementById('report-title').textContent =
      type === 'lost' ? 'Report a lost item' : 'Report a found item';
    document.getElementById('report-error').hidden = true;
    document.getElementById('report-preview').hidden = true;
    reportModal.hidden = false;
    reportModal.classList.add('is-open');
    document.body.classList.add('nav-lock');
    document.getElementById('report-name').focus();
  }

  function closeReport() {
    reportModal.classList.remove('is-open');
    reportModal.hidden = true;
    document.body.classList.remove('nav-lock');
    const preview = document.getElementById('report-preview');
    preview.removeAttribute('src');
    preview.hidden = true;
    preview.classList.remove('is-visible');
    document.getElementById('upload-area-text').textContent = 'Drop a photo or click to browse';
  }

  function finishConfirmation(confirmed) {
    confirmDialog.classList.remove('is-open');
    confirmDialog.hidden = true;
    if (!document.querySelector('.modal-overlay.is-open, .sidebar.is-open')) {
      document.body.classList.remove('nav-lock');
    }
    if (confirmationResolver) {
      const resolve = confirmationResolver;
      confirmationResolver = null;
      resolve(confirmed);
    }
  }

  function requestConfirmation(title, message) {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = message;
    confirmDialog.hidden = false;
    confirmDialog.classList.add('is-open');
    document.body.classList.add('nav-lock');
    document.getElementById('confirmProceed').focus();
    return new Promise(function (resolve) {
      confirmationResolver = resolve;
    });
  }

  function pageError(error) {
    pageContent.innerHTML =
      '<section class="panel"><div class="empty-state">' +
      '<h2 class="empty-state-title">Could not load this page</h2>' +
      '<p class="empty-state-text">' + escapeHtml(error.message) + '</p>' +
      '</div></section>';
  }

  function pageIntro(kicker, title, description, type) {
    return '<header class="page-intro">' +
      '<div><p class="eyebrow">' + kicker + '</p><h1>' + title + '</h1>' +
      '<p class="lede">' + description + '</p></div>' +
      (type ? '<button type="button" class="btn btn-primary btn-sm" data-action="report" data-type="' + type + '">' +
        'Report ' + type + ' item</button>' : '') +
      '</header>';
  }

  function displayDate(value) {
    return escapeHtml(value).split('T')[0];
  }

  function emptyState(title, message, action) {
    return '<section class="panel"><div class="empty-state">' +
      '<div class="empty-orb" aria-hidden="true"></div>' +
      '<h2 class="empty-state-title">' + title + '</h2>' +
      '<p class="empty-state-text">' + message + '</p>' +
      (action || '') +
      '</div></section>';
  }

  function itemCard(type, item) {
    const status = String(item.status || 'Open').toLowerCase();
    const image = item.has_image
      ? '<img src="' + API + '/items/' + type + '/' + Number(item.item_id) + '/image" alt="' + escapeHtml(item.name) + '" class="item-card-image">'
      : '<div class="item-card-image-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1.4"/><path d="m20 16-4.2-4.2L6 20"/></svg><span>No photo</span></div>';
    let action = '<p class="footer-note">This item has been resolved.</p>';
    if (item.status === 'Open') {
      action = '<button type="button" class="btn btn-primary" data-action="claim" data-type="' + type +
        '" data-id="' + Number(item.item_id) + '">Claim item</button>';
    } else if (item.status === 'Claimed' && isManagement()) {
      action = '<button type="button" class="btn btn-success" data-action="resolve" data-type="' + type +
        '" data-id="' + Number(item.item_id) + '">Mark resolved</button>';
    } else if (item.status === 'Claimed') {
      action = '<p class="footer-note">Waiting for management to verify this claim.</p>';
    }

    return '<article class="item-card" data-status="' + status + '">' +
      '<div class="item-media">' + image +
      '<span class="badge badge-' + status + '">' + escapeHtml(item.status) + '</span></div>' +
      '<div class="item-card-body">' +
      '<h2 class="item-card-name">' + escapeHtml(item.name) + '</h2>' +
      '<p class="item-card-desc">' + escapeHtml(item.description) + '</p>' +
      '<div class="item-card-meta"><span class="meta-chip">' + escapeHtml(item.location) +
      '</span><span class="meta-chip">' + (type === 'lost' ? 'Lost ' : 'Found ') +
      displayDate(item.item_date) + '</span></div>' +
      (item.claimed_by_username ? '<p class="item-claimer">Claimed by ' +
        escapeHtml(item.claimed_by_username) + '</p>' : '') +
      '</div><div class="item-card-footer">' + action + '</div></article>';
  }

  function isManagement() {
    return currentUser && (currentUser.role === 'Management' || currentUser.is_staff);
  }

  async function loadItems(type) {
    const data = await api('/items/' + type);
    return data.items;
  }

  function filterControls() {
    return '<div class="filters" data-filter-bar role="toolbar" aria-label="Filter by status">' +
      '<button type="button" class="chip is-active" data-filter="all">All</button>' +
      '<button type="button" class="chip" data-filter="open">Open</button>' +
      '<button type="button" class="chip" data-filter="claimed">Claimed</button>' +
      '<button type="button" class="chip" data-filter="resolved">Resolved</button></div>' +
      '<p class="filter-empty" data-filter-empty hidden>No items with this status.</p>';
  }

  async function renderItemsPage(type) {
    const label = type === 'lost' ? 'Lost' : 'Found';
    const items = await loadItems(type);
    currentFilter = 'all';
    document.getElementById('topbar-title').textContent = label + ' items';
    document.getElementById('topbar-actions').innerHTML = '';
    pageContent.innerHTML = pageIntro(
      'Discovery',
      label + ' items',
      type === 'lost'
        ? 'Belongings students have reported missing. If one is yours, submit a claim.'
        : 'Things turned in around campus. Recognize yours? Claim it and wait for verification.',
      type
    ) + (items.length
      ? filterControls() + '<div class="items-grid" data-filter-group>' +
        items.map(function (item) { return itemCard(type, item); }).join('') + '</div>'
      : emptyState(
        'No ' + type + ' items yet',
        type === 'lost'
          ? 'Be the first to report something missing on campus.'
          : 'Found something on campus? Turn it in so the owner can claim it.',
        '<button type="button" class="btn btn-primary" data-action="report" data-type="' + type + '">Report ' + type + ' item</button>'
      ));
  }

  function recordRow(type, item) {
    const dateLabel = type === 'lost' ? 'Lost' : 'Found';
    return '<article class="record"><div><h3 class="record-title">' + escapeHtml(item.name) +
      '</h3><p class="record-meta"><span>' + escapeHtml(item.location) + '</span><span>' +
      dateLabel + ' ' + displayDate(item.item_date) + '</span></p></div><div class="record-tags">' +
      '<span class="badge badge-' + type + '">' + type + '</span><span class="badge badge-' +
      String(item.status).toLowerCase() + '">' + escapeHtml(item.status) +
      '</span></div></article>';
  }

  async function renderUserHome() {
    const [lost, found] = await Promise.all([loadItems('lost'), loadItems('found')]);
    const ownLost = lost.filter(function (item) { return Number(item.reported_by) === Number(currentUser.id); });
    const ownFound = found.filter(function (item) { return Number(item.reported_by) === Number(currentUser.id); });
    const claims = lost.filter(function (item) { return Number(item.claimed_by) === Number(currentUser.id); })
      .concat(found.filter(function (item) { return Number(item.claimed_by) === Number(currentUser.id); }));
    document.getElementById('topbar-title').textContent = 'My Desk';
    document.getElementById('topbar-actions').innerHTML = '';

    const reports = ownLost.map(function (item) { return recordRow('lost', item); })
      .concat(ownFound.map(function (item) { return recordRow('found', item); })).join('');
    const claimRows = claims.map(function (item) {
      return '<article class="record"><div><h3 class="record-title">' + escapeHtml(item.name) +
        '</h3><p class="record-meta">' +
        (item.status === 'Resolved' ? 'Marked returned' : 'Waiting for management to verify') +
        '</p></div><span class="badge badge-' + String(item.status).toLowerCase() + '">' +
        escapeHtml(item.status) + '</span></article>';
    }).join('');

    pageContent.innerHTML =
      '<section class="welcome"><div class="welcome-copy">' +
      '<h1>Welcome back, <em>' + escapeHtml(currentUser.username) + '</em></h1>' +
      '<p class="lede">Looking for something? Search the lost board, or start a report below.</p>' +
      '<form class="search-bar search-bar-lg" id="home-search-form" role="search">' +
      '<span class="search-bar-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></svg></span>' +
      '<label class="visually-hidden" for="home-search">Search items</label>' +
      '<input id="home-search" name="q" type="search" placeholder="Search lost items by name, description or place">' +
      '<kbd class="search-shortcut" aria-hidden="true">/</kbd>' +
      '<button type="submit" class="btn btn-primary">Search</button></form>' +
      '<div class="welcome-counts" aria-label="Your activity">' +
      '<div><span>Lost reports</span><strong>' + ownLost.length + '</strong><small>' +
      (ownLost.length ? 'On the board' : 'None yet') + '</small></div>' +
      '<div><span>Found reports</span><strong>' + ownFound.length + '</strong><small>' +
      (ownFound.length ? 'On the board' : 'None yet') + '</small></div>' +
      '<div><span>Claims</span><strong>' + claims.length + '</strong><small>' +
      (claims.length ? 'In progress' : 'None yet') + '</small></div></div></div>' +
      '<figure class="welcome-plate"><img src="/img/cspc_campus.jpg" alt="CSPC Multi-Purpose Building I">' +
      '<figcaption><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>Multi-Purpose Building I</figcaption></figure></section>' +
      '<section class="capsules" aria-label="Quick actions">' +
      '<button type="button" class="capsule capsule-deep" data-action="report" data-type="lost">' +
      '<span class="capsule-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m20.2 13.2-7.2 7.2a2 2 0 0 1-2.8 0l-6.6-6.6a2 2 0 0 1 0-2.8l7.2-7.2a2 2 0 0 1 1.4-.6h6.6a2 2 0 0 1 2 2v6.6a2 2 0 0 1-.6 1.4Z"/><circle cx="16.5" cy="7.5" r="1.2"/></svg></span>' +
      '<span class="capsule-copy"><span class="capsule-title">Report a lost item</span><span class="capsule-note">Tell us what went missing</span></span><svg class="capsule-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></button>' +
      '<button type="button" class="capsule capsule-mid" data-action="report" data-type="found">' +
      '<span class="capsule-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m20.2 13.2-7.2 7.2a2 2 0 0 1-2.8 0l-6.6-6.6a2 2 0 0 1 0-2.8l7.2-7.2a2 2 0 0 1 1.4-.6h6.6a2 2 0 0 1 2 2v6.6a2 2 0 0 1-.6 1.4Z"/><path d="M12 7.7c1.4 0 2.4 1 2.4 2.2 0 2-2.4 4.3-2.4 4.3s-2.4-2.3-2.4-4.3c0-1.2 1-2.2 2.4-2.2Z"/></svg></span>' +
      '<span class="capsule-copy"><span class="capsule-title">Turn in a found item</span><span class="capsule-note">Help it reach its owner</span></span><svg class="capsule-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></button>' +
      '<a class="capsule capsule-ice" href="#" data-page="lost"><span class="capsule-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></svg></span>' +
      '<span class="capsule-copy"><span class="capsule-title">Browse the board</span><span class="capsule-note">See everything reported</span></span><svg class="capsule-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></a></section>' +
      '<div class="split"><section class="panel"><div class="panel-head"><div><h2 class="panel-title">Items you reported</h2>' +
      '<p class="panel-note">Lost and found reports attached to your account.</p></div><div class="panel-actions">' +
      '<a class="btn btn-secondary btn-sm" href="#" data-page="lost">Lost board</a>' +
      '<a class="btn btn-secondary btn-sm" href="#" data-page="found">Found board</a></div></div>' +
      (reports || '<div class="empty-state"><svg class="empty-art" viewBox="0 0 100 72" fill="none" aria-hidden="true"><path d="M22 11h42l20 20-20 20H22a7 7 0 0 1-7-7V18a7 7 0 0 1 7-7Z" stroke="currentColor" stroke-width="1.7" stroke-dasharray="4 4"/><circle cx="27" cy="25" r="3" stroke="currentColor" stroke-width="1.7"/><path d="M39 25h23M39 33h16" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="78" cy="54" r="12" fill="var(--panel)" stroke="currentColor" stroke-width="1.7"/></svg>' +
        '<h3 class="empty-state-title">Nothing reported yet</h3>' +
        '<p class="empty-state-text">When you report a lost or found item, it will show up here.</p></div>') +
      '</section><section class="panel"><div class="panel-head"><div><h2 class="panel-title">Your claims</h2>' +
      '<p class="panel-note">Management verifies each claim before an item is returned.</p></div></div>' +
      (claimRows || '<div class="empty-state"><svg class="empty-art empty-art-claim" viewBox="0 0 100 72" fill="none" aria-hidden="true"><path d="M17 16h66v40H17z" stroke="currentColor" stroke-width="1.7" stroke-dasharray="4 4"/><path d="M30 16v40m40-40v40" stroke="currentColor" stroke-width="1.7" stroke-dasharray="3 4"/><circle cx="50" cy="36" r="12" fill="var(--panel)" stroke="currentColor" stroke-width="1.7"/><path d="m45 36 3.5 3.5L55 33" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        '<h3 class="empty-state-title">No claims yet</h3>' +
        '<p class="empty-state-text">If you recognize a belonging, claim it and track it here.</p></div>') +
      '</section></div>';
  }

  async function renderManagement() {
    const [lost, found] = await Promise.all([loadItems('lost'), loadItems('found')]);
    const items = lost.map(function (item) { return { type: 'lost', item }; })
      .concat(found.map(function (item) { return { type: 'found', item }; }));
    const claimed = items.filter(function (entry) { return entry.item.status === 'Claimed'; });
    const open = items.filter(function (entry) { return entry.item.status === 'Open'; });
    const resolved = items.filter(function (entry) { return entry.item.status === 'Resolved'; });
    document.getElementById('topbar-title').textContent = 'Management';
    document.getElementById('topbar-actions').innerHTML = '';
    pageContent.innerHTML =
      '<section class="ops"><div class="ops-copy"><p class="eyebrow">Management desk</p>' +
      (claimed.length
        ? '<h1>' + claimed.length + ' claim' + (claimed.length === 1 ? '' : 's') + ' waiting.</h1>' +
          '<p class="lede">Verify the claimant, hand the item over, then mark the record resolved.</p>'
        : '<h1>The desk is clear.</h1><p class="lede">No claims are waiting. Counts below reflect live records.</p>') +
      '<div class="ops-links"><a class="btn btn-primary" href="#" data-page="lost">Lost items</a>' +
      '<a class="btn btn-secondary" href="#" data-page="found">Found items</a></div></div>' +
      '<div class="meter" aria-label="System summary">' +
      '<div class="meter-cell"><span class="meter-value">' + lost.length + '</span><span class="meter-label">Lost</span></div>' +
      '<div class="meter-cell"><span class="meter-value">' + found.length + '</span><span class="meter-label">Found</span></div>' +
      '<div class="meter-cell"><span class="meter-value">' + open.length + '</span><span class="meter-label">Open</span></div>' +
      '<div class="meter-cell meter-cell-focus"><span class="meter-value">' + claimed.length + '</span><span class="meter-label">Pending</span></div>' +
      '<div class="meter-cell"><span class="meter-value">' + resolved.length + '</span><span class="meter-label">Resolved</span></div>' +
      '</div></section><section class="panel"><div class="panel-head"><div>' +
      '<h2 class="panel-title">Claims awaiting verification</h2>' +
      '<p class="panel-note">Resolve a claim only after the item has been returned.</p></div></div>' +
      (claimed.length ? '<div class="record-scroll">' + claimed.map(function (entry) {
        return '<article class="claim-row"><div><h3 class="record-title">' + escapeHtml(entry.item.name) +
          ' <span class="badge badge-' + entry.type + '">' + entry.type + '</span></h3>' +
          '<p class="record-meta"><span>Claimed by ' +
          escapeHtml(entry.item.claimed_by_username || 'Unknown user') + '</span><span>' +
          escapeHtml(entry.item.location) + '</span></p></div>' +
          '<button type="button" class="btn btn-success" data-action="resolve" data-type="' +
          entry.type + '" data-id="' + Number(entry.item.item_id) + '">Mark resolved</button></article>';
      }).join('') + '</div>' :
        '<div class="empty-state"><div class="empty-orb" aria-hidden="true"></div>' +
        '<h3 class="empty-state-title">Nothing waiting</h3>' +
        '<p class="empty-state-text">New claims will appear here as soon as a student claims an item.</p></div>') +
      '</section>';
  }

  async function renderSearch(query) {
    document.getElementById('topbar-title').textContent = 'Search';
    document.getElementById('topbar-actions').innerHTML = '';
    const safeQuery = escapeHtml(query || '');
    let resultsMarkup = '<section class="panel search-idle"><div class="empty-state">' +
      '<div class="empty-orb" aria-hidden="true"></div><h2 class="empty-state-title">Start with a word</h2>' +
      '<p class="empty-state-text">Search looks through item names, descriptions and locations.</p></div></section>';
    if (query) {
      const data = await api('/search?q=' + encodeURIComponent(query));
      const lost = data.results.lost || [];
      const found = data.results.found || [];
      const matches = lost.map(function (item) { return itemCard('lost', item); })
        .concat(found.map(function (item) { return itemCard('found', item); })).join('');
      resultsMarkup = matches
        ? '<p class="lede">' + (lost.length + found.length) + ' matching item(s).</p><div class="items-grid">' + matches + '</div>'
        : emptyState('No match for “' + safeQuery + '”', 'Try a shorter name, a detail, or a campus location.');
    }
    pageContent.innerHTML =
      '<header class="page-intro page-intro-solo"><div><p class="eyebrow">Campus search</p>' +
      '<h1>Search lost and found items.</h1><p class="lede">Look up a name, a detail from the description, or a location.</p></div></header>' +
      '<form class="search-bar search-bar-lg" id="search-form" role="search">' +
      '<span class="search-bar-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></svg></span>' +
      '<label class="visually-hidden" for="search-query">Search items</label>' +
      '<input id="search-query" name="q" type="search" value="' + safeQuery + '" placeholder="Search items…">' +
      '<button type="submit" class="btn btn-primary">Search</button></form>' + resultsMarkup;
  }

  async function renderPage(page, query) {
    if (!currentUser) return;
    if (page === 'management' && !isManagement()) page = 'home';
    currentPage = page;
    document.querySelectorAll('[data-page]').forEach(function (link) {
      link.classList.toggle('is-active', link.dataset.page === page);
    });
    closeSidebar();

    try {
      if (page === 'lost' || page === 'found') await renderItemsPage(page);
      else if (page === 'management') await renderManagement();
      else if (page === 'search') await renderSearch(query || '');
      else await renderUserHome();
    } catch (error) {
      pageError(error);
    }
  }

  document.getElementById('login-form').addEventListener('submit', async function (event) {
    event.preventDefault();
    const button = event.currentTarget.querySelector('[type="submit"]');
    const errorBox = document.getElementById('login-error');
    errorBox.hidden = true;
    button.disabled = true;
    try {
      const form = new FormData(event.currentTarget);
      const data = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          identifier: form.get('identifier'),
          password: form.get('password'),
        }),
      });
      showApp(data.user);
      event.currentTarget.reset();
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.hidden = false;
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById('signup-form').addEventListener('submit', async function (event) {
    event.preventDefault();
    const button = event.currentTarget.querySelector('[type="submit"]');
    const errorBox = document.getElementById('signup-error');
    errorBox.hidden = true;
    button.disabled = true;
    try {
      const form = new FormData(event.currentTarget);
      await api('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({
          username: form.get('username'),
          id_number: form.get('id_number'),
          password: form.get('password'),
        }),
      });
      showAuth('login');
      showAlert('Account created. You can now sign in with your ID number.', 'success');
      document.getElementById('login-identifier').value = form.get('id_number');
      event.currentTarget.reset();
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.hidden = false;
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById('report-form').addEventListener('submit', async function (event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('[type="submit"]');
    const errorBox = document.getElementById('report-error');
    errorBox.hidden = true;
    button.disabled = true;
    try {
      const type = document.getElementById('report-type').value;
      await api('/items/' + type, { method: 'POST', body: new FormData(form) });
      closeReport();
      showAlert('Your item was reported.', 'success');
      await renderPage(currentPage);
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.hidden = false;
    } finally {
      button.disabled = false;
    }
  });

  document.addEventListener('submit', function (event) {
    const form = event.target;
    if (form.id !== 'search-form' && form.id !== 'home-search-form') return;
    event.preventDefault();
    const query = new FormData(form).get('q').trim();
    renderPage('search', query);
  });

  document.addEventListener('click', async function (event) {
    const themeChoice = event.target.closest('[data-theme-choice]');
    if (themeChoice) {
      setTheme(themeChoice.dataset.themeChoice);
      return;
    }

    const pageLink = event.target.closest('[data-page]');
    if (pageLink) {
      event.preventDefault();
      renderPage(pageLink.dataset.page);
      return;
    }

    const filterButton = event.target.closest('[data-filter]');
    if (filterButton) {
      currentFilter = filterButton.dataset.filter;
      const bar = filterButton.closest('[data-filter-bar]');
      bar.querySelectorAll('[data-filter]').forEach(function (button) {
        button.classList.toggle('is-active', button === filterButton);
      });
      const group = document.querySelector('[data-filter-group]');
      let shown = 0;
      group.querySelectorAll('[data-status]').forEach(function (card) {
        const match = currentFilter === 'all' || card.dataset.status === currentFilter;
        card.classList.toggle('is-filtered-out', !match);
        if (match) shown += 1;
      });
      const empty = document.querySelector('[data-filter-empty]');
      if (empty) empty.hidden = shown !== 0;
      return;
    }

    const action = event.target.closest('[data-action]');
    if (!action) return;
    if (action.dataset.action === 'show-signup') return showAuth('signup');
    if (action.dataset.action === 'show-login') return showAuth('login');
    if (action.dataset.action === 'report') return openReport(action.dataset.type);
    if (action.dataset.action === 'close-report') return closeReport();
    if (action.dataset.action === 'logout') {
      try {
        await api('/auth/logout', { method: 'POST' });
      } catch (error) {
        showAlert(error.message, 'error');
      } finally {
        showAuth('login');
      }
      return;
    }
    if (action.dataset.action === 'claim') {
      const confirmed = await requestConfirmation(
        'Claim this item?',
        'Management will verify your claim before the item is returned.'
      );
      if (!confirmed) return;
      try {
        await api('/items/' + action.dataset.type + '/' + action.dataset.id + '/claim', { method: 'POST' });
        showAlert('Claim submitted. Management will verify the item.', 'success');
        await renderPage(currentPage);
      } catch (error) {
        showAlert(error.message, 'error');
      }
      return;
    }
    if (action.dataset.action === 'resolve') {
      const confirmed = await requestConfirmation(
        'Resolve this item?',
        'Mark this item as resolved after it has been returned to the claimant.'
      );
      if (!confirmed) return;
      try {
        await api('/items/' + action.dataset.type + '/' + action.dataset.id + '/resolve', { method: 'POST' });
        showAlert('Item marked as resolved.', 'success');
        await renderPage(currentPage);
      } catch (error) {
        showAlert(error.message, 'error');
      }
    }
  });

  document.getElementById('report-image').addEventListener('change', function (event) {
    const file = event.target.files && event.target.files[0];
    const preview = document.getElementById('report-preview');
    const errorBox = document.getElementById('report-error');
    const uploadText = document.getElementById('upload-area-text');
    if (!file) {
      preview.hidden = true;
      preview.classList.remove('is-visible');
      uploadText.textContent = 'Drop a photo or click to browse';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      event.target.value = '';
      errorBox.textContent = 'Image must be 5 MB or smaller.';
      errorBox.hidden = false;
      preview.hidden = true;
      preview.classList.remove('is-visible');
      uploadText.textContent = 'Drop a photo or click to browse';
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) {
      event.target.value = '';
      errorBox.textContent = 'Only JPEG, PNG, GIF or WebP images are allowed.';
      errorBox.hidden = false;
      preview.hidden = true;
      preview.classList.remove('is-visible');
      uploadText.textContent = 'Drop a photo or click to browse';
      return;
    }
    errorBox.hidden = true;
    preview.src = URL.createObjectURL(file);
    preview.hidden = false;
    preview.classList.add('is-visible');
    uploadText.textContent = file.name;
  });

  const uploadArea = document.getElementById('upload-area');
  uploadArea.addEventListener('dragover', function (event) {
    event.preventDefault();
    uploadArea.classList.add('is-dragging');
  });
  uploadArea.addEventListener('dragleave', function (event) {
    if (!uploadArea.contains(event.relatedTarget)) uploadArea.classList.remove('is-dragging');
  });
  uploadArea.addEventListener('drop', function (event) {
    event.preventDefault();
    uploadArea.classList.remove('is-dragging');
    if (!event.dataTransfer.files.length) return;
    const transfer = new DataTransfer();
    Array.from(event.dataTransfer.files).forEach(function (file) { transfer.items.add(file); });
    const imageInput = document.getElementById('report-image');
    imageInput.files = transfer.files;
    imageInput.dispatchEvent(new Event('change', { bubbles: true }));
  });

  document.getElementById('confirmCancel').addEventListener('click', function () {
    finishConfirmation(false);
  });
  document.getElementById('confirmProceed').addEventListener('click', function () {
    finishConfirmation(true);
  });
  confirmDialog.addEventListener('click', function (event) {
    if (event.target === confirmDialog) finishConfirmation(false);
  });

  mobileToggle.addEventListener('click', function () {
    sidebar.classList.add('is-open');
    sidebarOverlay.hidden = false;
    sidebarOverlay.classList.add('is-open');
    document.body.classList.add('nav-lock');
    mobileToggle.setAttribute('aria-expanded', 'true');
  });
  sidebarOverlay.addEventListener('click', closeSidebar);
  reportModal.addEventListener('click', function (event) {
    if (event.target === reportModal) closeReport();
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === '/' && currentUser &&
        !event.target.matches('input, textarea, select, [contenteditable="true"]')) {
      event.preventDefault();
      const searchInput = document.getElementById('home-search') ||
        document.getElementById('search-query');
      if (searchInput) searchInput.focus();
    }
    if (event.key === 'Escape') {
      if (confirmDialog.classList.contains('is-open')) finishConfirmation(false);
      closeReport();
      closeSidebar();
    }
  });

  api('/auth/me')
    .then(function (data) {
      showApp(data.user);
    })
    .catch(function () {
      showAuth('login');
    });
})();
