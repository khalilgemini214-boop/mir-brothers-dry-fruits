/* ── App users, roles and user switching ───────────────────────── */
(function () {
  const MMB = window.MMB;
  const t = MMB.t;

  function roleLabel(role) {
    return t(role === 'viewer' ? 'users.role.viewer' : 'users.role.admin');
  }

  function roleTone(role) {
    return role === 'viewer' ? 'blue' : 'gold';
  }

  MMB.applyRoleUI = function () {
    const admin = MMB.isAdmin();
    const user = MMB.currentUser();
    document.body.classList.toggle('viewer-mode', !admin);

    document.querySelectorAll('[data-nav="settings"]').forEach(function (a) { a.hidden = !admin; });
    ['sideSaleBtn', 'sidePurchaseBtn', 'topSaleBtn'].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.hidden = !admin;
    });

    const chip = document.getElementById('userBtn');
    if (!chip) return;
    const initials = document.getElementById('userInitials');
    const name = document.getElementById('userName');
    const role = document.getElementById('userRole');
    if (initials) initials.textContent = MMB.getInitials(user.name);
    if (name) name.textContent = user.name;
    if (role) role.textContent = roleLabel(user.role);
    chip.setAttribute('title', user.name + ' · ' + roleLabel(user.role));
    chip.setAttribute('aria-label', t('users.switchTitle') + ' — ' + user.name);
  };

  function switchTo(user, api) {
    MMB.setActiveUser(user.id);
    if (api) api.close();
    try { sessionStorage.setItem('mmb_unlocked', '1'); } catch (e) { /* ignore */ }
    MMB.toast(t('users.switched', { name: user.name }));
    MMB.applyRoleUI();
    MMB.rerender();
  }

  function gateRoleLabel(role) {
    return t(role === 'viewer' ? 'users.role.viewer' : 'users.role.admin');
  }

  MMB.showUserGate = function (onDone) {
    const gate = document.getElementById('userGate');
    if (!gate) { if (onDone) onDone(); return; }
    const listEl = document.getElementById('userGateList');
    const notice = document.getElementById('userGateNotice');
    const pinBox = document.getElementById('userGatePinBox');
    const pinInput = document.getElementById('userGatePin');
    const pinError = document.getElementById('userGatePinError');
    const pinGo = document.getElementById('userGatePinGo');
    const setupBox = document.getElementById('userGateSetup');
    const ownerName = document.getElementById('userGateOwnerName');
    const ownerPin = document.getElementById('userGateOwnerPin');
    const ownerPin2 = document.getElementById('userGateOwnerPin2');
    const setupError = document.getElementById('userGateSetupError');
    const setupSave = document.getElementById('userGateOwnerSave');
    const refreshBtn = document.getElementById('userGateRefresh');
    const signOutBtn = document.getElementById('userGateSignOut');

    let loading = false;
    let fetchedOk = false;
    let pendingPin = null;

    gate.hidden = false;
    document.body.classList.add('user-gating');
    MMB.applyI18n(gate);

    function hasLocalData() {
      return !!(MMB.accounts().length || MMB.db.sales.length || MMB.db.purchases.length ||
        MMB.db.ledger.length || MMB.searchProducts('').length || MMB.db.adjustments.length);
    }

    function finish(user) {
      if (!user) return;
      MMB.setActiveUser(user.id);
      gate.hidden = true;
      document.body.classList.remove('user-gating');
      MMB.refreshUserGate = null;
      MMB.applyRoleUI();
      if (onDone) onDone();
    }

    function render() {
      const users = MMB.users();
      listEl.classList.toggle('loading', loading);
      listEl.innerHTML = users.map(function (u) {
        const pin = MMB.userHasPin(u);
        return '<button class="user-gate-item" type="button" data-gate-user="' + u.id + '">' +
          '<div class="avatar ' + (u.role === 'viewer' ? 'blue' : '') + '">' + MMB.esc(MMB.getInitials(u.name)) + '</div>' +
          '<div class="row-main"><div class="row-title">' + MMB.esc(u.name) + '</div>' +
          '<div class="row-sub"><span class="badge ' + (u.role === 'viewer' ? 'badge-blue' : 'badge-gold') + '">' + gateRoleLabel(u.role) + '</span>' +
          ' · ' + (pin ? t('users.pinSet') : t('users.noPin')) + '</div></div>' +
          (pin ? MMB.icon('lock', 'row-arrow') : MMB.icon('chevron-right', 'row-arrow')) +
          '</button>';
      }).join('');

      const onlyAdminNoPin = users.length === 1 && users[0].role === 'admin' && !MMB.userHasPin(users[0]);
      const canSetup = onlyAdminNoPin && (fetchedOk || hasLocalData());
      setupBox.hidden = !canSetup;
      if (canSetup) ownerName.value = users[0].name || 'Owner';

      pinBox.hidden = !pendingPin;
      if (!pendingPin) { pinInput.value = ''; pinError.textContent = ''; }

      listEl.querySelectorAll('[data-gate-user]').forEach(function (b) {
        b.addEventListener('click', function () {
          if (loading) return;
          const u = MMB.user(b.getAttribute('data-gate-user'));
          if (!u) return;
          if (u.role === 'admin' && !MMB.userHasPin(u)) {
            if (canSetup) { ownerName.focus(); }
            else notice.textContent = t('users.adminNoPinGate');
            return;
          }
          if (MMB.userHasPin(u)) {
            pendingPin = u;
            render();
            setTimeout(function () { pinInput.focus(); }, 50);
            return;
          }
          finish(u);
        });
      });

      refreshBtn.disabled = loading;
      signOutBtn.disabled = loading;
      pinGo.disabled = loading;
      setupSave.disabled = loading;
    }

    async function fetchProfiles() {
      if (loading) return;
      if (!MMB.sync || !MMB.sync.fetch) {
        fetchedOk = false;
        notice.textContent = t('users.profilesOffline');
        render();
        return;
      }
      loading = true;
      notice.textContent = t('users.loadingProfiles');
      render();
      try {
        const res = await MMB.sync.fetch();
        if (MMB.sync.finish) MMB.sync.finish();
        fetchedOk = !!(res && res.ok);
        notice.textContent = fetchedOk ? t('users.profilesLoaded') : t('users.profilesOffline');
      } catch (e) {
        fetchedOk = false;
        notice.textContent = t('users.profilesOffline');
      }
      loading = false;
      MMB.applyI18n(gate);
      render();
    }

    async function tryPin() {
      if (!pendingPin) return;
      const pin = pinInput.value;
      if (!/^\d{4,6}$/.test(pin)) { pinError.textContent = t('users.pinLength'); return; }
      pinGo.disabled = true;
      const ok = await MMB.verifyUserPin(pendingPin, pin);
      pinGo.disabled = false;
      if (!ok) {
        pinError.textContent = t('users.pinWrong');
        pinInput.classList.add('shake');
        setTimeout(function () { pinInput.classList.remove('shake'); }, 400);
        return;
      }
      finish(pendingPin);
    }

    async function saveOwner() {
      const u = MMB.users()[0];
      if (!u) return;
      const name = ownerName.value.trim();
      const pin = ownerPin.value;
      if (!name) { setupError.textContent = t('users.nameRequired'); ownerName.focus(); return; }
      if (!/^\d{4,6}$/.test(pin)) { setupError.textContent = t('users.pinLength'); ownerPin.focus(); return; }
      if (pin !== ownerPin2.value) { setupError.textContent = t('users.pinMismatch'); ownerPin2.focus(); return; }
      setupSave.disabled = true;
      const res = await MMB.updateUser(u.id, { name: name, role: 'admin', pin: pin });
      setupSave.disabled = false;
      if (!res.ok) {
        setupError.textContent = res.error === 'ownerPinRequired' ? t('users.ownerPinRequired') : t('common.error');
        return;
      }
      MMB.toast(t('users.syncOwner'), 'gold');
      finish(u);
    }

    notice.textContent = '';
    pinBox.hidden = true;
    setupBox.hidden = true;
    MMB.refreshUserGate = fetchProfiles;
    pinGo.onclick = tryPin;
    pinInput.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); tryPin(); } };
    setupSave.onclick = saveOwner;
    refreshBtn.onclick = fetchProfiles;
    signOutBtn.onclick = async function () {
      signOutBtn.disabled = true;
      try { await MMB.cloud.signOut(); }
      catch (e) { signOutBtn.disabled = false; notice.textContent = t('common.error'); }
    };

    render();
    fetchProfiles();
  };

  function askPin(user) {
    MMB.openSheet({
      title: t('users.enterPin'),
      subtitle: user.name + ' · ' + roleLabel(user.role),
      body: '<div class="field"><label class="label">' + t('users.pin') + '</label>' +
        '<input class="input num" id="userPinInput" type="password" inputmode="numeric" maxlength="6" autocomplete="off" data-autofocus></div>' +
        '<div class="auth-error" id="userPinError" style="margin-top:8px"></div>',
      footer: '<button class="btn btn-ghost" data-close>' + t('common.cancel') + '</button>' +
        '<button class="btn btn-primary" id="userPinGo">' + t('users.unlock') + '</button>',
      onMount: function (el, api) {
        const input = el.querySelector('#userPinInput');
        const err = el.querySelector('#userPinError');
        async function go() {
          const pin = input.value;
          if (!/^\d{4,6}$/.test(pin)) { err.textContent = t('users.pinLength'); return; }
          const ok = await MMB.verifyUserPin(user, pin);
          if (!ok) {
            err.textContent = t('users.pinWrong');
            input.classList.add('shake');
            setTimeout(function () { input.classList.remove('shake'); }, 400);
            return;
          }
          switchTo(user, api);
        }
        el.querySelector('#userPinGo').addEventListener('click', go);
        input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); go(); } });
        setTimeout(function () { input.focus(); }, 60);
      }
    });
  }

  MMB.openUserSwitcher = function () {
    const users = MMB.users();
    const current = MMB.currentUser();
    const currentIsAdmin = MMB.isAdmin();
    const rows = users.map(function (u) {
      const active = u.id === current.id;
      const pin = MMB.userHasPin(u);
      return '<button class="party-item" data-user="' + u.id + '">' +
        '<div class="avatar ' + roleTone(u.role) + '">' + MMB.esc(MMB.getInitials(u.name)) + '</div>' +
        '<div class="row-main"><div class="row-title">' + MMB.esc(u.name) +
        (active ? ' <span class="badge badge-green">' + t('users.current') + '</span>' : '') + '</div>' +
        '<div class="row-sub"><span class="badge ' + (u.role === 'viewer' ? 'badge-blue' : 'badge-gold') + '">' + roleLabel(u.role) + '</span>' +
        '<span class="sep"></span><span>' + (pin ? t('users.pinSet') : t('users.noPin')) + '</span></div></div>' +
        (active ? '' : MMB.icon('chevron-right', 'row-arrow')) + '</button>';
    }).join('');

    MMB.openSheet({
      title: t('users.switchTitle'),
      subtitle: current.name + ' · ' + roleLabel(current.role),
      body: '<div class="party-list">' + rows + '</div>' +
        (currentIsAdmin ? '<div class="hint mt-12">' + t('users.switchHintAdmin') + '</div>' : '<div class="hint mt-12">' + t('users.switchHintViewer') + '</div>'),
      footer: '<button class="btn btn-ghost" data-close>' + t('common.close') + '</button>' +
        (currentIsAdmin ? '<button class="btn btn-primary" id="switchAddUser">' + t('users.add') + '</button>' : ''),
      onMount: function (el, api) {
        el.querySelectorAll('[data-user]').forEach(function (b) {
          b.addEventListener('click', function () {
            const target = MMB.user(b.getAttribute('data-user'));
            if (!target) return;
            if (target.id === current.id) { api.close(); return; }
            if (currentIsAdmin) {
              if (target.role === 'viewer' && !MMB.userHasPin(current)) {
                MMB.toast(t('users.setOwnerPinFirst'), 'error');
                return;
              }
              switchTo(target, api);
              return;
            }
            if (target.role === 'admin' && !MMB.userHasPin(target)) {
              MMB.toast(t('users.adminPinRequired'), 'error');
              return;
            }
            if (MMB.userHasPin(target)) { api.close(); setTimeout(function () { askPin(target); }, 160); }
            else switchTo(target, api);
          });
        });
        const add = el.querySelector('#switchAddUser');
        if (add) add.addEventListener('click', function () {
          api.close();
          setTimeout(function () { MMB.openUserForm({}); }, 150);
        });
      }
    });
  };

  MMB.openUserForm = function (opts) {
    if (!MMB.isAdmin()) { MMB.toast(t('users.readonly'), 'error'); return; }
    opts = opts || {};
    const user = opts.user || null;
    const editing = !!user;
    let role = user && user.role === 'viewer' ? 'viewer' : 'admin';
    let clearPin = false;
    const hasPin = !!(user && MMB.userHasPin(user));

    function roleHint(r) {
      if (r === 'admin' && !hasPin) return t('users.pinRequired');
      if (r === 'viewer' && !MMB.adminHasPin()) return t('users.ownerPinRequired');
      return t(r === 'viewer' ? 'users.hint.viewer' : 'users.hint.admin');
    }

    const body = '<div class="form-grid">' +
      '<div class="field full"><label class="label">' + t('users.name') + '</label>' +
      '<input class="input" id="userFormName" maxlength="40" autocomplete="off" value="' + MMB.esc(user ? user.name : '') + '" data-autofocus></div>' +
      '<div class="field full"><label class="label">' + t('users.role') + '</label>' +
      '<div class="segmented" id="userFormRole">' +
      '<button type="button" data-role="admin" class="' + (role === 'admin' ? 'active' : '') + '">' + t('users.role.admin') + '</button>' +
      '<button type="button" data-role="viewer" class="' + (role === 'viewer' ? 'active' : '') + '">' + t('users.role.viewer') + '</button>' +
      '</div><div class="hint" id="userRoleHint">' + roleHint(role) + '</div></div>' +
      '<div class="field"><label class="label">' + (editing ? t('users.newPin') : t('users.pin')) + ' <span class="opt">' + t('common.optional') + '</span></label>' +
      '<input class="input num" id="userFormPin" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password" placeholder="' + (hasPin ? '••••' : '') + '"></div>' +
      '<div class="field"><label class="label">' + t('common.confirm') + '</label>' +
      '<input class="input num" id="userFormPinConf" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"></div>' +
      '<div class="field full"><div class="hint">' + t('users.pinFormHint') + '</div>' +
      (hasPin ? '<button type="button" class="btn btn-sm btn-ghost mt-8" id="userFormClearPin">' + MMB.icon('x') + t('users.removePin') + '</button>' : '') +
      '</div>' +
      '</div>';

    const footer = '<button class="btn btn-ghost" data-close>' + t('common.cancel') + '</button>' +
      (editing ? '<button class="btn btn-danger" id="userFormDelete">' + MMB.icon('trash') + t('common.delete') + '</button>' : '') +
      '<button class="btn btn-primary" id="userFormSave">' + t('common.save') + '</button>';

    MMB.openSheet({
      title: editing ? t('users.edit') : t('users.add'),
      subtitle: editing ? user.name : t('users.addHint'),
      body: body,
      footer: footer,
      onMount: function (el, api) {
        const nameEl = el.querySelector('#userFormName');
        const pinEl = el.querySelector('#userFormPin');
        const confEl = el.querySelector('#userFormPinConf');
        const clearEl = el.querySelector('#userFormClearPin');
        el.querySelectorAll('#userFormRole [data-role]').forEach(function (b) {
          b.addEventListener('click', function () {
            role = b.getAttribute('data-role') === 'viewer' ? 'viewer' : 'admin';
            el.querySelectorAll('#userFormRole [data-role]').forEach(function (x) { x.classList.toggle('active', x === b); });
            el.querySelector('#userRoleHint').textContent = roleHint(role);
          });
        });
        if (clearEl) clearEl.addEventListener('click', function () {
          clearPin = true;
          pinEl.value = '';
          confEl.value = '';
          clearEl.disabled = true;
          clearEl.classList.add('muted');
        });

        function errorText(code) {
          if (code === 'lastAdmin') return t('users.lastAdmin');
          if (code === 'name') return t('users.nameRequired');
          if (code === 'pin') return t('users.pinLength');
          if (code === 'readonly') return t('users.readonly');
          if (code === 'self') return t('users.cannotDeleteSelf');
          if (code === 'ownerPinRequired') return t('users.ownerPinRequired');
          if (code === 'pinRequired') return t('users.pinRequired');
          return t('common.error');
        }

        el.querySelector('#userFormSave').addEventListener('click', async function () {
          const name = nameEl.value.trim();
          if (!name) { MMB.toast(t('users.nameRequired'), 'error'); nameEl.focus(); return; }
          const pin = pinEl.value;
          const conf = confEl.value;
          if (pin) {
            if (!/^\d{4,6}$/.test(pin)) { MMB.toast(t('users.pinLength'), 'error'); pinEl.focus(); return; }
            if (pin !== conf) { MMB.toast(t('users.pinMismatch'), 'error'); confEl.focus(); return; }
          }
          const data = { name: name, role: role, pin: pin, clearPin: pin ? false : clearPin };
          const res = editing ? await MMB.updateUser(user.id, data) : await MMB.addUser(data);
          if (!res.ok) { MMB.toast(errorText(res.error), 'error'); return; }
          MMB.toast(editing ? t('common.saved') : t('users.added'));
          if (MMB.pendingCount && MMB.pendingCount()) MMB.toast(t('users.syncHint'), 'gold');
          api.close();
          MMB.applyRoleUI();
          if (opts.onSaved) opts.onSaved(); else MMB.rerender();
        });

        const del = el.querySelector('#userFormDelete');
        if (del) del.addEventListener('click', async function () {
          const ok = await MMB.confirm({ title: t('users.delete'), body: t('users.deleteBody', { name: user.name }), danger: true, confirmText: t('common.delete') });
          if (!ok) return;
          const res = MMB.deleteUser(user.id);
          if (!res.ok) { MMB.toast(errorText(res.error), 'error'); return; }
          MMB.toast(t('common.deleted'));
          api.close();
          MMB.applyRoleUI();
          if (opts.onSaved) opts.onSaved(); else MMB.rerender();
        });
      }
    });
  };

  MMB.usersSectionHTML = function () {
    if (!MMB.isAdmin()) return '';
    const users = MMB.users();
    const current = MMB.currentUser();
    const hasViewer = users.some(function (u) { return u.role === 'viewer'; });
    const adminNoPin = users.some(function (u) { return u.role === 'admin' && !MMB.userHasPin(u); });
    const pending = MMB.pendingCount ? MMB.pendingCount() : 0;

    const rows = users.map(function (u) {
      return '<div class="setting-row">' +
        '<div class="avatar sm ' + roleTone(u.role) + '">' + MMB.esc(MMB.getInitials(u.name)) + '</div>' +
        '<div class="setting-label"><div class="st">' + MMB.esc(u.name) +
        (u.id === current.id ? ' <span class="badge badge-green">' + t('users.current') + '</span>' : '') + '</div>' +
        '<div class="ss"><span class="badge ' + (u.role === 'viewer' ? 'badge-blue' : 'badge-gold') + '">' + roleLabel(u.role) + '</span>' +
        ' · ' + (MMB.userHasPin(u) ? t('users.pinSet') : t('users.noPin')) + '</div></div>' +
        '<div class="setting-control"><button class="btn btn-sm btn-ghost" data-edit-user="' + u.id + '">' + MMB.icon('pencil') + t('common.edit') + '</button></div></div>';
    }).join('');

    return '<section class="settings-group"><div class="section-head" style="margin-top:0">' +
      '<div class="section-title">' + t('users.section') + '</div>' +
      '<span class="micro">' + t('users.sectionHint') + '</span></div>' +
      '<div class="settings-card">' +
      '<div class="setting-row"><div class="si gold">' + MMB.icon('users') + '</div>' +
      '<div class="setting-label"><div class="st">' + t('users.currentUser') + '</div>' +
      '<div class="ss">' + MMB.esc(current.name) + ' · ' + roleLabel(current.role) + '</div></div>' +
      '<div class="setting-control"><button class="btn btn-sm btn-ghost" data-switch-user>' + MMB.icon('users') + t('users.switch') + '</button></div></div>' +
      rows +
      '<div class="form-pad" style="border-top:1px solid var(--line)"><button class="btn btn-soft btn-block" id="addUserBtn">' + MMB.icon('plus') + t('users.add') + '</button></div>' +
      (adminNoPin && hasViewer ? '<div class="hint warn" style="padding:0 16px 14px">' + t('users.ownerPinWarning') + '</div>' : '') +
      (pending ? '<div class="hint" style="padding:0 16px 14px">' + t('users.syncHint') + '</div>' : '') +
      '</div></section>';
  };

  MMB.bindUsersSection = function (root) {
    if (!root || !MMB.isAdmin()) return;
    const rerender = function () { MMB.rerender(); };
    root.querySelectorAll('[data-edit-user]').forEach(function (b) {
      b.addEventListener('click', function () {
        const u = MMB.user(b.getAttribute('data-edit-user'));
        if (u) MMB.openUserForm({ user: u, onSaved: rerender });
      });
    });
    const add = root.querySelector('#addUserBtn');
    if (add) add.addEventListener('click', function () { MMB.openUserForm({ onSaved: rerender }); });
    const sw = root.querySelector('[data-switch-user]');
    if (sw) sw.addEventListener('click', function () { MMB.openUserSwitcher(); });
  };
})();
