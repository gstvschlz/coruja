// Isolated-world content script: the loop, the solvers and every click and keystroke.
// Answers come from pagestate.js (MAIN world) over window.postMessage.
(() => {
  const T = globalThis.CorujaTyping;
  const L = globalThis.CorujaLabels;
  const SESSION_PATH = /^\/(practice|lesson|legendary)/;

  let S = { ...T.DEFAULT_SETTINGS };
  let enabled = false;
  let mode = 'path';     // path | practice | legendary
  let legendary = false; // mode === 'legendary'
  let status = { state: 'off', sessions: 0, skips: 0, wrong: 0, sessionWrong: 0, sessionSolved: 0, lastStop: '' };
  let busy = false;
  let handledId = null;  // challenge already answered or skipped
  let handledRoot = null; // its element: a "previous mistake" retry reuses the id
  let stuckSkips = 0;    // consecutive stuck skips
  let judged = false;    // feedback for handledId already counted
  let actedAt = 0;       // when the current challenge was answered
  let idleSince = Date.now();

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const pause = (min, max) => sleep(T.between(min, max));
  const norm = (s) => (s || '').toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
  const q = (sel, root = document) => root.querySelector(sel);
  const qa = (sel, root = document) => [...root.querySelectorAll(sel)];
  const log = (...a) => console.log('[coruja]', ...a);

  // ---- state shared with the popup ----
  chrome.storage.local.get(['enabled', 'mode', 'settings', 'status'], (v) => {
    enabled = !!v.enabled;
    mode = v.mode || 'path';
    legendary = mode === 'legendary';
    S = { ...T.DEFAULT_SETTINGS, ...(v.settings || {}) };
    status = { ...status, ...(v.status || {}) };
    log('loaded on', location.pathname, enabled ? '(running)' : '(off)');
    if (enabled) setStatus({ state: 'idle' });
    loop();
  });
  chrome.storage.onChanged.addListener((ch) => {
    if (ch.enabled) enabled = !!ch.enabled.newValue;
    if (ch.mode) { mode = ch.mode.newValue || 'path'; legendary = mode === 'legendary'; }
    if (ch.settings) S = { ...T.DEFAULT_SETTINGS, ...(ch.settings.newValue || {}) };
    if (ch.status && ch.status.newValue) status = { ...status, ...ch.status.newValue };
  });

  function setStatus(patch) {
    Object.assign(status, patch);
    chrome.storage.local.set({ status });
  }

  function stop(reason) {
    enabled = false;
    chrome.storage.local.set({ enabled: false });
    setStatus({ state: 'stopped', lastStop: reason });
    log('stopped:', reason);
  }

  // ---- DOM helpers ----
  const usable = (el) => !!el && !el.disabled && el.getAttribute('aria-disabled') !== 'true' && el.getClientRects().length > 0;
  const textOf = (el) => norm(el.innerText) || norm(el.getAttribute('aria-label'));
  const forbidden = (el) => L.forbidden.some((w) => textOf(el).includes(w));

  function click(el) {
    if (!usable(el) || forbidden(el)) return false;
    el.click();
    idleSince = Date.now();
    return true;
  }

  function byLabel(list, root = document) {
    return qa('button, [role="button"], a', root).find((b) => {
      const t = textOf(b);
      return usable(b) && list.some((l) => t === l || t.startsWith(l + ' '));
    });
  }

  const pageSays = (list) => { const t = norm(document.body.innerText); return list.some((l) => t.includes(l)); };

  let reqSeq = 0;
  function getChallenge() {
    return new Promise((resolve) => {
      const reqId = ++reqSeq;
      const done = (c) => { window.removeEventListener('message', on); resolve(c); };
      const on = (e) => {
        if (e.source === window && e.data && e.data.coruja === 'state' && e.data.reqId === reqId) done(e.data.challenge);
      };
      window.addEventListener('message', on);
      window.postMessage({ coruja: 'get', reqId }, location.origin);
      setTimeout(() => done(null), 1000);
    });
  }

  // One character at a time through the native value setter, so React sees each input event.
  async function typeInto(el, text) {
    setStatus({ state: 'typing' });
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const set = Object.getOwnPropertyDescriptor(proto, 'value').set;
    el.focus();
    if (el.value) { set.call(el, ''); el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContent' })); }
    const chars = [...text];
    const delays = T.keyDelays(text, S);
    let cur = '';
    for (let i = 0; i < chars.length; i++) {
      await sleep(delays[i]);
      cur += chars[i];
      set.call(el, cur);
      el.dispatchEvent(new InputEvent('input', { bubbles: true, data: chars[i], inputType: 'insertText' }));
    }
  }

  // ---- solvers: pick the widget on screen, then the answer field that fits it ----
  const choiceEls = (root) => qa('[data-test="challenge-choice"]', root);
  const tokenEls = (root) => qa('button[data-test$="challenge-tap-token"]', root);
  const tokenText = (b) => norm((q('[data-test="challenge-tap-token-text"]', b) || b).innerText);
  const textBox = (root) => q('textarea, input[data-test="challenge-text-input"]', root);
  const blankBoxes = (root) => qa('input', root).filter((i) => !i.type || i.type === 'text');

  async function clickAll(els) {
    for (const el of els) {
      if (!click(el)) return false;
      await pause(S.clickMin, S.clickMax);
    }
    return true;
  }

  // The word bank is shuffled and can hold both "The" and "the": match the exact text first,
  // then the word embedded in data-test ("The-challenge-tap-token"), lowercase only as a last resort.
  const exactText = (b) => (q('[data-test="challenge-tap-token-text"]', b) || b).innerText.trim();
  function findToken(word, root, used) {
    const free = tokenEls(root).filter((b) => !used.has(b) && usable(b));
    return free.find((b) => exactText(b) === word)
      || free.find((b) => b.getAttribute('data-test') === `${word}-challenge-tap-token`)
      || free.find((b) => tokenText(b) === norm(word));
  }

  async function tapWords(words, root) {
    const used = new Set();
    for (const w of words) {
      const t = findToken(String(w).trim(), root, used);
      if (!t) return false;
      used.add(t);
      if (!(await clickAll([t]))) return false;
    }
    return true;
  }

  // Choice cards may be shuffled too: pick by the data's text, fall back to the index.
  const choiceText = (x) => (x && typeof x === 'object' ? x.text ?? x.phrase ?? x.option : x);
  function choiceFor(c, i, choices) {
    const want = choiceText(c.choices && c.choices[i]);
    if (typeof want === 'string') {
      const hit = choices.find((el) => norm(el.innerText) === norm(want))
        || choices.find((el) => norm(el.innerText).includes(norm(want)));
      if (hit) return hit;
    }
    return choices[i];
  }

  // Returns true when answered, 'cantSpeak' for speak challenges, false when it cannot solve.
  async function solve(c, root) {
    if (/speak/i.test(c.type)) return 'cantSpeak';

    const choices = choiceEls(root);
    if (typeof c.correctIndex === 'number' && choices.length) {
      const el = choiceFor(c, c.correctIndex, choices);
      if (el) return clickAll([el]);
    }

    // Match pairs. In listenMatch both buttons of a pair share one data-test
    // ("I have-challenge-tap-token": audio "1" and text "5 I have"), seen live 2026-11-10.
    // Plain match is assumed to work the same way (unverified).
    if (Array.isArray(c.pairs) && tokenEls(root).length) {
      const groups = new Map();
      for (const b of tokenEls(root)) {
        const k = b.getAttribute('data-test');
        groups.set(k, [...(groups.get(k) || []), b]);
      }
      const sets = [...groups.values()];
      if (sets.length !== c.pairs.length || !sets.every((g) => g.length === 2)) return false;
      // One pair at a time: first button, then its partner, then wait until Duolingo
      // disables both (pair accepted) before starting the next pair.
      for (const g of sets) {
        if (!(await clickAll(g))) return false;
        const until = Date.now() + S.stuckMs;
        while (g.some(usable) && Date.now() < until) await sleep(S.tickMs);
        if (g.some(usable)) { log('pair not accepted:', g[0].getAttribute('data-test')); return false; }
      }
      return true;
    }

    // Fill-in blanks (listenComplete, completeReverseTranslation)
    const blanks = Array.isArray(c.displayTokens) ? c.displayTokens.filter((t) => t.isBlank).map((t) => t.text) : [];
    const boxes = blankBoxes(root);
    if (blanks.length && boxes.length === blanks.length) {
      for (let i = 0; i < blanks.length; i++) await typeInto(boxes[i], blanks[i]);
      return true;
    }

    // Free text (translate typed, listen, name). "Type what you hear" wants the prompt in the
    // course language; solutionTranslation is only its meaning (seen live 2026-11-10).
    const box = textBox(root);
    const text = (c.correctSolutions && c.correctSolutions[0]) ?? (/^listen/.test(c.type) ? c.prompt : undefined);
    if (box && text) { await typeInto(box, text); return true; }

    // Word bank (translate, listenTap, tapComplete)
    const tokens = tokenEls(root);
    if (tokens.length && Array.isArray(c.correctTokens) && c.correctTokens.length) return tapWords(c.correctTokens, root);
    // correctIndices point into the data's choices, never into the shuffled screen order
    const idx = Array.isArray(c.correctIndices) ? c.correctIndices : [];
    const words = idx.map((i) => choiceText(c.choices && c.choices[i]));
    if (tokens.length && idx.length && words.every((w) => typeof w === 'string')) return tapWords(words, root);
    if (choices.length && idx.length) {
      const els = idx.map((i) => choiceFor(c, i, choices));
      if (els.every(Boolean)) return clickAll(els);
    }
    return false;
  }

  // ---- challenge flow ----
  function quitLegendary(reason) {
    stop(`legendary: ${reason}`);
    location.href = '/learn';
  }

  async function skip(reason) {
    if (legendary) return quitLegendary(`would skip (${reason})`);
    setStatus({ state: 'skipping' });
    log('skip:', reason);
    judged = true;
    await pause(S.clickMin, S.clickMax);
    if (click(q('[data-test="player-skip"]')) || click(byLabel(L.skip))) setStatus({ skips: status.skips + 1 });
    actedAt = Date.now();
  }

  async function onChallenge(root) {
    const c = await getChallenge();
    const id = c && c.id ? c.id : `nostate:${root.getAttribute('data-test')}`;

    if (id === handledId && root === handledRoot) {
      const blame = q('[data-test*="blame"]');
      if (!judged && blame) {
        judged = true;
        if (/incorrect/.test(blame.getAttribute('data-test'))) {
          const sessionWrong = status.sessionWrong + 1;
          setStatus({ wrong: status.wrong + 1, sessionWrong });
          log('wrong answer:', c && c.type, c && c.prompt);
          if (legendary) return quitLegendary('wrong answer');
          if (sessionWrong >= S.maxWrong) return stop(`${sessionWrong} wrong answers in one session`);
        }
      }
      const next = q('[data-test="player-next"]');
      if (usable(next)) {
        const feedback = !!q('[data-test*="blame"]');
        await pause(S.submitMin, S.submitMax);
        click(next);  // Check if it was not pressed yet, Continue once feedback shows
        if (!feedback) return;
        // Wait for the feedback to clear, then forget this challenge so a later
        // "previous mistake" retry of the same id is solved again.
        const until = Date.now() + S.stuckMs;
        while (q('[data-test*="blame"]') && Date.now() < until) await sleep(S.tickMs);
        handledId = null;
        handledRoot = null;
        stuckSkips = 0;
        return;
      }
      if (Date.now() - actedAt > S.stuckMs) {
        if (++stuckSkips > 2) return stop('stuck: skipping did not help');
        await skip('stuck');
      }
      return;
    }

    handledId = id;
    handledRoot = root;
    judged = false;
    if (!c) return skip(`no page state for ${root.getAttribute('data-test')}`);

    setStatus({ state: 'reading' });
    await pause(S.readMin, S.readMax);
    if (!enabled) return;

    const r = await solve(c, root);
    actedAt = Date.now();
    if (r === 'cantSpeak') {
      // unverified whether this counts as a mistake in legendary, so legendary stops instead
      if (legendary) return quitLegendary('speak challenge');
      judged = true;
      if (click(byLabel(L.cantSpeak)) || click(q('[data-test="player-skip"]'))) setStatus({ skips: status.skips + 1 });
      return;
    }
    if (!r) return skip(`no solver for ${c.type}`);

    setStatus({ sessionSolved: status.sessionSolved + 1 });
    await pause(S.submitMin, S.submitMax);
    if (!click(q('[data-test="player-next"]'))) log('check button not usable after answering', c.type);
  }

  // ---- between sessions ----
  async function startLegendary() {
    if (location.pathname !== '/learn') { location.href = '/learn'; return; }
    const node = qa('[data-test~="skill-path-level-unit_review"]')
      .find((n) => L.legendary.some((l) => textOf(n).includes(l)));
    if (!node) return stop('no legendary level on the path');
    click(q('button', node) || node);
    await pause(S.clickMin, S.clickMax);
    // unverified: the start button of the legendary popover; click() refuses anything mentioning gems
    if (!click(byLabel(L.start))) stop('legendary start button not found, or it costs gems');
  }

  // Path mode: the current node's bubble has an "active" start link (href /lesson for a
  // lesson; seen live 2026-11-10). "JUMP HERE?" unit-test links are never taken.
  async function startPath() {
    if (location.pathname !== '/learn') { location.href = '/learn'; return; }
    const active = () => q('a[data-test~="skill-path-state-active"]');
    if (!active()) {
      const current = qa('[data-test^="skill-path-level"]')
        .map((n) => q('button', n) || n)
        .find((b) => /\d+ (of|de) \d+/.test(b.getAttribute('aria-label') || ''));
      if (current) { click(current); await pause(S.clickMin, S.clickMax); }
    }
    const a = active();
    if (a && forbidden(a)) return stop('next path node costs gems');
    const href = a && a.getAttribute('href');
    // Fallback: /lesson starts the current path lesson.
    location.href = href && /^\/(lesson|practice)/.test(href) ? href : '/lesson';
  }

  async function startNext() {
    if (status.sessionSolved > 0) setStatus({ sessions: status.sessions + 1 });
    setStatus({ state: 'waiting', sessionSolved: 0, sessionWrong: 0 });
    await pause(S.sessionMin, S.sessionMax);
    if (!enabled) return;
    if (legendary) return startLegendary();
    if (mode === 'practice') { location.href = '/practice'; return; }
    return startPath();
  }

  async function onOtherScreen() {
    if (pageSays(L.outOfHearts)) return stop('out of hearts');
    // Outside a session page nothing is clicked: a "Continue" on /learn or the practice hub
    // can open a lesson (seen live 2026-11-10). Go straight to the next session instead.
    if (!SESSION_PATH.test(location.pathname)) return startNext();
    const next = q('[data-test="player-next"]');
    const dismiss = (usable(next) && next) || byLabel(L.continue) || byLabel(L.dismiss) || byLabel(L.close);
    if (dismiss) {
      setStatus({ state: 'dismissing' });
      await pause(S.submitMin, S.submitMax);
      click(dismiss);
      return;
    }
    if (Date.now() - idleSince > S.interstitialMs) await startNext();
  }

  async function loop() {
    for (;;) {
      await sleep(S.tickMs);
      // After the extension is reloaded, a script left in an open tab loses chrome.* access.
      if (!chrome.runtime || !chrome.runtime.id) { log('extension reloaded: reload this tab'); return; }
      if (!enabled || busy) continue;
      busy = true;
      try {
        const root = q('[data-test^="challenge challenge-"]');
        if (root) await onChallenge(root);
        else await onOtherScreen();
      } catch (e) {
        log('error:', e);
      } finally {
        busy = false;
      }
    }
  }
})();
