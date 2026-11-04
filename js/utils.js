/* ── Utilities ─────────────────────────────────────────────────── */
(function () {
  const MMB = window.MMB = window.MMB || {};

  MMB.uid = function (prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  };

  MMB.round = function (n, d) {
    d = d == null ? 2 : d;
    const f = Math.pow(10, d);
    return Math.round((Number(n) + Number.EPSILON) * f) / f;
  };

  MMB.num = function (v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    if (v == null) return 0;
    const n = parseFloat(String(v).replace(/[,\s٬]/g, '').replace(/[−–—]/g, '-'));
    return isFinite(n) ? n : 0;
  };

  MMB.clamp = function (n, min, max) { return Math.min(max, Math.max(min, n)); };

  MMB.esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  MMB.escRe = function (s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };

  MMB.nf = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
  MMB.nf0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

  MMB.money = function (n, opts) {
    opts = opts || {};
    const v = Number(n) || 0;
    const abs = Math.abs(v);
    const body = (opts.decimals === 2 ? MMB.nf.format(abs) : (abs % 1 === 0 ? MMB.nf0.format(abs) : MMB.nf.format(abs)));
    let prefix = '';
    if (v < 0) prefix = '−';
    else if (opts.sign && v > 0) prefix = '+';
    if (opts.bare) return prefix + body;
    return prefix + 'Rs ' + body;
  };

  MMB.qty = function (n, unit) {
    const v = Number(n) || 0;
    const s = (v % 1 === 0 ? MMB.nf0.format(Math.abs(v)) : MMB.nf.format(Math.abs(v)));
    return (v < 0 ? '−' : '') + s + (unit ? ' ' + unit : '');
  };

  MMB.kg = function (n) { return MMB.qty(n, 'kg'); };

  MMB.pct = function (n, d) { return MMB.round(n, d == null ? 2 : d) + '%'; };

  /* Dates — all stored as YYYY-MM-DD, times as HH:MM */
  MMB.todayISO = function (d) {
    d = d || new Date();
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  };
  MMB.nowHM = function (d) {
    d = d || new Date();
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  };
  MMB.parseISO = function (iso) {
    if (!iso) return new Date(NaN);
    const p = String(iso).split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  };
  MMB.fmtDate = function (iso, short) {
    if (!iso) return '—';
    const d = MMB.parseISO(iso);
    if (isNaN(d)) return String(iso);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    if (short) return dd + '/' + mm;
    return dd + '/' + mm + '/' + yyyy;
  };
  MMB.fmtTime = function (hm) {
    if (!hm) return '';
    const p = String(hm).split(':');
    let h = Number(p[0]), m = p[1] || '00';
    const ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return h + ':' + String(m).padStart(2, '0') + ' ' + ap;
  };
  MMB.fmtDateTime = function (iso, hm) { return MMB.fmtDate(iso) + (hm ? ' · ' + MMB.fmtTime(hm) : ''); };
  MMB.monthKey = function (iso) { return String(iso || '').slice(0, 7); };
  MMB.thisMonthKey = function () { return MMB.monthKey(MMB.todayISO()); };
  MMB.daysAgoISO = function (n) {
    const d = new Date(); d.setDate(d.getDate() - n); return MMB.todayISO(d);
  };
  MMB.addDays = function (iso, n) {
    const d = MMB.parseISO(iso); d.setDate(d.getDate() + n); return MMB.todayISO(d);
  };
  MMB.weekday = function (iso, short) {
    const d = MMB.parseISO(iso);
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const urdu = ['اتوار', 'پیر', 'منگل', 'بدھ', 'جمعرات', 'جمعہ', 'ہفتہ'];
    if (typeof MMB.lang === 'function' && MMB.lang() === 'ur') return urdu[d.getDay()];
    return short ? days[d.getDay()].slice(0, 3) : days[d.getDay()];
  };
  MMB.monthLabel = function (iso) {
    const d = MMB.parseISO(iso + '-01');
    return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  };

  MMB.getInitials = function (name) {
    const s = String(name || '').trim();
    if (!s) return '?';
    const parts = s.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2);
    return (parts[0][0] || '') + (parts[1][0] || '');
  };

  MMB.hashColor = function (str) {
    let h = 0;
    for (let i = 0; i < String(str).length; i++) h = (h * 31 + String(str).charCodeAt(i)) >>> 0;
    return ['', 'gold', 'blue', 'red', 'gray'][h % 5] || '';
  };

  MMB.debounce = function (fn, wait) {
    let t;
    return function () {
      const args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, wait);
    };
  };

  MMB.copy = function (text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy');
        document.body.removeChild(ta); resolve();
      } catch (e) { reject(e); }
    });
  };

  MMB.download = function (filename, content, type) {
    const blob = new Blob([content], { type: type || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1200);
  };

  MMB.csvCell = function (v) {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  MMB.toCSV = function (rows) {
    return '\uFEFF' + rows.map(function (r) { return r.map(MMB.csvCell).join(','); }).join('\r\n');
  };

  MMB.words = (function () {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    function two(n) {
      if (n < 20) return ones[n];
      return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    }
    function three(n) {
      const h = Math.floor(n / 100), r = n % 100;
      return (h ? ones[h] + ' Hundred' + (r ? ' ' : '') : '') + (r ? two(r) : '');
    }
    return function (num) {
      num = Math.round(Math.abs(Number(num) || 0));
      if (!num) return 'Zero';
      const crore = Math.floor(num / 10000000); num %= 10000000;
      const lakh = Math.floor(num / 100000); num %= 100000;
      const thousand = Math.floor(num / 1000); num %= 1000;
      const parts = [];
      if (crore) parts.push(three(crore) + ' Crore');
      if (lakh) parts.push(three(lakh) + ' Lakh');
      if (thousand) parts.push(three(thousand) + ' Thousand');
      if (num) parts.push(three(num));
      return parts.join(' ');
    };
  })();

  MMB.moneyWords = function (n) { return 'Rupees ' + MMB.words(n) + ' only'; };

  MMB.asyncHash = async function (text) {
    try {
      if (window.crypto && crypto.subtle && crypto.subtle.digest) {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
        return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
      }
    } catch (e) { /* file:// fallback */ }
    let h1 = 0x811c9dc5, h2 = 0x1000193;
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
      h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0;
    }
    return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
  };

  MMB.salt = function () {
    const a = new Uint8Array(12);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(a);
    else for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
    return Array.from(a).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  };

  MMB.storageBytes = function () {
    try {
      let total = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        total += (k.length + (localStorage.getItem(k) || '').length) * 2;
      }
      return total;
    } catch (e) { return 0; }
  };
  MMB.bytesLabel = function (b) {
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(1) + ' MB';
  };

  MMB.parseJSON = function (text) {
    try { return JSON.parse(text); } catch (e) { return null; }
  };
})();
