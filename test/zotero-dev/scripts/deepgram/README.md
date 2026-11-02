# Deepgram — the case's kit

[Case](../../cases/deepgram.md) · [Checklist index](../../README.md) · [Tester workflow](../../../../.agents/zotero-tester.md)

Run through `_shared/run.js` (`start`/`wait`, `one`), one script per row, in
this order. First run: 2026-11-02, 1.16.16-beta8, isolated profile
`.tmp/zotero-isolated` (bridge 6101).

| Script | Check | Expected measured values | Params read |
| --- | --- | --- | --- |
| `00-baseline.js` | identity, startup, the prefs the case touches, readers, positions | `version` = the installed beta, `failed: []`, 29 steps `ok`; `webdav.enabled` false/`folder: false`; volume 100; prefetch 5/2/custom true; `highlight.word` true; `deepgram.enabled` false, key length 0 | — |
| `01-pane.js` | item 1: the section with the provider off | `#ztts-provider-deepgram`, heading `Deepgram (Aura-2) (console.deepgram.com)`, one `input type="text" class="ztts-secret"` bound to `deepgram.apiKey`, `disabled=false`, length 0; no menulist/textbox/checkbox; `?` 300 chars; `secrets()` → `{pref: "deepgram.apiKey", type: "text", length: 0, revealed: false, textSecurity: "disc", eye: {disabled: false, label: "Show the value"}}` | — |
| `02-enable.js` | item 2: one Enable with the key in place | line `Connected. 41 voices available. Synthesis works.`, `deepgram.enabled` true, field `disabled=true`, still `disc`/not revealed. A Test connection before it leaves the line unchanged, so this script stops on the pref | — |
| `03-import-open.js` | item 4a: case-owned fixture | attachment inside the isolated `data/storage`, reader ready (`_readAloudManager`), manager idle (no voice yet); id kept in `.tmp/zotero-dev/deepgram/fixture.json` | `test/fixtures/fixture-a.pdf` |
| `05-session.js` | items 4b–5: the voice, the session, prefetch | default voice set to `deepgram::aura-2-thalia-en`, popup open loads the catalog (`_allVoices` 41, `languages` 4, tier `deepgram`), `selectVoice` sets `_voice.id` and `selectedVoiceID`, session paused; document voice `{"voice": {"id": "deepgram::aura-2-thalia-en", "lang": "en"}, "manual": true}` | — |
| `06a-start-key.js` | item 6a: the trusted start | a script-started session meets the autoplay gate (`NotAllowedError`, `AudioContext was prevented…`); a trusted `Shift+Space` through `nsITextInputProcessor` on the **main** window with the **reader's tab selected** is consumed (1) and starts playback | — |
| `06-playback.js` | item 6: playback on the voice | `playing: true`, `paused: false`, `audio.state: "running"`, `gain: 0`, `playbackTime` advancing (1.013 → 2.508 s), `currentIndex` 8 → 9 → 10, `buffering: false`, `error: null`; prefetch `{sentences: 3, requests: 1, order: [8, 9, 10], open: 0, peak: 1}`; 11 adapter lines `deepgram: no word timestamps for N chars (audio from aura-2-thalia-en), highlighting the sentence` | — |
| `06b-word-mode.js` | item 7: word mode | `highlight.word` true and Zotero's level `word`; `highlight()` → `granularity: "sentence"`, `activeWordTimestamp: "stand-in"`, `state.segment: true`, unchanged across three samples while the index advanced | — |
| `07-restore.js` | item 8: restore and clean up | every pref back to its baseline value and user-value flag; Settings closed; readers 0; positions 0; case item erased; the owner's key kept | — |

Before starting: the isolated profile, the bridge on 6101, no key needed for
`00`–`01`; the owner types the key into the pane's Deepgram field after
`01-pane.js` (never through chat, never from disk). State touched: the
Deepgram section and switch, the key, `readAloud.volume`,
`readAloud.prefetch*`, `highlight.word`, `readAloud.defaultVoice`, one
library item and its document-voice record. Cleanup: `07-restore.js`, then
erase the item, then put the key back if the profile is to be handed on.

## Limits this run found

- **`(cached)` was not observed.** A same-text, same-voice replay is served by
  the Engine's clip store, so `remote-interface` is never reached and no
  adapter line is written at all (11 lines before the replay, 11 after;
  playback resumed at the replayed segment in under a second). The `(cached)`
  suffix belongs to the memory cache behind `remote-interface`, which this
  path does not touch. Expect it only when audio is evicted from the clip
  store but retained in that cache.
- **Enable does not rewrite the line.** With a Test connection already
  succeeded, Enable keeps the same text; read the switch and the field lock,
  not the line.
- **The catalog arrives when a session prepares.** `manager._allVoices` is 0
  on a freshly opened, idle reader; `toggleReadAloudPopup(true)` (or a pick
  through the player) loads it. A `selectVoice` before that silently does
  nothing.
- **Script-started playback meets the autoplay gate.** A trusted
  `Shift+Space` with the reader's tab selected is what starts it; the
  library tab selected makes the key land elsewhere (`consumed: 2`, session
  unmoved).
- **Clearing a restored pref can be undone.** Setting the baseline value and
  then clearing the user flag in the same script holds; clearing alone was
  re-written by the plugin's own observers. `07-restore.js` sets, waits,
  clears, waits, then reports what actually stuck.
- **Wrong API signatures return a bare `undefined`.** `Zotero.Items.getAll`
  with four arguments throws and the bridge answers `undefined`; read
  `zotero_read_errors` and check the signature before blaming the build.

## Runs

| Date | Build | Items | Notes |
| --- | --- | --- | --- |
| 2026-11-02 | 1.16.16-beta8 (sha256 5f07e819…) | 1, 2, 3, 4, 5, 6, 7, 8 PASS | items 2–7 spent one `Hi` probe, one catalog listing per Enable, 11 synthesized segments and a replay; volume 0 throughout; key kept (length 40) |
