/* ── Stock: purchases, sales, returns, adjustments ─────────────── */
(function () {
  const MMB = window.MMB;
  const t = MMB.t;
  MMB.views = MMB.views || {};

  let tab = 'in';
  let stockSearch = '';

  const CHARGE_KEYS = ['bardana', 'dalali', 'nikhara', 'chhappai', 'pehri', 'tulai', 'other'];

  function lineKg(l) {
    return MMB.round(l.unit === 'carton' ? MMB.num(l.qty) * MMB.num(l.cartonKg) : MMB.num(l.qty), 3);
  }
  function lineAmount(l) { return MMB.round(lineKg(l) * MMB.num(l.rate), 2); }
  function partyLabel(a) { return a ? a.name : ''; }

  function partyChipHTML(account, placeholder, clearable) {
    if (!account) {
      return '<button type="button" class="party-empty" data-pick-party>' + MMB.icon('plus') + '<span>' + MMB.esc(placeholder) + '</span></button>';
    }
    return '<div class="party-chip" data-pick-party>' +
      '<div class="pc-main"><div class="pc-name">' + MMB.esc(account.name) + '</div>' +
      '<div class="pc-type">' + t('accounts.type.' + account.type) + (account.phone ? ' · ' + MMB.esc(account.phone) : '') + '</div></div>' +
      (clearable ? '<button type="button" class="pc-x" data-clear-party aria-label="' + MMB.esc(t('common.remove')) + '">' + MMB.icon('x') + '</button>' : '') + '</div>';
  }

  /* ── bill form ────────────────────────────────────────────── */
  function openBillForm(mode, edit) {
    const isSale = mode === 'sale';
    const state = {
      partyId: edit ? (isSale ? edit.customerId : edit.supplierId) : null,
      brokerId: edit ? edit.brokerId : null,
      date: edit ? edit.date : MMB.todayISO(),
      time: edit ? edit.time : MMB.nowHM(),
      vehicle: edit ? edit.vehicle || '' : '',
      destination: edit ? edit.destination || '' : '',
      note: edit ? edit.note || '' : '',
      charges: {},
      lines: []
    };
    CHARGE_KEYS.forEach(function (k) { state.charges[k] = edit && edit.charges ? MMB.num(edit.charges[k]) : 0; });

    if (edit && edit.lines && edit.lines.length) {
      state.lines = edit.lines.map(function (l) {
        const p = MMB.product(l.productId);
        const isCarton = l.unit === 'carton' && (l.cartonQty || l.cartonKg);
        return {
          productId: l.productId, name: l.name || (p ? p.name : ''),
          qty: isCarton ? (l.cartonQty || MMB.round(l.qtyKg / (l.cartonKg || 10), 3)) : l.qtyKg,
          unit: isCarton ? 'carton' : 'kg',
          cartonKg: l.cartonKg || (p ? p.cartonKg : 10) || 10,
          rate: l.rate
        };
      });
    } else {
      state.lines = [{ productId: null, name: '', qty: '', unit: 'kg', cartonKg: MMB.db.settings.defaultCartonKg || 10, rate: '' }];
    }

    const title = edit ? (isSale ? t('stock.editSale') : t('stock.editPurchase')) : (isSale ? t('stock.newSale') : t('stock.newPurchase'));
    const sub = edit ? (isSale ? '#' + edit.billNo : edit.no) : (isSale ? t('stock.billNo') + ' ' + MMB.nextBillNo() : MMB.nextPurchaseNo());
    const account = state.partyId ? MMB.account(state.partyId) : null;
    const broker = state.brokerId ? MMB.account(state.brokerId) : null;

    const body =
      '<div class="form-grid">' +
      '<div class="field full"><label class="label">' + (isSale ? t('stock.customer') : t('stock.supplier')) + ' <span class="opt">' + t('common.required') + '</span></label>' +
      '<div id="billParty">' + partyChipHTML(account, isSale ? t('stock.selectCustomer') : t('stock.selectSupplier'), true) + '</div></div>' +
      (isSale ? '<div class="field full"><label class="label">' + t('stock.broker') + ' <span class="opt">' + t('common.optional') + '</span></label>' +
        '<div id="billBroker">' + partyChipHTML(broker, t('stock.selectBroker'), true) + '</div></div>' : '') +
      '<div class="date-time full"><div class="field"><label class="label">' + t('common.date') + '</label><input class="input" type="date" id="billDate" value="' + state.date + '"></div>' +
      '<div class="field"><label class="label">' + t('common.time') + '</label><input class="input" type="time" id="billTime" value="' + state.time + '"></div></div>' +
      '</div>' +

      '<div class="section-head" style="margin:18px 0 9px"><div class="section-title">' + t('stock.product') + '</div><span class="micro">' + (isSale ? t('stock.out') : t('stock.in')) + '</span></div>' +
      '<div id="billLines"></div>' +
      '<button class="btn btn-soft btn-block" id="addLineBtn" type="button" style="margin-top:2px">' + MMB.icon('plus') + t('stock.addLine') + '</button>' +

      (isSale ? '<div class="section-head" style="margin:18px 0 9px"><div class="section-title">' + t('stock.charges') + '</div><span class="micro">' + t('common.optional') + '</span></div>' +
        '<div class="charges-grid">' + CHARGE_KEYS.map(function (k) {
          return '<div class="field"><label class="label">' + t('stock.' + k) + '</label><input class="input num" type="number" inputmode="decimal" step="0.01" min="0" data-charge="' + k + '" placeholder="0" value="' + (state.charges[k] ? state.charges[k] : '') + '"></div>';
        }).join('') + '</div>' : '') +

      '<div class="totals mt-16" id="billTotals"></div>' +

      (isSale ? '<div class="form-grid mt-16">' +
        '<div class="field"><label class="label">' + t('stock.vehicle') + '</label><input class="input" id="billVehicle" maxlength="40" value="' + MMB.esc(state.vehicle) + '" placeholder="—"></div>' +
        '<div class="field"><label class="label">' + t('stock.destination') + '</label><input class="input" id="billDestination" maxlength="60" value="' + MMB.esc(state.destination) + '" placeholder="—"></div>' +
        '<div class="field full"><label class="label">' + t('common.notes') + ' <span class="opt">' + t('common.optional') + '</span></label><input class="input" id="billNote" maxlength="120" value="' + MMB.esc(state.note) + '" placeholder="' + MMB.esc(t('stock.notePlaceholder')) + '"></div>' +
        '</div>' : '<div class="field mt-16"><label class="label">' + t('common.notes') + ' <span class="opt">' + t('common.optional') + '</span></label><input class="input" id="billNote" maxlength="120" value="' + MMB.esc(state.note) + '"></div>');

    const footer = (isSale
      ? '<button class="btn btn-ghost" id="billSave">' + t('common.save') + '</button><button class="btn btn-primary" id="billSavePrint">' + MMB.icon('print') + t('stock.saveAndPrint') + '</button>'
      : '<button class="btn btn-ghost" data-close>' + t('common.cancel') + '</button><button class="btn btn-primary" id="billSave">' + t('stock.savePurchase') + '</button>');

    const sheet = MMB.openSheet({
      title: title,
      subtitle: MMB.esc(sub),
      body: body,
      footer: footer,
      modal: window.innerWidth > 760,
      sheetClass: 'wide',
      onMount: function (el, api) {
        const linesEl = el.querySelector('#billLines');
        const totalsEl = el.querySelector('#billTotals');
        const partyEl = el.querySelector('#billParty');
        const brokerEl = el.querySelector('#billBroker');

        function currentCustomer() { return state.partyId ? MMB.account(state.partyId) : null; }
        function currentBroker() { return state.brokerId ? MMB.account(state.brokerId) : null; }

        function bindParty(container, getAcc, setAcc, types, placeholder, titleText) {
          function renderChip() {
            container.innerHTML = partyChipHTML(getAcc(), placeholder, true);
            bindChip();
          }
          function bindChip() {
            const chip = container.querySelector('[data-pick-party]');
            const clear = container.querySelector('[data-clear-party]');
            if (chip) chip.addEventListener('click', function (e) {
              if (e.target.closest('[data-clear-party]')) return;
              MMB.openAccountPicker({
                types: types, selectedId: getAcc() ? getAcc().id : null,
                title: titleText,
                onPick: function (a) { setAcc(a.id); renderChip(); updateTotals(); }
              });
            });
            if (clear) clear.addEventListener('click', function (e) {
              e.stopPropagation(); setAcc(null); renderChip(); updateTotals();
            });
          }
          renderChip();
        }

        bindParty(partyEl, currentCustomer,
          function (id) { state.partyId = id; },
          ['customer'], isSale ? t('stock.selectCustomer') : t('stock.selectSupplier'),
          isSale ? t('stock.selectCustomer') : t('stock.selectSupplier'));
        if (isSale && brokerEl) {
          bindParty(brokerEl, currentBroker, function (id) { state.brokerId = id; },
            ['broker'], t('stock.selectBroker'), t('stock.selectBroker'));
        }

        el.querySelector('#billDate').addEventListener('change', function (e) { state.date = e.target.value || MMB.todayISO(); });
        el.querySelector('#billTime').addEventListener('change', function (e) { state.time = e.target.value || MMB.nowHM(); });
        const veh = el.querySelector('#billVehicle');
        if (veh) veh.addEventListener('input', function () { state.vehicle = veh.value; });
        const dest = el.querySelector('#billDestination');
        if (dest) dest.addEventListener('input', function () { state.destination = dest.value; });
        const note = el.querySelector('#billNote');
        if (note) note.addEventListener('input', function () { state.note = note.value; });

        el.querySelectorAll('[data-charge]').forEach(function (inp) {
          inp.addEventListener('input', function () {
            state.charges[inp.getAttribute('data-charge')] = MMB.num(inp.value);
            updateTotals();
          });
        });

        function updateTotals() {
          const goods = MMB.round(state.lines.reduce(function (s, l) { return s + lineAmount(l); }, 0), 2);
          const chargesTotal = MMB.round(CHARGE_KEYS.reduce(function (s, k) { return s + MMB.num(state.charges[k]); }, 0), 2);
          const total = MMB.round(goods + chargesTotal, 2);
          const ratePct = MMB.db.settings.commissionRate;
          const commission = isSale && state.brokerId ? MMB.round(goods * ratePct / 100, 2) : 0;

          let html = '<div class="total-row"><span>' + t('stock.goodsTotal') + '</span><span class="v num">' + MMB.money(goods) + '</span></div>';
          if (isSale) {
            html += '<div class="total-row"><span>' + t('stock.charges') + '</span><span class="v num">' + MMB.money(chargesTotal) + '</span></div>';
          }
          html += '<div class="total-row grand"><span>' + t('stock.billTotal') + '</span><span class="v num">' + MMB.money(total) + '</span></div>';
          if (isSale) {
            html += '<div class="total-row" style="font-size:11px"><span>' + MMB.esc(t('stock.commissionNote', { rate: ratePct, amount: MMB.money(commission) })) + '</span></div>';
          }
          totalsEl.innerHTML = html;

          linesEl.querySelectorAll('[data-line]').forEach(function (card) {
            const idx = Number(card.getAttribute('data-line'));
            const l = state.lines[idx];
            if (!l) return;
            const kgEl = card.querySelector('[data-kg]');
            const amtEl = card.querySelector('[data-amt]');
            if (kgEl) kgEl.textContent = '= ' + MMB.qty(lineKg(l), 'kg');
            if (amtEl) amtEl.textContent = MMB.money(lineAmount(l));
          });
        }

        function renderCombo(card, idx) {
          const line = state.lines[idx];
          const input = card.querySelector('[data-pname]');
          const list = card.querySelector('[data-combo-list]');
          const q = input.value.trim();
          const matches = MMB.searchProducts(q).slice(0, 7);
          const exact = MMB.findProduct(q);
          const sd = MMB.computeStock();
          let html = '';
          matches.forEach(function (p) {
            const st = (sd.states[p.id] || { qty: 0, avg: 0 });
            html += '<button type="button" class="combo-item" data-pick-product="' + p.id + '">' +
              '<div class="ci-ic">' + MMB.icon('package') + '</div><div class="ci-main"><div class="ci-name">' + MMB.esc(p.name) + '</div>' +
              '<div class="ci-sub">' + MMB.qty(st.qty, 'kg') + ' · ' + t('stock.avgCost') + ' ' + MMB.money(st.avg) + '</div></div>' +
              (line.productId === p.id ? MMB.icon('check') : '') + '</button>';
          });
          if (q && !exact) {
            html += '<button type="button" class="combo-item create" data-create-product="1"><div class="ci-ic gold">' + MMB.icon('plus') + '</div><div class="ci-main"><div class="ci-name">' + MMB.esc(t('stock.createProduct', { name: q })) + '</div><div class="ci-sub">' + t('stock.cartonDefault') + ' ' + MMB.db.settings.defaultCartonKg + ' kg</div></div></button>';
          }
          if (!html) html = '<div class="combo-empty">' + t('stock.noProducts') + '</div>';
          list.innerHTML = html;
          list.hidden = false;

          list.querySelectorAll('[data-pick-product]').forEach(function (b) {
            b.addEventListener('mousedown', function (e) { e.preventDefault(); });
            b.addEventListener('click', function () {
              const p = MMB.product(b.getAttribute('data-pick-product'));
              if (!p) return;
              const typed = input.value.trim();
              if (typed && typed.toLowerCase() !== p.name.trim().toLowerCase()) MMB.addAlias(p.id, typed);
              line.productId = p.id; line.name = p.name;
              line.cartonKg = p.cartonKg || MMB.db.settings.defaultCartonKg;
              renderLines();
            });
          });
          const create = list.querySelector('[data-create-product]');
          if (create) {
            create.addEventListener('mousedown', function (e) { e.preventDefault(); });
            create.addEventListener('click', function () {
              const qq = input.value.trim();
              if (!qq) return;
              const res = MMB.addProduct(qq, MMB.db.settings.defaultCartonKg);
              if (!res.ok) return;
              line.productId = res.product.id; line.name = res.product.name;
              line.cartonKg = res.product.cartonKg;
              renderLines();
            });
          }
        }

        function bindLine(card, idx) {
          const line = state.lines[idx];
          const input = card.querySelector('[data-pname]');
          const list = card.querySelector('[data-combo-list]');
          input.addEventListener('focus', function () { renderCombo(card, idx); });
          input.addEventListener('input', function () {
            line.productId = null;
            line.name = input.value;
            renderCombo(card, idx);
            updateTotals();
          });
          input.addEventListener('blur', function () {
            setTimeout(function () { if (list) list.hidden = true; }, 160);
          });

          const qty = card.querySelector('[data-qty]');
          qty.addEventListener('input', function () { line.qty = qty.value; updateTotals(); });
          const rate = card.querySelector('[data-rate]');
          rate.addEventListener('input', function () { line.rate = rate.value; updateTotals(); });
          const carton = card.querySelector('[data-carton]');
          if (carton) carton.addEventListener('input', function () { line.cartonKg = carton.value; updateTotals(); });

          card.querySelectorAll('[data-unit-btn]').forEach(function (b) {
            b.addEventListener('click', function () {
              const next = b.getAttribute('data-unit-btn');
              if (next === line.unit) return;
              const kg = lineKg(line);
              if (next === 'carton') {
                const ck = MMB.num(line.cartonKg) || 10;
                line.qty = kg ? MMB.round(kg / ck, 3) : '';
              } else {
                line.qty = kg || '';
              }
              line.unit = next;
              renderLines();
            });
          });

          const remove = card.querySelector('[data-remove-line]');
          if (remove) remove.addEventListener('click', function () {
            if (state.lines.length <= 1) return;
            state.lines.splice(idx, 1);
            renderLines();
          });
        }

        function renderLines() {
          linesEl.innerHTML = state.lines.map(function (l, idx) {
            const p = l.productId ? MMB.product(l.productId) : null;
            return '<div class="line-card" data-line="' + idx + '">' +
              '<div class="line-head"><span class="idx">' + t('stock.product') + ' ' + (idx + 1) + (p ? ' · ' + MMB.esc(p.name) : '') + '</span>' +
              (state.lines.length > 1 ? '<button type="button" class="icon-btn sm danger" data-remove-line aria-label="' + MMB.esc(t('stock.removeLine')) + '">' + MMB.icon('trash') + '</button>' : '') + '</div>' +
              '<div class="field"><input class="input" data-pname autocomplete="off" value="' + MMB.esc(l.name || '') + '" placeholder="' + MMB.esc(t('stock.productPlaceholder')) + '">' +
              '<div class="combo-list" data-combo-list hidden></div></div>' +
              '<div class="line-fields">' +
              '<div class="field"><label class="label">' + (l.unit === 'carton' ? t('stock.qtyCartons') : t('stock.qtyKg')) + '</label>' +
              '<input class="input num" data-qty type="number" inputmode="decimal" step="0.01" min="0" value="' + MMB.esc(l.qty) + '" placeholder="0"></div>' +
              '<div class="field"><label class="label">' + t('stock.unit') + '</label><div class="segmented">' +
              '<button type="button" data-unit-btn="kg" class="' + (l.unit === 'kg' ? 'active' : '') + '">kg</button>' +
              '<button type="button" data-unit-btn="carton" class="' + (l.unit === 'carton' ? 'active' : '') + '">' + t('common.carton') + '</button></div></div>' +
              (l.unit === 'carton' ? '<div class="field"><label class="label">' + t('stock.cartonKg') + '</label><input class="input num" data-carton type="number" inputmode="decimal" step="0.1" min="0.1" value="' + MMB.esc(l.cartonKg) + '"></div>' : '') +
              '<div class="field"><label class="label">' + t('stock.rate') + '</label><input class="input num" data-rate type="number" inputmode="decimal" step="0.01" min="0" value="' + MMB.esc(l.rate) + '" placeholder="0"></div>' +
              '</div>' +
              '<div class="line-total"><span class="muted" data-kg>= ' + MMB.qty(lineKg(l), 'kg') + '</span><span data-amt>' + MMB.money(lineAmount(l)) + '</span></div>' +
              '</div>';
          }).join('');
          linesEl.querySelectorAll('[data-line]').forEach(function (card, idx) { bindLine(card, idx); });
          updateTotals();
        }

        el.querySelector('#addLineBtn').addEventListener('click', function () {
          state.lines.push({ productId: null, name: '', qty: '', unit: 'kg', cartonKg: MMB.db.settings.defaultCartonKg || 10, rate: '' });
          renderLines();
        });

        renderLines();

        async function save(print) {
          if (!state.partyId) { MMB.toast(isSale ? t('stock.customerRequired') : t('stock.supplierRequired'), 'error'); return; }
          const lines = state.lines.map(function (l) {
            const p = MMB.product(l.productId);
            return {
              productId: l.productId, name: l.name || (p ? p.name : ''),
              qtyKg: lineKg(l), rate: MMB.num(l.rate),
              unit: l.unit, cartonQty: l.unit === 'carton' ? MMB.num(l.qty) : null,
              cartonKg: l.unit === 'carton' ? MMB.num(l.cartonKg) : null
            };
          }).filter(function (l) { return l.productId && l.qtyKg > 0; });
          if (!lines.length) { MMB.toast(t('stock.lineRequired'), 'error'); return; }

          if (isSale) {
            const sd = MMB.computeStock();
            const warns = [];
            lines.forEach(function (l) {
              const avail = (sd.states[l.productId] || { qty: 0 }).qty;
              if (l.qtyKg > avail + 0.0001) warns.push(t('stock.insufficient', { qty: MMB.qty(avail), name: l.name }));
            });
            if (warns.length) {
              const ok = await MMB.confirm({ title: t('common.warning'), body: warns.map(MMB.esc).join('<br>'), confirmText: t('common.yes'), danger: false });
              if (!ok) return;
            }
          }

          const data = {
            customerId: state.partyId, supplierId: state.partyId,
            brokerId: isSale ? state.brokerId : null,
            date: state.date, time: state.time, lines: lines,
            charges: isSale ? state.charges : {},
            vehicle: state.vehicle, destination: state.destination, note: state.note
          };
          const res = isSale ? MMB.saveSale(data, edit ? edit.id : null) : MMB.savePurchase(data, edit ? edit.id : null);
          if (!res.ok) { MMB.toast(t('common.error'), 'error'); return; }
          api.close();
          MMB.toast(isSale ? t('stock.saleSaved') : t('stock.purchaseSaved'));
          MMB.rerender();
          if (print && isSale && res.sale) setTimeout(function () { MMB.printSale(res.sale); }, 260);
        }

        el.querySelector('#billSave').addEventListener('click', function () { save(false); });
        const sp = el.querySelector('#billSavePrint');
        if (sp) sp.addEventListener('click', function () { save(true); });
      }
    });
    return sheet;
  }

  MMB.openSaleForm = function (sale) { return openBillForm('sale', sale || null); };
  MMB.openPurchaseForm = function (purchase) { return openBillForm('purchase', purchase || null); };

  /* ── sale / purchase details ─────────────────────────────── */
  function linesHTML(lines) {
    return '<div class="product-line">' + lines.map(function (l) {
      return '<div class="row-main"><div class="pname">' + MMB.esc(l.name) + '</div><div class="pmeta">' + MMB.qty(l.qtyKg, 'kg') + ' × ' + MMB.money(l.rate) + '</div></div><div class="pqty num">' + MMB.money(l.amount) + '</div>';
    }).join('') + '</div>';
  }

  function openSaleDetails(id) {
    const sale = MMB.db.sales.find(function (s) { return s.id === id; });
    if (!sale) return;
    const cust = MMB.account(sale.customerId);
    const broker = sale.brokerId ? MMB.account(sale.brokerId) : null;
    const returns = MMB.saleReturns(sale.id);
    const hasReturns = returns.length > 0;
    const fullyReturned = sale.lines.every(function (l, i) { return MMB.saleReturnedQty(sale.id, i) >= l.qtyKg - 0.0001; });
    const body =
      '<div class="grid cols-2" style="gap:8px">' +
      '<div class="month-cell"><div class="k">' + t('bills.customer') + '</div><div class="v" style="font-size:13px">' + MMB.esc(cust ? cust.name : '—') + '</div></div>' +
      '<div class="month-cell"><div class="k">' + t('bills.date') + '</div><div class="v" style="font-size:13px">' + MMB.fmtDate(sale.date) + ' · ' + MMB.fmtTime(sale.time) + '</div></div>' +
      (broker ? '<div class="month-cell"><div class="k">' + t('stock.broker') + '</div><div class="v" style="font-size:13px">' + MMB.esc(broker.name) + '</div></div>' : '') +
      (sale.vehicle ? '<div class="month-cell"><div class="k">' + t('stock.vehicle') + '</div><div class="v" style="font-size:13px">' + MMB.esc(sale.vehicle) + '</div></div>' : '') +
      (sale.destination ? '<div class="month-cell"><div class="k">' + t('stock.destination') + '</div><div class="v" style="font-size:13px">' + MMB.esc(sale.destination) + '</div></div>' : '') +
      '</div>' +
      '<div class="section-head" style="margin:16px 0 6px"><div class="section-title">' + t('stock.saleDetails') + '</div><span class="badge badge-gray">' + sale.lines.length + ' ' + (sale.lines.length === 1 ? t('common.item') : t('common.items')) + '</span></div>' +
      sale.lines.map(function (l) {
        return '<div class="product-line"><div class="thumb">' + MMB.icon('package') + '</div><div class="row-main"><div class="pname">' + MMB.esc(l.name) + '</div><div class="pmeta">' + MMB.qty(l.qtyKg, 'kg') + ' × ' + MMB.money(l.rate) + (l.unit === 'carton' && l.cartonQty ? ' · ' + l.cartonQty + ' × ' + l.cartonKg + ' kg' : '') + '</div></div><div class="pqty num">' + MMB.money(l.amount) + '</div></div>';
      }).join('') +
      '<div class="totals mt-16">' +
      '<div class="total-row"><span>' + t('stock.goodsTotal') + '</span><span class="v">' + MMB.money(sale.goodsTotal) + '</span></div>' +
      '<div class="total-row"><span>' + t('stock.charges') + '</span><span class="v">' + MMB.money(sale.chargesTotal) + '</span></div>' +
      '<div class="total-row grand"><span>' + t('stock.billTotal') + '</span><span class="v">' + MMB.money(sale.total) + '</span></div>' +
      '<div class="total-row"><span>' + t('dashboard.commission') + ' (' + sale.commissionRate + '%)</span><span class="v">' + MMB.money(sale.commission) + '</span></div>' +
      '</div>' +
      (returns.length ? '<div class="section-head" style="margin:16px 0 6px"><div class="section-title">' + t('stock.saleReturn') + '</div></div>' +
        returns.map(function (r) {
          return '<div class="product-line"><div class="thumb" style="background:var(--blue-soft);color:var(--blue)">' + MMB.icon('refresh') + '</div><div class="row-main"><div class="pname">' + t('stock.saleReturn') + ' · ' + MMB.fmtDate(r.date) + '</div><div class="pmeta">' + r.lines.map(function (l) { return l.name + ' ' + MMB.qty(l.qtyKg, 'kg'); }).join(', ') + (r.commissionReversal ? ' · ' + t('stock.commissionReversal') + ' ' + MMB.money(r.commissionReversal) : '') + '</div></div><div class="pqty num">−' + MMB.money(r.total) + '</div><button class="icon-btn sm" data-view-sret="' + r.id + '" aria-label="' + MMB.esc(t('common.view')) + '">' + MMB.icon('eye') + '</button><button class="icon-btn sm danger" data-del-sret="' + r.id + '" aria-label="' + MMB.esc(t('common.delete')) + '">' + MMB.icon('trash') + '</button></div>';
        }).join('') : '') +
      (hasReturns ? '<div class="hint warn mt-12">' + t('stock.cannotEditSale') + '</div>' : '') +
      (sale.note ? '<div class="hint mt-12">' + MMB.esc(sale.note) + '</div>' : '') +
      '<div class="row-flex wrap gap-8 mt-16"><button class="btn btn-sm btn-soft" id="sdView">' + MMB.icon('eye') + t('stock.viewBill') + '</button>' +
      '<button class="btn btn-sm btn-gold" id="sdReturn" ' + (fullyReturned ? 'disabled' : '') + '>' + MMB.icon('refresh') + t('stock.saleReturn') + '</button>' +
      '<button class="btn btn-sm btn-ghost" id="sdEdit" ' + (hasReturns ? 'disabled' : '') + '>' + MMB.icon('pencil') + t('common.edit') + '</button>' +
      '<button class="btn btn-sm btn-danger" id="sdDelete" ' + (hasReturns ? 'disabled' : '') + '>' + MMB.icon('trash') + t('common.delete') + '</button></div>';

    MMB.openSheet({
      title: t('stock.saleDetails'),
      subtitle: '#' + sale.billNo,
      body: body,
      footer: '<button class="btn btn-ghost" data-close>' + t('common.close') + '</button><button class="btn btn-primary" id="sdPrint">' + MMB.icon('print') + t('common.print') + '</button>',
      onMount: function (el, api) {
        el.querySelector('#sdPrint').addEventListener('click', function () { MMB.printSale(sale); });
        el.querySelector('#sdView').addEventListener('click', function () { MMB.openBillPreview(sale); });
        const retBtn = el.querySelector('#sdReturn');
        if (retBtn && !fullyReturned) retBtn.addEventListener('click', function () { api.close(); setTimeout(function () { openSaleReturn(sale); }, 140); });
        const editBtn = el.querySelector('#sdEdit');
        if (editBtn && !hasReturns) editBtn.addEventListener('click', function () { api.close(); setTimeout(function () { MMB.openSaleForm(sale); }, 140); });
        const delBtn = el.querySelector('#sdDelete');
        if (delBtn && !hasReturns) delBtn.addEventListener('click', async function () {
          const ok = await MMB.confirm({ title: t('stock.deleteSale'), body: MMB.esc(t('stock.deleteSaleBody', { no: sale.billNo })), danger: true, confirmText: t('common.delete') });
          if (!ok) return;
          const res = MMB.deleteSale(sale.id);
          if (!res.ok) { MMB.toast(t('stock.cannotDeleteSale'), 'error'); return; }
          MMB.toast(t('common.deleted'));
          api.close();
          MMB.rerender();
        });
        el.querySelectorAll('[data-view-sret]').forEach(function (b) {
          b.addEventListener('click', function () {
            const r = MMB.db.returns.find(function (x) { return x.id === b.getAttribute('data-view-sret'); });
            if (r) { api.close(); setTimeout(function () { openSaleReturnDetails(r); }, 140); }
          });
        });
        el.querySelectorAll('[data-del-sret]').forEach(function (b) {
          b.addEventListener('click', async function () {
            const ok = await MMB.confirm({ title: t('stock.deleteReturn'), body: t('common.cannotUndo'), danger: true, confirmText: t('common.delete') });
            if (!ok) return;
            MMB.deleteSaleReturn(b.getAttribute('data-del-sret'));
            MMB.toast(t('common.deleted'));
            api.close();
            MMB.rerender();
          });
        });
      }
    });
  }

  function openSaleReturn(sale) {
    const rows = sale.lines.map(function (l, i) {
      const already = MMB.saleReturnedQty(sale.id, i);
      return { line: l, index: i, already: already, remaining: MMB.round(l.qtyKg - already, 3) };
    }).filter(function (r) { return r.remaining > 0.0001; });
    if (!rows.length) { MMB.toast(t('stock.returned'), 'error'); return; }

    const body = '<div class="hint" style="margin-bottom:6px">' + t('stock.saleReturn') + ' · ' + t('ledger.linkedBill', { no: sale.billNo }) + ' · ' + MMB.esc(MMB.accountName(sale.customerId)) + '</div>' +
      '<div class="hint warn" style="margin-bottom:12px">' + t('stock.returnGoodsOnly') + '</div>' +
      rows.map(function (r) {
        return '<div class="line-card" data-sret-row="' + r.index + '">' +
          '<div class="line-head"><span class="idx">' + MMB.esc(r.line.name) + '</span><span class="badge badge-gray">' + t('stock.stockOnHand') + ' ' + MMB.qty(r.line.qtyKg, 'kg') + '</span></div>' +
          '<div class="line-fields" style="grid-template-columns:1fr 1fr">' +
          '<div class="field"><label class="label">' + t('stock.returnQty') + '</label><input class="input num" data-sret-qty type="number" inputmode="decimal" step="0.01" min="0" max="' + r.remaining + '" placeholder="0"></div>' +
          '<div class="field"><label class="label">' + t('stock.rate') + '</label><div class="input-static num">' + MMB.money(r.line.rate) + '</div></div>' +
          '</div><div class="line-total"><span class="muted">' + (r.already > 0 ? t('stock.alreadyReturned', { qty: MMB.qty(r.already) }) : '') + '</span><span data-sret-amt>Rs 0</span></div>' +
          '</div>';
      }).join('') +
      '<div class="date-time mt-12"><div class="field"><label class="label">' + t('common.date') + '</label><input class="input" type="date" id="sretDate" value="' + MMB.todayISO() + '"></div>' +
      '<div class="field"><label class="label">' + t('common.time') + '</label><input class="input" type="time" id="sretTime" value="' + MMB.nowHM() + '"></div></div>' +
      '<div class="field mt-12"><label class="label">' + t('common.notes') + ' <span class="opt">' + t('common.optional') + '</span></label><input class="input" id="sretNote" maxlength="120"></div>' +
      '<div class="totals mt-16" id="sretTotals"></div>';

    MMB.openSheet({
      title: t('stock.saleReturn'),
      subtitle: '#' + sale.billNo,
      body: body,
      footer: '<button class="btn btn-ghost" data-close>' + t('common.cancel') + '</button><button class="btn btn-primary" id="sretSave">' + t('stock.saveSaleReturn') + '</button>',
      onMount: function (el, api) {
        function calc() {
          let total = 0;
          el.querySelectorAll('[data-sret-row]').forEach(function (row) {
            const idx = Number(row.getAttribute('data-sret-row'));
            const r = rows.find(function (x) { return x.index === idx; });
            const qty = Math.min(MMB.num(row.querySelector('[data-sret-qty]').value), r.remaining);
            const amount = MMB.round(qty * r.line.rate, 2);
            row.querySelector('[data-sret-amt]').textContent = MMB.money(amount);
            total += amount;
          });
          el.querySelector('#sretTotals').innerHTML = '<div class="total-row grand"><span>' + t('stock.returnTotal') + '</span><span class="v">' + MMB.money(total) + '</span></div>';
        }
        el.querySelectorAll('[data-sret-qty]').forEach(function (i) { i.addEventListener('input', calc); });
        calc();
        el.querySelector('#sretSave').addEventListener('click', function () {
          const lines = [];
          el.querySelectorAll('[data-sret-row]').forEach(function (row) {
            const idx = Number(row.getAttribute('data-sret-row'));
            const r = rows.find(function (x) { return x.index === idx; });
            const qty = Math.min(MMB.num(row.querySelector('[data-sret-qty]').value), r.remaining);
            if (qty > 0) lines.push({ lineIndex: idx, qtyKg: qty });
          });
          if (!lines.length) { MMB.toast(t('stock.invalidQty'), 'error'); return; }
          const res = MMB.saveSaleReturn({ saleId: sale.id, lines: lines, date: el.querySelector('#sretDate').value, time: el.querySelector('#sretTime').value, note: el.querySelector('#sretNote').value });
          if (!res.ok) { MMB.toast(t('common.error'), 'error'); return; }
          MMB.toast(t('stock.saleReturnSaved'));
          api.close();
          MMB.rerender();
        });
      }
    });
  }

  function openSaleReturnDetails(ret) {
    if (!ret || ret.type !== 'sale') return;
    const sale = MMB.db.sales.find(function (s) { return s.id === ret.saleId; });
    const cust = MMB.account(ret.customerId);
    const body = '<div class="grid cols-2" style="gap:8px">' +
      '<div class="month-cell"><div class="k">' + t('bills.customer') + '</div><div class="v" style="font-size:13px">' + MMB.esc(cust ? cust.name : '—') + '</div></div>' +
      '<div class="month-cell"><div class="k">' + t('bills.date') + '</div><div class="v" style="font-size:13px">' + MMB.fmtDate(ret.date) + ' · ' + MMB.fmtTime(ret.time) + '</div></div>' +
      '<div class="month-cell"><div class="k">' + t('stock.saleReturn') + '</div><div class="v" style="font-size:13px">' + t('ledger.linkedBill', { no: ret.no }) + '</div></div>' +
      '</div>' +
      ret.lines.map(function (l) {
        return '<div class="product-line"><div class="thumb" style="background:var(--blue-soft);color:var(--blue)">' + MMB.icon('refresh') + '</div><div class="row-main"><div class="pname">' + MMB.esc(l.name) + '</div><div class="pmeta">' + MMB.qty(l.qtyKg, 'kg') + ' × ' + MMB.money(l.rate) + '</div></div><div class="pqty num">' + MMB.money(l.amount) + '</div></div>';
      }).join('') +
      '<div class="totals mt-16"><div class="total-row grand"><span>' + t('stock.returnTotal') + '</span><span class="v">' + MMB.money(ret.total) + '</span></div>' +
      (ret.commissionReversal ? '<div class="total-row"><span>' + t('stock.commissionReversal') + '</span><span class="v">' + MMB.money(ret.commissionReversal) + '</span></div>' : '') +
      '</div>' +
      (ret.note ? '<div class="hint mt-12">' + MMB.esc(ret.note) + '</div>' : '');
    MMB.openSheet({
      title: t('stock.saleReturnDetails'),
      subtitle: '#' + ret.no,
      body: body,
      footer: '<button class="btn btn-ghost" data-close>' + t('common.close') + '</button>' +
        (sale ? '<button class="btn btn-primary" id="sretBill">' + MMB.icon('eye') + t('stock.viewBill') + '</button>' : '') +
        '<button class="btn btn-danger" id="sretDelete">' + MMB.icon('trash') + t('common.delete') + '</button>',
      onMount: function (el, api) {
        const view = el.querySelector('#sretBill');
        if (view) view.addEventListener('click', function () { MMB.openBillPreview(sale); });
        el.querySelector('#sretDelete').addEventListener('click', async function () {
          const ok = await MMB.confirm({ title: t('stock.deleteReturn'), body: t('common.cannotUndo'), danger: true, confirmText: t('common.delete') });
          if (!ok) return;
          MMB.deleteSaleReturn(ret.id);
          MMB.toast(t('common.deleted'));
          api.close();
          MMB.rerender();
        });
      }
    });
  }

  function openPurchaseDetails(id) {
    const p = MMB.db.purchases.find(function (x) { return x.id === id; });
    if (!p) return;
    const supplier = MMB.account(p.supplierId);
    const returns = MMB.purchaseReturns(p.id);
    const hasReturns = returns.length > 0;
    const fullyReturned = p.lines.every(function (l, i) { return MMB.returnedQty(p.id, i) >= l.qtyKg - 0.0001; });

    const body =
      '<div class="grid cols-2" style="gap:8px">' +
      '<div class="month-cell"><div class="k">' + t('stock.supplier') + '</div><div class="v" style="font-size:13px">' + MMB.esc(supplier ? supplier.name : '—') + '</div></div>' +
      '<div class="month-cell"><div class="k">' + t('bills.date') + '</div><div class="v" style="font-size:13px">' + MMB.fmtDate(p.date) + ' · ' + MMB.fmtTime(p.time) + '</div></div>' +
      '</div>' +
      '<div class="section-head" style="margin:16px 0 6px"><div class="section-title">' + t('stock.purchaseDetails') + '</div><span class="badge badge-gray">' + p.lines.length + ' ' + (p.lines.length === 1 ? t('common.item') : t('common.items')) + '</span></div>' +
      p.lines.map(function (l, i) {
        const ret = MMB.returnedQty(p.id, i);
        return '<div class="product-line"><div class="thumb">' + MMB.icon('package') + '</div><div class="row-main"><div class="pname">' + MMB.esc(l.name) + '</div><div class="pmeta">' + MMB.qty(l.qtyKg, 'kg') + ' × ' + MMB.money(l.rate) + (ret > 0 ? ' · ' + t('stock.alreadyReturned', { qty: MMB.qty(ret) }) : '') + '</div></div><div class="pqty num">' + MMB.money(l.amount) + '</div></div>';
      }).join('') +
      '<div class="totals mt-16"><div class="total-row grand"><span>' + t('stock.total') + '</span><span class="v">' + MMB.money(p.total) + '</span></div></div>' +
      (returns.length ? '<div class="section-head" style="margin:16px 0 6px"><div class="section-title">' + t('stock.return') + '</div></div>' +
        returns.map(function (r) {
          return '<div class="product-line"><div class="thumb" style="background:var(--blue-soft);color:var(--blue)">' + MMB.icon('refresh') + '</div><div class="row-main"><div class="pname">' + t('stock.return') + ' · ' + MMB.fmtDate(r.date) + '</div><div class="pmeta">' + r.lines.map(function (l) { return l.name + ' ' + MMB.qty(l.qtyKg, 'kg'); }).join(', ') + '</div></div><div class="pqty num">−' + MMB.money(r.total) + '</div><button class="icon-btn sm danger" data-del-return="' + r.id + '">' + MMB.icon('trash') + '</button></div>';
        }).join('') : '') +
      (p.note ? '<div class="hint mt-12">' + MMB.esc(p.note) + '</div>' : '') +
      (hasReturns ? '<div class="hint warn mt-12">' + t('stock.cannotEditPurchase') + '</div>' : '') +
      '<div class="row-flex wrap gap-8 mt-16"><button class="btn btn-sm btn-soft" id="pdEdit" ' + (hasReturns ? 'disabled' : '') + '>' + MMB.icon('pencil') + t('common.edit') + '</button>' +
      '<button class="btn btn-sm btn-danger" id="pdDelete">' + MMB.icon('trash') + t('common.delete') + '</button></div>';

    MMB.openSheet({
      title: t('stock.purchaseDetails'),
      subtitle: p.no,
      body: body,
      footer: '<button class="btn btn-ghost" data-close>' + t('common.close') + '</button><button class="btn btn-primary" id="pdReturn" ' + (fullyReturned ? 'disabled' : '') + '>' + MMB.icon('refresh') + t('stock.return') + '</button>',
      onMount: function (el, api) {
        el.querySelector('#pdEdit').addEventListener('click', function () { api.close(); setTimeout(function () { MMB.openPurchaseForm(p); }, 140); });
        el.querySelector('#pdDelete').addEventListener('click', async function () {
          const ok = await MMB.confirm({ title: t('stock.deletePurchase'), body: MMB.esc(t('stock.deletePurchaseBody', { no: p.no })), danger: true, confirmText: t('common.delete') });
          if (!ok) return;
          const r = MMB.deletePurchase(p.id);
          if (!r.ok) { MMB.toast(t('stock.cannotDeletePurchase'), 'error'); return; }
          MMB.toast(t('common.deleted'));
          api.close();
          MMB.rerender();
        });
        const rb = el.querySelector('#pdReturn');
        if (rb && !fullyReturned) rb.addEventListener('click', function () { api.close(); setTimeout(function () { openPurchaseReturn(p); }, 140); });
        el.querySelectorAll('[data-del-return]').forEach(function (b) {
          b.addEventListener('click', async function () {
            const ok = await MMB.confirm({ title: t('common.delete'), body: t('common.cannotUndo'), danger: true, confirmText: t('common.delete') });
            if (!ok) return;
            MMB.deleteReturn(b.getAttribute('data-del-return'));
            MMB.toast(t('common.deleted'));
            api.close();
            MMB.rerender();
          });
        });
      }
    });
  }

  function openPurchaseReturn(purchase) {
    const rows = purchase.lines.map(function (l, i) {
      const already = MMB.returnedQty(purchase.id, i);
      const remaining = MMB.round(l.qtyKg - already, 3);
      return { line: l, index: i, already: already, remaining: remaining };
    }).filter(function (r) { return r.remaining > 0.0001; });
    if (!rows.length) { MMB.toast(t('stock.returned'), 'error'); return; }

    const body = '<div class="hint" style="margin-bottom:12px">' + t('stock.return') + ' · ' + MMB.esc(purchase.no) + '</div>' +
      rows.map(function (r) {
        return '<div class="line-card" data-ret-row="' + r.index + '">' +
          '<div class="line-head"><span class="idx">' + MMB.esc(r.line.name) + '</span><span class="badge badge-gray">' + t('stock.stockOnHand') + ' ' + MMB.qty(r.line.qtyKg, 'kg') + '</span></div>' +
          '<div class="line-fields" style="grid-template-columns:1fr 1fr">' +
          '<div class="field"><label class="label">' + t('stock.returnQty') + '</label><input class="input num" data-ret-qty type="number" inputmode="decimal" step="0.01" min="0" max="' + r.remaining + '" placeholder="0"></div>' +
          '<div class="field"><label class="label">' + t('stock.rate') + '</label><div class="input-static num">' + MMB.money(r.line.rate) + '</div></div>' +
          '</div><div class="line-total"><span class="muted">' + (r.already > 0 ? t('stock.alreadyReturned', { qty: MMB.qty(r.already) }) : '') + '</span><span data-ret-amt>Rs 0</span></div>' +
          '</div>';
      }).join('') +
      '<div class="date-time mt-12"><div class="field"><label class="label">' + t('common.date') + '</label><input class="input" type="date" id="retDate" value="' + MMB.todayISO() + '"></div>' +
      '<div class="field"><label class="label">' + t('common.time') + '</label><input class="input" type="time" id="retTime" value="' + MMB.nowHM() + '"></div></div>' +
      '<div class="totals mt-16" id="retTotals"></div>';

    MMB.openSheet({
      title: t('stock.return'),
      subtitle: purchase.no,
      body: body,
      footer: '<button class="btn btn-ghost" data-close>' + t('common.cancel') + '</button><button class="btn btn-primary" id="retSave">' + t('stock.saveReturn') + '</button>',
      onMount: function (el, api) {
        function calc() {
          let total = 0;
          el.querySelectorAll('[data-ret-row]').forEach(function (row) {
            const idx = Number(row.getAttribute('data-ret-row'));
            const r = rows.find(function (x) { return x.index === idx; });
            const qty = MMB.num(row.querySelector('[data-ret-qty]').value);
            const amount = MMB.round(Math.min(qty, r.remaining) * r.line.rate, 2);
            row.querySelector('[data-ret-amt]').textContent = MMB.money(amount);
            total += amount;
          });
          el.querySelector('#retTotals').innerHTML = '<div class="total-row grand"><span>' + t('stock.returnTotal') + '</span><span class="v">' + MMB.money(total) + '</span></div>';
        }
        el.querySelectorAll('[data-ret-qty]').forEach(function (i) { i.addEventListener('input', calc); });
        calc();
        el.querySelector('#retSave').addEventListener('click', function () {
          const lines = [];
          el.querySelectorAll('[data-ret-row]').forEach(function (row) {
            const idx = Number(row.getAttribute('data-ret-row'));
            const r = rows.find(function (x) { return x.index === idx; });
            const qty = Math.min(MMB.num(row.querySelector('[data-ret-qty]').value), r.remaining);
            if (qty > 0) lines.push({ lineIndex: idx, qtyKg: qty });
          });
          if (!lines.length) { MMB.toast(t('stock.invalidQty'), 'error'); return; }
          const res = MMB.savePurchaseReturn({ purchaseId: purchase.id, lines: lines, date: el.querySelector('#retDate').value, time: el.querySelector('#retTime').value });
          if (!res.ok) { MMB.toast(t('common.error'), 'error'); return; }
          MMB.toast(t('stock.returnSaved'));
          api.close();
          MMB.rerender();
        });
      }
    });
  }

  /* ── adjustment ───────────────────────────────────────────── */
  MMB.openAdjustmentForm = function () {
    if (!MMB.db.products.length) { MMB.toast(t('stock.addProductFirst'), 'error'); MMB.openProductForm({ onSaved: function () { MMB.openAdjustmentForm(); } }); return; }
    const opts = MMB.db.products.map(function (p) {
      const st = (MMB.computeStock().states[p.id] || { qty: 0 });
      return '<option value="' + p.id + '">' + MMB.esc(p.name) + ' — ' + MMB.qty(st.qty, 'kg') + '</option>';
    }).join('');
    const body = '<div class="form-grid">' +
      '<div class="field full"><label class="label">' + t('stock.product') + '</label><select class="select" id="adjProduct">' + opts + '</select></div>' +
      '<div class="field"><label class="label">' + t('stock.adjustQty') + '</label><input class="input num" id="adjQty" type="number" inputmode="decimal" step="0.01" placeholder="e.g. -5" data-autofocus></div>' +
      '<div class="field"><label class="label">' + t('stock.adjustReason') + '</label><select class="select" id="adjReason">' +
      ['damage', 'shortage', 'self', 'other'].map(function (r) { return '<option value="' + r + '">' + t('stock.reason.' + r) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field full"><label class="label">' + t('common.notes') + ' <span class="opt">' + t('common.optional') + '</span></label><input class="input" id="adjNote" maxlength="120"></div>' +
      '<div class="date-time full"><div class="field"><label class="label">' + t('common.date') + '</label><input class="input" type="date" id="adjDate" value="' + MMB.todayISO() + '"></div>' +
      '<div class="field"><label class="label">' + t('common.time') + '</label><input class="input" type="time" id="adjTime" value="' + MMB.nowHM() + '"></div></div>' +
      '</div><div class="hint mt-12">' + t('stock.adjustHint') + '</div>';
    MMB.openSheet({
      title: t('stock.adjust'), body: body,
      footer: '<button class="btn btn-ghost" data-close>' + t('common.cancel') + '</button><button class="btn btn-primary" id="adjSave">' + t('common.save') + '</button>',
      onMount: function (el, api) {
        el.querySelector('#adjSave').addEventListener('click', function () {
          const qty = MMB.num(el.querySelector('#adjQty').value);
          if (!qty) { el.querySelector('#adjQty').focus(); return; }
          const res = MMB.saveAdjustment({
            productId: el.querySelector('#adjProduct').value, qtyKg: qty,
            reason: el.querySelector('#adjReason').value, note: el.querySelector('#adjNote').value,
            date: el.querySelector('#adjDate').value, time: el.querySelector('#adjTime').value
          });
          if (!res.ok) { MMB.toast(t('common.error'), 'error'); return; }
          MMB.toast(t('stock.adjustSaved'));
          api.close();
          MMB.rerender();
        });
      }
    });
  };

  function openAdjustmentsSheet() {
    MMB.openSheet({
      title: t('stock.adjustHistory'),
      body: '<div id="adjList"></div>',
      onClose: function () { MMB.rerender(); },
      onMount: function (el, api) {
        function render() {
          const list = el.querySelector('#adjList');
          const rows = MMB.db.adjustments.slice().sort(function (a, b) {
            return (b.date + b.time).localeCompare(a.date + a.time);
          });
          if (!rows.length) {
            list.innerHTML = MMB.emptyHTML('scale', t('stock.noAdjustments'), '');
            return;
          }
          list.innerHTML = rows.map(function (a) {
            const p = MMB.product(a.productId);
            const qty = MMB.num(a.qtyKg);
            return '<div class="product-line"><div class="thumb">' + MMB.icon('scale') + '</div>' +
              '<div class="row-main"><div class="pname">' + MMB.esc(p ? p.name : '—') + '</div>' +
              '<div class="pmeta">' + MMB.fmtDate(a.date) + ' · ' + t('stock.reason.' + (a.reason || 'other')) + (a.note ? ' · ' + MMB.esc(a.note) : '') + '</div></div>' +
              '<div class="pqty num" style="color:' + (qty > 0 ? 'var(--green-2)' : 'var(--red)') + '">' + (qty > 0 ? '+' : '−') + MMB.qty(Math.abs(qty), 'kg') + '</div>' +
              '<button class="icon-btn sm danger" data-del-adj="' + a.id + '" aria-label="' + MMB.esc(t('common.delete')) + '">' + MMB.icon('trash') + '</button></div>';
          }).join('');
          list.querySelectorAll('[data-del-adj]').forEach(function (b) {
            b.addEventListener('click', async function () {
              const ok = await MMB.confirm({ title: t('common.delete'), body: t('common.cannotUndo'), danger: true, confirmText: t('common.delete') });
              if (!ok) return;
              MMB.deleteAdjustment(b.getAttribute('data-del-adj'));
              MMB.toast(t('common.deleted'));
              render();
            });
          });
        }
        render();
      }
    });
  }

  /* ── products sheet ───────────────────────────────────────── */
  function openProductsSheet() {
    const sheet = MMB.openSheet({
      title: t('stock.products'),
      body: '<div id="prodList"></div>',
      footer: '<button class="btn btn-primary btn-block" id="prodAdd">' + MMB.icon('plus') + t('stock.addProduct') + '</button>',
      onMount: function (el, api) {
        function render() {
          const sd = MMB.computeStock();
          const list = el.querySelector('#prodList');
          if (!MMB.db.products.length) {
            list.innerHTML = MMB.emptyHTML('package', t('stock.noProducts'), t('stock.firstPurchase'));
          } else {
            list.innerHTML = MMB.db.products.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).map(function (p) {
              const st = sd.states[p.id] || { qty: 0, avg: 0, value: 0 };
              return '<button class="party-item" data-edit-product="' + p.id + '">' +
                '<div class="entry-icon">' + MMB.icon('package') + '</div>' +
                '<div class="row-main"><div class="row-title">' + MMB.esc(p.name) + '</div><div class="row-sub">' + MMB.qty(st.qty, 'kg') + ' · ' + t('stock.avgCost') + ' ' + MMB.money(st.avg) + (p.aliases && p.aliases.length ? ' · ' + p.aliases.slice(0, 2).map(MMB.esc).join(', ') : '') + '</div></div>' +
                MMB.icon('pencil', 'row-arrow') + '</button>';
            }).join('');
          }
          list.querySelectorAll('[data-edit-product]').forEach(function (b) {
            b.addEventListener('click', function () {
              const p = MMB.product(b.getAttribute('data-edit-product'));
              if (p) MMB.openProductForm({ product: p, onSaved: function () { render(); }, onDeleted: function () { render(); } });
            });
          });
        }
        render();
        el.querySelector('#prodAdd').addEventListener('click', function () {
          MMB.openProductForm({ onSaved: function () { render(); } });
        });
      }
    });
    return sheet;
  }

  /* ── stock view ───────────────────────────────────────────── */
  MMB.views.stock = {
    render: function (root, params) {
      tab = (params && params.tab) === 'out' ? 'out' : 'in';
      const sd = MMB.computeStock();
      const totals = MMB.stockTotals(sd);
      const low = MMB.lowStock(sd);
      const sales = MMB.db.sales.slice().sort(function (a, b) { return (b.date + b.time).localeCompare(a.date + a.time); });
      const purchases = MMB.db.purchases.slice().sort(function (a, b) { return (b.date + b.time).localeCompare(a.date + a.time); });
      const purchaseReturns = MMB.db.returns.filter(function (r) { return r.type === 'purchase'; });
      const saleReturnsList = MMB.db.returns.filter(function (r) { return r.type === 'sale'; });

      root.innerHTML =
        '<div class="stock-tabs">' +
        '<a class="stock-tab ' + (tab === 'in' ? 'active' : '') + '" href="#/stock/in">' + MMB.icon('package') + t('stock.in') + '<span class="badge ' + (tab === 'in' ? 'badge-gold' : 'badge-gray') + '">' + (purchases.length + purchaseReturns.length) + '</span></a>' +
        '<a class="stock-tab out ' + (tab === 'out' ? 'active' : '') + '" href="#/stock/out">' + MMB.icon('receipt') + t('stock.out') + '<span class="badge ' + (tab === 'out' ? 'badge-gold' : 'badge-gray') + '">' + (sales.length + saleReturnsList.length) + '</span></a>' +
        '</div>' +

        '<div class="stock-summary">' +
        '<span class="pill">' + MMB.icon('scale') + t('stock.stockValue') + ' <strong>' + MMB.money(totals.value) + '</strong></span>' +
        '<span class="pill">' + MMB.icon('package') + t('stock.totalKg') + ' <strong>' + MMB.qty(totals.qty, 'kg') + '</strong></span>' +
        '<span class="pill">' + MMB.icon('sparkles') + MMB.db.products.length + ' ' + (MMB.db.products.length === 1 ? t('stock.product') : t('stock.products')) + '</span>' +
        (low.length ? '<span class="pill" style="color:var(--red)">' + MMB.icon('alert') + low.length + ' ' + t('stock.low') + '</span>' : '') +
        '</div>' +

        '<div class="row-flex wrap gap-8" style="margin-bottom:12px">' +
        '<button class="btn btn-sm btn-ghost" id="stockProducts">' + MMB.icon('package') + t('stock.manageProducts') + '</button>' +
        '<button class="btn btn-sm btn-ghost" id="stockAdjust">' + MMB.icon('scale') + t('stock.adjust') + '</button>' +
        '<button class="btn btn-sm btn-ghost" id="stockAdjustHistory">' + MMB.icon('clock') + t('stock.adjustHistory') + '</button>' +
        '</div>' +

        '<div class="card card-pad" style="padding:12px 16px;margin-bottom:12px"><div class="input-wrap">' + MMB.icon('search') +
        '<input class="input" id="stockSearch" placeholder="' + MMB.esc(t('common.search')) + '…" value="' + MMB.esc(stockSearch) + '" autocomplete="off"></div></div>' +
        '<div id="stockList"></div>';

      function renderList() {
        const listEl = root.querySelector('#stockList');
        const q = stockSearch.trim().toLowerCase();
        const match = function (s) { return !q || s.toLowerCase().indexOf(q) !== -1; };

        if (tab === 'in') {
          const rets = MMB.db.returns.filter(function (r) { return r.type === 'purchase'; }).sort(function (a, b) { return (b.date + b.time).localeCompare(a.date + a.time); });
          const items = purchases.map(function (p) {
            return { kind: 'purchase', date: p.date, time: p.time, obj: p };
          }).concat(rets.map(function (r) {
            return { kind: 'return', date: r.date, time: r.time, obj: r };
          })).sort(function (a, b) { return (b.date + b.time).localeCompare(a.date + a.time); });

          const filtered = items.filter(function (it) {
            if (it.kind === 'purchase') {
              const p = it.obj;
              const hay = [p.no, MMB.accountName(p.supplierId)].concat(p.lines.map(function (l) { return l.name; })).join(' ');
              return match(hay);
            }
            const r = it.obj;
            const hay = [r.no, MMB.accountName(r.supplierId)].concat((r.lines || []).map(function (l) { return l.name; })).join(' ');
            return match(hay);
          });

          if (!items.length) {
            listEl.innerHTML = '<div class="card">' + MMB.emptyHTML('package', t('stock.emptyIn'), t('stock.emptyInHint'),
              '<button class="btn btn-primary" data-new="purchase">' + MMB.icon('plus') + t('stock.newPurchase') + '</button>') + '</div>';
          } else if (!filtered.length) {
            listEl.innerHTML = '<div class="card">' + MMB.emptyHTML('search', t('accounts.noResults'), '') + '</div>';
          } else {
            listEl.innerHTML = '<div class="card" style="padding:4px 14px"><div class="list">' + filtered.map(function (it) {
              if (it.kind === 'return') {
                const r = it.obj;
                return '<button class="list-row" data-return="' + r.id + '">' +
                  '<div class="avatar blue" style="border-radius:12px">' + MMB.icon('refresh') + '</div>' +
                  '<div class="row-main"><div class="row-title">' + t('stock.return') + ' · ' + MMB.esc(r.no) + ' <span class="badge badge-blue">' + t('stock.returnBadge') + '</span></div>' +
                  '<div class="row-sub">' + MMB.esc(MMB.accountName(r.supplierId)) + '<span class="sep"></span>' + MMB.fmtDate(r.date) + '<span class="sep"></span>' + r.lines.map(function (l) { return l.name + ' ' + MMB.qty(l.qtyKg, 'kg'); }).join(', ') + '</div></div>' +
                  '<div class="row-end"><div class="row-amount positive">−' + MMB.money(r.total) + '</div><div class="row-note">' + t('common.total') + '</div></div>' + MMB.icon('chevron-right', 'row-arrow') + '</button>';
              }
              const p = it.obj;
              const rets2 = MMB.purchaseReturns(p.id);
              return '<button class="list-row" data-purchase="' + p.id + '">' +
                '<div class="avatar gold" style="border-radius:12px">' + MMB.icon('package') + '</div>' +
                '<div class="row-main"><div class="row-title">' + MMB.esc(p.no) + (rets2.length ? ' <span class="badge badge-blue">' + t('stock.linkedReturns') + '</span>' : '') + '</div>' +
                '<div class="row-sub">' + MMB.esc(MMB.accountName(p.supplierId)) + '<span class="sep"></span>' + MMB.fmtDate(p.date) + '<span class="sep"></span>' + p.lines.map(function (l) { return l.name + ' ' + MMB.qty(l.qtyKg, 'kg'); }).join(', ') + '</div></div>' +
                '<div class="row-end"><div class="row-amount">' + MMB.money(p.total) + '</div><div class="row-note">' + t('stock.in') + '</div></div>' + MMB.icon('chevron-right', 'row-arrow') + '</button>';
            }).join('') + '</div></div>';
          }

          listEl.querySelectorAll('[data-purchase]').forEach(function (b) { b.addEventListener('click', function () { openPurchaseDetails(b.getAttribute('data-purchase')); }); });
          listEl.querySelectorAll('[data-return]').forEach(function (b) {
            b.addEventListener('click', function () {
              const r = MMB.db.returns.find(function (x) { return x.id === b.getAttribute('data-return'); });
              if (!r) return;
              MMB.openSheet({
                title: t('stock.return'), subtitle: r.no,
                body: '<div class="grid cols-2" style="gap:8px"><div class="month-cell"><div class="k">' + t('stock.supplier') + '</div><div class="v" style="font-size:13px">' + MMB.esc(MMB.accountName(r.supplierId)) + '</div></div><div class="month-cell"><div class="k">' + t('bills.date') + '</div><div class="v" style="font-size:13px">' + MMB.fmtDate(r.date) + '</div></div></div>' +
                  r.lines.map(function (l) { return '<div class="product-line"><div class="row-main"><div class="pname">' + MMB.esc(l.name) + '</div><div class="pmeta">' + MMB.qty(l.qtyKg, 'kg') + ' × ' + MMB.money(l.rate) + '</div></div><div class="pqty num">' + MMB.money(l.amount) + '</div></div>'; }).join('') +
                  '<div class="totals mt-16"><div class="total-row grand"><span>' + t('stock.returnTotal') + '</span><span class="v">' + MMB.money(r.total) + '</span></div></div>',
                footer: '<button class="btn btn-ghost" data-close>' + t('common.close') + '</button><button class="btn btn-danger" id="retDel">' + MMB.icon('trash') + t('common.delete') + '</button>',
                onMount: function (el, api) {
                  el.querySelector('#retDel').addEventListener('click', async function () {
                    const ok = await MMB.confirm({ title: t('common.delete'), body: t('common.cannotUndo'), danger: true, confirmText: t('common.delete') });
                    if (!ok) return;
                    MMB.deleteReturn(r.id);
                    MMB.toast(t('common.deleted'));
                    api.close();
                    MMB.rerender();
                  });
                }
              });
            });
          });
          const nb = listEl.querySelector('[data-new]');
          if (nb) nb.addEventListener('click', function () { MMB.openPurchaseForm(); });
        } else {
          const outItems = sales.map(function (s) { return { kind: 'sale', date: s.date, time: s.time, obj: s }; })
            .concat(saleReturnsList.map(function (r) { return { kind: 'saleReturn', date: r.date, time: r.time, obj: r }; }))
            .sort(function (a, b) { return (b.date + b.time).localeCompare(a.date + a.time); });
          const filtered = outItems.filter(function (it) {
            if (!q) return true;
            if (it.kind === 'sale') {
              const s = it.obj;
              return [s.billNo, MMB.accountName(s.customerId), s.brokerId ? MMB.accountName(s.brokerId) : ''].concat(s.lines.map(function (l) { return l.name; })).join(' ').toLowerCase().indexOf(q) !== -1;
            }
            const r = it.obj;
            return [r.no, MMB.accountName(r.customerId)].concat((r.lines || []).map(function (l) { return l.name; })).join(' ').toLowerCase().indexOf(q) !== -1;
          });
          if (!outItems.length) {
            listEl.innerHTML = '<div class="card">' + MMB.emptyHTML('receipt', t('stock.emptyOut'), t('stock.emptyOutHint'),
              '<button class="btn btn-primary" data-new="sale">' + MMB.icon('plus') + t('stock.newSale') + '</button>') + '</div>';
          } else if (!filtered.length) {
            listEl.innerHTML = '<div class="card">' + MMB.emptyHTML('search', t('accounts.noResults'), '') + '</div>';
          } else {
            listEl.innerHTML = '<div class="card" style="padding:4px 14px"><div class="list">' + filtered.map(function (it) {
              if (it.kind === 'saleReturn') {
                const r = it.obj;
                return '<button class="list-row" data-salereturn="' + r.id + '">' +
                  '<div class="avatar blue" style="border-radius:12px">' + MMB.icon('refresh') + '</div>' +
                  '<div class="row-main"><div class="row-title">' + t('stock.saleReturn') + ' · #' + MMB.esc(r.no) + ' <span class="badge badge-blue">' + t('stock.returnBadge') + '</span></div>' +
                  '<div class="row-sub">' + MMB.esc(MMB.accountName(r.customerId)) + '<span class="sep"></span>' + MMB.fmtDate(r.date) + '<span class="sep"></span>' + r.lines.map(function (l) { return l.name + ' ' + MMB.qty(l.qtyKg, 'kg'); }).join(', ') + '</div></div>' +
                  '<div class="row-end"><div class="row-amount negative">−' + MMB.money(r.total) + '</div><div class="row-note">' + t('stock.saleReturn') + '</div></div>' + MMB.icon('chevron-right', 'row-arrow') + '</button>';
              }
              const s = it.obj;
              const srets = MMB.saleReturns(s.id);
              return '<button class="list-row" data-sale="' + s.id + '">' +
                '<div class="avatar" style="border-radius:12px">' + MMB.icon('receipt') + '</div>' +
                '<div class="row-main"><div class="row-title">#' + MMB.esc(s.billNo) + ' <span class="badge badge-green">' + t('stock.sale') + '</span>' + (srets.length ? ' <span class="badge badge-blue">' + t('stock.linkedReturns') + '</span>' : '') + '</div>' +
                '<div class="row-sub">' + MMB.esc(MMB.accountName(s.customerId)) + (s.brokerId ? ' · ' + MMB.esc(MMB.accountName(s.brokerId)) : '') + '<span class="sep"></span>' + MMB.fmtDate(s.date) + '<span class="sep"></span>' + s.lines.map(function (l) { return l.name; }).join(', ') + '</div></div>' +
                '<div class="row-end"><div class="row-amount">' + MMB.money(s.total) + '</div><div class="row-note">' + t('dashboard.commission') + ' ' + MMB.money(s.commission) + '</div></div>' + MMB.icon('chevron-right', 'row-arrow') + '</button>';
            }).join('') + '</div></div>';
          }
          listEl.querySelectorAll('[data-sale]').forEach(function (b) { b.addEventListener('click', function () { openSaleDetails(b.getAttribute('data-sale')); }); });
          listEl.querySelectorAll('[data-salereturn]').forEach(function (b) {
            b.addEventListener('click', function () {
              const r = MMB.db.returns.find(function (x) { return x.id === b.getAttribute('data-salereturn'); });
              if (r) openSaleReturnDetails(r);
            });
          });
          const nb = listEl.querySelector('[data-new]');
          if (nb) nb.addEventListener('click', function () { MMB.openSaleForm(); });
        }
      }

      root.querySelector('#stockSearch').addEventListener('input', function (e) { stockSearch = e.target.value; renderList(); });
      root.querySelector('#stockProducts').addEventListener('click', openProductsSheet);
      root.querySelector('#stockAdjust').addEventListener('click', function () { MMB.openAdjustmentForm(); });
      root.querySelector('#stockAdjustHistory').addEventListener('click', openAdjustmentsSheet);

      const fabLabel = tab === 'in' ? t('stock.newPurchase') : t('stock.newSale');
      MMB.setFAB('<button class="fab" id="stockFab" aria-label="' + MMB.esc(fabLabel) + '" title="' + MMB.esc(fabLabel) + '">' + MMB.icon('plus') + '</button>');
      const fab = document.getElementById('stockFab');
      if (fab) fab.addEventListener('click', function () { if (tab === 'in') MMB.openPurchaseForm(); else MMB.openSaleForm(); });

      renderList();
    }
  };

  MMB.openSaleDetails = openSaleDetails;
  MMB.openSaleReturnDetails = openSaleReturnDetails;
  MMB.openPurchaseDetails = openPurchaseDetails;
  MMB.openPurchaseReturn = openPurchaseReturn;
  MMB.openProductsSheet = openProductsSheet;
})();
