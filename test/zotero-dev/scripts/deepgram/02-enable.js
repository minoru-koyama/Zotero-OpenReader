// Deepgram case item 2: one Enable check with the owner's key in place.
// Clicks the switch and traces the pref, the field lock and the line.
// An earlier revision polled only for a CHANGED line and outlived the
// bridge's 30 s window when a Test connection had already written the
// same text; it now also stops on `enabled` turning true.
(async () => {
  const PROFILE = '/Users/minorukoyama/repos/Zotero-OpenReader/.tmp/zotero-isolated/profile';
  if (Services.dirsvc.get('ProfD', Ci.nsIFile).path !== PROFILE) throw new Error('Wrong profile');
  const win = Services.wm.getMostRecentWindow('zotero:pref');
  if (!win) return JSON.stringify({ blocked: 'No settings window open' });
  const doc = win.document;
  const key = Zotero.Prefs.get('zotero-tts.deepgram.apiKey');
  const out = { keyLength: typeof key === 'string' ? key.length : null, trace: [] };
  if (typeof key !== 'string' || key.trim() === '') return JSON.stringify({ ...out, blocked: 'No key typed into the Deepgram field' });
  if (Zotero.Prefs.get('zotero-tts.readAloud.volume') !== 0) throw new Error('Profile is not muted');

  const button = doc.getElementById('ztts-enable-deepgram');
  const line = doc.getElementById('ztts-test-result-deepgram');
  const field = [...doc.querySelectorAll('input.ztts-secret')]
    .find((input) => (input.getAttribute('preference') || '').endsWith('deepgram.apiKey'));
  const sample = (phase) => ({
    phase,
    at: Date.now(),
    label: button?.getAttribute('label') ?? null,
    disabled: button ? !!button.disabled : null,
    line: line ? line.textContent : null,
    enabled: Zotero.Prefs.get('zotero-tts.deepgram.enabled'),
    fieldDisabled: field ? !!field.disabled : null,
    revealed: field ? field.getAttribute('data-revealed') === 'true' : null,
  });

  out.trace.push(sample('before'));
  button.click();
  const until = Date.now() + 18_000;
  let settled = false;
  while (Date.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const now = sample('poll');
    if (now.enabled === true || /failed|rejected/i.test(now.line || '')) {
      out.trace.push(now);
      settled = true;
      break;
    }
  }
  if (!settled) out.trace.push(sample('timeout'));
  out.settled = settled;
  return JSON.stringify(out);
})()
