// Deepgram case item 6: playback on aura-2-thalia-en, sampled from the
// Engine's own diagnostic. Playback starts from a trusted Shift+Space
// (driving §6) because a script-started session meets the autoplay gate.
// An earlier revision called manager.toggleReadAloudPaused() from the
// script and sampled engine() with the wrong paths; this one sends the key
// and reads session.playing / playbackTime / audio per reader.
(async () => {
  const PROFILE = '/Users/minorukoyama/repos/Zotero-OpenReader/.tmp/zotero-isolated/profile';
  if (Services.dirsvc.get('ProfD', Ci.nsIFile).path !== PROFILE) throw new Error('Wrong profile');
  const DIR = '/Users/minorukoyama/repos/Zotero-OpenReader/.tmp/zotero-dev/deepgram';
  const fixture = JSON.parse(await IOUtils.readUTF8(DIR + '/fixture.json'));
  if (Zotero.Prefs.get('zotero-tts.readAloud.volume') !== 0) throw new Error('Not muted');

  let reader = null;
  for (let i = 0; i < Zotero.Reader._readers.length; i++) if (Zotero.Reader._readers[i].itemID === fixture.itemID) reader = Zotero.Reader._readers[i];
  const manager = reader?._internalReader?._readAloudManager;
  if (!manager) return JSON.stringify({ blocked: 'No manager' });

  const main = Services.wm.getMostRecentWindow('navigator:browser');
  const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
  tip.beginInputTransactionForTests(main);
  const press = () => {
    tip.keydown(new main.KeyboardEvent('keydown', { key: 'Shift', code: 'ShiftLeft', keyCode: 16 }));
    const consumed = tip.keydown(new main.KeyboardEvent('keydown', { key: ' ', code: 'Space', keyCode: 32, shiftKey: true }));
    tip.keyup(new main.KeyboardEvent('keyup', { key: ' ', code: 'Space', keyCode: 32, shiftKey: true }));
    tip.keyup(new main.KeyboardEvent('keyup', { key: 'Shift', code: 'ShiftLeft', keyCode: 16 }));
    return consumed;
  };

  const row = () => {
    const engine = JSON.parse(Zotero.ZoteroTTS.diagnostics.engine());
    const entry = (engine.readers || []).find((r) => r.itemID === fixture.itemID) ?? null;
    if (!entry) return null;
    const s = entry.session || {};
    return {
      playing: s.playing ?? null,
      paused: s.paused ?? null,
      buffering: s.buffering ?? null,
      voice: s.voice ?? null,
      playbackTime: s.playbackTime ?? null,
      currentIndex: s.currentIndex ?? null,
      error: s.error ?? null,
      audio: entry.audio ? { state: entry.audio.state ?? null, currentTime: entry.audio.currentTime ?? null } : null,
      prefetch: s.prefetch ?? null,
    };
  };

  const out = { before: row(), consumed: null, samples: [] };
  if (!out.before?.playing) out.consumed = press();
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setTimeout(resolve, 900));
    out.samples.push({ at: i + 1, ...row() });
  }
  if (row()?.playing) press();
  await new Promise((resolve) => setTimeout(resolve, 300));
  out.afterPause = row();
  out.prefs = {
    prefetchCustom: Zotero.Prefs.get('zotero-tts.readAloud.prefetchCustom'),
    prefetchSentences: Zotero.Prefs.get('zotero-tts.readAloud.prefetchSentences'),
    prefetchRequests: Zotero.Prefs.get('zotero-tts.readAloud.prefetchRequests'),
  };
  return JSON.stringify(out);
})()
