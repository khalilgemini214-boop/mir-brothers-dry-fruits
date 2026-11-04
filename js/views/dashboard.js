/* ── Dashboard ─────────────────────────────────────────────────── */
(function () {
  const MMB = window.MMB;
  const t = MMB.t;
  MMB.views = MMB.views || {};
  let chartRange = 7;

  function heroArt() {
    return '<svg class="hero-art" viewBox="0 0 320 230" fill="none" aria-hidden="true">' +
      '<g opacity=".9">' +
      '<path d="M292 214C246 186 228 146 238 102c8-36 34-58 62-70" stroke="#D9A94B" stroke-opacity=".5" stroke-width="1.3" stroke-linecap="round"/>' +
      '<path d="M262 176c-24-8-43-2-58 17 22 8 43 2 58-17Z" fill="#7FA88A" fill-opacity=".18" stroke="#A9C7B1" stroke-opacity=".45"/>' +
      '<path d="M247 149c22-13 45-12 62 2-18 14-42 13-62-2Z" fill="#7FA88A" fill-opacity=".16" stroke="#A9C7B1" stroke-opacity=".42"/>' +
      '<path d="M244 120c-23-4-43 5-54 26 23 4 43-6 54-26Z" fill="#7FA88A" fill-opacity=".14" stroke="#A9C7B1" stroke-opacity=".38"/>' +
      '<path d="M256 92c20-16 43-19 64-8-15 16-38 19-64 8Z" fill="#7FA88A" fill-opacity=".16" stroke="#A9C7B1" stroke-opacity=".4"/>' +
      '<path d="M285 60c-10-23-4-44 18-58 9 22 3 43-18 58Z" fill="#D9A94B" fill-opacity=".16" stroke="#E4B45B" stroke-opacity=".55"/>' +
      '<ellipse cx="211" cy="196" rx="17" ry="11" transform="rotate(-38 211 196)" stroke="#D9A94B" stroke-opacity=".7" stroke-width="1.2"/>' +
      '<path d="M200 204c4-6 9-10 15-13" stroke="#D9A94B" stroke-opacity=".55" stroke-width="1"/>' +
      '<ellipse cx="183" cy="177" rx="10" ry="7" transform="rotate(28 183 177)" stroke="#E4B45B" stroke-opacity=".55" stroke-width="1"/>' +
      '<circle cx="128" cy="66" r="2" fill="#D9A94B" fill-opacity=".55"/>' +
      '<circle cx="148" cy="42" r="1.4" fill="#D9A94B" fill-opacity=".45"/>' +
      '<circle cx="100" cy="94" r="1.2" fill="#D9A94B" fill-opacity=".38"/>' +
      '</g></svg>';
  }

  function activityHTML(items) {
    if (!items.length) return MMB.emptyHTML('sparkles', t('dashboard.noActivity'), '');
    return items.map(function (it) {
      let icon = 'receipt', cls = '', amountCls = 'positive', amount = MMB.money(it.amount);
      if (it.kind === 'purchase') { icon = 'package'; cls = 'gold'; amountCls = 'negative'; amount = '−' + MMB.money(it.amount); }
      else if (it.kind === 'saleReturn') { icon = 'refresh'; cls = 'blue'; amountCls = 'negative'; amount = '−' + MMB.money(it.amount); }
      else if (it.kind === 'entry') {
        let positive = (it.effect || 0) >= 0;
        if (it.accountType === 'expense') positive = it.entryType === 'credit';
        icon = positive ? 'arrow-down-left' : 'arrow-up-right';
        cls = positive ? '' : 'blue';
        amountCls = positive ? 'positive' : 'negative';
        amount = (positive ? '+' : '−') + MMB.money(it.amount);
      }
      return '<button class="activity-row" style="width:100%;text-align:start" data-act="' + it.kind + '" data-id="' + (it.accountId || '') + '" data-date="' + (it.date || '') + '">' +
        '<div class="ai ' + cls + '">' + MMB.icon(icon) + '</div>' +
        '<div class="am"><div class="at">' + MMB.esc(it.title) + '</div><div class="as">' + MMB.esc(it.sub) + ' · ' + MMB.fmtDate(it.date) + '</div></div>' +
        '<div class="av ' + amountCls + ' num">' + amount + '</div></button>';
    }).join('');
  }

  function lowStockHTML(list) {
    if (!list.length) {
      if (!MMB.db.products.length) {
        return '<div class="empty" style="padding:22px 8px"><div class="empty-art" style="width:44px;height:44px;margin-bottom:8px">' + MMB.icon('package') + '</div><h3>' + t('stock.noProducts') + '</h3><p>' + t('stock.firstPurchase') + '</p><button class="btn btn-sm btn-soft mt-12" data-action="stock">' + t('dashboard.viewStock') + '</button></div>';
      }
      return '<div class="empty" style="padding:22px 8px"><div class="empty-art" style="width:44px;height:44px;margin-bottom:8px">' + MMB.icon('check') + '</div><h3>' + t('dashboard.allGood') + '</h3><p>' + t('dashboard.noLowStock') + '</p></div>';
    }
    return list.slice(0, 5).map(function (x) {
      return '<button class="low-row" style="width:100%;text-align:start" data-stock="1">' +
        '<div class="thumb" style="width:32px;height:32px;border-radius:9px;background:var(--gold-soft);color:var(--gold);display:grid;place-items:center">' + MMB.icon('package') + '</div>' +
        '<div class="lm"><div class="lt">' + MMB.esc(x.product.name) + '</div><div class="ls">' + t('stock.avgCost') + ' ' + MMB.money(x.productStockAvg || 0) + '</div></div>' +
        '<div class="lq">' + (x.qty <= 0 ? t('stock.outOfStock') : MMB.qty(x.qty) + ' kg') + '</div></button>';
    }).join('');
  }

  MMB.views.dashboard = {
    render: function (root) {
      const db = MMB.db;
      const shop = db.settings.shop;
      const sd = MMB.computeStock();
      const today = MMB.todayStats(sd);
      const month = MMB.monthStats(sd);
      const summary = MMB.summary();
      const totals = MMB.stockTotals(sd);
      const low = MMB.lowStock(sd).map(function (x) { x.productStockAvg = (sd.states[x.product.id] || {}).avg || 0; return x; });
      const recent = MMB.recent(7);
      const series30 = MMB.dailySeries(30);
      const series = series30.slice(-chartRange);
      const todayISO = MMB.todayISO();
      const isUr = MMB.lang() === 'ur';
      const name = isUr ? shop.nameUr : shop.nameEn;
      const tagline = isUr ? shop.taglineUr : shop.taglineEn;
      const backupDays = MMB.backupAgeDays();
      const hasData = db.accounts.length > 0 || db.sales.length > 0 || db.purchases.length > 0;
      const salesCount = db.sales.filter(function (s) { return MMB.monthKey(s.date) === MMB.thisMonthKey(); }).length;

      const monthStart = MMB.todayISO().slice(0, 8) + '01';
      const customerTotals = {};
      db.sales.filter(function (s) { return s.date >= monthStart && s.date <= todayISO; }).forEach(function (s) {
        if (!customerTotals[s.customerId]) customerTotals[s.customerId] = { total: 0, count: 0 };
        customerTotals[s.customerId].total += s.total;
        customerTotals[s.customerId].count += 1;
      });
      db.returns.filter(function (r) { return r.type === 'sale' && r.date >= monthStart && r.date <= todayISO; }).forEach(function (r) {
        if (customerTotals[r.customerId]) customerTotals[r.customerId].total -= r.total;
      });
      const topCustomers = Object.keys(customerTotals).map(function (id) {
        return { account: MMB.account(id), total: customerTotals[id].total, count: customerTotals[id].count };
      }).filter(function (x) { return x.account; }).sort(function (a, b) { return b.total - a.total; }).slice(0, 5);
      const stockProducts = db.products.map(function (p) {
        const st = sd.states[p.id] || { qty: 0, value: 0, avg: 0 };
        return { product: p, qty: st.qty, value: st.value, avg: st.avg };
      }).filter(function (x) { return x.qty > 0; }).sort(function (a, b) { return b.value - a.value; }).slice(0, 5);

      const chartHTML = MMB.lineChart(series) +
        '<div class="chart-legend"><span class="legend-item"><span class="legend-line"></span>' + t('dashboard.sales') + '</span>' +
        '<span class="legend-item"><span class="legend-line gold"></span>' + t('dashboard.profit') + '</span></div>';

      root.innerHTML =
        '<div id="dashUpdateBanner"></div>' +
        (backupDays > 7 && hasData ? '<div class="banner">' + MMB.icon('database') + '<span>' + t('dashboard.backupNudge') + '</span><button class="btn btn-sm btn-gold" data-action="backup">' + t('dashboard.backupNow') + '</button></div>' : '') +
        '<section class="hero fade-up">' +
        '<div class="hero-greet">' + t('dashboard.greeting') + '</div>' +
        '<div class="hero-title">' + MMB.esc(name) + '</div>' +
        '<div class="hero-date">' + MMB.icon('calendar') + MMB.fmtDate(todayISO) + ' · ' + MMB.weekday(todayISO) + '</div>' +
        '<div class="hero-grid"><div class="hero-main">' +
        '<div class="hero-stat"><div class="k">' + t('dashboard.todaySales') + '</div><div class="v num">' + MMB.money(today.salesTotal) + '</div><div class="s">' + today.salesCount + ' ' + (today.salesCount === 1 ? t('stock.sale') : t('stock.sales')) + '</div></div>' +
        '<div class="hero-stat"><div class="k">' + t('dashboard.todayProfit') + '</div><div class="v ' + (today.profit >= 0 ? 'positive' : 'negative') + ' num">' + MMB.money(today.profit) + '</div><div class="s">' + t('dashboard.thisMonthSummary') + ': ' + MMB.money(month.profit) + '</div></div>' +
        '</div><div class="hero-actions">' +
        '<button class="btn btn-gold" data-action="sale">' + MMB.icon('plus') + t('dashboard.newSale') + '</button>' +
        '<button class="btn btn-ghost" data-action="purchase">' + MMB.icon('package') + t('dashboard.newPurchase') + '</button>' +
        '</div></div>' + heroArt() + '</section>' +

        '<div class="grid cols-4 stagger" style="margin-top:15px">' +
        '<button class="stat-card" data-action="accounts" style="text-align:start">' +
        '<div class="stat-top"><div class="stat-icon"><svg class="ic"><use href="#i-arrow-down-left"/></svg></div><span class="badge badge-green">' + t('dashboard.receivable') + '</span></div>' +
        '<div class="stat-value num">' + MMB.money(summary.receivable) + '</div><div class="stat-sub"><span class="dot"></span>' + t('accounts.balance.negative') + '</div></button>' +
        '<button class="stat-card" data-action="accounts" style="text-align:start">' +
        '<div class="stat-top"><div class="stat-icon red"><svg class="ic"><use href="#i-arrow-up-right"/></svg></div><span class="badge badge-red">' + t('dashboard.payable') + '</span></div>' +
        '<div class="stat-value num">' + MMB.money(summary.payable) + '</div><div class="stat-sub"><span class="dot"></span>' + t('accounts.balance.positive') + '</div></button>' +
        '<button class="stat-card" data-action="accounts" style="text-align:start">' +
        '<div class="stat-top"><div class="stat-icon blue"><svg class="ic"><use href="#i-wallet"/></svg></div><span class="badge badge-blue">' + t('dashboard.cashBank') + '</span></div>' +
        '<div class="stat-value num">' + MMB.money(summary.cash) + '</div><div class="stat-sub"><span class="dot"></span>' + t('dashboard.cashInHand') + '</div></button>' +
        '<button class="stat-card" data-action="stock" style="text-align:start">' +
        '<div class="stat-top"><div class="stat-icon gold"><svg class="ic"><use href="#i-package"/></svg></div><span class="badge badge-gold">' + t('dashboard.stockValue') + '</span></div>' +
        '<div class="stat-value num">' + MMB.money(totals.value) + '</div><div class="stat-sub"><span class="dot"></span>' + MMB.qty(totals.qty, 'kg') + ' · ' + db.products.length + ' ' + (db.products.length === 1 ? t('stock.product') : t('dashboard.products')) + '</div></button>' +
        '</div>' +

        '<div class="grid" style="grid-template-columns:1.55fr .9fr;margin-top:15px" id="dashMid">' +
        '<section class="card card-pad">' +
        '<div class="section-head" style="margin-top:0"><div class="section-title">' + t('dashboard.salesProfit') + '</div>' +
        '<div class="chart-tabs" id="chartTabs"><button class="' + (chartRange === 7 ? 'active' : '') + '" data-range="7">' + t('dashboard.last7') + '</button><button class="' + (chartRange === 30 ? 'active' : '') + '" data-range="30">' + t('dashboard.last30') + '</button></div></div>' +
        '<div class="chart-wrap" id="dashChart">' + chartHTML + '</div>' +
        '<div class="divider"></div><div class="month-grid">' +
        '<div class="month-cell"><div class="k">' + t('dashboard.monthSales') + '</div><div class="v">' + MMB.money(month.salesTotal) + '</div></div>' +
        '<div class="month-cell"><div class="k">' + t('dashboard.monthProfit') + '</div><div class="v ' + (month.profit >= 0 ? 'positive' : 'negative') + '">' + MMB.money(month.profit) + '</div></div>' +
        '<div class="month-cell"><div class="k">' + t('dashboard.expensesMonth') + '</div><div class="v">' + MMB.money(month.expenses) + '</div></div>' +
        '<div class="month-cell"><div class="k">' + t('dashboard.purchases') + '</div><div class="v">' + MMB.money(month.purchasesTotal) + '</div></div>' +
        '</div></section>' +

        '<section class="card card-pad"><div class="section-head" style="margin-top:0"><div class="section-title">' + t('dashboard.thisMonthSummary') + '</div><span class="badge badge-gray">' + salesCount + ' ' + (salesCount === 1 ? t('stock.sale') : t('stock.sales')) + '</span></div>' +
        '<div class="totals" style="background:transparent;border:0;padding:0;gap:9px">' +
        '<div class="total-row"><span>' + t('dashboard.goods') + '</span><span class="v">' + MMB.money(month.goodsTotal) + '</span></div>' +
        '<div class="total-row"><span>' + t('dashboard.charges') + '</span><span class="v">' + MMB.money(month.chargesTotal) + '</span></div>' +
        '<div class="total-row"><span>' + t('dashboard.cogs') + '</span><span class="v">−' + MMB.money(month.cogs) + '</span></div>' +
        '<div class="total-row"><span>' + t('dashboard.commission') + '</span><span class="v">−' + MMB.money(month.commission) + '</span></div>' +
        '<div class="total-row"><span>' + t('dashboard.expenses') + '</span><span class="v">−' + MMB.money(month.expenses) + '</span></div>' +
        '<div class="total-row"><span>' + t('dashboard.stockLoss') + '</span><span class="v">−' + MMB.money(Math.max(0, month.stockLoss)) + '</span></div>' +
        '<div class="total-row grand"><span>' + t('dashboard.netProfit') + '</span><span class="v ' + (month.profit >= 0 ? 'positive' : 'negative') + '">' + MMB.money(month.profit) + '</span></div>' +
        '</div>' +
        '<button class="btn btn-soft btn-block" style="margin-top:14px" data-action="stock">' + t('dashboard.viewStock') + MMB.icon('chevron-right') + '</button>' +
        '</section></div>' +

        '<div class="section-head"><div class="section-title">' + t('dashboard.quickActions') + '</div></div>' +
        '<div class="quick-grid stagger">' +
        '<button class="quick-btn" data-action="sale"><div class="qi">' + MMB.icon('receipt') + '</div><div><div class="qt">' + t('dashboard.newSale') + '</div><div class="qs">' + t('dashboard.quickSaleHint') + '</div></div></button>' +
        '<button class="quick-btn" data-action="purchase"><div class="qi gold">' + MMB.icon('package') + '</div><div><div class="qt">' + t('dashboard.newPurchase') + '</div><div class="qs">' + t('dashboard.quickPurchaseHint') + '</div></div></button>' +
        '<button class="quick-btn" data-action="newAccount"><div class="qi blue">' + MMB.icon('users') + '</div><div><div class="qt">' + t('dashboard.newAccount') + '</div><div class="qs">' + t('dashboard.quickAccountHint') + '</div></div></button>' +
        '<button class="quick-btn" data-action="adjust"><div class="qi red">' + MMB.icon('scale') + '</div><div><div class="qt">' + t('stock.adjust') + '</div><div class="qs">' + t('dashboard.quickStockHint') + '</div></div></button>' +
        '</div>' +

        '<div class="grid cols-2" style="margin-top:22px">' +
        '<section class="card card-pad"><div class="section-head" style="margin-top:0"><div class="section-title">' + t('dashboard.recent') + '</div></div>' + activityHTML(recent) + '</section>' +
        '<section class="card card-pad"><div class="section-head" style="margin-top:0"><div class="section-title">' + t('dashboard.lowStock') + '</div><button class="link-btn" data-action="stock">' + t('dashboard.viewAll') + MMB.icon('chevron-right') + '</button></div>' + lowStockHTML(low) + '</section>' +
        '</div>' +

        '<div class="grid cols-2" style="margin-top:15px">' +
        '<section class="card card-pad"><div class="section-head" style="margin-top:0"><div class="section-title">' + t('dashboard.topCustomers') + '</div></div>' +
        (topCustomers.length ? '<div class="party-list" style="padding:0">' + topCustomers.map(function (x) {
          return '<button class="party-item" data-cust="' + x.account.id + '">' +
            MMB.avatar(x.account.name, MMB.hashColor(x.account.name)) +
            '<div class="row-main"><div class="row-title">' + MMB.esc(x.account.name) + '</div><div class="row-sub">' + (x.count === 1 ? t('dashboard.billCountOne') : t('dashboard.billCount', { n: x.count })) + '</div></div>' +
            '<div class="row-end"><div class="row-amount">' + MMB.money(x.total) + '</div><div class="row-note">' + t('dashboard.sales') + '</div></div>' +
            MMB.icon('chevron-right', 'row-arrow') + '</button>';
        }).join('') + '</div>' : MMB.emptyHTML('users', t('dashboard.noSales'), '')) + '</section>' +
        '<section class="card card-pad"><div class="section-head" style="margin-top:0"><div class="section-title">' + t('dashboard.stockByProduct') + '</div><button class="link-btn" data-action="stock">' + t('dashboard.viewAll') + MMB.icon('chevron-right') + '</button></div>' +
        (stockProducts.length ? stockProducts.map(function (x) {
          return '<div class="product-line"><div class="thumb">' + MMB.icon('package') + '</div><div class="row-main"><div class="pname">' + MMB.esc(x.product.name) + '</div><div class="pmeta">' + MMB.qty(x.qty, 'kg') + ' · ' + t('stock.avgCost') + ' ' + MMB.money(x.avg) + '</div></div><div class="pqty num">' + MMB.money(x.value) + '</div></div>';
        }).join('') : MMB.emptyHTML('package', t('dashboard.noStock'), '')) + '</section>' +
        '</div>';

      // responsive fallback for the two-column mid grid
      const mid = root.querySelector('#dashMid');
      if (mid && window.innerWidth <= 900) mid.style.gridTemplateColumns = '1fr';
      if (MMB.mountUpdateBanner) MMB.mountUpdateBanner(root);

      root.querySelectorAll('[data-action]').forEach(function (b) {
        b.addEventListener('click', function () {
          const a = b.getAttribute('data-action');
          if (a === 'sale') { MMB.openSaleForm && MMB.openSaleForm(); }
          else if (a === 'purchase') { MMB.openPurchaseForm && MMB.openPurchaseForm(); }
          else if (a === 'accounts') { MMB.navigate('accounts'); }
          else if (a === 'stock') { MMB.navigate('stock/out'); }
          else if (a === 'newAccount') { MMB.openAccountForm({}); }
          else if (a === 'adjust') { MMB.openAdjustmentForm && MMB.openAdjustmentForm(); }
          else if (a === 'backup') { if (MMB.downloadBackup) MMB.downloadBackup(); }
        });
      });

      const tabs = root.querySelector('#chartTabs');
      if (tabs) {
        tabs.querySelectorAll('[data-range]').forEach(function (b) {
          b.addEventListener('click', function () {
            chartRange = Number(b.getAttribute('data-range')) === 30 ? 30 : 7;
            tabs.querySelectorAll('button').forEach(function (x) { x.classList.remove('active'); });
            b.classList.add('active');
            const c = root.querySelector('#dashChart');
            if (c) c.innerHTML = MMB.lineChart(series30.slice(-chartRange)) +
              '<div class="chart-legend"><span class="legend-item"><span class="legend-line"></span>' + t('dashboard.sales') + '</span><span class="legend-item"><span class="legend-line gold"></span>' + t('dashboard.profit') + '</span></div>';
          });
        });
      }

      root.querySelectorAll('.activity-row').forEach(function (b) {
        b.addEventListener('click', function () {
          const kind = b.getAttribute('data-act');
          const id = b.getAttribute('data-id');
          if (kind === 'sale' || kind === 'saleReturn') { MMB.navigate('stock/out'); }
          else if (kind === 'purchase') { MMB.navigate('stock/in'); }
          else if (kind === 'entry' && id) { location.hash = '#/account/' + id; }
        });
      });
      root.querySelectorAll('[data-stock]').forEach(function (b) {
        b.addEventListener('click', function () { MMB.navigate('stock/in'); });
      });
      root.querySelectorAll('[data-cust]').forEach(function (b) {
        b.addEventListener('click', function () { location.hash = '#/account/' + b.getAttribute('data-cust'); });
      });

      const updateMid = function () {
        if (mid) mid.style.gridTemplateColumns = window.innerWidth <= 900 ? '1fr' : '1.55fr .9fr';
      };
      window.addEventListener('resize', updateMid, { passive: true });
    }
  };
})();
