// Deepgram case items 4b-5: make aura-2-thalia-en the document's voice through
// the plugin's global default, open the session, pause at once, and read what
// the manager and the document voice record hold. The default voice pref is
// snapshotted here and restored by 07-restore.js.
(async () => {
  const PROFILE = '/Users/minorukoyama/repos/Zotero-OpenReader/.tmp/zotero-isolated/profile';
  if (Services.dirsvc.get('ProfD', Ci.nsIFile).path !== PROFILE) throw new Error('Wrong profile');
  const DIR = '/Users/minorukoyama/repos/Zotero-OpenReader/.tmp/zotero-dev/deepgram';
  const fixture = JSON.parse(await IOUtils.readUTF8(DIR + '/fixture.json'));
  const out = { itemID: fixture.itemID, key: fixture.key };

  const VOICE = 'deepgram::aura-2-thalia-en';
  out.defaultVoiceBefore = {
    value: Zotero.Prefs.get('zotero-tts.readAloud.defaultVoice'),
    user: Zotero.Prefs.prefHasUserValue('extensions.zotero.zotero-tts.readAloud.defaultVoice'),
  };
  Zotero.Prefs.set('zotero-tts.readAloud.defaultVoice', VOICE);
  if (Zotero.Prefs.get('zotero-tts.readAloud.volume') !== 0) throw new Error('Not muted');

  let reader = null;
  for (let i = 0; i < Zotero.Reader._readers.length; i++) {
    if (Zotero.Reader._readers[i].itemID === fixture.itemID) reader = Zotero.Reader._readers[i];
  }
  if (!reader) return JSON.stringify({ ...out, blocked: 'No reader for the fixture' });
  const internal = reader._internalReader;
  const manager = internal?._readAloudManager;
  if (!manager) return JSON.stringify({ ...out, blocked: 'No manager' });

  internal.toggleReadAloudPopup(true);
  const until = Date.now() + 15_000;
  while (Date.now() < until) {
    if (manager.active && manager._voice?.id) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  out.started = { active: !!manager.active, paused: !!manager.paused, voice: manager._voice?.id ?? null };
  if (manager.active && !manager.paused) manager.pause();
  await new Promise((resolve) => setTimeout(resolve, 400));

  out.after = {
    active: !!manager.active,
    paused: !!manager.paused,
    selectedVoiceID: manager.selectedVoiceID ?? null,
    voice: manager._voice?.id ?? null,
    tier: manager._selectedTier ?? null,
    allVoices: manager._allVoices?.length ?? null,
    languages: Array.isArray(manager.languages) ? manager.languages.length : null,
  };
  const record = Zotero.Prefs.get('zotero-tts.documentVoices.user/' + fixture.key);
  out.documentVoice = record ? JSON.parse(record) : null;
  return JSON.stringify(out);
})()
