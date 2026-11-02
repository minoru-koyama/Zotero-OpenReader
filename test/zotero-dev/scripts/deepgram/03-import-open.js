// Deepgram case item 4a: import a case-owned copy of fixture-a.pdf and open it.
// The id goes to .tmp/zotero-dev/deepgram/fixture.json for the later steps.
(async () => {
  const PROFILE = '/Users/minorukoyama/repos/Zotero-OpenReader/.tmp/zotero-isolated/profile';
  const DATA = '/Users/minorukoyama/repos/Zotero-OpenReader/.tmp/zotero-isolated/data';
  const ROOT = '/Users/minorukoyama/repos/Zotero-OpenReader';
  const DIR = ROOT + '/.tmp/zotero-dev/deepgram';
  if (Services.dirsvc.get('ProfD', Ci.nsIFile).path !== PROFILE) throw new Error('Wrong profile');
  if (Zotero.DataDirectory.dir !== DATA) throw new Error('Wrong data directory');

  const title = 'OpenReader Deepgram case fixture 2026-11-02';
  const item = await Zotero.Attachments.importFromFile({
    file: ROOT + '/test/fixtures/fixture-a.pdf',
    libraryID: Zotero.Libraries.userLibraryID,
    title,
  });
  const file = await item.getFilePathAsync();
  const out = { itemID: item.id, key: item.key, title, insideData: !!file && file.startsWith(DATA + '/storage/') };

  await IOUtils.writeUTF8(DIR + '/fixture.json', JSON.stringify(out));

  const reader = await Zotero.Reader.open(item.id);
  const until = Date.now() + 24_000;
  let internal = null;
  while (Date.now() < until) {
    internal = reader?._internalReader;
    if (internal?._readAloudManager) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  out.readerReady = !!internal?._readAloudManager;
  const manager = internal?._readAloudManager ?? null;
  out.before = manager
    ? { active: !!manager.active, paused: !!manager.paused, selectedVoiceID: manager.selectedVoiceID ?? null, voice: manager._voice?.id ?? null }
    : null;
  return JSON.stringify(out);
})()
