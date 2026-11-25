const API = '/api';
const $ = id => document.getElementById(id);
function showPage(id) { document.querySelectorAll('.page').forEach(p => p.classList.remove('active')); $(id).classList.remove('hidden'); $(id).classList.add('active'); }
function setAlert(text, type) { const a = $('alert'); a.textContent = text; a.className = 'alert ' + (type === 'success' ? 'alert-success' : 'alert-error') + ' show'; setTimeout(() => a.classList.remove('show'), 5000); }
function setBtnLoading(btnId, loading) { const b = $(btnId); if (!b) return; if (loading) { b.classList.add('btn-loading'); b.disabled = true; } else { b.classList.remove('btn-loading'); b.disabled = false; } }
function setAuthUI(authenticated, user) {
  var login = $('page-login'); var signup = $('page-signup'); var app = $('page-app');
  var headerUser = $('header-user'); var headerLogout = $('header-logout');
  if (authenticated) {
    login.classList.remove('active'); signup.classList.remove('active');
    login.classList.add('hidden'); signup.classList.add('hidden');
    app.classList.remove('hidden'); app.classList.add('active');
    $('app-user').textContent = 'Logged in as ' + user.username + ' (' + user.role + ')';
    headerUser.textContent = user.username + ' (' + user.role + ')';
    headerUser.classList.remove('hidden'); headerLogout.classList.remove('hidden');
    if (user.role === 'Management') { $('mgmt-tab').classList.remove('hidden'); }
    tab('lost');
  } else {
    app.classList.remove('active');
    login.classList.remove('hidden'); login.classList.add('active');
    signup.classList.remove('active'); signup.classList.add('hidden'); app.classList.add('hidden');
    headerUser.classList.add('hidden'); headerLogout.classList.add('hidden');
  }
}
async function api(path, opts) {
  opts = opts || {};
  var r = await fetch(API + path, { credentials: 'include', headers: { 'Content-Type': 'application/json', ...opts.headers }, ...opts });
  if (r.status === 401) { setAuthUI(false); throw new Error('auth'); }
  return r.json();
}
var auth = {
  login: async function() {
    var fd = new FormData($('form-login'));
    setBtnLoading('form-login', true);
    try {
      var res = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: fd.get('username'), password: fd.get('password') }),
      });
      setAuthUI(true, res.user);
      $('form-login').reset();
    } catch (e) { setAlert('Invalid username or password.', 'error'); }
    finally { setBtnLoading('form-login', false); }
  },
  signup: async function() {
    var fd = new FormData($('form-signup'));
    setBtnLoading('form-signup', true);
    try {
      await api('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ username: fd.get('username'), id_number: fd.get('id') || null, role: fd.get('role'), password: fd.get('password') }),
      });
      setAlert('Account created! You can now sign in.', 'success');
      $('form-signup').reset();
      showPage('page-login');
    } catch (e) { setAlert('Signup failed. Username may already be taken.', 'error'); }
    finally { setBtnLoading('form-signup', false); }
  },
  logout: async function() {
    try { await api('/auth/logout', { method: 'POST' }); } catch (e) {}
    setAuthUI(false);
    showPage('page-login');
  },
};
$('form-login').onsubmit = function(e) { e.preventDefault(); auth.login(); };
$('form-signup').onsubmit = function(e) { e.preventDefault(); auth.signup(); };
$('link-to-signup').onclick = function(e) { e.preventDefault(); showPage('page-signup'); };
$('link-to-login').onclick = function(e) { e.preventDefault(); showPage('page-login'); };
$('app-logout').onclick = function(e) { e.preventDefault(); auth.logout(); };
$('header-logout').onclick = function(e) { e.preventDefault(); auth.logout(); };
document.querySelector('.tabs').addEventListener('click', function(e) {
  var target = e.target.closest('[data-tab]');
  if (target) tab(target.dataset.tab);
});
$('search-q').addEventListener('input', debouncedSearch);
document.addEventListener('click', function(e) {
  var button = e.target.closest('[data-action]');
  if (!button) return;
  if (button.dataset.action === 'claim-item') claimItem(button.dataset.type, button.dataset.id);
  if (button.dataset.action === 'refresh-claims') loadClaims();
  if (button.dataset.action === 'process-claim') processClaim(button.dataset.id, button.dataset.decision);
});
function tab(name) {
  document.querySelectorAll('.tab-content').forEach(function(el) { if (el.id !== 'tab-' + name) el.classList.add('hidden'); });
  var target = $('tab-' + name); if (target) target.classList.remove('hidden');
  if (name === 'lost') loadItems('lost');
  if (name === 'found') loadItems('found');
  if (name === 'claims') loadClaims();
  if (name === 'management') loadManagement();
}
async function loadItems(type) {
  try {
    var data = await api('/items/' + type);
    var items = data.items;
    var rows = items.map(function(it) {
      return '<tr>' +
        '<td><strong>' + escapeHtml(it.name) + '</strong></td>' +
        '<td>' + escapeHtml(it.description || '') + '</td>' +
        '<td>' + (it.item_date || '—') + '</td>' +
        '<td>' + escapeHtml(it.location || '—') + '</td>' +
        '<td><span class="badge badge-' + it.status.toLowerCase() + '">' + it.status + '</span></td>' +
        '<td>' +
          (it.status === 'Open'
            ? '<button class="btn btn-sm btn-primary" data-action="claim-item" data-type="' + type + '" data-id="' + it.item_id + '">Claim</button>'
            : it.claimed_by ? '<span class="badge badge-claimed">Claimed</span>' : '<span class="badge badge-resolved">—</span>'
          ) +
        '</td>' +
      '</tr>';
    }).join('');
    var html = '<table>' +
      '<thead><tr><th>Item</th><th>Description</th><th>Date</th><th>Location</th><th>Status</th><th>Action</th></tr></thead>' +
      '<tbody>' + (rows || '<tr><td colspan="6" class="empty">No items found.</td></tr>') + '</tbody>' +
      '</table>';
    $('tab-' + type).innerHTML = html;
  } catch (e) { $('tab-' + type).innerHTML = '<div class="empty">Failed to load items.</div>'; }
}
async function claimItem(type, id) {
  if (!confirm('Claim this item?')) return;
  try {
    await api('/items/' + type + '/' + id + '/claim', { method: 'POST' });
    loadItems(type);
  } catch (e) { setAlert('Could not claim item. It may already be taken.', 'error'); }
}
async function loadClaims() {
  try {
    var data = await api('/claims');
    var pending = data.pending;
    var rows = pending.map(function(c) {
      return '<tr>' +
        '<td>#' + c.id + '</td>' +
        '<td>' + escapeHtml(c.item_type) + ' #' + c.item_id + '</td>' +
        '<td>' + escapeHtml(c.requester) + '</td>' +
        '<td>' + escapeHtml(c.reason) + '</td>' +
        '<td><button class="btn btn-sm btn-outline" data-action="refresh-claims">Refresh</button></td>' +
      '</tr>';
    }).join('');
    $('tab-claims').innerHTML = '<h3>My claims</h3>' +
      '<div class="table-wrap">' +
      '<table>' +
      '<thead><tr><th>ID</th><th>Item</th><th>Requester</th><th>Reason</th><th></th></tr></thead>' +
      '<tbody>' + (rows || '<tr><td colspan="5" class="empty">No claims yet.</td></tr>') + '</tbody>' +
      '</table></div>';
  } catch (e) { $('tab-claims').innerHTML = '<div class="empty">Failed to load claims.</div>'; }
}
async function loadManagement() {
  try {
    var data = await api('/claims');
    var pending = data.pending;
    var history = data.history;
    var p = pending.map(function(c) {
      return '<tr>' +
        '<td>#' + c.id + '</td>' +
        '<td>' + escapeHtml(c.item_type) + ' #' + c.item_id + '</td>' +
        '<td>' + escapeHtml(c.requester) + '</td>' +
        '<td>' + escapeHtml(c.reason) + '</td>' +
        '<td>' +
          '<button class="btn btn-sm btn-success" data-action="process-claim" data-id="' + c.id + '" data-decision="approve">Approve</button> ' +
          '<button class="btn btn-sm btn-danger" data-action="process-claim" data-id="' + c.id + '" data-decision="decline">Decline</button>' +
        '</td>' +
      '</tr>';
    }).join('');
    var h = history.map(function(c) {
      return '<tr>' +
        '<td>#' + c.id + '</td>' +
        '<td>' + escapeHtml(c.item_type) + ' #' + c.item_id + '</td>' +
        '<td>' + escapeHtml(c.requester) + '</td>' +
        '<td><span class="badge badge-' + c.status.toLowerCase() + '">' + c.status + '</span></td>' +
        '<td>' + escapeHtml(c.manager_note || '') + '</td>' +
      '</tr>';
    }).join('');
    $('tab-management').innerHTML = '<h3>Management — Claim Requests</h3>' +
      '<div class="card p-lg" style="margin-bottom:var(--space-md);">' +
      '<h4 style="margin-bottom:var(--space-sm);">Pending</h4>' +
      '<div class="table-wrap">' +
      '<table>' +
      '<thead><tr><th>ID</th><th>Item</th><th>Requester</th><th>Reason</th><th>Action</th></tr></thead>' +
      '<tbody>' + (p || '<tr><td colspan="5" class="empty">No pending requests.</td></tr>') + '</tbody>' +
      '</table></div></div>' +
      '<h4 style="margin-bottom:var(--space-sm);">History</h4>' +
      '<div class="table-wrap">' +
      '<table>' +
      '<thead><tr><th>ID</th><th>Item</th><th>Requester</th><th>Status</th><th>Note</th></tr></thead>' +
      '<tbody>' + (h || '<tr><td colspan="5" class="empty">No history.</td></tr>') + '</tbody>' +
      '</table></div>';
  } catch (e) { $('tab-management').innerHTML = '<div class="empty">Failed to load management view.</div>'; }
}
async function processClaim(id, action) {
  var note = prompt(action === 'approve' ? 'Enter approval note:' : 'Enter decline reason:');
  if (note === null) return;
  try {
    await api('/claims/' + id + '/' + action, {
      method: 'POST',
      body: JSON.stringify({ manager_note: note || '' }),
    });
    loadManagement();
    loadItems('lost');
    loadItems('found');
  } catch (e) { setAlert('Failed to process claim.', 'error'); }
}
async function doSearch() {
  var q = $('search-q').value.trim();
  if (!q) { $('search-results').innerHTML = ''; return; }
  try {
    var data = await api('/search?q=' + encodeURIComponent(q));
    var lost = data.results.lost.map(function(i) {
      return '<li>' + escapeHtml(i.name) + ' — ' + escapeHtml(i.location) + ' (' + i.status + ')</li>';
    }).join('');
    var found = data.results.found.map(function(i) {
      return '<li>' + escapeHtml(i.name) + ' — ' + escapeHtml(i.location) + ' (' + i.status + ')</li>';
    }).join('');
    $('search-results').innerHTML =
      '<strong>Lost items:</strong> <ul style="margin-left:var(--space-md);margin-top:var(--space-xs)">' + lost || '<li>none</li>' + '</ul>' +
      '<strong style="margin-top:var(--space-md);display:block;">Found items:</strong> <ul style="margin-left:var(--space-md);margin-top:var(--space-xs)">' + found || '<li>none</li>' + '</ul>';
  } catch (e) { $('search-results').innerHTML = '<div class="empty">Search failed.</div>'; }
}
var searchTimer;
function debouncedSearch() { clearTimeout(searchTimer); searchTimer = setTimeout(doSearch, 300); }
$('form-report').onsubmit = async function(e) {
  e.preventDefault();
  var fd = new FormData(e.target);
  var type = fd.get('type');
  setBtnLoading('form-report', true);
  try {
    await api('/items/' + type, {
      method: 'POST',
      body: JSON.stringify({ name: fd.get('name'), description: fd.get('desc'), date: fd.get('date'), location: fd.get('loc') }),
    });
    e.target.reset();
    loadItems(type);
    setAlert('Item reported successfully.', 'success');
  } catch (err) { setAlert('Failed to report item.', 'error'); }
  finally { setBtnLoading('form-report', false); }
};
function escapeHtml(t) {
  return String(t ?? '').replace(/[&<>"']/g, function(c) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c];
  });
}
var style = document.createElement('style');
style.textContent = '.btn-success { background: var(--color-success); color: #fff; } .btn-success:hover:not(:disabled) { background: #15803d; } .btn-danger { background: var(--color-danger); color: #fff; } .btn-danger:hover:not(:disabled) { background: #b91c1c; } .w-full { width: 100%; } .cursor-pointer { cursor: pointer; }';
document.head.appendChild(style);
(async () => {
  try {
    var res = await api('/auth/me');
    if (res.user) setAuthUI(true, res.user);
    else setAuthUI(false);
  } catch (e) { setAuthUI(false); }
})();
