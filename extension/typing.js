// Pure timing helpers and default settings. Loaded as a classic script by the
// extension (exposes globalThis.CorujaTyping) and as CommonJS by check.mjs.
(function (root) {
  const DEFAULT_SETTINGS = {
    wpm: 80,                 // 5 characters per word, so 80 wpm = 150 ms per character
    spacePause: 1.8,         // relative weight of a space vs a letter
    keyJitter: 0.5,          // each key weight is 1 +/- keyJitter
    answerJitter: 0.1,       // each answer's pace is wpm * (1 +/- answerJitter)
    readMin: 1500, readMax: 4000,       // pause before acting on a new challenge
    clickMin: 250, clickMax: 700,       // between clicks
    submitMin: 400, submitMax: 900,     // before Check / Continue
    sessionMin: 5000, sessionMax: 20000, // between sessions
    stuckMs: 8000,           // no DOM change after acting: skip
    interstitialMs: 10000,   // no known button between sessions: go to next session
    maxWrong: 3,             // wrong answers per session before switching off
    tickMs: 500,             // main loop poll interval
  };

  const msPerChar = (wpm) => 60000 / (wpm * 5);

  const between = (min, max, rand = Math.random) => min + rand() * (max - min);

  // Per-character delays for typing `text`. Spaces get a longer pause, every key is
  // jittered, and the whole answer is scaled so its mean is the answer's pace.
  function keyDelays(text, s = DEFAULT_SETTINGS, rand = Math.random) {
    const chars = [...text];
    if (chars.length === 0) return [];
    const weights = chars.map((c) =>
      (c === ' ' ? s.spacePause : 1) * between(1 - s.keyJitter, 1 + s.keyJitter, rand));
    const sum = weights.reduce((a, b) => a + b, 0);
    const pace = msPerChar(s.wpm) * between(1 - s.answerJitter, 1 + s.answerJitter, rand);
    return weights.map((w) => (w * pace * chars.length) / sum);
  }

  const api = { DEFAULT_SETTINGS, msPerChar, between, keyDelays };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CorujaTyping = api;
})(globalThis);
