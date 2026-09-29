/* ═══════════════════════════════════════════════════════════════
   EngCalc — Engineering Calculator
   Main application logic
   ═══════════════════════════════════════════════════════════════ */
'use strict';

/* ── SAFE MATH ENGINE ──────────────────────────────────────── */
const MathEngine = (() => {
  // Tokeniser
  const TOKEN = {
    NUM: 'NUM', OP: 'OP', LPAREN: 'LPAREN', RPAREN: 'RPAREN',
    FUNC: 'FUNC', CONST: 'CONST', END: 'END'
  };

  const CONSTANTS = {
    π: Math.PI, pi: Math.PI, e: Math.E, phi: (1 + Math.sqrt(5)) / 2,
    φ: (1 + Math.sqrt(5)) / 2, tau: 2 * Math.PI, τ: 2 * Math.PI,
    Inf: Infinity
  };

  function tokenize(expr) {
    const tokens = [];
    let i = 0;
    const src = expr.trim();
    while (i < src.length) {
      // skip spaces
      if (/\s/.test(src[i])) { i++; continue; }
      // Numbers (including scientific notation)
      if (/[0-9.]/.test(src[i])) {
        let num = '';
        while (i < src.length && /[0-9.]/.test(src[i])) num += src[i++];
        if (i < src.length && (src[i] === 'e' || src[i] === 'E')) {
          num += src[i++];
          if (i < src.length && (src[i] === '+' || src[i] === '-')) num += src[i++];
          while (i < src.length && /[0-9]/.test(src[i])) num += src[i++];
        }
        tokens.push({ type: TOKEN.NUM, val: parseFloat(num) });
        continue;
      }
      // Hex literal 0x...
      if (src[i] === '0' && i+1 < src.length && src[i+1] === 'x') {
        let h = '0x'; i += 2;
        while (i < src.length && /[0-9a-fA-F]/.test(src[i])) h += src[i++];
        tokens.push({ type: TOKEN.NUM, val: parseInt(h, 16) });
        continue;
      }
      // Identifiers (functions, constants)
      if (/[a-zA-Zπφτ_]/.test(src[i])) {
        let id = '';
        while (i < src.length && /[a-zA-Z0-9πφτ_]/.test(src[i])) id += src[i++];
        if (CONSTANTS[id] !== undefined) {
          tokens.push({ type: TOKEN.NUM, val: CONSTANTS[id] });
        } else {
          tokens.push({ type: TOKEN.FUNC, val: id });
        }
        continue;
      }
      // Operators & parens
      if (src[i] === '(') { tokens.push({ type: TOKEN.LPAREN }); i++; continue; }
      if (src[i] === ')') { tokens.push({ type: TOKEN.RPAREN }); i++; continue; }
      if ('+-*/^%!'.includes(src[i])) { tokens.push({ type: TOKEN.OP, val: src[i] }); i++; continue; }
      // Multiplication implicit (handled in parser)
      throw new Error(`Unknown character: ${src[i]}`);
    }
    tokens.push({ type: TOKEN.END });
    return tokens;
  }

  // Recursive-descent parser with proper precedence
  // expr -> term ((+|-) term)*
  // term -> factor ((*|/|%) factor)*
  // factor -> unary (^ factor)?  (right-assoc)
  // unary -> -? postfix
  // postfix -> primary (!)*
  // primary -> num | func(expr) | (expr)

  let _tokens, _pos, _angleMode;

  function peek() { return _tokens[_pos]; }
  function consume() { return _tokens[_pos++]; }
  function expect(type) {
    const t = consume();
    if (t.type !== type) throw new Error(`Expected ${type}`);
    return t;
  }

  function toRad(v) {
    if (_angleMode === 'deg')  return v * Math.PI / 180;
    if (_angleMode === 'grad') return v * Math.PI / 200;
    return v;
  }
  function fromRad(v) {
    if (_angleMode === 'deg')  return v * 180 / Math.PI;
    if (_angleMode === 'grad') return v * 200 / Math.PI;
    return v;
  }

  function factorial(n) {
    n = Math.round(n);
    if (n < 0) throw new Error('Factorial of negative');
    if (n > 170) throw new Error('Factorial too large');
    if (n === 0 || n === 1) return 1;
    let r = 1;
    for (let i = 2; i <= n; i++) r *= i;
    return r;
  }

  function callFunc(name, arg) {
    switch (name) {
      case 'sin':   return Math.sin(toRad(arg));
      case 'cos':   return Math.cos(toRad(arg));
      case 'tan': {
        const r = toRad(arg);
        const c = Math.cos(r);
        if (Math.abs(c) < 1e-14) throw new Error('tan undefined');
        return Math.tan(r);
      }
      case 'asin':  { const v = Math.asin(arg); return fromRad(v); }
      case 'acos':  { const v = Math.acos(arg); return fromRad(v); }
      case 'atan':  { const v = Math.atan(arg); return fromRad(v); }
      case 'atan2': throw new Error('Use atan2(y,x) via bitwise tools');
      case 'sinh':  return Math.sinh(arg);
      case 'cosh':  return Math.cosh(arg);
      case 'tanh':  return Math.tanh(arg);
      case 'asinh': return Math.asinh(arg);
      case 'acosh': return Math.acosh(arg);
      case 'atanh': return Math.atanh(arg);
      case 'log':   if (arg <= 0) throw new Error('log of non-positive'); return Math.log10(arg);
      case 'log2':  if (arg <= 0) throw new Error('log2 of non-positive'); return Math.log2(arg);
      case 'ln':    if (arg <= 0) throw new Error('ln of non-positive');  return Math.log(arg);
      case 'exp':   return Math.exp(arg);
      case 'sqrt':  if (arg < 0) throw new Error('√ of negative'); return Math.sqrt(arg);
      case 'cbrt':  return Math.cbrt(arg);
      case 'abs':   return Math.abs(arg);
      case 'ceil':  return Math.ceil(arg);
      case 'floor': return Math.floor(arg);
      case 'round': return Math.round(arg);
      case 'sign':  return Math.sign(arg);
      case 'fact':  return factorial(arg);
      case 'deg':   return arg * 180 / Math.PI;
      case 'rad':   return arg * Math.PI / 180;
      default:      throw new Error(`Unknown function: ${name}`);
    }
  }

  function parsePrimary() {
    const t = peek();
    // Unary minus/plus
    if (t.type === TOKEN.OP && (t.val === '-' || t.val === '+')) {
      consume();
      const v = parseFactor();
      return t.val === '-' ? -v : v;
    }
    if (t.type === TOKEN.NUM) { consume(); return t.val; }
    if (t.type === TOKEN.FUNC) {
      const fname = t.val; consume();
      expect(TOKEN.LPAREN);
      const arg = parseExpr();
      expect(TOKEN.RPAREN);
      return callFunc(fname, arg);
    }
    if (t.type === TOKEN.LPAREN) {
      consume();
      const v = parseExpr();
      expect(TOKEN.RPAREN);
      return v;
    }
    throw new Error('Unexpected token: ' + (t.val || t.type));
  }

  function parsePostfix() {
    let v = parsePrimary();
    while (peek().type === TOKEN.OP && peek().val === '!') {
      consume();
      v = factorial(v);
    }
    return v;
  }

  function parseFactor() {
    const base = parsePostfix();
    if (peek().type === TOKEN.OP && peek().val === '^') {
      consume();
      const exp = parseFactor(); // right-associative
      return Math.pow(base, exp);
    }
    return base;
  }

  function parseTerm() {
    let v = parseFactor();
    while (true) {
      const t = peek();
      if (t.type !== TOKEN.OP || !'*/%'.includes(t.val)) {
        // Implicit multiplication: number followed by func or lparen
        if (t.type === TOKEN.FUNC || t.type === TOKEN.LPAREN) {
          v = v * parseFactor();
          continue;
        }
        break;
      }
      consume();
      const r = parseFactor();
      if (t.val === '*') v *= r;
      else if (t.val === '/') {
        if (r === 0) throw new Error('Cannot divide by zero');
        v /= r;
      }
      else if (t.val === '%') {
        if (r === 0) throw new Error('Modulo by zero');
        v %= r;
      }
    }
    return v;
  }

  function parseExpr() {
    let v = parseTerm();
    while (true) {
      const t = peek();
      if (t.type !== TOKEN.OP || !'+-'.includes(t.val)) break;
      // Check it's not unary in wrong position
      consume();
      const r = parseTerm();
      if (t.val === '+') v += r;
      else v -= r;
    }
    return v;
  }

  function evaluate(expr, angleMode = 'deg') {
    if (!expr || !expr.trim()) return { ok: true, value: 0 };
    // Replace display symbols with parseable equivalents
    const e = expr
      .replace(/×/g, '*')
      .replace(/÷/g, '/')
      .replace(/−/g, '-')
      .replace(/\u2212/g, '-')
      .replace(/²/g, '^2')
      .replace(/³/g, '^3')
      .replace(/√\(/g, 'sqrt(')
      .replace(/√(\d+\.?\d*)/g, 'sqrt($1)');

    try {
      _tokens = tokenize(e);
      _pos = 0;
      _angleMode = angleMode;
      const result = parseExpr();
      if (peek().type !== TOKEN.END) throw new Error('Unexpected token');
      if (!isFinite(result)) {
        if (result === Infinity || result === -Infinity) throw new Error('Result is Infinity');
        throw new Error('Result is not a number');
      }
      return { ok: true, value: result };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  return { evaluate };
})();

/* ── NUMBER FORMATTER ──────────────────────────────────────── */
function formatNumber(n) {
  if (!isFinite(n)) return String(n);
  // Remove floating-point noise
  const fixed15 = parseFloat(n.toPrecision(13));
  // If very large or very small, use exponential
  if (Math.abs(fixed15) >= 1e15 || (Math.abs(fixed15) < 1e-7 && fixed15 !== 0)) {
    return fixed15.toExponential(6).replace(/\.?0+e/, 'e');
  }
  // Round to avoid 0.30000000000000004 etc.
  let s = String(fixed15);
  // Trim trailing zeros after decimal
  if (s.includes('.')) s = s.replace(/\.?0+$/, '');
  return s;
}

/* ── THEME MANAGER ─────────────────────────────────────────── */
const ThemeManager = (() => {
  const KEY = 'engcalc-theme';
  let current;

  function init() {
    const saved = localStorage.getItem(KEY);
    if (saved) {
      current = saved;
    } else {
      current = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    apply(current);
    document.getElementById('themeToggle').addEventListener('click', toggle);
  }

  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    current = theme;
  }

  function toggle() {
    const next = current === 'dark' ? 'light' : 'dark';
    apply(next);
    localStorage.setItem(KEY, next);
  }

  return { init, get: () => current };
})();

/* ── HISTORY MANAGER ───────────────────────────────────────── */
const HistoryManager = (() => {
  const KEY = 'engcalc-history';
  const MAX = 50;
  let items = [];
  let onClickCb = null;

  function init(onClick) {
    onClickCb = onClick;
    items = JSON.parse(localStorage.getItem(KEY) || '[]');
    render();
    document.getElementById('clearHistoryBtn').addEventListener('click', clearAll);
    document.getElementById('historyToggle').addEventListener('click', togglePanel);
    document.getElementById('historyOverlay').addEventListener('click', closePanel);
  }

  function add(expr, result) {
    items.unshift({ expr, result, id: Date.now() });
    if (items.length > MAX) items.pop();
    localStorage.setItem(KEY, JSON.stringify(items));
    render();
  }

  function remove(id) {
    items = items.filter(i => i.id !== id);
    localStorage.setItem(KEY, JSON.stringify(items));
    render();
  }

  function clearAll() {
    items = [];
    localStorage.removeItem(KEY);
    render();
  }

  function render() {
    const list = document.getElementById('historyList');
    if (!items.length) {
      list.innerHTML = '<p class="history-empty">No calculations yet</p>';
      return;
    }
    list.innerHTML = items.map(it => `
      <div class="history-item" data-id="${it.id}" role="button" tabindex="0" aria-label="Reuse ${it.expr} = ${it.result}">
        <div class="hist-expr">${escapeHtml(it.expr)}</div>
        <div class="hist-result">${escapeHtml(it.result)}</div>
        <button class="hist-del" aria-label="Delete history entry" title="Delete">✕</button>
      </div>
    `).join('');

    list.querySelectorAll('.history-item').forEach(el => {
      el.addEventListener('click', e => {
        if (e.target.classList.contains('hist-del')) {
          remove(parseInt(el.dataset.id));
        } else {
          const item = items.find(i => i.id === parseInt(el.dataset.id));
          if (item && onClickCb) onClickCb(item.result);
          if (window.innerWidth <= 768) closePanel();
        }
      });
      el.addEventListener('keydown', e => { if (e.key === 'Enter') el.click(); });
    });
  }

  function togglePanel() {
    const panel = document.getElementById('historyPanel');
    const overlay = document.getElementById('historyOverlay');
    const isOpen = panel.classList.contains('open');
    panel.classList.toggle('open', !isOpen);
    overlay.classList.toggle('visible', !isOpen);
    panel.setAttribute('aria-hidden', isOpen);
  }

  function closePanel() {
    document.getElementById('historyPanel').classList.remove('open');
    document.getElementById('historyOverlay').classList.remove('visible');
  }

  return { init, add };
})();

/* ── TOAST ─────────────────────────────────────────────────── */
function showToast(msg) {
  let el = document.getElementById('toastEl');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toastEl'; el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2000);
}

function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ═══════════════════════════════════════════════════════════════
   CALCULATOR CORE
   ═══════════════════════════════════════════════════════════════ */
const Calculator = (() => {
  let expr = '';
  let lastResult = '';
  let angleMode = 'deg';
  let memory = 0;
  let memSet = false;
  let shifted = false;
  let currentMode = 'basic'; // basic | sci

  // ── State helpers ──────────────────────────────────────────
  function getExpr() { return expr; }
  function setExpr(e) { expr = e; updateDisplay(); }

  function updateDisplay() {
    const exprEl   = document.getElementById('exprDisplay');
    const resultEl = document.getElementById('resultDisplay');
    const memEl    = document.getElementById('memoryDisplay');

    exprEl.textContent = expr || '0';
    exprEl.classList.toggle('shrink', expr.length > 22);

    // Live preview
    if (expr && expr !== lastResult) {
      const res = MathEngine.evaluate(expr, angleMode);
      if (res.ok && String(res.value) !== expr) {
        const fmt = formatNumber(res.value);
        resultEl.textContent = fmt;
        resultEl.classList.remove('error');
      } else if (!res.ok && expr.length > 1) {
        resultEl.textContent = '';
      } else {
        resultEl.textContent = '';
      }
    } else {
      resultEl.textContent = '';
    }

    memEl.textContent = memSet ? `M: ${formatNumber(memory)}` : '';
    memEl.classList.toggle('visible', memSet);
    document.getElementById('angleMode').textContent = angleMode.toUpperCase();
  }

  function appendExpr(s) {
    // If last result was shown and user presses a digit, start fresh
    if (lastResult && expr === lastResult) {
      // If appending an operator, keep the result; if digit, clear
      if (/[0-9.(π]/.test(s)) { expr = ''; }
    }
    // Prevent double operators
    if ('+-*/^%'.includes(s) && '+-*/^%'.includes(expr.slice(-1))) {
      expr = expr.slice(0, -1);
    }
    // Prevent leading operator (except minus)
    if ((expr === '' || expr === '0') && '*/^%'.includes(s)) return;
    if (expr === '0' && /[0-9]/.test(s)) { expr = s; }
    else expr += s;
    lastResult = '';
    updateDisplay();
  }

  function clear(all = false) {
    if (all || expr === '') { expr = ''; lastResult = ''; }
    else { expr = expr.slice(0, -1); }
    updateDisplay();
  }

  function clearAll() {
    expr = ''; lastResult = '';
    document.getElementById('resultDisplay').textContent = '';
    document.getElementById('resultDisplay').classList.remove('error');
    updateDisplay();
  }

  function calculate() {
    if (!expr) return;
    const res = MathEngine.evaluate(expr, angleMode);
    const resultEl = document.getElementById('resultDisplay');
    if (res.ok) {
      const fmt = formatNumber(res.value);
      HistoryManager.add(expr, fmt);
      resultEl.textContent = fmt;
      resultEl.classList.remove('error');
      expr = fmt;
      lastResult = fmt;
    } else {
      resultEl.textContent = res.error;
      resultEl.classList.add('error');
      lastResult = '';
    }
    document.getElementById('exprDisplay').textContent = expr || '0';
  }

  function percentage() {
    const res = MathEngine.evaluate(expr, angleMode);
    if (res.ok) {
      const fmt = formatNumber(res.value / 100);
      expr = fmt; lastResult = '';
      updateDisplay();
    }
  }

  function negate() {
    if (!expr) return;
    if (expr.startsWith('-')) { expr = expr.slice(1); }
    else { expr = '-' + expr; }
    lastResult = '';
    updateDisplay();
  }

  // Memory
  function memStore(op) {
    const cur = parseFloat(expr) || (lastResult ? parseFloat(lastResult) : 0);
    if (op === 'mc') { memory = 0; memSet = false; }
    else if (op === 'mr') {
      expr = formatNumber(memory);
      lastResult = '';
    }
    else if (op === 'm+') { memory += cur; memSet = true; }
    else if (op === 'm-') { memory -= cur; memSet = true; }
    updateDisplay();
  }

  // Scientific functions
  function applySci(fn) {
    const res = MathEngine.evaluate(expr || '0', angleMode);
    const curVal = res.ok ? res.value : 0;

    switch (fn) {
      case 'sin':   expr = `sin(${expr || '0'})`; break;
      case 'cos':   expr = `cos(${expr || '0'})`; break;
      case 'tan':   expr = `tan(${expr || '0'})`; break;
      case 'asin':  expr = `asin(${expr || '0'})`; break;
      case 'acos':  expr = `acos(${expr || '0'})`; break;
      case 'atan':  expr = `atan(${expr || '0'})`; break;
      case 'sinh':  expr = `sinh(${expr || '0'})`; break;
      case 'cosh':  expr = `cosh(${expr || '0'})`; break;
      case 'tanh':  expr = `tanh(${expr || '0'})`; break;
      case 'asinh': expr = `asinh(${expr || '0'})`; break;
      case 'acosh': expr = `acosh(${expr || '0'})`; break;
      case 'atanh': expr = `atanh(${expr || '0'})`; break;
      case 'log':   expr = `log(${expr || '0'})`; break;
      case 'ln':    expr = `ln(${expr || '0'})`; break;
      case 'log2':  expr = `log2(${expr || '0'})`; break;
      case 'sqrt':  expr = `sqrt(${expr || '0'})`; break;
      case 'cbrt':  expr = `cbrt(${expr || '0'})`; break;
      case 'x2':    expr = `(${expr || '0'})^2`; break;
      case 'x3':    expr = `(${expr || '0'})^3`; break;
      case 'exp':   expr = `exp(${expr || '0'})`; break;
      case '10x':   expr = `10^(${expr || '0'})`; break;
      case 'inv':   expr = `1/(${expr || '0'})`; break;
      case 'fact':  expr = `${expr || '0'}!`; break;
      case 'abs':   expr = `abs(${expr || '0'})`; break;
      case 'pow':   expr += '^'; break;
      case 'nrt':   expr += '^(1/'; break; // e.g. 8^(1/3))
      case 'pi':    appendExpr('π'); return;
      case 'e':     appendExpr('e'); return;
      case 'phi':   appendExpr('φ'); return;
      case 'mod':   appendExpr('%'); return;
      case 'ee':    appendExpr('e'); return; // scientific notation base
      default: return;
    }
    lastResult = '';
    updateDisplay();
  }

  // Angle mode
  function setAngleMode(m) {
    angleMode = m;
    document.querySelectorAll('.angle-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.angle === m);
    });
    updateDisplay();
  }

  // Shift
  function toggleShift() {
    shifted = !shifted;
    document.getElementById('shiftBtn').classList.toggle('active', shifted);
    buildButtons(); // rebuild with shifted labels
  }

  // ── BUTTON DEFINITIONS ─────────────────────────────────────
  const BASIC_BUTTONS = [
    // row 1: memory
    { label:'MC', cls:'mem', action:()=>memStore('mc'), tip:'Memory Clear' },
    { label:'MR', cls:'mem', action:()=>memStore('mr'), tip:'Memory Recall' },
    { label:'M+', cls:'mem', action:()=>memStore('m+'), tip:'Memory Add' },
    { label:'M-', cls:'mem', action:()=>memStore('m-'), tip:'Memory Subtract' },
    // row 2
    { label:'(',  cls:'fn',  action:()=>appendExpr('(') },
    { label:')',  cls:'fn',  action:()=>appendExpr(')') },
    { label:'%',  cls:'fn',  action:percentage,          tip:'Percent' },
    { label:'⌫',  cls:'clr', action:()=>clear(false),   tip:'Backspace', key:'Backspace' },
    // row 3
    { label:'AC', cls:'clr', action:clearAll,            tip:'All Clear', key:'Escape' },
    { label:'+/-',cls:'fn',  action:negate,              tip:'Toggle sign' },
    { label:'÷',  cls:'op',  action:()=>appendExpr('/'), key:'/' },
    { label:'×',  cls:'op',  action:()=>appendExpr('*'), key:'*' },
    // row 4
    { label:'7',  cls:'num', action:()=>appendExpr('7'), key:'7' },
    { label:'8',  cls:'num', action:()=>appendExpr('8'), key:'8' },
    { label:'9',  cls:'num', action:()=>appendExpr('9'), key:'9' },
    { label:'−',  cls:'op',  action:()=>appendExpr('-'), key:'-' },
    // row 5
    { label:'4',  cls:'num', action:()=>appendExpr('4'), key:'4' },
    { label:'5',  cls:'num', action:()=>appendExpr('5'), key:'5' },
    { label:'6',  cls:'num', action:()=>appendExpr('6'), key:'6' },
    { label:'+',  cls:'op',  action:()=>appendExpr('+'), key:'+' },
    // row 6
    { label:'1',  cls:'num', action:()=>appendExpr('1'), key:'1' },
    { label:'2',  cls:'num', action:()=>appendExpr('2'), key:'2' },
    { label:'3',  cls:'num', action:()=>appendExpr('3'), key:'3' },
    { label:'=',  cls:'eq span2', rows:2, action:calculate, key:'Enter', keyAlt:'=' },
    // row 7
    { label:'0',  cls:'num span2', action:()=>appendExpr('0'), key:'0' },
    { label:'.',  cls:'num', action:()=>appendExpr('.'), key:'.' },
  ];

  function getSciButtons() {
    const s = shifted;
    return [
      // row 1 — trig
      { label: s?'asin':'sin',  cls:'fn', action:()=>applySci(s?'asin':'sin'),  tip: s?'Inverse sine':'Sine' },
      { label: s?'acos':'cos',  cls:'fn', action:()=>applySci(s?'acos':'cos'),  tip: s?'Inverse cosine':'Cosine' },
      { label: s?'atan':'tan',  cls:'fn', action:()=>applySci(s?'atan':'tan'),  tip: s?'Inverse tangent':'Tangent' },
      { label: s?'asinh':'sinh',cls:'fn', action:()=>applySci(s?'asinh':'sinh'),tip: s?'Inverse hyperbolic sine':'Hyperbolic sine' },
      { label: s?'acosh':'cosh',cls:'fn', action:()=>applySci(s?'acosh':'cosh'),tip: s?'Inverse hyperbolic cosine':'Hyperbolic cosine' },
      { label: s?'atanh':'tanh',cls:'fn', action:()=>applySci(s?'atanh':'tanh'),tip: s?'Inverse hyperbolic tangent':'Hyperbolic tangent' },
      // row 2 — power/log
      { label: s?'10ˣ':'log',   cls:'fn', action:()=>applySci(s?'10x':'log'),   tip: s?'10 to the power x':'Log base 10' },
      { label: s?'eˣ':'ln',    cls:'fn', action:()=>applySci(s?'exp':'ln'),    tip: s?'e to the power x':'Natural log' },
      { label: s?'log₂':'√',   cls:'fn', action:()=>applySci(s?'log2':'sqrt'), tip: s?'Log base 2':'Square root' },
      { label: s?'ⁿ√':'x²',   cls:'fn', action:()=>applySci(s?'nrt':'x2'),    tip: s?'nth root (x^(1/n))':'x squared' },
      { label: s?'xʸ':'x³',   cls:'fn', action:()=>applySci(s?'pow':'x3'),    tip: s?'x to the power y':'x cubed' },
      { label: 'cbrt',          cls:'fn', action:()=>applySci('cbrt'),           tip:'Cube root' },
      // row 3 — constants / misc
      { label:'π',    cls:'fn', action:()=>applySci('pi'),    tip:'Pi ≈ 3.14159...' },
      { label:'e',    cls:'fn', action:()=>applySci('e'),     tip:'Euler\'s number ≈ 2.71828...' },
      { label:'φ',    cls:'fn', action:()=>applySci('phi'),   tip:'Golden ratio ≈ 1.61803...' },
      { label:'n!',   cls:'fn', action:()=>applySci('fact'),  tip:'Factorial' },
      { label:'|x|',  cls:'fn', action:()=>applySci('abs'),   tip:'Absolute value' },
      { label:'1/x',  cls:'fn', action:()=>applySci('inv'),   tip:'Reciprocal' },
      // row 4: shared with basic
      { label:'(',    cls:'fn',  action:()=>appendExpr('(') },
      { label:')',    cls:'fn',  action:()=>appendExpr(')') },
      { label:'mod',  cls:'fn',  action:()=>applySci('mod'),  tip:'Modulo (%)' },
      { label:'⌫',   cls:'clr', action:()=>clear(false),     tip:'Backspace' },
      // row 5
      { label:'AC',   cls:'clr', action:clearAll },
      { label:'+/-',  cls:'fn',  action:negate },
      { label:'÷',    cls:'op',  action:()=>appendExpr('/') },
      { label:'×',    cls:'op',  action:()=>appendExpr('*') },
      // row 6–8: digits + ops
      { label:'7',    cls:'num', action:()=>appendExpr('7') },
      { label:'8',    cls:'num', action:()=>appendExpr('8') },
      { label:'9',    cls:'num', action:()=>appendExpr('9') },
      { label:'−',    cls:'op',  action:()=>appendExpr('-') },
      { label:'4',    cls:'num', action:()=>appendExpr('4') },
      { label:'5',    cls:'num', action:()=>appendExpr('5') },
      { label:'6',    cls:'num', action:()=>appendExpr('6') },
      { label:'+',    cls:'op',  action:()=>appendExpr('+') },
      { label:'1',    cls:'num', action:()=>appendExpr('1') },
      { label:'2',    cls:'num', action:()=>appendExpr('2') },
      { label:'3',    cls:'num', action:()=>appendExpr('3') },
      { label:'=',    cls:'eq span2', action:calculate },
      { label:'0',    cls:'num span2', action:()=>appendExpr('0') },
      { label:'.',    cls:'num', action:()=>appendExpr('.') },
    ];
  }

  function buildButtons() {
    const grid = document.getElementById('btnGrid');
    const isSci = currentMode === 'sci';
    const buttons = isSci ? getSciButtons() : BASIC_BUTTONS;

    const cols = isSci ? 6 : 4;
    grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

    grid.innerHTML = '';
    buttons.forEach(btn => {
      const el = document.createElement('button');
      el.type = 'button';
      const classes = ['calc-btn', ...btn.cls.split(' ')];
      el.className = classes.join(' ');
      el.innerHTML = btn.label;
      if (btn.tip) el.setAttribute('data-tip', btn.tip);
      if (btn.key)     el.dataset.key = btn.key;
      if (btn.keyAlt)  el.dataset.keyAlt = btn.keyAlt;
      el.setAttribute('aria-label', btn.tip || btn.label);
      el.addEventListener('click', () => {
        el.classList.add('pressed');
        setTimeout(() => el.classList.remove('pressed'), 120);
        btn.action();
      });
      grid.appendChild(el);
    });
  }

  function init() {
    buildButtons();
    updateDisplay();

    // Copy / Paste buttons
    document.getElementById('copyBtn').addEventListener('click', async () => {
      const val = document.getElementById('resultDisplay').textContent || expr;
      if (val) {
        try { await navigator.clipboard.writeText(val); } catch (_) {}
        showToast('Copied!');
      }
    });
    document.getElementById('pasteBtn').addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text && text.length < 200 && /^[\d\s+\-*/()^%.a-zA-Zπφτ!,]+$/.test(text)) {
          expr = text.trim(); lastResult = '';
          updateDisplay();
        }
      } catch (_) { showToast('Paste not available'); }
    });

    // Angle buttons
    document.querySelectorAll('.angle-btn').forEach(btn => {
      btn.addEventListener('click', () => setAngleMode(btn.dataset.angle));
    });

    // Shift button
    document.getElementById('shiftBtn').addEventListener('click', toggleShift);
  }

  function switchMode(mode) {
    currentMode = mode;
    const sciExtras = document.getElementById('sciExtras');
    sciExtras.hidden = mode !== 'sci';
    shifted = false;
    if (document.getElementById('shiftBtn')) {
      document.getElementById('shiftBtn').classList.remove('active');
    }
    buildButtons();
  }

  function loadResult(val) {
    expr = String(val); lastResult = val; updateDisplay();
  }

  return { init, switchMode, loadResult };
})();

/* ═══════════════════════════════════════════════════════════════
   ENGINEERING MODE
   ═══════════════════════════════════════════════════════════════ */
const EngineeringMode = (() => {

  // ── Number Base Converter ──────────────────────────────────
  function buildNumberSystems() {
    return `
    <div class="tool-grid">
      <div class="tool-card">
        <h3><span class="tool-icon">🔢</span> Number Base Converter</h3>
        <div class="tool-row">
          <label>Value</label>
          <input class="tool-input" id="nsInput" placeholder="Enter number" />
        </div>
        <div class="tool-row">
          <label>From base</label>
          <select class="tool-select" id="nsFrom">
            <option value="10">Decimal (10)</option>
            <option value="2">Binary (2)</option>
            <option value="8">Octal (8)</option>
            <option value="16">Hexadecimal (16)</option>
          </select>
        </div>
        <button class="tool-btn primary" onclick="EngineeringMode.convertBase()">Convert</button>
        <div class="numbase-grid" style="margin-top:10px">
          <div class="base-display"><div class="base-label">BIN</div><div class="base-val" id="resBin">—</div></div>
          <div class="base-display"><div class="base-label">OCT</div><div class="base-val" id="resOct">—</div></div>
          <div class="base-display"><div class="base-label">DEC</div><div class="base-val" id="resDec">—</div></div>
          <div class="base-display"><div class="base-label">HEX</div><div class="base-val" id="resHex">—</div></div>
        </div>
      </div>

      <div class="tool-card">
        <h3><span class="tool-icon">⚙</span> Bitwise Operations</h3>
        <div class="tool-row">
          <label>A (dec)</label>
          <input class="tool-input" id="bwA" placeholder="e.g. 12" type="number" />
        </div>
        <div class="tool-row">
          <label>B (dec)</label>
          <input class="tool-input" id="bwB" placeholder="e.g. 10" type="number" />
        </div>
        <div class="bitwise-btns">
          ${['AND','OR','XOR','NOT A','LSHIFT A','RSHIFT A'].map(op=>`<button class="tool-btn" onclick="EngineeringMode.bitwise('${op}')">${op}</button>`).join('')}
        </div>
        <div class="tool-result" id="bwResult"><span class="result-label">Result</span>—</div>
      </div>
    </div>`;
  }

  function convertBase() {
    const val = document.getElementById('nsInput').value.trim();
    const from = parseInt(document.getElementById('nsFrom').value);
    if (!val) return;
    const num = parseInt(val, from);
    if (isNaN(num)) { ['Bin','Oct','Dec','Hex'].forEach(b=>document.getElementById('res'+b).textContent='Invalid'); return; }
    document.getElementById('resBin').textContent = num.toString(2);
    document.getElementById('resOct').textContent = num.toString(8);
    document.getElementById('resDec').textContent = num.toString(10);
    document.getElementById('resHex').textContent = num.toString(16).toUpperCase();
  }

  function bitwise(op) {
    const a = parseInt(document.getElementById('bwA').value) || 0;
    const b = parseInt(document.getElementById('bwB').value) || 0;
    let res, label;
    switch(op) {
      case 'AND':     res = a & b;  label=`${a} AND ${b}`; break;
      case 'OR':      res = a | b;  label=`${a} OR ${b}`;  break;
      case 'XOR':     res = a ^ b;  label=`${a} XOR ${b}`; break;
      case 'NOT A':   res = ~a;     label=`NOT ${a}`;       break;
      case 'LSHIFT A':res = a << 1; label=`${a} << 1`;      break;
      case 'RSHIFT A':res = a >> 1; label=`${a} >> 1`;      break;
      default: return;
    }
    document.getElementById('bwResult').innerHTML = `<span class="result-label">${escapeHtml(label)}</span>${res} (0x${(res>>>0).toString(16).toUpperCase()}, 0b${(res>>>0).toString(2)})`;
  }

  // ── Electrical / Ohm's Law ─────────────────────────────────
  function buildElectrical() {
    return `
    <div class="tool-grid">

      <div class="tool-card">
        <h3><span class="tool-icon">⚡</span> Ohm's Law</h3>
        <p style="font-size:0.78rem;color:var(--text-secondary);margin-bottom:10px">Fill two fields, leave one blank to solve for it.</p>
        <div class="tool-row"><label>Voltage (V)</label><input class="tool-input" id="olmV" placeholder="Volts" /></div>
        <div class="tool-row"><label>Current (I)</label><input class="tool-input" id="olmI" placeholder="Amperes" /></div>
        <div class="tool-row"><label>Resistance (R)</label><input class="tool-input" id="olmR" placeholder="Ohms" /></div>
        <button class="tool-btn primary" onclick="EngineeringMode.ohmsLaw()">Solve</button>
        <div class="tool-result" id="olmResult"><span class="result-label">Result</span>—</div>
      </div>

      <div class="tool-card">
        <h3><span class="tool-icon">💡</span> Power Calculator</h3>
        <p style="font-size:0.78rem;color:var(--text-secondary);margin-bottom:10px">P = V×I = I²R = V²/R. Fill two fields.</p>
        <div class="tool-row"><label>Power (P)</label><input class="tool-input" id="pwrP" placeholder="Watts" /></div>
        <div class="tool-row"><label>Voltage (V)</label><input class="tool-input" id="pwrV" placeholder="Volts" /></div>
        <div class="tool-row"><label>Current (I)</label><input class="tool-input" id="pwrI" placeholder="Amperes" /></div>
        <div class="tool-row"><label>Resistance (R)</label><input class="tool-input" id="pwrR" placeholder="Ohms" /></div>
        <button class="tool-btn primary" onclick="EngineeringMode.powerCalc()">Solve</button>
        <div class="tool-result" id="pwrResult"><span class="result-label">Result</span>—</div>
      </div>

      <div class="tool-card">
        <h3><span class="tool-icon">🔗</span> Resistor Combinations</h3>
        <div class="tool-row"><label>R1 (Ω)</label><input class="tool-input" id="rcR1" placeholder="e.g. 100" /></div>
        <div class="tool-row"><label>R2 (Ω)</label><input class="tool-input" id="rcR2" placeholder="e.g. 200" /></div>
        <div class="tool-row"><label>R3 (Ω)</label><input class="tool-input" id="rcR3" placeholder="optional" /></div>
        <div style="display:flex;gap:6px;margin-top:8px">
          <button class="tool-btn" onclick="EngineeringMode.resistors('series')">Series</button>
          <button class="tool-btn" onclick="EngineeringMode.resistors('parallel')">Parallel</button>
        </div>
        <div class="tool-result" id="rcResult"><span class="result-label">Result</span>—</div>
      </div>

      <div class="tool-card">
        <h3><span class="tool-icon">〜</span> Frequency ↔ Wavelength</h3>
        <p style="font-size:0.78rem;color:var(--text-secondary);margin-bottom:10px">λ = c / f &nbsp;|&nbsp; c = 3×10⁸ m/s</p>
        <div class="tool-row"><label>Frequency (Hz)</label><input class="tool-input" id="fwFreq" placeholder="e.g. 1e9" /></div>
        <div class="tool-row"><label>Wavelength (m)</label><input class="tool-input" id="fwWave" placeholder="e.g. 0.3" /></div>
        <div style="display:flex;gap:6px;margin-top:8px">
          <button class="tool-btn" onclick="EngineeringMode.freqWave('f2w')">f → λ</button>
          <button class="tool-btn" onclick="EngineeringMode.freqWave('w2f')">λ → f</button>
        </div>
        <div class="tool-result" id="fwResult"><span class="result-label">Result</span>—</div>
      </div>

    </div>`;
  }

  function ohmsLaw() {
    const V = parseFloat(document.getElementById('olmV').value);
    const I = parseFloat(document.getElementById('olmI').value);
    const R = parseFloat(document.getElementById('olmR').value);
    let msg = '';
    if (isNaN(V) && !isNaN(I) && !isNaN(R)) msg = `V = I × R = ${formatNumber(I*R)} V`;
    else if (isNaN(I) && !isNaN(V) && !isNaN(R)) { if(R===0){msg='Error: R=0';} else msg = `I = V / R = ${formatNumber(V/R)} A`; }
    else if (isNaN(R) && !isNaN(V) && !isNaN(I)) { if(I===0){msg='Error: I=0';} else msg = `R = V / I = ${formatNumber(V/I)} Ω`; }
    else msg = 'Fill exactly two fields';
    document.getElementById('olmResult').innerHTML = `<span class="result-label">Ohm's Law</span>${escapeHtml(msg)}`;
  }

  function powerCalc() {
    const P = parseFloat(document.getElementById('pwrP').value);
    const V = parseFloat(document.getElementById('pwrV').value);
    const I = parseFloat(document.getElementById('pwrI').value);
    const R = parseFloat(document.getElementById('pwrR').value);
    const known = [!isNaN(P), !isNaN(V), !isNaN(I), !isNaN(R)].filter(Boolean).length;
    let msg = '';
    if (known < 2) { msg = 'Fill at least two fields'; }
    else if (!isNaN(V) && !isNaN(I))  msg = `P = ${formatNumber(V*I)} W`;
    else if (!isNaN(P) && !isNaN(V))  msg = `I = P/V = ${formatNumber(P/V)} A`;
    else if (!isNaN(P) && !isNaN(I))  msg = `V = P/I = ${formatNumber(P/I)} V`;
    else if (!isNaN(V) && !isNaN(R) && R>0) msg = `P = V²/R = ${formatNumber(V*V/R)} W`;
    else if (!isNaN(I) && !isNaN(R))  msg = `P = I²×R = ${formatNumber(I*I*R)} W`;
    else msg = 'Cannot solve with these fields';
    document.getElementById('pwrResult').innerHTML = `<span class="result-label">Power</span>${escapeHtml(msg)}`;
  }

  function resistors(type) {
    const vals = [
      parseFloat(document.getElementById('rcR1').value),
      parseFloat(document.getElementById('rcR2').value),
      parseFloat(document.getElementById('rcR3').value)
    ].filter(v => !isNaN(v) && v > 0);
    if (vals.length < 2) { document.getElementById('rcResult').innerHTML = `<span class="result-label">Result</span>Fill at least 2 resistors`; return; }
    let res;
    if (type === 'series') {
      res = vals.reduce((a,b) => a+b, 0);
      document.getElementById('rcResult').innerHTML = `<span class="result-label">Series</span>${formatNumber(res)} Ω`;
    } else {
      res = 1 / vals.reduce((a,b) => a + 1/b, 0);
      document.getElementById('rcResult').innerHTML = `<span class="result-label">Parallel</span>${formatNumber(res)} Ω`;
    }
  }

  function freqWave(dir) {
    const C = 3e8;
    if (dir === 'f2w') {
      const f = parseFloat(document.getElementById('fwFreq').value);
      if (isNaN(f)||f<=0) { document.getElementById('fwResult').innerHTML=`<span class="result-label">Error</span>Invalid frequency`; return; }
      document.getElementById('fwResult').innerHTML = `<span class="result-label">Wavelength</span>${formatNumber(C/f)} m`;
    } else {
      const w = parseFloat(document.getElementById('fwWave').value);
      if (isNaN(w)||w<=0) { document.getElementById('fwResult').innerHTML=`<span class="result-label">Error</span>Invalid wavelength`; return; }
      document.getElementById('fwResult').innerHTML = `<span class="result-label">Frequency</span>${formatNumber(C/w)} Hz`;
    }
  }

  // ── Unit Conversions ───────────────────────────────────────
  const UNITS = {
    Length:   { m:1, km:1e3, cm:0.01, mm:1e-3, mi:1609.344, ft:0.3048, 'in':0.0254, yd:0.9144, nm:1e-9 },
    Mass:     { kg:1, g:1e-3, mg:1e-6, lb:0.453592, oz:0.028349, t:1000, 'short ton':907.185 },
    Temperature: null, // special
    Time:     { s:1, ms:1e-3, min:60, hr:3600, day:86400, week:604800, month:2592000, year:31536000 },
    Area:     { m2:1, km2:1e6, cm2:1e-4, mm2:1e-6, ft2:0.0929, in2:0.000645, acre:4046.86, ha:1e4 },
    Volume:   { m3:1, L:1e-3, mL:1e-6, ft3:0.028316, gal:0.003785, qt:9.46353e-4, cup:2.36588e-4, 'fl oz':2.95735e-5 },
    Speed:    { 'km/h':1, 'm/s':3.6, mph:1.60934, knot:1.852, 'ft/s':1.09728 },
    Pressure: { Pa:1, kPa:1e3, MPa:1e6, bar:1e5, psi:6894.76, atm:101325, mmHg:133.322, torr:133.322 },
    Energy:   { J:1, kJ:1e3, MJ:1e6, cal:4.184, kcal:4184, Wh:3600, kWh:3.6e6, BTU:1055.06, eV:1.602e-19 },
    Power:    { W:1, kW:1e3, MW:1e6, hp:745.7, BTU_hr:0.29307 },
    Frequency:{ Hz:1, kHz:1e3, MHz:1e6, GHz:1e9, rpm:1/60 },
    Data:     { bit:1, byte:8, KB:8192, MB:8388608, GB:8589934592, TB:8796093022208 },
  };

  function buildUnits() {
    const cats = Object.keys(UNITS);
    const opts = cats.map((c,i) => `<button class="eng-tab${i===0?' active':''}" onclick="EngineeringMode.selectUnit('${c}',this)">${c}</button>`).join('');
    return `
    <div class="eng-tabs" id="unitCatTabs">${opts}</div>
    <div id="unitPanel" class="tool-card">
      ${buildUnitPanel(cats[0])}
    </div>`;
  }

  function buildUnitPanel(cat) {
    if (cat === 'Temperature') {
      return `
      <h3><span class="tool-icon">🌡</span> Temperature Conversion</h3>
      <div class="tool-row"><label>Value</label><input class="tool-input" id="ucVal" type="number" placeholder="Value" /></div>
      <div class="tool-row">
        <label>From</label>
        <select class="tool-select" id="ucFrom"><option>°C</option><option>°F</option><option>K</option><option>°R</option></select>
        <label style="min-width:auto">To</label>
        <select class="tool-select" id="ucTo"><option>°F</option><option>°C</option><option>K</option><option>°R</option></select>
      </div>
      <button class="tool-btn primary" onclick="EngineeringMode.convertTemp()">Convert</button>
      <div class="tool-result" id="ucResult"><span class="result-label">Result</span>—</div>`;
    }
    const units = Object.keys(UNITS[cat]);
    const optHtml = units.map(u => `<option value="${u}">${u}</option>`).join('');
    const icon = {Length:'📏',Mass:'⚖',Time:'⏱',Area:'⬜',Volume:'🧊',Speed:'💨',Pressure:'🌪',Energy:'⚡',Power:'💡',Frequency:'〜',Data:'💾'}[cat] || '📐';
    return `
    <h3><span class="tool-icon">${icon}</span> ${cat} Conversion</h3>
    <div class="tool-row">
      <input class="tool-input" id="ucVal" type="number" placeholder="Value" style="flex:2" />
      <select class="tool-select" id="ucFrom">${optHtml}</select>
      <span style="color:var(--text-secondary)">→</span>
      <select class="tool-select" id="ucTo">${optHtml}</select>
    </div>
    <button class="tool-btn primary" onclick="EngineeringMode.convertUnit('${cat}')">Convert</button>
    <div class="tool-result" id="ucResult"><span class="result-label">Result</span>—</div>`;
  }

  function selectUnit(cat, btn) {
    document.querySelectorAll('#unitCatTabs .eng-tab').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('unitPanel').innerHTML = buildUnitPanel(cat);
  }

  function convertUnit(cat) {
    const val = parseFloat(document.getElementById('ucVal').value);
    const from = document.getElementById('ucFrom').value;
    const to   = document.getElementById('ucTo').value;
    if (isNaN(val)) { document.getElementById('ucResult').innerHTML=`<span class="result-label">Error</span>Invalid value`; return; }
    const fac = UNITS[cat];
    const result = val * fac[from] / fac[to];
    document.getElementById('ucResult').innerHTML = `<span class="result-label">${val} ${escapeHtml(from)} =</span>${formatNumber(result)} ${escapeHtml(to)}`;
  }

  function convertTemp() {
    const val = parseFloat(document.getElementById('ucVal').value);
    const from = document.getElementById('ucFrom').value;
    const to   = document.getElementById('ucTo').value;
    if (isNaN(val)) { document.getElementById('ucResult').innerHTML=`<span class="result-label">Error</span>Invalid value`; return; }
    // convert to Kelvin first
    let K;
    switch(from) {
      case '°C': K = val + 273.15; break;
      case '°F': K = (val - 32) * 5/9 + 273.15; break;
      case 'K':  K = val; break;
      case '°R': K = val * 5/9; break;
    }
    let res;
    switch(to) {
      case '°C': res = K - 273.15; break;
      case '°F': res = (K - 273.15) * 9/5 + 32; break;
      case 'K':  res = K; break;
      case '°R': res = K * 9/5; break;
    }
    document.getElementById('ucResult').innerHTML = `<span class="result-label">${val} ${escapeHtml(from)} =</span>${formatNumber(res)} ${escapeHtml(to)}`;
  }

  // ── Init ───────────────────────────────────────────────────
  function init() {
    const engContent = document.getElementById('engContent');
    engContent.innerHTML = `
    <div class="eng-tabs" id="engMainTabs">
      <button class="eng-tab active" data-panel="numSys">Number Systems</button>
      <button class="eng-tab" data-panel="electrical">Electrical</button>
      <button class="eng-tab" data-panel="units">Unit Conversion</button>
    </div>
    <div id="engNumSys" class="eng-panel active">${buildNumberSystems()}</div>
    <div id="engElectrical" class="eng-panel">${buildElectrical()}</div>
    <div id="engUnits" class="eng-panel">${buildUnits()}</div>`;

    document.getElementById('engMainTabs').addEventListener('click', e => {
      const btn = e.target.closest('.eng-tab[data-panel]');
      if (!btn) return;
      document.querySelectorAll('#engMainTabs .eng-tab').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('#engContent .eng-panel').forEach(p=>p.classList.remove('active'));
      document.getElementById('eng'+btn.dataset.panel.charAt(0).toUpperCase()+btn.dataset.panel.slice(1)).classList.add('active');
    });
  }

  return { init, convertBase, bitwise, ohmsLaw, powerCalc, resistors, freqWave, convertUnit, convertTemp, selectUnit };
})();

// Expose for onclick handlers
window.EngineeringMode = EngineeringMode;

/* ═══════════════════════════════════════════════════════════════
   ENGINEERING TOOLKIT
   ═══════════════════════════════════════════════════════════════ */
const Toolkit = (() => {

  function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }
  function lcm(a, b) { return Math.abs(a * b) / gcd(a, b); }

  function isPrime(n) {
    if (n < 2) return false;
    if (n === 2) return true;
    if (n % 2 === 0) return false;
    for (let i = 3; i <= Math.sqrt(n); i += 2) if (n % i === 0) return false;
    return true;
  }

  function factorial(n) {
    n = Math.round(n);
    if (n < 0) return 'undefined';
    if (n > 170) return 'Overflow';
    let r = 1n; for (let i = 2n; i <= BigInt(n); i++) r *= i;
    return r.toString();
  }

  function nPr(n, r) {
    if (r > n) return 0;
    let res = 1;
    for (let i = 0; i < r; i++) res *= (n - i);
    return res;
  }

  function nCr(n, r) {
    if (r > n) return 0;
    if (r === 0 || r === n) return 1;
    r = Math.min(r, n - r);
    let res = 1;
    for (let i = 0; i < r; i++) res = res * (n - i) / (i + 1);
    return Math.round(res);
  }

  function statistics(nums) {
    const n = nums.length;
    if (!n) return null;
    const sorted = [...nums].sort((a,b) => a-b);
    const sum = nums.reduce((a,b)=>a+b, 0);
    const mean = sum / n;
    const median = n % 2 === 0 ? (sorted[n/2-1] + sorted[n/2]) / 2 : sorted[Math.floor(n/2)];
    const freq = {}; nums.forEach(x => freq[x] = (freq[x]||0)+1);
    const maxF = Math.max(...Object.values(freq));
    const mode = Object.keys(freq).filter(k=>freq[k]===maxF).join(', ');
    const variance = nums.reduce((a,x) => a + (x-mean)**2, 0) / n;
    const stddev = Math.sqrt(variance);
    return { n, sum, mean, median, mode, min:sorted[0], max:sorted[n-1], range:sorted[n-1]-sorted[0], variance, stddev };
  }

  function det2(a,b,c,d) { return a*d - b*c; }
  function det3(m) {
    return m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1])
          -m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0])
          +m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0]);
  }
  function matMul(A, B) {
    const rows = A.length, cols = B[0].length, inner = B.length;
    return Array.from({length:rows}, (_,i) =>
      Array.from({length:cols}, (_,j) =>
        Array.from({length:inner}, (_,k) => A[i][k]*B[k][j]).reduce((a,b)=>a+b,0)));
  }
  function matAdd(A,B,sign=1) { return A.map((r,i)=>r.map((v,j)=>v+sign*B[i][j])); }
  function matTranspose(A) { return A[0].map((_,j)=>A.map(r=>r[j])); }

  function getMatrix(prefix, rows, cols) {
    const m = [];
    for (let i = 0; i < rows; i++) {
      const r = [];
      for (let j = 0; j < cols; j++) {
        const v = parseFloat(document.getElementById(`${prefix}_${i}_${j}`)?.value) || 0;
        r.push(v);
      }
      m.push(r);
    }
    return m;
  }

  function matInputHTML(id, rows, cols, label) {
    let html = `<p style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:4px">${label}</p><div class="matrix-wrap"><table class="matrix-table">`;
    for (let i = 0; i < rows; i++) {
      html += '<tr>';
      for (let j = 0; j < cols; j++) {
        html += `<td><input type="number" id="${id}_${i}_${j}" placeholder="0" /></td>`;
      }
      html += '</tr>';
    }
    return html + '</table></div>';
  }

  function buildHTML() {
    return `
    <div class="toolkit-tabs" id="tkTabs">
      <button class="toolkit-tab active" data-tk="quadratic">Quadratic</button>
      <button class="toolkit-tab" data-tk="stats">Statistics</button>
      <button class="toolkit-tab" data-tk="matrix">Matrix</button>
      <button class="toolkit-tab" data-tk="number">Number Theory</button>
      <button class="toolkit-tab" data-tk="comb">Combinatorics</button>
      <button class="toolkit-tab" data-tk="misc">Misc</button>
    </div>

    <!-- Quadratic -->
    <div class="toolkit-panel active" id="tk-quadratic">
      <div class="tool-grid">
        <div class="tool-card">
          <h3><span class="tool-icon">📈</span> Quadratic Equation Solver</h3>
          <p style="font-size:0.78rem;color:var(--text-secondary);margin-bottom:10px">ax² + bx + c = 0</p>
          <div class="tool-row"><label>a</label><input class="tool-input" id="qA" type="number" placeholder="1" /></div>
          <div class="tool-row"><label>b</label><input class="tool-input" id="qB" type="number" placeholder="0" /></div>
          <div class="tool-row"><label>c</label><input class="tool-input" id="qC" type="number" placeholder="0" /></div>
          <button class="tool-btn primary" onclick="Toolkit.solveQuadratic()">Solve</button>
          <div class="tool-result" id="qResult"><span class="result-label">Roots</span>—</div>
        </div>
        <div class="tool-card">
          <h3><span class="tool-icon">📊</span> Percentage Calculator</h3>
          <div class="tool-row"><label>Value</label><input class="tool-input" id="pcVal" type="number" placeholder="e.g. 250" /></div>
          <div class="tool-row"><label>Percent</label><input class="tool-input" id="pcPct" type="number" placeholder="e.g. 15" /></div>
          <button class="tool-btn primary" style="margin-bottom:6px" onclick="Toolkit.percentCalc('pct')">X% of Y</button>
          <button class="tool-btn" onclick="Toolkit.percentCalc('what')">X is what % of Y</button>
          <button class="tool-btn" style="margin-top:6px" onclick="Toolkit.percentCalc('change')">% Change (old→new)</button>
          <div class="tool-result" id="pcResult"><span class="result-label">Result</span>—</div>
        </div>
      </div>
    </div>

    <!-- Statistics -->
    <div class="toolkit-panel" id="tk-stats">
      <div class="tool-card" style="max-width:600px">
        <h3><span class="tool-icon">📉</span> Statistics Calculator</h3>
        <p style="font-size:0.78rem;color:var(--text-secondary);margin-bottom:8px">Enter comma-separated numbers</p>
        <textarea class="tool-input" id="statsInput" rows="3" placeholder="e.g. 2, 4, 4, 4, 5, 5, 7, 9" style="width:100%;resize:vertical"></textarea>
        <button class="tool-btn primary" style="margin-top:8px" onclick="Toolkit.calcStats()">Calculate</button>
        <div id="statsOutput" class="stats-output"></div>
      </div>
    </div>

    <!-- Matrix -->
    <div class="toolkit-panel" id="tk-matrix">
      <div class="tool-grid">
        <div class="tool-card">
          <h3><span class="tool-icon">🔲</span> 2×2 Matrix Operations</h3>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:10px">
            <div>${matInputHTML('m2a',2,2,'Matrix A')}</div>
            <div>${matInputHTML('m2b',2,2,'Matrix B')}</div>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:5px">
            <button class="tool-btn" onclick="Toolkit.mat2Op('add')">A+B</button>
            <button class="tool-btn" onclick="Toolkit.mat2Op('sub')">A−B</button>
            <button class="tool-btn" onclick="Toolkit.mat2Op('mul')">A×B</button>
            <button class="tool-btn" onclick="Toolkit.mat2Op('detA')">det(A)</button>
            <button class="tool-btn" onclick="Toolkit.mat2Op('transA')">Aᵀ</button>
          </div>
          <div class="tool-result" id="m2Result"><span class="result-label">Result</span>—</div>
        </div>
        <div class="tool-card">
          <h3><span class="tool-icon">🔳</span> 3×3 Matrix Operations</h3>
          ${matInputHTML('m3a',3,3,'Matrix A')}
          <div style="margin-top:8px">${matInputHTML('m3b',3,3,'Matrix B')}</div>
          <div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:8px">
            <button class="tool-btn" onclick="Toolkit.mat3Op('detA')">det(A)</button>
            <button class="tool-btn" onclick="Toolkit.mat3Op('transA')">Aᵀ</button>
            <button class="tool-btn" onclick="Toolkit.mat3Op('add')">A+B</button>
            <button class="tool-btn" onclick="Toolkit.mat3Op('mul')">A×B</button>
          </div>
          <div class="tool-result" id="m3Result"><span class="result-label">Result</span>—</div>
        </div>
      </div>
    </div>

    <!-- Number Theory -->
    <div class="toolkit-panel" id="tk-number">
      <div class="tool-grid">
        <div class="tool-card">
          <h3><span class="tool-icon">🔢</span> GCD / LCM</h3>
          <div class="tool-row"><label>A</label><input class="tool-input" id="gcdA" type="number" placeholder="e.g. 12" /></div>
          <div class="tool-row"><label>B</label><input class="tool-input" id="gcdB" type="number" placeholder="e.g. 8" /></div>
          <div style="display:flex;gap:6px;margin-top:8px">
            <button class="tool-btn primary" onclick="Toolkit.calcGCD()">GCD</button>
            <button class="tool-btn" onclick="Toolkit.calcLCM()">LCM</button>
          </div>
          <div class="tool-result" id="gcdResult"><span class="result-label">Result</span>—</div>
        </div>
        <div class="tool-card">
          <h3><span class="tool-icon">🔍</span> Prime Checker</h3>
          <div class="tool-row"><label>Number</label><input class="tool-input" id="primeN" type="number" placeholder="e.g. 97" /></div>
          <button class="tool-btn primary" onclick="Toolkit.checkPrime()">Check</button>
          <div class="tool-result" id="primeResult"><span class="result-label">Result</span>—</div>
        </div>
        <div class="tool-card">
          <h3><span class="tool-icon">❗</span> Factorial</h3>
          <div class="tool-row"><label>n</label><input class="tool-input" id="factN" type="number" placeholder="e.g. 10" min="0" /></div>
          <button class="tool-btn primary" onclick="Toolkit.calcFactorial()">Calculate n!</button>
          <div class="tool-result" id="factResult"><span class="result-label">Result</span>—</div>
        </div>
      </div>
    </div>

    <!-- Combinatorics -->
    <div class="toolkit-panel" id="tk-comb">
      <div class="tool-grid">
        <div class="tool-card">
          <h3><span class="tool-icon">🎲</span> Permutations & Combinations</h3>
          <div class="tool-row"><label>n</label><input class="tool-input" id="combN" type="number" placeholder="Total items" /></div>
          <div class="tool-row"><label>r</label><input class="tool-input" id="combR" type="number" placeholder="Choose r" /></div>
          <div style="display:flex;gap:6px;margin-top:8px">
            <button class="tool-btn primary" onclick="Toolkit.calcNPR()">nPr (Permutations)</button>
            <button class="tool-btn" onclick="Toolkit.calcNCR()">nCr (Combinations)</button>
          </div>
          <div class="tool-result" id="combResult"><span class="result-label">Result</span>—</div>
        </div>
      </div>
    </div>

    <!-- Misc -->
    <div class="toolkit-panel" id="tk-misc">
      <div class="tool-grid">
        <div class="tool-card">
          <h3><span class="tool-icon">📐</span> Average / Mean</h3>
          <p style="font-size:0.78rem;color:var(--text-secondary);margin-bottom:8px">Comma-separated numbers</p>
          <textarea class="tool-input" id="avgInput" rows="2" placeholder="e.g. 10, 20, 30, 40" style="width:100%"></textarea>
          <button class="tool-btn primary" style="margin-top:8px" onclick="Toolkit.calcAvg()">Calculate</button>
          <div class="tool-result" id="avgResult"><span class="result-label">Result</span>—</div>
        </div>
        <div class="tool-card">
          <h3><span class="tool-icon">↔</span> Binary / Hex Converter</h3>
          <div class="tool-row"><label>Binary</label><input class="tool-input" id="bxBin" placeholder="e.g. 1010" /></div>
          <div class="tool-row"><label>Decimal</label><input class="tool-input" id="bxDec" placeholder="e.g. 10" /></div>
          <div class="tool-row"><label>Hex</label><input class="tool-input" id="bxHex" placeholder="e.g. A" /></div>
          <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:6px">
            <button class="tool-btn" onclick="Toolkit.bxConvert('bin')">From BIN</button>
            <button class="tool-btn" onclick="Toolkit.bxConvert('dec')">From DEC</button>
            <button class="tool-btn" onclick="Toolkit.bxConvert('hex')">From HEX</button>
          </div>
        </div>
      </div>
    </div>`;
  }

  // ── Toolkit Logic ──────────────────────────────────────────
  function solveQuadratic() {
    const a = parseFloat(document.getElementById('qA').value);
    const b = parseFloat(document.getElementById('qB').value);
    const c = parseFloat(document.getElementById('qC').value);
    if (isNaN(a)||isNaN(b)||isNaN(c)||a===0) {
      document.getElementById('qResult').innerHTML = `<span class="result-label">Error</span>a must be non-zero and all fields filled`;
      return;
    }
    const D = b*b - 4*a*c;
    let html;
    if (D > 0) {
      const x1 = (-b + Math.sqrt(D)) / (2*a);
      const x2 = (-b - Math.sqrt(D)) / (2*a);
      html = `<span class="result-label">Two real roots (Δ=${formatNumber(D)})</span>x₁ = ${formatNumber(x1)}<br>x₂ = ${formatNumber(x2)}`;
    } else if (D === 0) {
      html = `<span class="result-label">One repeated root (Δ=0)</span>x = ${formatNumber(-b/(2*a))}`;
    } else {
      const re = -b/(2*a), im = Math.sqrt(-D)/(2*a);
      html = `<span class="result-label">Complex roots (Δ=${formatNumber(D)})</span><span class="quad-result-complex">x₁ = ${formatNumber(re)} + ${formatNumber(im)}i<br>x₂ = ${formatNumber(re)} − ${formatNumber(im)}i</span>`;
    }
    document.getElementById('qResult').innerHTML = html;
  }

  function percentCalc(type) {
    const v = parseFloat(document.getElementById('pcVal').value);
    const p = parseFloat(document.getElementById('pcPct').value);
    let msg = '';
    if (type === 'pct') {
      if (isNaN(v)||isNaN(p)) { msg='Enter both Value and Percent'; }
      else msg = `${p}% of ${v} = ${formatNumber(v*p/100)}`;
    } else if (type === 'what') {
      if (isNaN(v)||isNaN(p)) { msg='Enter Value (X) and Percent field (Y)'; }
      else msg = `${v} is ${formatNumber(v/p*100)}% of ${p}`;
    } else {
      if (isNaN(v)||isNaN(p)) { msg='Enter old value and new value (in percent field)'; }
      else msg = `% change from ${v} to ${p}: ${formatNumber((p-v)/Math.abs(v)*100)}%`;
    }
    document.getElementById('pcResult').innerHTML = `<span class="result-label">Result</span>${escapeHtml(msg)}`;
  }

  function calcStats() {
    const raw = document.getElementById('statsInput').value;
    const nums = raw.split(/[,\s]+/).map(Number).filter(n => !isNaN(n) && String(n).trim() !== '');
    if (!nums.length) { document.getElementById('statsOutput').innerHTML = '<p style="color:var(--text-muted);font-size:0.8rem">No valid numbers found</p>'; return; }
    const s = statistics(nums);
    document.getElementById('statsOutput').innerHTML = `
    <div class="stats-row"><span class="stats-key">Count</span><span class="stats-val">${s.n}</span></div>
    <div class="stats-row"><span class="stats-key">Sum</span><span class="stats-val">${formatNumber(s.sum)}</span></div>
    <div class="stats-row"><span class="stats-key">Mean</span><span class="stats-val">${formatNumber(s.mean)}</span></div>
    <div class="stats-row"><span class="stats-key">Median</span><span class="stats-val">${formatNumber(s.median)}</span></div>
    <div class="stats-row"><span class="stats-key">Mode</span><span class="stats-val">${escapeHtml(s.mode)}</span></div>
    <div class="stats-row"><span class="stats-key">Min</span><span class="stats-val">${formatNumber(s.min)}</span></div>
    <div class="stats-row"><span class="stats-key">Max</span><span class="stats-val">${formatNumber(s.max)}</span></div>
    <div class="stats-row"><span class="stats-key">Range</span><span class="stats-val">${formatNumber(s.range)}</span></div>
    <div class="stats-row"><span class="stats-key">Variance</span><span class="stats-val">${formatNumber(s.variance)}</span></div>
    <div class="stats-row"><span class="stats-key">Std Dev</span><span class="stats-val">${formatNumber(s.stddev)}</span></div>`;
  }

  function mat2Op(op) {
    const A = getMatrix('m2a',2,2), B = getMatrix('m2b',2,2);
    let res, label;
    try {
      if (op==='add') { res = matAdd(A,B);     label='A + B'; }
      else if(op==='sub'){ res=matAdd(A,B,-1); label='A − B'; }
      else if(op==='mul'){ res=matMul(A,B);    label='A × B'; }
      else if(op==='detA'){ document.getElementById('m2Result').innerHTML=`<span class="result-label">det(A)</span>${formatNumber(det2(A[0][0],A[0][1],A[1][0],A[1][1]))}`;return;}
      else if(op==='transA'){ res=matTranspose(A); label='Aᵀ'; }
      const fmt = res.map(r=>r.map(v=>formatNumber(v)).join('  ')).join('\n');
      document.getElementById('m2Result').innerHTML = `<span class="result-label">${label}</span><pre style="font-family:monospace;margin:0">${escapeHtml(fmt)}</pre>`;
    } catch(e){ document.getElementById('m2Result').innerHTML=`<span class="result-label">Error</span>${e.message}`; }
  }

  function mat3Op(op) {
    const A = getMatrix('m3a',3,3), B = getMatrix('m3b',3,3);
    let res, label;
    try {
      if(op==='detA'){ document.getElementById('m3Result').innerHTML=`<span class="result-label">det(A)</span>${formatNumber(det3(A))}`;return;}
      else if(op==='transA'){ res=matTranspose(A); label='Aᵀ'; }
      else if(op==='add'){ res=matAdd(A,B); label='A+B'; }
      else if(op==='mul'){ res=matMul(A,B); label='A×B'; }
      const fmt = res.map(r=>r.map(v=>formatNumber(v)).join('  ')).join('\n');
      document.getElementById('m3Result').innerHTML = `<span class="result-label">${label}</span><pre style="font-family:monospace;margin:0">${escapeHtml(fmt)}</pre>`;
    } catch(e){ document.getElementById('m3Result').innerHTML=`<span class="result-label">Error</span>${e.message}`; }
  }

  function calcGCD() {
    const a=Math.abs(parseInt(document.getElementById('gcdA').value));
    const b=Math.abs(parseInt(document.getElementById('gcdB').value));
    if(isNaN(a)||isNaN(b)){document.getElementById('gcdResult').innerHTML=`<span class="result-label">Error</span>Invalid input`;return;}
    document.getElementById('gcdResult').innerHTML=`<span class="result-label">GCD(${a}, ${b})</span>${gcd(a,b)}`;
  }
  function calcLCM() {
    const a=Math.abs(parseInt(document.getElementById('gcdA').value));
    const b=Math.abs(parseInt(document.getElementById('gcdB').value));
    if(isNaN(a)||isNaN(b)||a===0||b===0){document.getElementById('gcdResult').innerHTML=`<span class="result-label">Error</span>Invalid input`;return;}
    document.getElementById('gcdResult').innerHTML=`<span class="result-label">LCM(${a}, ${b})</span>${lcm(a,b)}`;
  }
  function checkPrime() {
    const n=parseInt(document.getElementById('primeN').value);
    if(isNaN(n)){document.getElementById('primeResult').innerHTML=`<span class="result-label">Error</span>Invalid number`;return;}
    document.getElementById('primeResult').innerHTML=`<span class="result-label">${n}</span>${isPrime(n)?'✓ Is prime':'✗ Not prime'}`;
  }
  function calcFactorial() {
    const n=parseInt(document.getElementById('factN').value);
    if(isNaN(n)||n<0){document.getElementById('factResult').innerHTML=`<span class="result-label">Error</span>Enter a non-negative integer`;return;}
    document.getElementById('factResult').innerHTML=`<span class="result-label">${n}!</span>${factorial(n)}`;
  }
  function calcNPR() {
    const n=parseInt(document.getElementById('combN').value), r=parseInt(document.getElementById('combR').value);
    if(isNaN(n)||isNaN(r)){document.getElementById('combResult').innerHTML=`<span class="result-label">Error</span>Invalid input`;return;}
    document.getElementById('combResult').innerHTML=`<span class="result-label">P(${n},${r})</span>${formatNumber(nPr(n,r))}`;
  }
  function calcNCR() {
    const n=parseInt(document.getElementById('combN').value), r=parseInt(document.getElementById('combR').value);
    if(isNaN(n)||isNaN(r)){document.getElementById('combResult').innerHTML=`<span class="result-label">Error</span>Invalid input`;return;}
    document.getElementById('combResult').innerHTML=`<span class="result-label">C(${n},${r})</span>${formatNumber(nCr(n,r))}`;
  }
  function calcAvg() {
    const raw=document.getElementById('avgInput').value;
    const nums=raw.split(/[,\s]+/).map(Number).filter(n=>!isNaN(n)&&String(n).trim()!=='');
    if(!nums.length){document.getElementById('avgResult').innerHTML=`<span class="result-label">Error</span>No valid numbers`;return;}
    const avg=nums.reduce((a,b)=>a+b,0)/nums.length;
    document.getElementById('avgResult').innerHTML=`<span class="result-label">Mean of ${nums.length} values</span>${formatNumber(avg)}`;
  }
  function bxConvert(from) {
    let dec;
    if(from==='bin'){ dec=parseInt(document.getElementById('bxBin').value,2); }
    else if(from==='dec'){ dec=parseInt(document.getElementById('bxDec').value,10); }
    else { dec=parseInt(document.getElementById('bxHex').value,16); }
    if(isNaN(dec))return;
    document.getElementById('bxBin').value=dec.toString(2);
    document.getElementById('bxDec').value=dec.toString(10);
    document.getElementById('bxHex').value=dec.toString(16).toUpperCase();
  }

  function init() {
    document.getElementById('toolkitContent').innerHTML = buildHTML();
    document.getElementById('tkTabs').addEventListener('click', e => {
      const btn = e.target.closest('.toolkit-tab[data-tk]');
      if (!btn) return;
      document.querySelectorAll('#tkTabs .toolkit-tab').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('#toolkitContent .toolkit-panel').forEach(p=>p.classList.remove('active'));
      document.getElementById('tk-'+btn.dataset.tk).classList.add('active');
    });
  }

  return {
    init, solveQuadratic, percentCalc, calcStats,
    mat2Op, mat3Op, calcGCD, calcLCM, checkPrime, calcFactorial,
    calcNPR, calcNCR, calcAvg, bxConvert
  };
})();

window.Toolkit = Toolkit;

/* ═══════════════════════════════════════════════════════════════
   KEYBOARD SUPPORT
   ═══════════════════════════════════════════════════════════════ */
const KeyboardHandler = (() => {
  const keyMap = {
    '0':'0','1':'1','2':'2','3':'3','4':'4','5':'5','6':'6','7':'7','8':'8','9':'9',
    '.':'.','(':  '(', ')':')',
    '+':'+', '-':'-', '*':'*', '/':'/',
    'Enter':'=', '=':'=',
    'Backspace':'⌫', 'Escape':'AC', '%':'%'
  };

  function flashBtn(label) {
    const btns = document.querySelectorAll('.calc-btn');
    btns.forEach(btn => {
      if (btn.textContent.trim() === label || btn.dataset.key === label || btn.dataset.keyAlt === label) {
        btn.classList.add('kbd-active');
        setTimeout(() => btn.classList.remove('kbd-active'), 140);
      }
    });
  }

  function init() {
    document.addEventListener('keydown', e => {
      // Ignore if focus is in an input/textarea
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      // Prevent page scroll on space/arrow
      if ([' ','ArrowUp','ArrowDown'].includes(e.key)) e.preventDefault();

      const mapped = keyMap[e.key];
      if (!mapped) return;

      e.preventDefault();
      flashBtn(mapped);

      // Find matching button and click
      const btn = [...document.querySelectorAll('.calc-btn')].find(b =>
        b.textContent.trim() === mapped ||
        b.dataset.key === e.key ||
        b.dataset.keyAlt === e.key
      );
      if (btn) { btn.click(); return; }

      // Fallback direct actions
      if (e.key === 'Enter' || e.key === '=') {
        const eq = document.querySelector('.calc-btn.eq');
        if (eq) eq.click();
      }
    });
  }

  return { init };
})();

/* ═══════════════════════════════════════════════════════════════
   MODE SWITCHER
   ═══════════════════════════════════════════════════════════════ */
const ModeSwitcher = (() => {
  function init() {
    document.querySelectorAll('.mode-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.mode-tab').forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-selected', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');

        const mode = btn.dataset.mode;
        const calcSection = document.getElementById('calcSection');
        const engSection  = document.getElementById('engSection');
        const tkSection   = document.getElementById('toolkitSection');

        // Hide all
        calcSection.hidden = true;
        engSection.hidden  = true;
        tkSection.hidden   = true;

        if (mode === 'basic') {
          calcSection.hidden = false;
          Calculator.switchMode('basic');
        } else if (mode === 'sci') {
          calcSection.hidden = false;
          Calculator.switchMode('sci');
        } else if (mode === 'eng') {
          engSection.hidden = false;
        } else if (mode === 'toolkit') {
          tkSection.hidden = false;
        }
      });
    });
  }
  return { init };
})();

/* ═══════════════════════════════════════════════════════════════
   APP INIT
   ═══════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  ThemeManager.init();

  HistoryManager.init(val => {
    Calculator.loadResult(val);
    // Switch to basic/sci mode if we're on eng/toolkit
    const activeMode = document.querySelector('.mode-tab.active')?.dataset.mode;
    if (activeMode !== 'basic' && activeMode !== 'sci') {
      document.querySelector('.mode-tab[data-mode="basic"]').click();
    }
  });

  Calculator.init();
  EngineeringMode.init();
  Toolkit.init();
  ModeSwitcher.init();
  KeyboardHandler.init();

  // Prevent form submit / accidental refresh
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
      // allow Enter in inputs for tool cards (don't block)
    }
  });
});
