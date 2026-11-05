/* ── Accounts list + ledger ────────────────────────────────────── */
(function () {
  const MMB = window.MMB;
  const t = MMB.t;
  MMB.views = MMB.views || {};

  let filter = 'all';
  let query = '';
  let sort = 'newest';

  const TYPES = ['customer', 'broker', 'cash', 'expense'];
  const TYPE_BADGE = { customer: 'badge-green', broker: 'badge-gold', cash: 'badge-blue', expense: 'badge-red' };
  const TYPE_AVATAR = { customer: '', broker: 'gold', cash: 'blue', expense: 'red' };

  /* ── accounts list ────────────────────────────────────────── */
  MMB.views.accounts = {
    render: function (root) {
      const db = MMB.db;
      const counts = { all: db.accounts.length };
      TYPES.forEach(function (tp) { counts[tp] = db.accounts.filter(function (a) { return a.type === tp; }).length; });

      root.innerHTML =
        '<div class="card card-pad" style="padding:14px 16px;margin-bottom:14px">' +
        '<div class="input-wrap">' + MMB.icon('search') + '<input class="input" id="accSearch" placeholder="' + MMB.esc(t('accounts.searchPlaceholder')) + '" value="' + MMB.esc(query) + '" autocomplete="off"></div>' +
        '<div class="chips" style="margin-top:11px" id="accChips">' +
        ['all'].concat(TYPES).map(function (tp) {
          const label = tp === 'all' ? t('common.all') : t('accounts.type.' + tp);
          return '<button class="chip ' + (filter === tp ? 'active' : '') + '" data-filter="' + tp + '">' + label + '<span class="count">' + counts[tp] + '</span></button>';
        }).join('') + '</div></div>' +
        '<div id="accountsList"></div>';

      const listEl = root.querySelector('#accountsList');
      const searchEl = root.querySelector('#accSearch');

      function renderList() {
        let arr = db.accounts.slice();
        if (filter !== 'all') arr = arr.filter(function (a) { return a.type === filter; });
        const q = query.trim().toLowerCase();
        if (q) arr = arr.filter(function (a) {
          return a.name.toLowerCase().indexOf(q) !== -1 || (a.phone || '').toLowerCase().indexOf(q) !== -1;
        });
        arr.sort(function (a, b) {
          const ba = MMB.accountBalance(a.id), bb = MMB.accountBalance(b.id);
          if (Math.abs(bb) !== Math.abs(ba)) return Math.abs(bb) - Math.abs(ba);
          return a.name.localeCompare(b.name);
        });

        if (!db.accounts.length) {
          listEl.innerHTML = '<div class="card">' + MMB.emptyHTML('users', t('accounts.empty'), t('accounts.emptyHint'),
            '<button class="btn btn-primary" data-new>' + MMB.icon('plus') + t('accounts.new') + '</button>') + '</div>';
        } else if (!arr.length) {
          listEl.innerHTML = '<div class="card">' + MMB.emptyHTML('search', t('accounts.noResults'), '') + '</div>';
        } else {
          listEl.innerHTML = '<div class="card" style="padding:4px 14px"><div class="list">' + arr.map(function (a) {
            const bal = MMB.accountBalance(a.id);
            const cls = a.type === 'expense' ? '' : bal > 0 ? 'positive' : bal < 0 ? 'negative' : '';
            const amount = a.type === 'expense' ? MMB.money(Math.abs(bal)) : MMB.money(bal, { sign: true });
            return '<button class="list-row" data-account="' + a.id + '">' +
              MMB.avatar(a.name, TYPE_AVATAR[a.type]) +
              '<div class="row-main"><div class="row-title">' + MMB.esc(a.name) + '</div>' +
              '<div class="row-sub"><span class="badge ' + TYPE_BADGE[a.type] + '">' + t('accounts.type.' + a.type) + '</span>' +
              (a.phone ? '<span class="sep"></span><span>' + MMB.esc(a.phone) + '</span>' : '') + '</div></div>' +
              '<div class="row-end"><div class="row-amount ' + cls + '">' + amount + '</div><div class="row-note">' + MMB.balanceLabel(a) + '</div></div>' +
              MMB.icon('chevron-right', 'row-arrow') + '</button>';
          }).join('') + '</div></div>';
        }

        listEl.querySelectorAll('[data-account]').forEach(function (b) {
          b.addEventListener('click', function () { location.hash = '#/account/' + b.getAttribute('data-account'); });
        });
        const nb = listEl.querySelector('[data-new]');
        if (nb) nb.addEventListener('click', function () { openNew(); });
      }

      function openNew() {
        MMB.openAccountForm({
          type: filter === 'all' ? 'customer' : filter,
          onSaved: function () { MMB.rerender(); }
        });
      }

      searchEl.addEventListener('input', function () { query = searchEl.value; renderList(); });
      root.querySelectorAll('#accChips [data-filter]').forEach(function (b) {
        b.addEventListener('click', function () {
          filter = b.getAttribute('data-filter');
          root.querySelectorAll('#accChips .chip').forEach(function (x) { x.classList.remove('active'); });
          b.classList.add('active');
          renderList();
        });
      });
      MMB.setFAB('<button class="fab" id="accFab" aria-label="' + MMB.esc(t('accounts.new')) + '" title="' + MMB.esc(t('accounts.new')) + '">' + MMB.icon('plus') + '</button>');
      const fab = document.getElementById('accFab');
      if (fab) fab.addEventListener('click', openNew);

      renderList();
    }
  };

  /* ── ledger ───────────────────────────────────────────────── */
  function entryEffect(account, entry) {
    return MMB.entrySign(account, entry.type) * MMB.num(entry.amount);
  }

  function entryAmountHTML(account, entry) {
    const amt = MMB.num(entry.amount);
    if (account.type === 'expense') {
      if (entry.type === 'debit') return '<span class="negative num">' + MMB.money(amt) + '</span>';
      return '<span class="positive num">−' + MMB.money(amt) + '</span>';
    }
    const eff = entryEffect(account, entry);
    return '<span class="' + (eff >= 0 ? 'positive' : 'negative') + ' num">' + (eff >= 0 ? '+' : '−') + MMB.money(amt) + '</span>';
  }

  function entryIcon(account, entry) {
    if (entry.refType === 'sale') {
      if (entry.subtype === 'commission') return '<div class="entry-icon gold">' + MMB.icon('coins') + '</div>';
      return '<div class="entry-icon">' + MMB.icon('receipt') + '</div>';
    }
    if (entry.refType === 'purchase') return '<div class="entry-icon gold">' + MMB.icon('package') + '</div>';
    if (entry.refType === 'return' || entry.refType === 'saleReturn') return '<div class="entry-icon blue">' + MMB.icon('refresh') + '</div>';
    const eff = entryEffect(account, entry);
    return '<div class="entry-icon ' + (eff >= 0 ? '' : 'red') + '">' + MMB.icon(eff >= 0 ? 'arrow-down-left' : 'arrow-up-right') + '</div>';
  }

  function entrySub(account, entry) {
    let parts = [MMB.fmtDate(entry.date) + ' · ' + MMB.fmtTime(entry.time)];
    if (entry.refType === 'sale') {
      const s = MMB.db.sales.find(function (x) { return x.id === entry.refId; });
      if (s) parts.push(s.lines.map(function (l) { return l.name; }).join(', '));
    } else if (entry.refType === 'saleReturn') {
      const r = MMB.db.returns.find(function (x) { return x.id === entry.refId; });
      if (r) parts.push(r.lines.map(function (l) { return l.name + ' ' + MMB.qty(l.qtyKg, 'kg'); }).join(', '));
    } else if (entry.details) {
      parts.push(entry.details);
    }
    const pair = MMB.entryPair(entry);
    if (pair) parts.push(t('ledger.pairedWith', { name: MMB.accountName(pair.accountId) }));
    return parts.filter(Boolean).join(' · ');
  }

  function typeLabel(account, type) {
    if (account.type === 'cash') return type === 'debit' ? t('ledger.cashIn') : t('ledger.cashOut');
    if (account.type === 'expense') return type === 'debit' ? t('ledger.addExpense') : t('ledger.reversal');
    return type === 'debit' ? t('ledger.debit') : t('ledger.credit');
  }

  function typeSub(account, type) {
    if (account.type === 'cash') return type === 'debit' ? t('ledger.cashDebitEffect') : t('ledger.cashCreditEffect');
    if (account.type === 'expense') return type === 'debit' ? t('ledger.expenseDebitEffect') : t('ledger.expenseCreditEffect');
    return type === 'debit' ? t('ledger.debitSub') : t('ledger.creditSub');
  }

  function openEntryForm(account, type, entry) {
    const editing = !!entry;
    const pair = entry ? MMB.entryPair(entry) : null;
    let partyId = pair ? pair.accountId : null;
    const currentBalance = MMB.accountBalance(account.id);

    function partyChip() {
      if (!partyId) {
        return '<button type="button" class="party-empty" data-open-party>' + MMB.icon('plus') + '<span>' + t('ledger.selectParty') + '</span></button>';
      }
      const a = MMB.account(partyId);
      return '<div class="party-chip" data-open-party>' +
        '<div class="pc-main"><div class="pc-name">' + MMB.esc(a.name) + '</div><div class="pc-type">' + t('accounts.type.' + a.type) + (a.phone ? ' · ' + MMB.esc(a.phone) : '') + '</div></div>' +
        '<button type="button" class="pc-x" data-remove-party aria-label="' + MMB.esc(t('common.remove')) + '">' + MMB.icon('x') + '</button></div>';
    }

    const body =
      '<div class="field"><label class="label">' + t('ledger.amount') + '</label>' +
      '<input class="input input-lg num" id="leAmount" data-autofocus type="number" inputmode="decimal" step="0.01" min="0" placeholder="0" value="' + (editing ? entry.amount : '') + '"></div>' +
      '<div class="field mt-12"><label class="label">' + t('common.details') + ' <span class="opt">' + t('common.optional') + '</span></label>' +
      '<input class="input" id="leDetails" maxlength="160" autocomplete="off" placeholder="' + MMB.esc(t('ledger.detailsPlaceholder')) + '" value="' + (editing ? MMB.esc(entry.details) : '') + '"></div>' +
      '<div class="date-time mt-12">' +
      '<div class="field"><label class="label">' + t('common.date') + '</label><input class="input" id="leDate" type="date" value="' + (editing ? entry.date : MMB.todayISO()) + '"></div>' +
      '<div class="field"><label class="label">' + t('common.time') + '</label><input class="input" id="leTime" type="time" value="' + (editing ? entry.time : MMB.nowHM()) + '"></div></div>' +
      '<div class="field mt-12"><label class="label">' + t('ledger.party') + ' <span class="opt">' + t('common.optional') + '</span></label>' +
      '<div id="leParty">' + partyChip() + '</div><div class="hint">' + t('ledger.partyHint') + '</div></div>' +
      '<div class="totals mt-16" id="leEffect"></div>';

    MMB.openSheet({
      title: (editing ? t('ledger.editTitle') : (type === 'credit' ? t('ledger.newCredit') : t('ledger.newDebit'))),
      subtitle: MMB.esc(account.name) + ' · ' + typeLabel(account, type),
      body: body,
      footer: '<button class="btn btn-ghost" data-close>' + t('common.cancel') + '</button><button class="btn btn-primary" id="leSave">' + MMB.icon('check') + (editing ? t('common.save') : t('ledger.saveEntry')) + '</button>',
      onMount: function (el, api) {
        const amountEl = el.querySelector('#leAmount');
        const detailsEl = el.querySelector('#leDetails');
        const dateEl = el.querySelector('#leDate');
        const timeEl = el.querySelector('#leTime');
        const partyEl = el.querySelector('#leParty');
        const effectEl = el.querySelector('#leEffect');

        function updateEffect() {
          const amt = MMB.num(amountEl.value);
          const sign = MMB.entrySign(account, type);
          const after = currentBalance + sign * amt;
          const balLabel = account.type === 'expense' ? t('accounts.balance.expense') : t('ledger.summary.balance');
          effectEl.innerHTML =
            '<div class="total-row"><span>' + t('ledger.currentBalance') + '</span><span class="v">' + MMB.money(currentBalance) + '</span></div>' +
            '<div class="total-row"><span>' + typeSub(account, type) + '</span><span class="v">' + (sign >= 0 ? '+' : '−') + MMB.money(amt) + '</span></div>' +
            '<div class="total-row grand"><span>' + t('ledger.afterEntry') + '</span><span class="v ' + (after >= 0 ? '' : 'negative') + '">' + MMB.money(after) + '</span></div>';
        }
        updateEffect();
        amountEl.addEventListener('input', updateEffect);

        function bindParty() {
          const open = partyEl.querySelector('[data-open-party]');
          const remove = partyEl.querySelector('[data-remove-party]');
          if (open) open.addEventListener('click', function (e) {
            if (e.target.closest('[data-remove-party]')) return;
            MMB.openAccountPicker({
              excludeId: account.id,
              selectedId: partyId,
              onPick: function (a) {
                partyId = a.id;
                partyEl.innerHTML = partyChip();
                bindParty();
              }
            });
          });
          if (remove) remove.addEventListener('click', function (e) {
            e.stopPropagation();
            partyId = null;
            partyEl.innerHTML = partyChip();
            bindParty();
          });
        }
        bindParty();

        el.querySelector('#leSave').addEventListener('click', function () {
          const amt = MMB.num(amountEl.value);
          if (!(amt > 0)) { amountEl.focus(); amountEl.classList.add('shake'); setTimeout(function () { amountEl.classList.remove('shake'); }, 400); return; }
          const payload = {
            accountId: account.id, type: type, amount: amt,
            details: detailsEl.value.trim(), date: dateEl.value, time: timeEl.value,
            partyId: partyId
          };
          const res = editing ? MMB.updateEntry(entry.id, payload) : MMB.addEntry(payload);
          if (!res.ok) { MMB.toast(t('common.error'), 'error'); return; }
          MMB.toast(editing ? t('common.saved') : t('ledger.entrySaved'));
          api.close();
          MMB.rerender();
        });
      }
    });
  }

  function openEntryActions(entry) {
    const actions = [];
    if (entry.refType === 'sale') {
      const hasReturns = MMB.saleReturns(entry.refId).length > 0;
      actions.push({ label: t('stock.viewBill'), icon: 'receipt', act: 'viewSale' });
      if (!hasReturns) {
        actions.push({ label: t('stock.editSale'), icon: 'pencil', act: 'editSale' });
        actions.push({ label: t('stock.deleteSale'), icon: 'trash', act: 'delSale', danger: true });
      } else {
        actions.push({ label: t('stock.cannotEditSale'), icon: 'alert', act: 'none', disabled: true });
      }
    } else if (entry.refType === 'purchase') {
      const hasReturns = MMB.purchaseReturns(entry.refId).length > 0;
      if (!hasReturns) {
        actions.push({ label: t('stock.editPurchase'), icon: 'pencil', act: 'editPurchase' });
        actions.push({ label: t('stock.deletePurchase'), icon: 'trash', act: 'delPurchase', danger: true });
      } else {
        actions.push({ label: t('stock.cannotEditPurchase'), icon: 'alert', act: 'none', disabled: true });
      }
    } else if (entry.refType === 'return') {
      actions.push({ label: t('common.delete'), icon: 'trash', act: 'delReturn', danger: true });
    } else if (entry.refType === 'saleReturn') {
      actions.push({ label: t('stock.viewReturn'), icon: 'eye', act: 'viewSaleReturn' });
      actions.push({ label: t('stock.deleteReturn'), icon: 'trash', act: 'delSaleReturn', danger: true });
    } else {
      actions.push({ label: t('common.edit'), icon: 'pencil', act: 'edit' });
      actions.push({ label: t('common.delete'), icon: 'trash', act: 'del', danger: true });
    }
    const body = '<div class="party-list">' + actions.map(function (a) {
      return '<button class="party-item" data-act="' + a.act + '" ' + (a.disabled ? 'disabled style="opacity:.6;cursor:default"' : '') + '>' +
        '<div class="entry-icon ' + (a.danger ? 'red' : '') + '">' + MMB.icon(a.icon) + '</div>' +
        '<div class="row-main"><div class="row-title" style="' + (a.danger ? 'color:var(--red)' : '') + '">' + a.label + '</div></div>' +
        (a.disabled ? '' : MMB.icon('chevron-right', 'row-arrow')) + '</button>';
    }).join('') + '</div>';
    MMB.openSheet({
      title: MMB.entryTitle(entry),
      subtitle: MMB.fmtDate(entry.date) + ' · ' + MMB.fmtTime(entry.time) + ' · ' + MMB.money(entry.amount),
      body: body,
      onMount: function (el, api) {
        el.querySelectorAll('[data-act]').forEach(function (b) {
          b.addEventListener('click', async function () {
            const act = b.getAttribute('data-act');
            api.close();
            if (act === 'edit') {
              setTimeout(function () { openEntryForm(MMB.account(entry.accountId), entry.type, entry); }, 120);
            } else if (act === 'del') {
              const pair = MMB.entryPair(entry);
              const ok = await MMB.confirm({
                title: t('ledger.deleteTitle'),
                body: MMB.esc(t('ledger.deleteBody', { amount: MMB.money(entry.amount), pair: pair ? t('ledger.deletePairNote') : '' })),
                danger: true, confirmText: t('common.delete')
              });
              if (!ok) return;
              MMB.deleteEntry(entry.id);
              MMB.toast(t('ledger.entryDeleted'));
              MMB.rerender();
            } else if (act === 'viewSale') {
              const s = MMB.db.sales.find(function (x) { return x.id === entry.refId; });
              if (s) MMB.openBillPreview(s);
            } else if (act === 'editSale') {
              const s = MMB.db.sales.find(function (x) { return x.id === entry.refId; });
              if (s && MMB.openSaleForm) MMB.openSaleForm(s);
            } else if (act === 'delSale') {
              const s = MMB.db.sales.find(function (x) { return x.id === entry.refId; });
              if (!s) return;
              const ok = await MMB.confirm({ title: t('stock.deleteSale'), body: MMB.esc(t('stock.deleteSaleBody', { no: s.billNo })), danger: true, confirmText: t('common.delete') });
              if (!ok) return;
              const dr = MMB.deleteSale(s.id);
              if (!dr.ok) { MMB.toast(t('stock.cannotDeleteSale'), 'error'); return; }
              MMB.toast(t('common.deleted'));
              MMB.rerender();
            } else if (act === 'editPurchase') {
              const p = MMB.db.purchases.find(function (x) { return x.id === entry.refId; });
              if (p && MMB.openPurchaseForm) MMB.openPurchaseForm(p);
            } else if (act === 'delPurchase') {
              const p = MMB.db.purchases.find(function (x) { return x.id === entry.refId; });
              if (!p) return;
              const ok = await MMB.confirm({ title: t('stock.deletePurchase'), body: MMB.esc(t('stock.deletePurchaseBody', { no: p.no })), danger: true, confirmText: t('common.delete') });
              if (!ok) return;
              const r = MMB.deletePurchase(p.id);
              if (!r.ok) { MMB.toast(t('stock.cannotDeletePurchase'), 'error'); return; }
              MMB.toast(t('common.deleted'));
              MMB.rerender();
            } else if (act === 'delReturn') {
              const ok = await MMB.confirm({ title: t('common.delete'), body: t('common.cannotUndo'), danger: true, confirmText: t('common.delete') });
              if (!ok) return;
              MMB.deleteReturn(entry.refId);
              MMB.toast(t('common.deleted'));
              MMB.rerender();
            } else if (act === 'viewSaleReturn') {
              const r = MMB.db.returns.find(function (x) { return x.id === entry.refId; });
              if (r && MMB.openSaleReturnDetails) MMB.openSaleReturnDetails(r);
            } else if (act === 'delSaleReturn') {
              const ok = await MMB.confirm({ title: t('stock.deleteReturn'), body: t('common.cannotUndo'), danger: true, confirmText: t('common.delete') });
              if (!ok) return;
              MMB.deleteSaleReturn(entry.refId);
              MMB.toast(t('common.deleted'));
              MMB.rerender();
            }
          });
        });
      }
    });
  }

  function openLedger(root, id) {
    const account = MMB.account(id);
    if (!account) {
      root.innerHTML = '<div class="page-head"><div><h2 class="page-title">' + t('accounts.title') + '</h2></div></div>' +
        '<div class="card">' + MMB.emptyHTML('users', t('accounts.noResults'), '') + '</div>';
      return;
    }
    const balance = MMB.accountBalance(account.id);
    const entries = MMB.accountEntries(account.id, sort);
    const hasEntries = entries.length > 0;
    let creditTotal = 0, debitTotal = 0;
    MMB.db.ledger.forEach(function (e) {
      if (e.accountId !== account.id) return;
      if (e.type === 'credit') creditTotal += MMB.num(e.amount);
      else debitTotal += MMB.num(e.amount);
    });

    const balanceTone = account.type === 'expense' ? 'neutral' : balance >= 0 ? '' : 'negative';
    const balLabel = MMB.balanceLabel(account);

    root.innerHTML =
      '<div class="page-head" style="margin-bottom:12px"><div class="row-flex" style="gap:10px;align-items:center">' +
      '<button class="icon-btn" id="ledgerBack" aria-label="' + MMB.esc(t('common.back')) + '">' + MMB.icon('back') + '</button>' +
      '<div><div class="row-title" style="font-size:19px;font-family:var(--font-display);font-weight:600;letter-spacing:-.02em">' + MMB.esc(account.name) + '</div>' +
      '<div class="row-sub"><span class="badge ' + TYPE_BADGE[account.type] + '">' + t('accounts.type.' + account.type) + '</span>' +
      (account.phone ? '<span class="sep"></span><span>' + MMB.esc(account.phone) + '</span>' : '') + '</div></div></div>' +
      '<div class="head-actions"><button class="icon-btn" id="ledgerEdit" aria-label="' + MMB.esc(t('common.edit')) + '">' + MMB.icon('pencil') + '</button></div></div>' +

      '<section class="ledger-balance-card ' + balanceTone + '">' +
      '<div class="k">' + (account.type === 'expense' ? t('accounts.balance.expense') : t('ledger.summary.balance')) + '</div>' +
      '<div class="v num">' + MMB.money(Math.abs(balance)) + '</div>' +
      '<div class="s">' + balLabel + '</div>' +
      '</section>' +

      '<div class="ledger-summary">' +
      '<div class="card"><div class="k">' + t('ledger.summary.credit') + '</div><div class="v positive num">' + MMB.money(creditTotal) + '</div></div>' +
      '<div class="card"><div class="k">' + t('ledger.summary.debit') + '</div><div class="v negative num">' + MMB.money(debitTotal) + '</div></div>' +
      '<div class="card"><div class="k">' + t('ledger.summary.balance') + '</div><div class="v num">' + MMB.money(balance) + '</div></div>' +
      '</div>' +

      '<div class="ledger-filters"><span class="micro">' + (entries.length === 1 ? t('ledger.entryCountOne') : t('ledger.entryCount', { n: entries.length })) + '</span>' +
      '<div class="sort-toggle" id="ledgerSort"><button data-sort="newest" class="' + (sort === 'newest' ? 'active' : '') + '">' + t('common.newest') + '</button><button data-sort="oldest" class="' + (sort === 'oldest' ? 'active' : '') + '">' + t('common.oldest') + '</button></div></div>' +

      '<div class="ledger-list" id="ledgerList"></div>' +
      (hasEntries ? '<div style="height:96px"></div><div class="ledger-sticky">' + ledgerButtons(account) + '</div>' : '');

    const listEl = root.querySelector('#ledgerList');
    if (!entries.length) {
      const cClass = account.type === 'cash' ? 'btn-danger' : 'btn-primary';
      const dClass = account.type === 'cash' ? 'btn-primary' : 'btn-danger';
      const actions = '<div class="row-flex wrap gap-8" style="justify-content:center;margin-top:16px">' +
        '<button class="btn ' + cClass + '" data-entry-type="credit">' + MMB.icon('arrow-down-left') + typeLabel(account, 'credit') + '</button>' +
        '<button class="btn ' + dClass + '" data-entry-type="debit">' + MMB.icon('arrow-up-right') + typeLabel(account, 'debit') + '</button>' +
        '</div>';
      listEl.innerHTML = '<div style="padding:8px">' + MMB.emptyHTML('book', t('ledger.empty'), t('ledger.emptyHint'), actions) + '</div>';
    } else {
      listEl.innerHTML = entries.map(function (e) {
        return '<div class="ledger-item" data-entry="' + e.id + '">' +
          entryIcon(account, e) +
          '<div class="entry-main"><div class="entry-title">' + MMB.esc(MMB.entryTitle(e)) + '</div>' +
          '<div class="entry-meta">' + MMB.esc(entrySub(account, e)) + '</div></div>' +
          '<div class="row-end"><div class="entry-amount">' + entryAmountHTML(account, e) + '</div>' +
          '<div class="row-note">' + (e.type === 'credit' ? t('ledger.credit') : t('ledger.debit')) + '</div></div>' +
          '<button class="icon-btn sm" data-menu="' + e.id + '" aria-label="' + MMB.esc(t('common.more')) + '">' + MMB.icon('more') + '</button>' +
          '</div>';
      }).join('');
    }

    root.querySelector('#ledgerBack').addEventListener('click', function () { MMB.navigate('accounts'); });
    root.querySelector('#ledgerEdit').addEventListener('click', function () {
      MMB.openAccountForm({ account: account, onSaved: function () { MMB.rerender(); }, onDeleted: function () { MMB.navigate('accounts'); } });
    });
    root.querySelectorAll('#ledgerSort [data-sort]').forEach(function (b) {
      b.addEventListener('click', function () { sort = b.getAttribute('data-sort'); MMB.rerender(); });
    });
    listEl.querySelectorAll('[data-menu]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        const entry = MMB.db.ledger.find(function (x) { return x.id === b.getAttribute('data-menu'); });
        if (entry) openEntryActions(entry);
      });
    });
    listEl.querySelectorAll('[data-entry]').forEach(function (row) {
      row.addEventListener('click', function () {
        const entry = MMB.db.ledger.find(function (x) { return x.id === row.getAttribute('data-entry'); });
        if (entry) openEntryActions(entry);
      });
    });
    root.querySelectorAll('[data-entry-type]').forEach(function (b) {
      b.addEventListener('click', function () { openEntryForm(account, b.getAttribute('data-entry-type')); });
    });
  }

  function ledgerButtons(account) {
    const cSign = MMB.entrySign(account, 'credit');
    const dSign = MMB.entrySign(account, 'debit');
    let creditCls = cSign >= 0 ? 'btn-credit' : 'btn-debit';
    let debitCls = dSign >= 0 ? 'btn-credit' : 'btn-debit';
    if (account.type === 'expense') { creditCls = 'btn-credit'; debitCls = 'btn-debit'; }
    function label(type) {
      if (account.type === 'cash') return type === 'debit' ? t('ledger.cashIn') : t('ledger.cashOut');
      if (account.type === 'expense') return type === 'debit' ? t('ledger.addExpense') : t('ledger.reversal');
      return type === 'credit' ? t('ledger.credit') : t('ledger.debit');
    }
    function sub(type) {
      if (account.type === 'cash') return type === 'debit' ? t('ledger.cashDebitEffect') : t('ledger.cashCreditEffect');
      if (account.type === 'expense') return type === 'debit' ? t('ledger.expenseDebitEffect') : t('ledger.expenseCreditEffect');
      return type === 'credit' ? t('ledger.creditSub') : t('ledger.debitSub');
    }
    return '<button class="btn ' + creditCls + '" data-entry-type="credit"><span><strong>' + label('credit') + '</strong><small>' + sub('credit') + '</small></span></button>' +
      '<button class="btn ' + debitCls + '" data-entry-type="debit"><span><strong>' + label('debit') + '</strong><small>' + sub('debit') + '</small></span></button>';
  }

  MMB.views.accounts.renderLedger = function (root, id) { openLedger(root, id); };
  MMB.openLedgerEntryForm = openEntryForm;
})();
