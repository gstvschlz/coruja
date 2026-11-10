// Runs in the page's MAIN world: React fiber expandos are invisible to the isolated
// content script. It only reads the current challenge and posts the answer fields back.
(function () {
  const FIELDS = ['type', 'id', 'prompt', 'choices', 'correctIndex', 'correctIndices', 'correctSolutions',
    'correctTokens', 'solutionTranslation', 'displayTokens', 'pairs'];

  function currentChallenge() {
    const el = document.querySelector('[data-test^="challenge challenge-"]');
    if (!el) return null;
    const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
    // Search up by prop name, never by a fixed depth.
    for (let f = key && el[key]; f; f = f.return) {
      const c = f.memoizedProps && f.memoizedProps.challenge;
      if (c && typeof c === 'object' && typeof c.type === 'string') {
        const out = {};
        for (const k of FIELDS) if (k in c) out[k] = c[k];
        try { return JSON.parse(JSON.stringify(out)); } catch { return null; }
      }
    }
    return null;
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.coruja !== 'get') return;
    window.postMessage({ coruja: 'state', reqId: e.data.reqId, challenge: currentChallenge() }, location.origin);
  });
})();
