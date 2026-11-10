# Coruja

A Chrome extension that solves Duolingo practice and legendary sessions in your own
logged-in browser, at human pace. Works with English and Brazilian Portuguese interfaces.

Using it breaks Duolingo's terms of service and can get the account banned or its
leaderboard results reset. Use it on your own account at your own risk.

## What it does

- Reads each challenge's correct answer from the lesson page and answers it first try.
- Types answers one character at a time at an average of 80 wpm, with jitter and longer
  pauses after spaces.
- Never uses the microphone. Speak challenges are skipped with "Can't speak now"
  ("Não posso falar agora"). Listening challenges are solved.
- Skips a challenge when it has no solver, the page has no answer, or nothing happens
  for 8 s after answering.
- Loops practice sessions (`/practice`) until switched off, or until hearts run out.
- Legendary mode: only legendary levels, and it stops at the first wrong answer or skip.
- Between sessions it only clicks Continue, No thanks/Not now or close. It never clicks
  anything that mentions gems, buying, trials or sharing.
- Switches off after 3 wrong answers in one session.

## Install

1. Open `chrome://extensions` (Chrome or Chromium) and turn on Developer mode.
2. Click Load unpacked and pick the `extension/` folder.
3. Log in to duolingo.com, open the Coruja popup and turn on Running.

After editing the code, click the reload icon on the extension card and reload Duolingo.

## Settings

The popup shows the current state, counters and the last stop reason. Under Settings
you can change every timing: `wpm`, reading pause (`readMin`/`readMax`), click delays,
submit delays, pause between sessions, `stuckMs`, `interstitialMs` and `maxWrong`.

## Check

```sh
mise run check
```

Asserts that the typing delays average 150 ms per character (80 wpm) within 3%.

## Not yet verified on a live page

The Portuguese button labels, speak challenges, match pairs and the legendary start
button have not been seen live yet. They are marked `unverified` in the code.

## License

MIT. Based on [auto-lingo](https://github.com/drknzz/auto-lingo) by drknzz.
