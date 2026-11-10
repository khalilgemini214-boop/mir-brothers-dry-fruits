/* ── Settings ──────────────────────────────────────────────────── */
(function () {
  const MMB = window.MMB;
  const t = MMB.t;
  MMB.views = MMB.views || {};

  MMB.downloadBackup = async function () {
    try {
      const json = MMB.exportJSON();
      const name = 'mir-brothers-backup-' + MMB.todayISO() + '.json';
      await MMB.shareFile(name, json, 'application/json', {
        dialogTitle: t('settings.shareBackup'),
        savedToast: t('settings.backupDone')
      });
      MMB.rerender();
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      console.warn('Backup share failed', e);
      MMB.toast(t('common.shareFailed'), 'error');
    }
  };

  async function downloadCSV(kind, filename) {
    let csv = '';
    if (kind === 'accounts') csv = MMB.csvAccounts();
    else if (kind === 'ledger') csv = MMB.csvLedger();
    else if (kind === 'sales') csv = MMB.csvSales();
    else if (kind === 'purchases') csv = MMB.csvPurchases();
    else if (kind === 'returns') csv = MMB.csvReturns();
    else if (kind === 'stock') csv = MMB.csvStock();
    try {
      await MMB.shareFile(filename, csv, 'text/csv;charset=utf-8', {
        dialogTitle: t('settings.shareExport'),
        savedToast: t('common.done')
      });
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      console.warn('CSV share failed', e);
      MMB.toast(t('common.shareFailed'), 'error');
    }
  }

  function openPinModal(mode) {
    const hasPin = MMB.pinSet();
    const needCurrent = hasPin && (mode === 'change' || mode === 'remove');
    const needNew = mode !== 'remove';
    const body = '<div class="form-grid">' +
      (needCurrent ? '<div class="field full"><label class="label">' + t('settings.pin') + '</label><input class="input num" id="pinCurrent" type="password" inputmode="numeric" maxlength="6" autocomplete="off" data-autofocus></div>' : '') +
      (needNew ? '<div class="field full"><label class="label">' + (mode === 'change' ? t('settings.changePin') : t('settings.setPin')) + '</label><input class="input num" id="pinNew" type="password" inputmode="numeric" maxlength="6" autocomplete="off" ' + (!needCurrent ? 'data-autofocus' : '') + '></div>' +
        '<div class="field full"><label class="label">' + t('common.confirm') + '</label><input class="input num" id="pinConfirm" type="password" inputmode="numeric" maxlength="6" autocomplete="off"></div>' : '') +
      '</div><div class="hint mt-12">' + t('settings.pinHint') + '</div>';

    MMB.openSheet({
      title: mode === 'remove' ? t('settings.removePin') : (mode === 'change' ? t('settings.changePin') : t('settings.setPin')),
      body: body,
      footer: '<button class="btn btn-ghost" data-close>' + t('common.cancel') + '</button><button class="btn ' + (mode === 'remove' ? 'btn-danger' : 'btn-primary') + '" id="pinSave">' + t('common.confirm') + '</button>',
      onMount: function (el, api) {
        el.querySelector('#pinSave').addEventListener('click', async function () {
          const cur = el.querySelector('#pinCurrent');
          const nw = el.querySelector('#pinNew');
          const cf = el.querySelector('#pinConfirm');
          if (needCurrent) {
            if (!cur.value || cur.value.length < 4) { MMB.toast(t('settings.pinLength'), 'error'); return; }
            const ok = await MMB.verifyPin(cur.value);
            if (!ok) { MMB.toast(t('settings.pinWrong'), 'error'); cur.classList.add('shake'); setTimeout(function () { cur.classList.remove('shake'); }, 400); return; }
          }
          if (mode === 'remove') {
            MMB.removePin();
            MMB.toast(t('settings.removedPin'));
            api.close();
            MMB.rerender();
            return;
          }
          const pin = nw.value;
          if (!/^\d{4,6}$/.test(pin)) { MMB.toast(t('settings.pinLength'), 'error'); nw.focus(); return; }
          if (pin !== cf.value) { MMB.toast(t('settings.pinMismatch'), 'error'); cf.focus(); return; }
          await MMB.setPin(pin);
          try { sessionStorage.setItem('mmb_unlocked', '1'); } catch (e) { }
          MMB.toast(mode === 'change' ? t('settings.pinChanged') : t('settings.pinSet'));
          api.close();
          MMB.rerender();
        });
      }
    });
  }

  MMB.views.settings = {
    render: function (root) {
      const s = MMB.db.settings.shop;
      const st = MMB.db.settings;
      const upd = st.updates || (st.updates = { feedUrl: '', autoCheck: true, lastCheckedAt: null });
      const sd = MMB.computeStock();
      const lastBackup = st.backupLastAt ? MMB.fmtDate(st.backupLastAt.slice(0, 10)) : t('settings.never');
      const bytes = MMB.storageBytes();
      const pendingCloud = MMB.pendingCount ? MMB.pendingCount() : 0;
      const lastSyncMs = Number(MMB.db.sync && MMB.db.sync.lastSyncMs) || 0;
      const lastFetched = (function () {
        if (!MMB.sync || !MMB.sync.lastFetchedISO) return t('sync.never');
        const iso = MMB.sync.lastFetchedISO();
        if (!iso) return t('sync.never');
        const d = new Date(iso);
        if (isNaN(d.getTime())) return t('sync.never');
        try {
          return d.toLocaleString(MMB.lang() === 'ur' ? 'ur-PK' : 'en-GB', {
            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
          });
        } catch (e) { return MMB.fmtDate(iso.slice(0, 10)); }
      })();

      root.innerHTML =
        '<div class="page-head"><div><h2 class="page-title">' + t('settings.title') + '</h2><p class="page-sub">' + t('settings.subtitle') + '</p></div></div>' +

        /* shop */
        '<section class="settings-group"><div class="section-head" style="margin-top:0"><div class="section-title">' + t('settings.shop') + '</div><span class="micro">' + t('settings.shopProfileHint') + '</span></div>' +
        '<div class="settings-card"><div class="form-pad"><div class="form-grid">' +
        '<div class="field"><label class="label">' + t('settings.shopNameEn') + '</label><input class="input" id="setNameEn" value="' + MMB.esc(s.nameEn) + '"></div>' +
        '<div class="field"><label class="label">' + t('settings.shopNameUr') + '</label><input class="input" id="setNameUr" dir="rtl" value="' + MMB.esc(s.nameUr) + '"></div>' +
        '<div class="field"><label class="label">' + t('settings.taglineEn') + '</label><input class="input" id="setTagEn" value="' + MMB.esc(s.taglineEn) + '"></div>' +
        '<div class="field"><label class="label">' + t('settings.taglineUr') + '</label><input class="input" id="setTagUr" dir="rtl" value="' + MMB.esc(s.taglineUr) + '"></div>' +
        '<div class="field full"><label class="label">' + t('settings.addressEn') + '</label><input class="input" id="setAddrEn" value="' + MMB.esc(s.addressEn) + '"></div>' +
        '<div class="field full"><label class="label">' + t('settings.addressUr') + '</label><input class="input" id="setAddrUr" dir="rtl" value="' + MMB.esc(s.addressUr) + '"></div>' +
        '<div class="field full"><label class="label">' + t('settings.phones') + '</label><input class="input" id="setPhones" value="' + MMB.esc((s.phones || []).join(', ')) + '"></div>' +
        '</div>' +
        '<div class="setting-row" style="padding:14px 0 0;border:0;min-height:0;margin-top:4px">' +
        '<div class="logo-preview" id="logoPreview">' + (s.logo ? '<img src="' + s.logo + '" style="width:100%;height:100%;object-fit:cover;border-radius:14px" alt="">' : MMB.logoSVG(56)) + '</div>' +
        '<div class="setting-label"><div class="st">' + t('settings.logo') + '</div><div class="ss">' + t('settings.logoHint') + '</div></div>' +
        '<div class="setting-control"><label class="btn btn-sm btn-ghost" style="cursor:pointer">' + MMB.icon('upload') + t('settings.uploadLogo') + '<input type="file" id="logoFile" accept="image/png,image/jpeg,image/svg+xml" hidden></label>' +
        '<button class="btn btn-sm btn-danger" id="logoRemove" style="' + (s.logo ? '' : 'display:none') + '">' + MMB.icon('trash') + '</button></div></div>' +
        '<button class="btn btn-primary" id="shopSave" style="margin-top:16px">' + MMB.icon('check') + t('settings.saveShop') + '</button>' +
        '</div></div></section>' +

        /* business */
        '<section class="settings-group"><div class="section-head" style="margin-top:0"><div class="section-title">' + t('settings.business') + '</div></div>' +
        '<div class="settings-card">' +
        '<div class="setting-row"><div class="si gold">' + MMB.icon('coins') + '</div><div class="setting-label"><div class="st">' + t('settings.commission') + '</div><div class="ss">' + t('settings.commissionHint') + '</div></div>' +
        '<div class="setting-control"><input class="input num" id="setCommission" type="number" step="0.01" min="0" max="100" value="' + st.commissionRate + '"><span class="hint">%</span></div></div>' +
        '<div class="setting-row"><div class="si">' + MMB.icon('alert') + '</div><div class="setting-label"><div class="st">' + t('settings.lowStock') + '</div><div class="ss">' + t('dashboard.lowStock') + '</div></div>' +
        '<div class="setting-control"><input class="input num" id="setLowStock" type="number" step="0.1" min="0" value="' + st.lowStockKg + '"><span class="hint">kg</span></div></div>' +
        '<div class="setting-row"><div class="si">' + MMB.icon('package') + '</div><div class="setting-label"><div class="st">' + t('settings.defaultCarton') + '</div><div class="ss">' + t('stock.cartonHint') + '</div></div>' +
        '<div class="setting-control"><input class="input num" id="setCarton" type="number" step="0.1" min="0.1" value="' + st.defaultCartonKg + '"><span class="hint">kg</span></div></div>' +
        '<div class="setting-row"><div class="si gold">' + MMB.icon('receipt') + '</div><div class="setting-label"><div class="st">' + t('settings.nextBill') + '</div><div class="ss">' + t('stock.billNo') + ' ' + MMB.nextBillNo() + '</div></div>' +
        '<div class="setting-control"><input class="input num" id="setBillNo" type="number" step="1" min="1" value="' + st.billCounter + '"></div></div>' +
        '<div class="setting-row"><div class="si gold">' + MMB.icon('package') + '</div><div class="setting-label"><div class="st">' + t('settings.nextPurchase') + '</div><div class="ss">' + MMB.nextPurchaseNo() + '</div></div>' +
        '<div class="setting-control"><input class="input num" id="setPurchaseNo" type="number" step="1" min="1" value="' + st.purchaseCounter + '"></div></div>' +
        '<div class="form-pad" style="border-top:1px solid var(--line)"><button class="btn btn-primary btn-block" id="businessSave">' + MMB.icon('check') + t('common.save') + '</button></div>' +
        '</div></section>' +

        /* appearance */
        '<section class="settings-group"><div class="section-head" style="margin-top:0"><div class="section-title">' + t('settings.appearance') + '</div></div>' +
        '<div class="settings-card">' +
        '<div class="setting-row"><div class="si blue">' + MMB.icon('globe') + '</div><div class="setting-label"><div class="st">' + t('settings.language') + '</div><div class="ss">English / اردو</div></div>' +
        '<div class="setting-control"><div class="segmented" id="langSeg"><button data-lang="en" class="' + (MMB.lang() === 'en' ? 'active' : '') + '">English</button><button data-lang="ur" class="' + (MMB.lang() === 'ur' ? 'active' : '') + '">اردو</button></div></div></div>' +
        '<div class="setting-row"><div class="si">' + MMB.icon(st.theme === 'dark' ? 'moon' : 'sun') + '</div><div class="setting-label"><div class="st">' + t('settings.theme') + '</div><div class="ss">' + (st.theme === 'dark' ? t('settings.dark') : t('settings.light')) + '</div></div>' +
        '<div class="setting-control"><div class="segmented" id="themeSeg"><button data-theme="light" class="' + (st.theme !== 'dark' ? 'active' : '') + '">' + t('settings.light') + '</button><button data-theme="dark" class="' + (st.theme === 'dark' ? 'active' : '') + '">' + t('settings.dark') + '</button></div></div></div>' +
        '</div></section>' +

        /* security */
        '<section class="settings-group"><div class="section-head" style="margin-top:0"><div class="section-title">' + t('settings.security') + '</div></div>' +
        '<div class="settings-card">' +
        '<div class="setting-row"><div class="si red">' + MMB.icon('lock') + '</div><div class="setting-label"><div class="st">' + t('settings.pin') + '</div><div class="ss">' + (MMB.pinSet() ? t('settings.pinOn') : t('settings.pinOff')) + ' · ' + t('settings.pinHint') + '</div></div>' +
        '<div class="setting-control">' + (MMB.pinSet()
          ? '<button class="btn btn-sm btn-ghost" id="pinChange">' + t('settings.changePin') + '</button><button class="btn btn-sm btn-danger" id="pinRemove">' + t('settings.removePin') + '</button>'
          : '<button class="btn btn-sm btn-primary" id="pinSet">' + t('settings.setPin') + '</button>') + '</div></div>' +
        '</div></section>' +

        /* updates */
        '<section class="settings-group"><div class="section-head" style="margin-top:0"><div class="section-title">' + t('settings.updates') + '</div><span class="micro">' + t('settings.updatesHint') + '</span></div>' +
        '<div class="settings-card">' +
        '<div id="updateBox"></div>' +
        '<div class="setting-row" style="display:block">' +
        '<div class="row-flex gap-10" style="margin-bottom:8px"><div class="si blue">' + MMB.icon('globe') + '</div><div class="setting-label"><div class="st">' + t('settings.feedUrl') + '</div><div class="ss">' + t('settings.feedHint') + '</div></div></div>' +
        '<div class="input-wrap"><input class="input" id="setUpdateFeed" value="' + MMB.esc(upd.feedUrl || '') + '" placeholder="' + MMB.esc((window.MMB_CONFIG && MMB_CONFIG.feedUrl) || t('settings.updateFeedPlaceholder')) + '"></div>' +
        '<button class="btn btn-sm btn-ghost mt-8" id="saveUpdateFeed">' + MMB.icon('check') + t('common.save') + '</button>' +
        '</div>' +
        '<div class="setting-row"><div class="si gold">' + MMB.icon('refresh') + '</div><div class="setting-label"><div class="st">' + t('settings.autoCheck') + '</div><div class="ss">' + t('settings.updatesHint') + '</div></div>' +
        '<div class="setting-control"><button class="switch ' + (upd.autoCheck !== false ? 'on' : '') + '" id="autoUpdateToggle" aria-label="' + MMB.esc(t('settings.autoCheck')) + '"></button></div></div>' +
        '</div></section>' +

        /* cloud */
        '<section class="settings-group"><div class="section-head" style="margin-top:0"><div class="section-title">' + t('settings.cloud') + '</div><span class="micro">' + t('settings.cloudHint') + '</span></div>' +
        '<div class="settings-card">' +
        '<div class="setting-row"><div class="si blue">' + MMB.icon('globe') + '</div><div class="setting-label"><div class="st">' + MMB.esc((MMB.cloud && MMB.cloud.email()) || '—') + '</div><div class="ss">' + t('settings.signedInEmail') + '</div></div>' +
        '<div class="setting-control"><button class="btn btn-sm btn-ghost" id="signOutBtn">' + MMB.icon('lock') + t('settings.signOut') + '</button></div></div>' +
        '<div class="setting-row"><div class="si gold">' + MMB.icon('refresh') + '</div><div class="setting-label"><div class="st" id="cloudPending">' + t('settings.cloudPending') + ' · ' + pendingCloud + '</div><div class="ss">' + t('sync.lastFetched', { time: lastFetched }) + (lastSyncMs ? ' · ' + t('settings.lastSyncTime', { time: (lastSyncMs / 1000).toFixed(1) + 's' }) : '') + '</div></div>' +
        '<div class="setting-control"><button class="btn btn-sm btn-ghost" id="resyncBtn">' + t('settings.resync') + '</button></div></div>' +
        '</div></section>' +

        /* data */
        '<section class="settings-group"><div class="section-head" style="margin-top:0"><div class="section-title">' + t('settings.data') + '</div><span class="micro">' + t('settings.storageUsed') + ': ' + MMB.bytesLabel(bytes) + '</span></div>' +
        '<div class="settings-card">' +
        '<div class="setting-row"><div class="si">' + MMB.icon('database') + '</div><div class="setting-label"><div class="st">' + t('settings.backup') + '</div><div class="ss">' + t('settings.lastBackup', { date: lastBackup }) + '</div></div>' +
        '<div class="setting-control"><button class="btn btn-sm btn-primary" id="backupBtn">' + MMB.icon('download') + t('common.download') + '</button></div></div>' +
        '<div class="setting-row"><div class="si gold">' + MMB.icon('upload') + '</div><div class="setting-label"><div class="st">' + t('settings.restore') + '</div><div class="ss">' + t('settings.storageNote') + '</div></div>' +
        '<div class="setting-control"><label class="btn btn-sm btn-ghost" style="cursor:pointer">' + t('common.upload') + '<input type="file" id="restoreFile" accept=".json,application/json" hidden></label></div></div>' +
        '<div class="setting-row" style="display:block"><div class="row-flex wrap gap-8" style="margin-bottom:9px"><div class="si blue">' + MMB.icon('file') + '</div><div class="setting-label"><div class="st">' + t('settings.exportCsv') + '</div><div class="ss">' + t('settings.exportHint') + '</div></div></div>' +
        '<div class="row-flex wrap gap-8">' +
        '<button class="btn btn-sm btn-ghost" data-csv="accounts">' + t('settings.exportAccounts') + '</button>' +
        '<button class="btn btn-sm btn-ghost" data-csv="ledger">' + t('settings.exportLedger') + '</button>' +
        '<button class="btn btn-sm btn-ghost" data-csv="sales">' + t('settings.exportSales') + '</button>' +
        '<button class="btn btn-sm btn-ghost" data-csv="purchases">' + t('settings.exportPurchases') + '</button>' +
        '<button class="btn btn-sm btn-ghost" data-csv="returns">' + t('settings.exportReturns') + '</button>' +
        '<button class="btn btn-sm btn-ghost" data-csv="stock">' + t('settings.exportStock') + '</button>' +
        '</div></div>' +
        '<div class="setting-row"><div class="si">' + MMB.icon('sparkles') + '</div><div class="setting-label"><div class="st">' + t('settings.dataSummary') + '</div><div class="ss">' + MMB.accounts().length + ' ' + t('settings.accountsCount') + ' · ' + MMB.searchProducts('').length + ' ' + t('settings.productsCount') + ' · ' + MMB.db.sales.length + ' ' + t('settings.salesCount') + ' · ' + MMB.db.purchases.length + ' ' + t('settings.purchasesCount') + ' · ' + MMB.db.ledger.length + ' ' + t('settings.entriesCount') + '</div></div></div>' +
        '<div class="setting-row" style="background:color-mix(in srgb,var(--red-soft) 40%, transparent)"><div class="si red">' + MMB.icon('alert') + '</div><div class="setting-label"><div class="st" style="color:var(--red)">' + t('settings.reset') + '</div><div class="ss">' + t('settings.resetHint') + '</div></div>' +
        '<div class="setting-control"><button class="btn btn-sm btn-danger" id="resetBtn">' + t('common.reset') + '</button></div></div>' +
        '</div></section>' +

        /* about */
        '<section class="settings-group"><div class="settings-card"><div class="about-card">' +
        MMB.logoSVG(58) +
        '<h3>' + t('app.name') + '</h3><p>' + t('app.tagline') + '</p>' +
        '<p style="margin-top:8px">' + t('settings.madeFor') + '</p>' +
        '<div class="version-pill">' + MMB.icon('shield') + 'v' + MMB.esc(MMB_CONFIG.version + (MMB_CONFIG.build && MMB_CONFIG.build !== 'dev' ? ' · ' + MMB_CONFIG.build : '')) + '</div>' +
        '<p class="hint" style="margin-top:12px">' + t('settings.backupHint') + '</p>' +
        '</div></div></section>';

      /* shop save */
      root.querySelector('#shopSave').addEventListener('click', function () {
        const shop = MMB.db.settings.shop;
        shop.nameEn = root.querySelector('#setNameEn').value.trim() || shop.nameEn;
        shop.nameUr = root.querySelector('#setNameUr').value.trim() || shop.nameUr;
        shop.taglineEn = root.querySelector('#setTagEn').value.trim();
        shop.taglineUr = root.querySelector('#setTagUr').value.trim();
        shop.addressEn = root.querySelector('#setAddrEn').value.trim();
        shop.addressUr = root.querySelector('#setAddrUr').value.trim();
        shop.phones = root.querySelector('#setPhones').value.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
        MMB.save();
        MMB.toast(t('settings.shopSaved'));
        MMB.rerender();
      });

      const logoFile = root.querySelector('#logoFile');
      logoFile.addEventListener('change', function () {
        const f = logoFile.files && logoFile.files[0];
        if (!f) return;
        if (f.size > 600 * 1024) { MMB.toast(t('settings.logoTooBig'), 'error'); return; }

        function useLogo(data) {
          MMB.db.settings.shop.logo = data;
          MMB.save();
          const prev = root.querySelector('#logoPreview');
          if (prev) prev.innerHTML = '<img src="' + MMB.db.settings.shop.logo + '" style="width:100%;height:100%;object-fit:cover;border-radius:14px" alt="">';
          const rm = root.querySelector('#logoRemove');
          if (rm) rm.style.display = '';
          MMB.toast(t('common.saved'));
        }

        const reader = new FileReader();
        reader.onload = function () {
          const src = String(reader.result);
          if (f.type === 'image/svg+xml' || !window.Image || !document.createElement('canvas').getContext) {
            useLogo(src);
            return;
          }
          // A 600 KB logo becomes an 800 KB base64 string that is rewritten
          // on every save and uploaded on the first sync. Shrink it to a
          // 320 px image, usually 20-40 KB, before storing it.
          const img = new Image();
          img.onload = function () {
            try {
              const max = 320;
              const scale = Math.min(1, max / Math.max(img.width, img.height));
              const w = Math.max(1, Math.round(img.width * scale));
              const h = Math.max(1, Math.round(img.height * scale));
              const canvas = document.createElement('canvas');
              canvas.width = w;
              canvas.height = h;
              canvas.getContext('2d').drawImage(img, 0, 0, w, h);
              let out = '';
              try { out = canvas.toDataURL('image/webp', 0.85); } catch (e) { out = ''; }
              if (!out || out.indexOf('data:image/webp') !== 0) out = canvas.toDataURL('image/png');
              useLogo(out && out.length < src.length ? out : src);
            } catch (e) {
              useLogo(src);
            }
          };
          img.onerror = function () { useLogo(src); };
          img.src = src;
        };
        reader.readAsDataURL(f);
      });
      const logoRemove = root.querySelector('#logoRemove');
      if (logoRemove) logoRemove.addEventListener('click', function () {
        MMB.db.settings.shop.logo = '';
        MMB.save();
        const prev = root.querySelector('#logoPreview');
        if (prev) prev.innerHTML = MMB.logoSVG(56);
        logoRemove.style.display = 'none';
        MMB.toast(t('common.saved'));
      });

      /* business save */
      root.querySelector('#businessSave').addEventListener('click', function () {
        const st2 = MMB.db.settings;
        st2.commissionRate = MMB.clamp(MMB.num(root.querySelector('#setCommission').value), 0, 100);
        st2.lowStockKg = Math.max(0, MMB.num(root.querySelector('#setLowStock').value));
        st2.defaultCartonKg = Math.max(0.1, MMB.num(root.querySelector('#setCarton').value) || 10);
        st2.billCounter = Math.max(1, Math.floor(MMB.num(root.querySelector('#setBillNo').value) || 1));
        st2.purchaseCounter = Math.max(1, Math.floor(MMB.num(root.querySelector('#setPurchaseNo').value) || 1));
        MMB.save();
        MMB.toast(t('settings.savedSettings'));
        MMB.rerender();
      });

      /* appearance */
      root.querySelectorAll('#langSeg [data-lang]').forEach(function (b) {
        b.addEventListener('click', function () { MMB.setLanguage(b.getAttribute('data-lang')); });
      });
      root.querySelectorAll('#themeSeg [data-theme]').forEach(function (b) {
        b.addEventListener('click', function () { MMB.setTheme(b.getAttribute('data-theme')); });
      });

      /* updates */
      MMB.bindUpdateBox(root);
      root.querySelector('#saveUpdateFeed').addEventListener('click', function () {
        const u = MMB.db.settings.updates || (MMB.db.settings.updates = { feedUrl: '', autoCheck: true, lastCheckedAt: null });
        u.feedUrl = root.querySelector('#setUpdateFeed').value.trim();
        MMB.save();
        MMB.toast(t('settings.feedSaved'));
        MMB.refreshUpdateUI();
      });
      root.querySelector('#autoUpdateToggle').addEventListener('click', function () {
        const u = MMB.db.settings.updates || (MMB.db.settings.updates = { feedUrl: '', autoCheck: true, lastCheckedAt: null });
        const on = !u.autoCheck;
        u.autoCheck = on;
        MMB.save();
        this.classList.toggle('on', on);
        MMB.refreshUpdateUI();
      });

      /* security */
      const setBtn = root.querySelector('#pinSet');
      if (setBtn) setBtn.addEventListener('click', function () { openPinModal('set'); });
      const changeBtn = root.querySelector('#pinChange');
      if (changeBtn) changeBtn.addEventListener('click', function () { openPinModal('change'); });
      const removeBtn = root.querySelector('#pinRemove');
      if (removeBtn) removeBtn.addEventListener('click', function () { openPinModal('remove'); });

      /* cloud */
      const resyncBtn = root.querySelector('#resyncBtn');
      if (resyncBtn) resyncBtn.addEventListener('click', async function () {
        const ok = await MMB.confirm({
          title: t('settings.resync'),
          body: t('settings.resyncBody'),
          confirmText: t('settings.resync')
        });
        if (!ok) return;
        MMB.sync.resetCursor();
        const r = await MMB.sync.fetch();
        if (r && r.ok) {
          MMB.toast(t('sync.fetched', { n: r.fetched || 0 }), 'gold');
          setTimeout(function () {
            try {
              if (MMB.safeRerender) MMB.safeRerender();
              else MMB.rerender();
            } finally {
              if (MMB.sync.finish) MMB.sync.finish();
            }
          }, 0);
        } else {
          MMB.toast(t('sync.failed'), 'error');
        }
      });

      const signOutBtn = root.querySelector('#signOutBtn');
      if (signOutBtn) signOutBtn.addEventListener('click', async function () {
        const pending = MMB.pendingCount ? MMB.pendingCount() : 0;
        const body = t('auth.signOutBody') + (pending
          ? ' ' + t('sync.signOutPending', { n: pending })
          : '');
        const ok = await MMB.confirm({
          title: t('auth.signOutConfirm'),
          body: body,
          danger: true,
          confirmText: t('settings.signOut')
        });
        if (!ok) return;
        try { await MMB.cloud.signOut(); }
        catch (e) { MMB.toast(t('common.error'), 'error'); }
      });

      /* backup */
      root.querySelector('#backupBtn').addEventListener('click', function () { MMB.downloadBackup(); });
      const restore = root.querySelector('#restoreFile');
      restore.addEventListener('change', function () {
        const f = restore.files && restore.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = async function () {
          const obj = MMB.parseJSON(String(reader.result));
          if (!obj) { MMB.toast(t('settings.importError'), 'error'); return; }
          const ok = await MMB.confirm({ title: t('settings.confirmRestore'), body: t('settings.confirmRestoreBody'), danger: true, confirmText: t('common.confirm') });
          if (!ok) return;
          const res = MMB.importJSON(obj);
          if (!res.ok) { MMB.toast(t('settings.importError'), 'error'); return; }
          MMB.toast(t('settings.importDone'));
          setTimeout(function () { location.reload(); }, 600);
        };
        reader.readAsText(f);
        restore.value = '';
      });

      root.querySelectorAll('[data-csv]').forEach(function (b) {
        b.addEventListener('click', function () {
          const kind = b.getAttribute('data-csv');
          downloadCSV(kind, 'mir-brothers-' + kind + '-' + MMB.todayISO() + '.csv');
        });
      });

      root.querySelector('#resetBtn').addEventListener('click', async function () {
        const ok = await MMB.confirm({ title: t('settings.confirmReset'), body: t('settings.confirmResetBody'), danger: true, confirmText: t('common.reset') });
        if (!ok) return;
        MMB.resetData();
        MMB.toast(t('settings.resetDone'));
        setTimeout(function () { location.reload(); }, 500);
      });
    }
  };
})();
