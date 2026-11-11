/* ── UI: overlays, pickers, toasts, charts, print ─────────────── */
(function () {
  const MMB = window.MMB;
  const t = MMB.t;

  MMB.icon = function (name, cls) {
    return '<svg class="ic ' + (cls || '') + '" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
  };

  MMB.logoSVG = function (size) {
    const s = size || 44;
    return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 64 64" aria-hidden="true">' +
      '<circle cx="32" cy="32" r="31" fill="#1F3D2E"/><circle cx="32" cy="32" r="26.5" fill="none" stroke="#C99A3F" stroke-width="1.2"/>' +
      '<path d="M32 8.5c2.7 3.1 2.7 6.6 0 9.3-2.7-2.7-2.7-6.2 0-9.3Z" fill="#7FA88A"/>' +
      '<path d="M32 55.5c-2.7-3.1-2.7-6.6 0-9.3 2.7 2.7 2.7 6.2 0 9.3Z" fill="#7FA88A"/>' +
      '<path d="M8.5 32c3.1-2.7 6.6-2.7 9.3 0-2.7 2.7-6.2 2.7-9.3 0Z" fill="#7FA88A"/>' +
      '<path d="M55.5 32c-3.1 2.7-6.6 2.7-9.3 0 2.7-2.7 6.2-2.7 9.3 0Z" fill="#7FA88A"/>' +
      '<text x="32" y="39.5" text-anchor="middle" font-family="Georgia,serif" font-size="17" font-weight="700" fill="#F7F2E8" letter-spacing=".5">MZ</text></svg>';
  };

  MMB.avatar = function (name, cls) {
    return '<div class="avatar ' + (cls || '') + '">' + MMB.esc(MMB.getInitials(name)) + '</div>';
  };

  MMB.shortMoney = function (n) {
    const v = Number(n) || 0;
    const a = Math.abs(v);
    let s;
    if (a >= 10000000) s = (a / 10000000).toFixed(a % 10000000 === 0 ? 0 : 1) + 'Cr';
    else if (a >= 100000) s = (a / 100000).toFixed(a % 100000 === 0 ? 0 : 1) + 'L';
    else if (a >= 1000) s = (a / 1000).toFixed(a % 1000 === 0 ? 0 : 1) + 'k';
    else s = String(Math.round(a));
    return (v < 0 ? '−' : '') + s;
  };

  /* ── toast ────────────────────────────────────────────────── */
  MMB.toast = function (msg, type) {
    const host = document.getElementById('toastHost');
    if (!host) return;
    const el = document.createElement('div');
    el.className = 'toast ' + (type || '');
    el.innerHTML = MMB.icon(type === 'error' ? 'alert' : type === 'gold' ? 'sparkles' : 'check') + '<span>' + MMB.esc(msg) + '</span>';
    host.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('show'); });
    setTimeout(function () {
      el.classList.remove('show');
      setTimeout(function () { el.remove(); }, 300);
    }, type === 'error' ? 4200 : 2600);
  };

  /* ── overlay system ───────────────────────────────────────── */
  const overlays = [];
  let zBase = 80;

  function syncBody() {
    document.body.style.overflow = overlays.length ? 'hidden' : '';
  }

  MMB.openSheet = function (opts) {
    opts = opts || {};
    const host = document.getElementById('overlayHost');
    const wrap = document.createElement('div');
    wrap.className = 'overlay' + (opts.modal ? ' modal' : '') + (opts.className ? ' ' + opts.className : '');
    wrap.style.zIndex = String(zBase + overlays.length * 2);

    const title = opts.title ? '<div class="sheet-title">' + opts.title + '</div>' : '';
    const subtitle = opts.subtitle ? '<div class="sheet-sub">' + opts.subtitle + '</div>' : '';
    const head = opts.noHead ? '' : '<div class="sheet-head"><div style="flex:1;min-width:0">' + title + subtitle + '</div><button class="sheet-close" data-close aria-label="Close">' + MMB.icon('x') + '</button></div>';

    wrap.innerHTML = '<div class="backdrop" data-close></div>' +
      '<section class="sheet ' + (opts.sheetClass || '') + '" role="dialog" aria-modal="true" aria-label="' + MMB.esc(opts.ariaLabel || opts.title || '') + '">' +
      head +
      '<div class="sheet-body">' + (opts.body || '') + '</div>' +
      (opts.footer ? '<div class="sheet-foot">' + opts.footer + '</div>' : '') +
      '</section>';

    host.appendChild(wrap);
    const api = { el: wrap, closed: false, close: close };
    overlays.push(api);
    syncBody();

    requestAnimationFrame(function () { wrap.classList.add('open'); });

    function close() {
      if (api.closed) return;
      api.closed = true;
      wrap.classList.remove('open');
      const idx = overlays.indexOf(api);
      if (idx > -1) overlays.splice(idx, 1);
      syncBody();
      setTimeout(function () { wrap.remove(); }, 320);
      if (opts.onClose) opts.onClose();
    }

    wrap.querySelectorAll('[data-close]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        if (opts.persistent && b.classList.contains('backdrop')) return;
        close();
      });
    });

    // Focus after the animation starts. The first [data-autofocus] wins.
    setTimeout(function () {
      const focusEl = wrap.querySelector('[data-autofocus]');
      if (focusEl) { try { focusEl.focus({ preventScroll: true }); if (focusEl.select) focusEl.select(); } catch (e) { } }
    }, 80);

    if (opts.onMount) opts.onMount(wrap, api);
    return api;
  };

  MMB.closeTop = function () {
    const top = overlays[overlays.length - 1];
    if (top) top.close();
  };
  MMB.closeAll = function () {
    overlays.slice().reverse().forEach(function (o) { o.close(); });
  };
  MMB.hasOverlay = function () { return overlays.length > 0; };

  document.addEventListener('keydown', function (e) {
    if (!overlays.length) return;
    const top = overlays[overlays.length - 1];
    if (e.key === 'Escape') {
      e.preventDefault();
      top.close();
    } else if (e.key === 'Tab') {
      const f = top.el.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  /* ── confirm ──────────────────────────────────────────────── */
  MMB.confirm = function (opts) {
    return new Promise(function (resolve) {
      let settled = false;
      function done(v) {
        if (settled) return;
        settled = true; resolve(v);
        sheet.close();
      }
      const sheet = MMB.openSheet({
        modal: true,
        className: 'confirm',
        title: '',
        noHead: true,
        persistent: true,
        body: '<div class="confirm-body"><h3>' + MMB.esc(opts.title || t('common.confirm')) + '</h3>' +
          (opts.body ? '<p>' + opts.body + '</p>' : '') + '</div>',
        footer: '<button class="btn btn-ghost" data-no>' + MMB.esc(opts.cancelText || t('common.cancel')) + '</button>' +
          '<button class="btn ' + (opts.danger ? 'btn-danger' : 'btn-primary') + '" data-yes>' + MMB.esc(opts.confirmText || t('common.confirm')) + '</button>',
        onClose: function () { if (!settled) { settled = true; resolve(false); } },
        onMount: function (el, api) {
          el.querySelector('[data-no]').addEventListener('click', function () { done(false); });
          el.querySelector('[data-yes]').addEventListener('click', function () { done(true); });
          setTimeout(function () { const y = el.querySelector('[data-yes]'); if (y) y.focus(); }, 100);
        }
      });
    });
  };

  /* ── account rows / balance display ───────────────────────── */
  MMB.balanceClass = function (a) {
    if (!a) return '';
    if (a.type === 'expense') return 'negative';
    const b = MMB.accountBalance(a.id);
    return b > 0 ? 'positive' : b < 0 ? 'negative' : '';
  };

  MMB.balanceLabel = function (a) {
    if (!a) return '';
    if (a.type === 'cash') return t('accounts.balance.cash');
    if (a.type === 'expense') return t('accounts.balance.expense');
    const b = MMB.accountBalance(a.id);
    if (b > 0) return t('accounts.balance.positive');
    if (b < 0) return t('accounts.balance.negative');
    return t('accounts.balance.zero');
  };

  MMB.balanceText = function (a, signed) {
    if (!a) return '';
    const b = MMB.accountBalance(a.id);
    if (a.type === 'expense') return MMB.money(Math.abs(b));
    return MMB.money(b, { sign: !!signed });
  };

  MMB.accountRowHTML = function (a, opts) {
    opts = opts || {};
    const bal = MMB.accountBalance(a.id);
    const cls = a.type === 'expense' ? '' : bal > 0 ? 'positive' : bal < 0 ? 'negative' : '';
    const amount = a.type === 'expense' ? MMB.money(Math.abs(bal)) : MMB.money(bal, { sign: true });
    return '<button class="party-item ' + (opts.selected ? 'selected' : '') + '" data-account-id="' + a.id + '" type="button">' +
      MMB.avatar(a.name, MMB.hashColor(a.name)) +
      '<div class="row-main"><div class="row-title">' + MMB.esc(a.name) + '</div>' +
      '<div class="row-sub"><span class="badge ' + (a.type === 'broker' ? 'badge-gold' : a.type === 'cash' ? 'badge-blue' : a.type === 'expense' ? 'badge-red' : 'badge-green') + '">' + t('accounts.type.' + a.type) + '</span>' +
      (a.phone ? '<span>' + MMB.esc(a.phone) + '</span>' : '') + '</div></div>' +
      '<div class="row-end"><div class="row-amount ' + cls + ' num">' + amount + '</div>' +
      '<div class="row-note">' + MMB.balanceLabel(a) + '</div></div></button>';
  };

  /* ── account picker ───────────────────────────────────────── */
  MMB.openAccountPicker = function (opts) {
    opts = opts || {};
    const types = opts.types || null;
    const excludeId = opts.excludeId || null;
    let query = '';
    function list() {
      let arr = MMB.accounts();
      if (types) arr = arr.filter(function (a) { return types.indexOf(a.type) !== -1; });
      if (excludeId) arr = arr.filter(function (a) { return a.id !== excludeId; });
      const q = query.trim().toLowerCase();
      if (q) arr = arr.filter(function (a) { return a.name.toLowerCase().indexOf(q) !== -1 || (a.phone || '').toLowerCase().indexOf(q) !== -1; });
      arr.sort(function (a, b) { return a.name.localeCompare(b.name); });
      return arr;
    }
    const body = '<div class="party-search"><div class="input-wrap">' + MMB.icon('search') +
      '<input class="input" id="acSearch" autocomplete="off" placeholder="' + MMB.esc(opts.searchPlaceholder || t('ledger.partyModal.search')) + '"></div></div>' +
      '<div class="party-list" id="acList"></div>';
    const sheet = MMB.openSheet({
      title: MMB.esc(opts.title || t('ledger.partyModal.title')),
      body: body,
      className: 'party',
      onMount: function (el, api) {
        const input = el.querySelector('#acSearch');
        const listEl = el.querySelector('#acList');
        function render() {
          const arr = list();
          if (!arr.length) {
            const q = query.trim();
            const newType = types && types.length === 1 ? types[0] : 'customer';
            listEl.innerHTML = '<div class="empty" style="padding:26px 10px">' + MMB.icon('users') +
              '<h3>' + (q ? t('accounts.noResults') : t('accounts.empty')) + '</h3>' +
              '<p>' + (q ? '' : t('accounts.emptyHint')) + '</p>' +
              '<button class="btn btn-primary" data-new-pick>' + MMB.icon('plus') + (q ? t('accounts.new') + ' “' + MMB.esc(q) + '”' : t('accounts.new')) + '</button></div>';
            listEl.querySelector('[data-new-pick]').addEventListener('click', function () {
              MMB.openAccountForm({
                type: newType,
                name: q,
                onSaved: function (acc) {
                  api.close();
                  if (opts.onPick) opts.onPick(acc);
                }
              });
            });
            return;
          }
          listEl.innerHTML = arr.map(function (a) { return MMB.accountRowHTML(a, { selected: opts.selectedId === a.id }); }).join('');
        }
        input.addEventListener('input', function () { query = input.value; render(); });
        listEl.addEventListener('click', function (e) {
          const row = e.target.closest('[data-account-id]');
          if (!row) return;
          const a = MMB.account(row.getAttribute('data-account-id'));
          if (!a) return;
          api.close();
          if (opts.onPick) opts.onPick(a);
        });
        render();
      }
    });
    return sheet;
  };

  /* ── account form ─────────────────────────────────────────── */
  MMB.openAccountForm = function (opts) {
    opts = opts || {};
    const account = opts.account || null;
    let type = account ? account.type : (opts.type || 'customer');
    const isEdit = !!account;
    const body =
      '<div class="form-grid">' +
      '<div class="field full"><label class="label" for="afName">' + t('accounts.form.name') + '</label>' +
      '<input class="input" id="afName" data-autofocus maxlength="80" autocomplete="off" value="' + (account ? MMB.esc(account.name) : MMB.esc(opts.name || '')) + '" placeholder="' + MMB.esc(t('accounts.form.namePlaceholder')) + '"></div>' +
      '<div class="field full"><label class="label" for="afPhone">' + t('accounts.form.phone') + ' <span class="opt">' + t('common.optional') + '</span></label>' +
      '<input class="input num" id="afPhone" maxlength="30" inputmode="tel" autocomplete="off" value="' + (account ? MMB.esc(account.phone) : '') + '" placeholder="' + MMB.esc(t('accounts.form.phonePlaceholder')) + '"></div>' +
      '<div class="field full"><label class="label">' + t('accounts.form.type') + '</label>' +
      '<div class="chips" id="afTypes">' +
      ['customer', 'broker', 'cash', 'expense'].map(function (tp) {
        return '<button type="button" class="chip ' + (tp === type ? 'active' : '') + '" data-type="' + tp + '">' + t('accounts.type.' + tp) + '</button>';
      }).join('') +
      '</div><div class="hint" id="afHint"></div></div>' +
      '</div>';

    const footer = (isEdit ? '<button class="btn btn-danger" id="afDelete" type="button">' + MMB.icon('trash') + t('common.delete') + '</button>' : '') +
      '<button class="btn btn-primary" id="afSave" type="button">' + MMB.icon('check') + t('common.save') + '</button>';

    let sheet;
    sheet = MMB.openSheet({
      title: isEdit ? t('accounts.form.edit') : t('accounts.form.new'),
      body: body,
      footer: footer,
      modal: false,
      onMount: function (el, api) {
        const nameEl = el.querySelector('#afName');
        const phoneEl = el.querySelector('#afPhone');
        const hintEl = el.querySelector('#afHint');

        function hint() {
          const rate = MMB.db.settings.commissionRate;
          hintEl.textContent = t('accounts.form.hint.' + type, { rate: rate });
        }
        hint();

        el.querySelectorAll('#afTypes [data-type]').forEach(function (b) {
          b.addEventListener('click', function () {
            el.querySelectorAll('#afTypes .chip').forEach(function (x) { x.classList.remove('active'); });
            b.classList.add('active');
            type = b.getAttribute('data-type');
            hint();
          });
        });

        el.querySelector('#afSave').addEventListener('click', function () {
          const name = nameEl.value.trim();
          if (!name) {
            nameEl.classList.add('shake');
            setTimeout(function () { nameEl.classList.remove('shake'); }, 400);
            nameEl.focus();
            return;
          }
          let res;
          if (isEdit) res = MMB.updateAccount(account.id, { name: name, phone: phoneEl.value.trim(), type: type });
          else res = MMB.addAccount({ name: name, phone: phoneEl.value.trim(), type: type });
          if (!res.ok) { MMB.toast(t('common.error'), 'error'); return; }
          MMB.toast(isEdit ? t('common.saved') : t('common.saved'));
          api.close();
          if (opts.onSaved) opts.onSaved(res.account);
        });

        const del = el.querySelector('#afDelete');
        if (del) {
          const used = MMB.accountIsUsed(account.id);
          if (used) {
            del.disabled = true;
            del.title = t('accounts.form.deleteBlocked');
            del.innerHTML = MMB.icon('lock') + t('common.delete');
            const note = document.createElement('div');
            note.className = 'hint warn';
            note.style.marginTop = '8px';
            note.textContent = t('accounts.form.deleteBlocked');
            el.querySelector('.sheet-body').appendChild(note);
          } else {
            del.addEventListener('click', async function () {
              const ok = await MMB.confirm({
                title: t('accounts.form.deleteTitle'),
                body: MMB.esc(t('accounts.form.deleteBody', { name: account.name })),
                danger: true, confirmText: t('common.delete')
              });
              if (!ok) return;
              const r = MMB.deleteAccount(account.id);
              if (!r.ok) { MMB.toast(t('accounts.form.deleteBlocked'), 'error'); return; }
              MMB.toast(t('common.deleted'));
              api.close();
              if (opts.onDeleted) opts.onDeleted();
            });
          }
        }
      }
    });
    return sheet;
  };

  /* ── product form ─────────────────────────────────────────── */
  MMB.openProductForm = function (opts) {
    opts = opts || {};
    const p = opts.product || null;
    const isEdit = !!p;
    const body = '<div class="form-grid">' +
      '<div class="field full"><label class="label">' + t('stock.productName') + '</label><input class="input" id="pfName" data-autofocus maxlength="80" value="' + (p ? MMB.esc(p.name) : '') + '" placeholder="' + MMB.esc(t('stock.productPlaceholder')) + '"></div>' +
      '<div class="field"><label class="label">' + t('stock.cartonDefault') + '</label><input class="input num" id="pfCarton" type="number" step="0.1" min="0.1" value="' + (p ? p.cartonKg : MMB.db.settings.defaultCartonKg) + '"></div>' +
      '<div class="field"><label class="label">' + t('settings.lowStock') + '</label><input class="input num" id="pfLow" type="number" step="0.1" min="0" value="' + (p && p.lowStockKg != null ? p.lowStockKg : '') + '" placeholder="' + MMB.db.settings.lowStockKg + '"></div>' +
      '</div>';
    const footer = (isEdit ? '<button class="btn btn-danger" id="pfDelete">' + MMB.icon('trash') + t('common.delete') + '</button>' : '') +
      '<button class="btn btn-primary" id="pfSave">' + MMB.icon('check') + t('common.save') + '</button>';
    MMB.openSheet({
      title: isEdit ? t('stock.editProduct') : t('stock.addProduct'),
      body: body, footer: footer,
      onMount: function (el, api) {
        el.querySelector('#pfSave').addEventListener('click', function () {
          const name = el.querySelector('#pfName').value.trim();
          if (!name) { el.querySelector('#pfName').focus(); return; }
          const carton = MMB.num(el.querySelector('#pfCarton').value) || 10;
          const low = el.querySelector('#pfLow').value;
          let res;
          if (isEdit) res = MMB.updateProduct(p.id, { name: name, cartonKg: carton, lowStockKg: low === '' ? null : MMB.num(low) });
          else res = MMB.addProduct(name, carton);
          if (!res.ok) return;
          MMB.toast(t('stock.productSaved'));
          api.close();
          if (opts.onSaved) opts.onSaved(res.product);
        });
        const del = el.querySelector('#pfDelete');
        if (del) {
          const used = MMB.productIsUsed(p.id);
          if (used) {
            del.disabled = true;
            const n = document.createElement('div');
            n.className = 'hint warn'; n.style.marginTop = '8px';
            n.textContent = t('stock.productInUse');
            el.querySelector('.sheet-body').appendChild(n);
          } else {
            del.addEventListener('click', async function () {
              const ok = await MMB.confirm({ title: t('stock.deleteProduct'), body: MMB.esc(t('stock.deleteProductBody', { name: p.name })), danger: true, confirmText: t('common.delete') });
              if (!ok) return;
              MMB.deleteProduct(p.id);
              api.close();
              if (opts.onDeleted) opts.onDeleted();
            });
          }
        }
      }
    });
  };

  /* ── charts ───────────────────────────────────────────────── */
  MMB.lineChart = function (series, opts) {
    opts = opts || {};
    const W = 620, H = 190, padL = 42, padR = 10, padT = 12, padB = 24;
    const n = series.length;
    const maxV = Math.max(1, Math.max.apply(null, series.map(function (s) { return Math.max(s.sales, s.profit, 0); })));
    const minV = Math.min(0, Math.min.apply(null, series.map(function (s) { return Math.min(s.sales, s.profit); })));
    const span = maxV - minV || 1;
    const x = function (i) { return padL + (n <= 1 ? (W - padL - padR) / 2 : i * (W - padL - padR) / (n - 1)); };
    const y = function (v) { return padT + (H - padT - padB) * (1 - (v - minV) / span); };
    const salesPts = series.map(function (s, i) { return x(i) + ',' + y(s.sales); }).join(' ');
    const profitPts = series.map(function (s, i) { return x(i) + ',' + y(s.profit); }).join(' ');
    const area = padL + ',' + (H - padB) + ' ' + salesPts + ' ' + x(n - 1) + ',' + (H - padB);
    const grid = [0, 0.5, 1].map(function (f) {
      const v = minV + span * f;
      const yy = y(v);
      return '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + yy + '" y2="' + yy + '" stroke="currentColor" stroke-opacity=".09" stroke-width="1"/>' +
        '<text x="' + (padL - 6) + '" y="' + (yy + 3) + '" text-anchor="end" font-size="8.5" fill="currentColor" opacity=".5">' + MMB.shortMoney(v) + '</text>';
    }).join('');
    const step = n > 14 ? Math.ceil(n / 6) : 1;
    const labels = series.map(function (s, i) {
      if (i % step !== 0 && i !== n - 1) return '';
      return '<text x="' + x(i) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="8.5" fill="currentColor" opacity=".55">' + MMB.fmtDate(s.date, true) + '</text>';
    }).join('');
    const last = series[n - 1] || { sales: 0, profit: 0 };
    return '<svg class="chart-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Sales and profit chart">' +
      '<defs><linearGradient id="salesFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#2F6B4F" stop-opacity=".22"/><stop offset="100%" stop-color="#2F6B4F" stop-opacity="0"/></linearGradient></defs>' +
      grid +
      '<polygon points="' + area + '" fill="url(#salesFill)"/>' +
      '<polyline points="' + salesPts + '" fill="none" stroke="#2F6B4F" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>' +
      '<polyline points="' + profitPts + '" fill="none" stroke="#C99A3F" stroke-width="2.2" stroke-dasharray="1 0" stroke-linejoin="round" stroke-linecap="round"/>' +
      '<circle cx="' + x(n - 1) + '" cy="' + y(last.sales) + '" r="3.4" fill="#2F6B4F" stroke="var(--surface)" stroke-width="2"/>' +
      '<circle cx="' + x(n - 1) + '" cy="' + y(last.profit) + '" r="3.2" fill="#C99A3F" stroke="var(--surface)" stroke-width="2"/>' +
      labels + '</svg>';
  };

  /* ── bill ─────────────────────────────────────────────────── */
  MMB.billHTML = function (sale) {
    const shop = MMB.db.settings.shop;
    const cust = MMB.account(sale.customerId);
    const broker = sale.brokerId ? MMB.account(sale.brokerId) : null;
    const logo = shop.logo ? '<img class="bill-logo" src="' + shop.logo + '" alt="">' : '<div class="bill-logo">' + MMB.logoSVG(52) + '</div>';
    const phones = (shop.phones || []).join(' · ');
    // The bill is always bilingual, regardless of the app language.
    const te = function (k) { return MMB.tIn('en', k); };
    const tu = function (k) { return MMB.tIn('ur', k); };
    const cLabels = {
      bardana: te('stock.bardana'), dalali: te('stock.dalali'), nikhara: te('stock.nikhara'),
      chhappai: te('stock.chhappai'), pehri: te('stock.pehri'), tulai: te('stock.tulai'), other: te('stock.other')
    };
    const chargeRows = Object.keys(sale.charges || {}).filter(function (k) { return MMB.num(sale.charges[k]) > 0; }).map(function (k) {
      return '<tr><td>' + cLabels[k] + '</td><td class="r">' + MMB.money(sale.charges[k], { bare: true }) + '</td></tr>';
    }).join('');

    const itemRows = sale.lines.map(function (l) {
      const cart = l.cartonQty ? '<small>' + l.cartonQty + ' × ' + l.cartonKg + ' kg</small>' : '';
      return '<tr><td class="desc">' + MMB.esc(l.name) + cart + '</td>' +
        '<td class="c">' + MMB.qty(l.qtyKg) + ' kg</td>' +
        '<td class="r">' + MMB.money(l.rate, { bare: true }) + '</td>' +
        '<td class="r">' + MMB.money(l.amount, { bare: true }) + '</td></tr>';
    }).join('');

    return '<div class="bill">' +
      '<div class="bill-head">' + logo +
      '<div class="bill-brand"><h1>' + MMB.esc(shop.nameEn) + '</h1><div class="tag">' + MMB.esc(shop.taglineEn).toUpperCase() + '</div>' +
      '<div class="ur">' + MMB.esc(shop.nameUr) + '</div></div>' +
      '<div class="bill-contact"><div class="ph">' + MMB.esc(phones) + '</div><div>' + MMB.esc(shop.addressEn) + '</div><div class="bill-urdu" style="font-size:8pt">' + MMB.esc(shop.addressUr) + '</div></div></div>' +
      '<div class="bill-meta">' +
      '<div class="l"><span><strong>' + te('bills.billNo') + ' / ' + tu('bills.urduBillNo') + ':</strong> ' + MMB.esc(sale.billNo) + '</span>' +
      '<span><strong>' + te('bills.date') + ' / ' + tu('bills.urduDate') + ':</strong> ' + MMB.fmtDate(sale.date) + '</span>' +
      (sale.dueDate ? '<span><strong>' + te('common.dueDate') + ' / ' + tu('common.dueDate') + ':</strong> ' + MMB.fmtDate(sale.dueDate) + '</span>' : '') + '</div>' +
      '<div class="l"><span><strong>' + te('bills.customer') + ' / ' + tu('bills.urduCustomer') + ':</strong> ' + MMB.esc(cust ? cust.name : '—') + '</span>' +
      (sale.vehicle ? '<span><strong>' + te('bills.vehicle') + ' / ' + tu('bills.urduVehicle') + ':</strong> ' + MMB.esc(sale.vehicle) + '</span>' : '') +
      (sale.destination ? '<span><strong>' + te('bills.destination') + ' / ' + tu('bills.urduDestination') + ':</strong> ' + MMB.esc(sale.destination) + '</span>' : '') + '</div>' +
      '<div class="l">' + (broker ? '<span><strong>' + te('bills.broker') + ' / ' + tu('bills.urduBroker') + ':</strong> ' + MMB.esc(broker.name) + '</span>' : '') +
      (cust && cust.phone ? '<span><strong>Ph:</strong> ' + MMB.esc(cust.phone) + '</span>' : '') + '</div></div>' +
      '<div class="bill-title"><span>' + te('bills.saleBill').toUpperCase() + '</span><span class="ur">' + tu('bills.urduSale') + '</span></div>' +
      '<table class="bill-table"><thead><tr><th style="width:50%">' + te('bills.description') + ' / ' + tu('bills.urduDescription') + '</th>' +
      '<th style="width:14%">' + te('bills.qty') + ' / ' + tu('bills.urduQty') + '</th>' +
      '<th style="width:16%">' + te('bills.rate') + ' / ' + tu('bills.urduRate') + '</th>' +
      '<th style="width:20%">' + te('bills.amount') + ' / ' + tu('bills.urduAmount') + '</th></tr></thead><tbody>' + itemRows + '</tbody></table>' +
      (chargeRows ? '<table class="bill-charges">' + chargeRows + '</table>' : '') +
      '<div class="bill-total"><span class="k">' + te('bills.grandTotal') + ' <span class="bill-urdu">/ ' + tu('bills.urduTotal') + '</span></span><span class="v">Rs ' + MMB.money(sale.total, { bare: true }) + '</span></div>' +
      '<div class="bill-words"><strong>' + te('bills.amountInWords') + ' / ' + tu('bills.urduWords') + ':</strong> ' + MMB.esc(MMB.moneyWords(sale.total)) + '</div>' +
      '<div class="bill-foot"><div>' + (sale.note ? '<div><strong>' + te('common.notes') + ':</strong> ' + MMB.esc(sale.note) + '</div>' : '') +
      '<div class="bill-urdu">' + tu('bills.urduThanks') + '</div></div>' +
      '<div class="bill-sign">' + te('bills.signature') + '<div class="bill-urdu">' + tu('bills.urduSignature') + '</div></div></div>' +
      '<div class="bill-note">' + te('bills.thankYou') + ' · ' + MMB.esc(shop.nameEn) + '</div>' +
      '<div class="bill-credit">Software by Paiwand Softwares - 0331-8625942</div>' +
      '</div>';
  };

  MMB.printSale = function (sale) {
    const area = document.getElementById('printArea');
    if (!area) return;
    area.innerHTML = MMB.billHTML(sale);
    setTimeout(function () { window.print(); }, 60);
  };

  /* ── PDF bill (download / share) ───────────────────────────── */
  function nativePlugin(name) {
    try { return window.Capacitor && window.Capacitor.Plugins ? window.Capacitor.Plugins[name] : null; } catch (e) { return null; }
  }

  function pdfFileName(sale) {
    return 'Bill-' + String(sale.billNo || 'bill').replace(/[^0-9A-Za-z_-]+/g, '') + '.pdf';
  }

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onloadend = function () { resolve(String(reader.result || '').split(',')[1] || ''); };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /* Share a file with the native share sheet (so it can go to WhatsApp), or
     fall back to a browser download. */
  async function shareBlobFile(blob, name, opts) {
    opts = opts || {};
    const fs = nativePlugin('Filesystem');
    const share = nativePlugin('Share');
    if (fs && fs.writeFile && share && share.share) {
      const data = await blobToBase64(blob);
      const written = await fs.writeFile({ path: name, data: data, directory: 'CACHE', recursive: true });
      await share.share({ title: name, dialogTitle: opts.dialogTitle || t('stock.pdfSharePdf'), files: [written.uri] });
      return true;
    }
    if (navigator.canShare && typeof File === 'function') {
      const file = new File([blob], name, { type: blob.type || 'application/octet-stream' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: name });
        return true;
      }
    }
    saveBlob(blob, name);
    MMB.toast(opts.savedToast || t('stock.pdfSaved'));
    return false;
  }

  MMB.shareFile = async function (filename, content, type, opts) {
    const blob = new Blob([content], { type: type || 'application/octet-stream' });
    return shareBlobFile(blob, filename, opts);
  };

  function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
  }

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  let billCssCache = null;
  /* The bill CSS with the web fonts inlined, so an SVG image of the bill
     can load them (an <img> cannot request external files). */
  function billExportCSS() {
    if (billCssCache) return billCssCache;
    billCssCache = (async function () {
      const cssUrl = new URL('css/app.css', document.baseURI);
      const res = await fetch(cssUrl.href);
      if (!res.ok) throw new Error('css-' + res.status);
      let css = await res.text();
      const found = [];
      css.replace(/url\(['"]?([^'")]+\.woff2)['"]?\)/g, function (m, u) {
        if (found.indexOf(u) === -1) found.push(u);
        return m;
      });
      const embedded = {};
      await Promise.all(found.map(async function (u) {
        const r = await fetch(new URL(u, cssUrl).href);
        if (!r.ok) throw new Error('font-' + r.status);
        embedded[u] = 'data:font/woff2;base64,' + arrayBufferToBase64(await r.arrayBuffer());
      }));
      return css.replace(/url\(['"]?([^'")]+\.woff2)['"]?\)/g, function (m, u) {
        return 'url("' + (embedded[u] || u) + '")';
      });
    })().catch(function (e) { billCssCache = null; throw e; });
    return billCssCache;
  }

  /* Render a DOM node with the browser's own layout engine (SVG foreignObject)
     so Urdu/RTL text keeps its shaping. html2canvas lays RTL text out
     left-to-right and garbles it. */
  async function elementCanvasFromSVG(node, scale) {
    await new Promise(function (resolve) { setTimeout(resolve, 30); });
    const w = Math.max(1, Math.ceil(node.scrollWidth) + 1);
    const h = Math.max(1, Math.ceil(node.scrollHeight) + 1);
    scale = scale || 2;
    const css = await billExportCSS();
    const markup = new XMLSerializer().serializeToString(node);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + Math.round(w * scale) + '" height="' + Math.round(h * scale) + '" viewBox="0 0 ' + w + ' ' + h + '">' +
      '<style type="text/css"><![CDATA[' + css + ']]></style>' +
      '<foreignObject x="0" y="0" width="' + w + '" height="' + h + '">' +
      markup +
      '</foreignObject></svg>';
    // A blob: URL would taint the canvas; a data: URL stays same-origin.
    const bytes = new TextEncoder().encode(svg);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    const url = 'data:image/svg+xml;base64,' + btoa(binary);
    const img = new Image();
    img.src = url;
    if (img.decode) await img.decode();
    else await new Promise(function (resolve, reject) { img.onload = resolve; img.onerror = reject; });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  async function billCanvasFromSVG(sale) {
    const host = document.createElement('div');
    host.className = 'bill-export';
    host.innerHTML = MMB.billHTML(sale);
    document.body.appendChild(host);
    try {
      const node = host.querySelector('.bill');
      if (!node) throw new Error('no-bill');
      return await elementCanvasFromSVG(node, 2.4);
    } finally {
      host.remove();
    }
  }

  async function elementCanvasFromHTML(node, scale) {
    if (!window.html2canvas) throw new Error('pdf-unavailable');
    if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) { } }
    await new Promise(function (resolve) { setTimeout(resolve, 80); });
    return await window.html2canvas(node, {
      scale: scale || 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      width: node.scrollWidth,
      height: node.scrollHeight,
      windowWidth: node.scrollWidth
    });
  }

  async function billCanvasFromHTML(sale) {
    const host = document.createElement('div');
    host.className = 'bill-export';
    host.innerHTML = MMB.billHTML(sale);
    document.body.appendChild(host);
    try {
      const node = host.querySelector('.bill');
      return await elementCanvasFromHTML(node, 2);
    } finally {
      host.remove();
    }
  }

  MMB.billPDF = async function (sale) {
    if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('pdf-unavailable');
    let canvas;
    try {
      canvas = await billCanvasFromSVG(sale);
    } catch (e) {
      console.warn('SVG bill render failed, falling back', e);
      canvas = await billCanvasFromHTML(sale);
    }
    const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a5', orientation: 'portrait', compress: true });
    const pageW = 148, pageH = 210, margin = 4;
    const maxW = pageW - margin * 2, maxH = pageH - margin * 2;
    let w = maxW;
    let h = canvas.height * w / canvas.width;
    if (h > maxH) { h = maxH; w = canvas.width * h / canvas.height; }
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', (pageW - w) / 2, margin, w, h);
    return pdf.output('blob');
  };

  /* ── ledger statement PDF ─────────────────────────────────── */
  function ledgerPDFName(account) {
    const name = String(account && account.name || 'ledger')
      .replace(/[^0-9A-Za-z\u0600-\u06FF_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'ledger';
    return name + '-ledger-' + MMB.todayISO() + '.pdf';
  }

  /* Lay a long statement document across A4 pages, breaking between rows. */
  async function docBlobFromHTML(html) {
    if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('pdf-unavailable');
    const host = document.createElement('div');
    host.className = 'doc-export';
    host.innerHTML = html;
    document.body.appendChild(host);
    try {
      const node = host.firstElementChild;
      if (!node) throw new Error('no-doc');
      await Promise.all(Array.prototype.map.call(node.querySelectorAll('img'), function (img) {
        if (img.complete) return null;
        return new Promise(function (resolve) { img.onload = img.onerror = resolve; });
      }));
      if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) { } }
      const rowCount = node.querySelectorAll('tbody tr').length;
      const renderScale = rowCount > 200 ? 1.5 : rowCount > 80 ? 1.9 : 2.2;
      let canvas;
      try {
        canvas = await elementCanvasFromSVG(node, renderScale);
      } catch (e) {
        console.warn('SVG statement render failed, falling back', e);
        canvas = await elementCanvasFromHTML(node, Math.min(renderScale, 2));
      }
      const pageW = 210, pageH = 297, margin = 8;
      const contentW = pageW - margin * 2;   // 194 mm
      const contentH = pageH - margin * 2;   // 281 mm
      const pxPerMm = canvas.width / contentW;
      const pagePx = Math.floor(contentH * pxPerMm);
      const rect = node.getBoundingClientRect();
      const scalepx = canvas.width / Math.max(1, rect.width);
      const rowBottoms = Array.prototype.map.call(node.querySelectorAll('tbody tr'), function (r) {
        return Math.round((r.getBoundingClientRect().bottom - rect.top) * scalepx);
      });
      const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
      let y = 0, pages = 0;
      while (y < canvas.height - 1) {
        let sliceH = Math.min(pagePx, canvas.height - y);
        if (y + sliceH < canvas.height - 1) {
          let breakAt = 0;
          rowBottoms.forEach(function (b) {
            if (b > y && b <= y + pagePx && b > breakAt) breakAt = b;
          });
          if (breakAt > y + pagePx * 0.5) sliceH = breakAt - y;
        }
        const slice = document.createElement('canvas');
        slice.width = canvas.width;
        slice.height = sliceH;
        const ctx = slice.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, slice.width, slice.height);
        ctx.drawImage(canvas, 0, y, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
        if (pages > 0) pdf.addPage();
        pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, contentW, sliceH / pxPerMm);
        y += sliceH;
        pages++;
      }
      for (let i = 1; i <= pages; i++) {
        pdf.setPage(i);
        pdf.setFontSize(7.5);
        pdf.setTextColor(135, 135, 125);
        pdf.text(i + ' / ' + pages, pageW - margin, pageH - 4, { align: 'right' });
      }
      return pdf.output('blob');
    } finally {
      host.remove();
    }
  }

  MMB.shareLedgerPDF = async function (account) {
    try {
      MMB.toast(t('stock.pdfWorking'), 'gold');
      const blob = await docBlobFromHTML(MMB.ledgerStatementHTML(account));
      await shareBlobFile(blob, ledgerPDFName(account), { dialogTitle: t('stock.pdfSharePdf') });
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      console.warn('Ledger PDF failed', e);
      MMB.toast(t('stock.pdfFailed'), 'error');
    }
  };

  MMB.downloadSalePDF = async function (sale) {
    try {
      MMB.toast(t('stock.pdfWorking'), 'gold');
      const blob = await MMB.billPDF(sale);
      saveBlob(blob, pdfFileName(sale));
      MMB.toast(t('stock.pdfSaved'));
    } catch (e) {
      console.warn('PDF failed', e);
      MMB.toast(t('stock.pdfFailed'), 'error');
    }
  };

  MMB.shareSalePDF = async function (sale) {
    try {
      MMB.toast(t('stock.pdfWorking'), 'gold');
      const blob = await MMB.billPDF(sale);
      await shareBlobFile(blob, pdfFileName(sale), { dialogTitle: t('stock.pdfSharePdf') });
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      console.warn('PDF share failed', e);
      MMB.toast(t('stock.pdfFailed'), 'error');
    }
  };

  MMB.openBillPreview = function (sale) {
    const prevDir = document.documentElement.dir;
    // The bill is a fixed LTR document, even when the app UI is Urdu.
    document.documentElement.dir = 'ltr';
    MMB.openSheet({
      title: t('stock.viewBill') + ' · ' + MMB.esc(sale.billNo),
      body: '<div class="bill-scroll">' + MMB.billHTML(sale) + '</div>',
      footer: '<button class="btn btn-ghost" data-close>' + t('common.close') + '</button>' +
        '<button class="btn btn-soft" id="bpPdf">' + MMB.icon('file') + t('stock.pdf') + '</button>',
      modal: true,
      sheetClass: 'wide',
      onClose: function () { document.documentElement.dir = prevDir; },
      onMount: function (el, api) {
        const sheet = el.querySelector('.sheet');
        if (sheet) sheet.setAttribute('dir', 'ltr');
        el.querySelector('#bpPdf').addEventListener('click', function () { MMB.shareSalePDF(sale); });
      }
    });
  };

  /* ── small helpers ────────────────────────────────────────── */
  MMB.emptyHTML = function (icon, title, text, actionHTML) {
    return '<div class="empty"><div class="empty-art">' + MMB.icon(icon, 'lg') + '</div><h3>' + MMB.esc(title) + '</h3><p>' + MMB.esc(text || '') + '</p>' + (actionHTML || '') + '</div>';
  };

  MMB.dayLabel = function (iso) {
    const today = MMB.todayISO();
    if (iso === today) return t('common.today');
    return MMB.fmtDate(iso);
  };
})();
