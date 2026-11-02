// Deepgram case item 6a: a trusted Shift+Space into the reader, which is what
// the autoplay gate needs (driving §6). Returns the handlers' consumption.
(async () => {
  const PROFILE = '/Users/minorukoyama/repos/Zotero-OpenReader/.tmp/zotero-isolated/profile';
  if (Services.dirsvc.get('ProfD', Ci.nsIFile).path !== PROFILE) throw new Error('Wrong profile');
  const DIR = '/Users/minorukoyama/repos/Zotero-OpenReader/.tmp/zotero-dev/deepgram';
  const fixture = JSON.parse(await IOUtils.readUTF8(DIR + '/fixture.json'));
  if (Zotero.Prefs.get('zotero-tts.readAloud.volume') !== 0) throw new Error('Not muted');

  let reader = null;
  for (let i = 0; i < Zotero.Reader._readers.length; i++) if (Zotero.Reader._readers[i].itemID === fixture.itemID) reader = Zotero.Reader._readers[i];
  const internal = reader?._internalReader;
  const manager = internal?._readAloudManager;
  if (!manager) return JSON.stringify({ blocked: 'No manager' });

  const win = reader._iframeWindow ?? reader._window;
  if (!win) return JSON.stringify({ blocked: 'No reader window' });
  win.focus();

  const tip = Cc['@mozilla.org/text-input-processor;1'].createInstance(Ci.nsITextInputProcessor);
  if (!tip.beginInputTransactionForTests(win)) return JSON.stringify({ blocked: 'No input transaction' });
  const key = (type, k, code, keyCode, modifiers) =>
    tip[type](new win.KeyboardEvent(type === 'keydown' ? 'keydown' : 'keyup', { key: k, code, keyCode, modifiers }));
  const out = { voice: manager._voice?.id ?? null, active: !!manager.active, paused: !!manager.paused };
  out.consumed = {
    shiftDown: key('keydown', 'Shift', 'ShiftLeft', 16, {}),
    spaceDown: key('keydown', ' ', 'Space', 32, { shiftKey: true }),
    spaceUp: key('keyup', ' ', 'Space', 32, { shiftKey: true }),
    shiftUp: key('keyup', 'Shift', 'ShiftLeft', 16, {}),
  };
  await new Promise((resolve) => setTimeout(resolve, 1200));
  out.after = { active: !!manager.active, paused: !!manager.paused, voice: manager._voice?.id ?? null, selectedVoiceID: manager.selectedVoiceID ?? null };
  return JSON.stringify(out);
})()
