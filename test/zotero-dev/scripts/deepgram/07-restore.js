// Deepgram case item 8: restore every pref this run touched to its baseline
// value AND user-value flag, close the settings window and the fixture's tab,
// erase the case-owned item, and confirm the profile is as it was found.
// The owner's Deepgram key stays; the provider's switch goes back to the
// baseline (off) it was found in. Every phase is reported, so a step that
// fails names itself instead of returning a bare undefined.
(async () => {
  const PROFILE = '/Users/minorukoyama/repos/Zotero-OpenReader/.tmp/zotero-isolated/profile';
  const DATA = '/Users/minorukoyama/repos/Zotero-OpenReader/.tmp/zotero-isolated/data';
  const DIR = '/Users/minorukoyama/repos/Zotero-OpenReader/.tmp/zotero-dev/deepgram';
  const out = { phase: 'start', restored: [], errors: [] };
  try {
    if (Services.dirsvc.get('ProfD', Ci.nsIFile).path !== PROFILE) throw new Error('Wrong profile');
    if (Zotero.DataDirectory.dir !== DATA) throw new Error('Wrong data directory');

    out.phase = 'read-baseline';
    const baseline = JSON.parse(await IOUtils.readUTF8(DIR + '/baseline.json'));
    const fixture = JSON.parse(await IOUtils.readUTF8(DIR + '/fixture.json'));
    const prefs = Components.classes['@mozilla.org/preferences-service;1'].getService(Ci.nsIPrefService);

    out.phase = 'restore-prefs';
    const wanted = { ...baseline.prefs, 'zotero-tts.readAloud.defaultVoice': { value: '', user: false } };
    for (const [name, want] of Object.entries(wanted)) {
      if (name.endsWith('apiKey')) continue; // the owner's key stays
      const full = 'extensions.zotero.' + name;
      try {
        if (want.user) Zotero.Prefs.set(name, want.value);
        else if (prefs.prefHasUserValue(full)) prefs.clearUserPref(full);
        out.restored.push({ name, value: Zotero.Prefs.get(name), user: prefs.prefHasUserValue(full) });
      } catch (e) {
        out.errors.push(name + ': ' + String((e && e.message) || e));
      }
    }

    out.phase = 'close-settings';
    try {
      Services.wm.getMostRecentWindow('zotero:pref')?.close();
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (e) {
      out.errors.push('close-settings: ' + String((e && e.message) || e));
    }
    out.settingsOpen = !!Services.wm.getMostRecentWindow('zotero:pref');

    out.phase = 'close-tabs';
    try {
      const readers = [...Zotero.Reader._readers];
      for (const reader of readers) {
        try {
          if (reader?.itemID === fixture.itemID) reader.close?.();
        } catch (e) {
          out.errors.push('close-tab: ' + String((e && e.message) || e));
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 600));
    } catch (e) {
      out.errors.push('close-tabs: ' + String((e && e.message) || e));
    }

    out.phase = 'erase-item';
    try {
      const item = Zotero.Items.get(fixture.itemID);
      if (item) {
        const file = await item.getFilePathAsync();
        if (!file || !file.startsWith(DATA + '/storage/')) throw new Error('Refusing to erase a non-test attachment');
        await item.eraseTx();
        out.erased = fixture.itemID;
      } else {
        out.erased = 'already gone';
      }
    } catch (e) {
      out.errors.push('erase-item: ' + String((e && e.message) || e));
    }

    out.phase = 'verify';
    try {
      out.readers = Zotero.Reader._readers.length;
    } catch (e) {
      out.errors.push('readers: ' + String((e && e.message) || e));
    }
    try {
      out.tabs = (Zotero_Tabs._tabs || []).map((tab) => String(tab?.title ?? '')).filter((title) => /Deepgram case fixture/.test(title));
    } catch (e) {
      out.errors.push('tabs: ' + String((e && e.message) || e));
    }
    try {
      out.positionRows = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position())?.database?.rows ?? null;
    } catch (e) {
      out.errors.push('position: ' + String((e && e.message) || e));
    }
    try {
      out.positionSyncFolder = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync()).folder;
    } catch (e) {
      out.errors.push('positionSync: ' + String((e && e.message) || e));
    }
    out.keyLength = (Zotero.Prefs.get('zotero-tts.deepgram.apiKey') || '').length;
    out.debugStoring = Zotero.Debug.storing;
    if (out.debugStoring) Zotero.Debug.setStore(false);
    out.phase = 'done';
  } catch (e) {
    out.errors.push('FATAL at ' + out.phase + ': ' + String((e && e.message) || e));
  }
  return JSON.stringify(out);
})()
