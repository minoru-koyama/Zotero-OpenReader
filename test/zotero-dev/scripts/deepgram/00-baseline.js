// Deepgram case, baseline: identity, startup, the prefs this case touches,
// open readers and the positions row count. Reads nothing secret in bulk.
(async () => {
  const PROFILE = '/Users/minorukoyama/repos/Zotero-OpenReader/.tmp/zotero-isolated/profile';
  const DATA = '/Users/minorukoyama/repos/Zotero-OpenReader/.tmp/zotero-isolated/data';
  const DIR = '/Users/minorukoyama/repos/Zotero-OpenReader/.tmp/zotero-dev/deepgram';
  if (Services.dirsvc.get('ProfD', Ci.nsIFile).path !== PROFILE) throw new Error('Wrong profile');
  if (Zotero.DataDirectory.dir !== DATA) throw new Error('Wrong data directory');

  const out = { profile: PROFILE, data: DATA, ranAt: new Date().toISOString() };
  try {
    const started = JSON.parse(Zotero.ZoteroTTS.diagnostics.startup());
    out.version = started.version;
    out.startupFailed = started.failed;
    out.startupSteps = Array.isArray(started.steps)
      ? started.steps.map((step) => `${step.name}:${step.ok ? 'ok' : 'FAILED'}`)
      : started.steps;
  } catch (e) {
    out.startupError = String(e);
  }

  const names = [
    'webdav.enabled',
    'readAloud.volume',
    'readAloud.prefetchCustom',
    'readAloud.prefetchSentences',
    'readAloud.prefetchRequests',
    'highlight.word',
    'deepgram.enabled',
    'deepgram.apiKey',
  ];
  out.prefs = {};
  for (const name of names) {
    let value;
    try {
      value = Zotero.Prefs.get('zotero-tts.' + name);
    } catch (e) {
      value = 'ERR ' + e.message;
    }
    if (name.endsWith('apiKey')) value = typeof value === 'string' ? value.length : value;
    out.prefs[name] = {
      value: value === undefined ? null : value,
      user: Zotero.Prefs.prefHasUserValue('extensions.zotero.zotero-tts.' + name),
    };
  }

  out.debugStoring = Zotero.Debug.storing;
  out.settingsOpen = !!Services.wm.getMostRecentWindow('zotero:pref');
  out.readers = [];
  for (let i = 0; i < Zotero.Reader._readers.length; i++) {
    const reader = Zotero.Reader._readers[i];
    let manager = null;
    try {
      manager = reader?._internalReader?._readAloudManager ?? null;
    } catch (e) {
      manager = 'ERR';
    }
    out.readers.push({
      title: String(reader?._title ?? '').slice(0, 40),
      active: manager && manager !== 'ERR' ? !!manager.active : manager,
      paused: manager && manager !== 'ERR' ? !!manager.paused : manager,
    });
  }

  try {
    const position = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
    out.position = { rows: position?.database?.rows ?? null, legacyPref: position?.legacyPref ?? null };
  } catch (e) {
    out.position = 'ERR ' + e.message;
  }
  try {
    out.positionSync = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
  } catch (e) {
    out.positionSync = 'ERR ' + e.message;
  }

  await IOUtils.makeDirectory(DIR, { ignoreExisting: true, createAncestors: true });
  await IOUtils.writeUTF8(DIR + '/baseline.json', JSON.stringify(out, null, 1));
  return JSON.stringify(out);
})()
