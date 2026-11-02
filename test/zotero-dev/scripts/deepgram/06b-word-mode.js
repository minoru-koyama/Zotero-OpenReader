(async () => {
  const DIR = '/Users/minorukoyama/repos/Zotero-OpenReader/.tmp/zotero-dev/deepgram';
  const fixture = JSON.parse(await IOUtils.readUTF8(DIR + '/fixture.json'));
  let reader = null;
  for (let i = 0; i < Zotero.Reader._readers.length; i++) if (Zotero.Reader._readers[i].itemID === fixture.itemID) reader = Zotero.Reader._readers[i];
  const manager = reader?._internalReader?._readAloudManager;
  const out = { wordPref: Zotero.Prefs.get('zotero-tts.highlight.word'), zoteroLevel: Zotero.Prefs.get('reader.readAloud.highlightGranularity') };
  if (out.wordPref !== true) Zotero.Prefs.set('zotero-tts.highlight.word', true);
  const snap = () => {
    const raw = Zotero.ZoteroTTS.diagnostics.highlight();
    try { return JSON.parse(raw); } catch (e) { return String(raw).slice(0, 300); }
  };
  const e0 = JSON.parse(Zotero.ZoteroTTS.diagnostics.engine());
  const r0 = (e0.readers || []).find((x) => x.itemID === fixture.itemID) || {};
  out.start = { playing: r0.session?.playing, paused: r0.session?.paused, index: r0.session?.currentIndex, wordClock: r0.session?.wordClock ?? null, activeTimestampIndex: r0.session?.activeTimestampIndex ?? null };
  Zotero_Tabs.select(reader.tabID);
  await new Promise((r) => setTimeout(r, 400));
  if (!out.start.playing) {
    const main = Services.wm.getMostRecentWindow('navigator:browser');
    const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
    tip.beginInputTransactionForTests(main);
    tip.keydown(new main.KeyboardEvent('keydown', { key: 'Shift', code: 'ShiftLeft', keyCode: 16 }));
    tip.keydown(new main.KeyboardEvent('keydown', { key: ' ', code: 'Space', keyCode: 32, shiftKey: true }));
    tip.keyup(new main.KeyboardEvent('keyup', { key: ' ', code: 'Space', keyCode: 32, shiftKey: true }));
    tip.keyup(new main.KeyboardEvent('keyup', { key: 'Shift', code: 'ShiftLeft', keyCode: 16 }));
  }
  await new Promise((r) => setTimeout(r, 2000));
  out.highlight1 = snap();
  await new Promise((r) => setTimeout(r, 2000));
  out.highlight2 = snap();
  const e1 = JSON.parse(Zotero.ZoteroTTS.diagnostics.engine());
  const r1 = (e1.readers || []).find((x) => x.itemID === fixture.itemID) || {};
  out.end = { playing: r1.session?.playing, paused: r1.session?.paused, index: r1.session?.currentIndex, wordClock: r1.session?.wordClock ?? null, activeTimestampIndex: r1.session?.activeTimestampIndex ?? null };
  if (r1.session?.playing) manager.pause();
  return JSON.stringify(out);
})()
