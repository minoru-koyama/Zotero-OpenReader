// Deepgram case item 1: the section as the pane draws it with the provider
// off, plus what diagnostics.secrets() reports for its field. Opens Settings
// on the plugin pane when it is not open, and leaves it open for the key.
// Every read is reported even when one fails, so a partial pane still says
// which part was missing.
(async () => {
  const PROFILE = '/Users/minorukoyama/repos/Zotero-OpenReader/.tmp/zotero-isolated/profile';
  if (Services.dirsvc.get('ProfD', Ci.nsIFile).path !== PROFILE) throw new Error('Wrong profile');
  const out = {};
  const step = (name, fn) => {
    try {
      out[name] = fn();
    } catch (e) {
      out[name] = 'ERR ' + String((e && e.message) || e);
    }
  };
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const waitFor = async (read, limit = 6000, stepMs = 200) => {
    const until = Date.now() + limit;
    while (Date.now() < until) {
      const value = read();
      if (value) return value;
      await sleep(stepMs);
    }
    return null;
  };

  if (!Services.wm.getMostRecentWindow('zotero:pref')) {
    Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
    await waitFor(() => Services.wm.getMostRecentWindow('zotero:pref'), 10000);
  }
  const win = Services.wm.getMostRecentWindow('zotero:pref');
  if (!win) return JSON.stringify({ ...out, blocked: 'No settings window' });
  try {
    await waitFor(() => win.Zotero_Preferences, 6000);
    await win.Zotero_Preferences.navigateToPane('zotero-tts-pane');
  } catch (e) {
    out.navigate = 'ERR ' + String((e && e.message) || e);
  }
  const section = await waitFor(() => win.document.getElementById('ztts-provider-deepgram'), 8000);
  if (!section) return JSON.stringify({ ...out, blocked: 'No Deepgram section' });
  section.scrollIntoView({ block: 'center' });

  step('section', () => ({ id: section.id, tag: section.localName }));
  step('heading', () => (section.querySelector('h2') || section.querySelector('label')).textContent.trim());
  step('accountLink', () => section.querySelector('[is="zotero-text-link"]')?.getAttribute('href') ?? null);
  step('fields', () =>
    [...section.querySelectorAll('input')].map((f) => ({
      type: f.getAttribute('type'),
      class: f.getAttribute('class'),
      preference: f.getAttribute('preference'),
      disabled: !!f.disabled,
      valueLength: typeof f.value === 'string' ? f.value.length : null,
    })),
  );
  step('otherControls', () =>
    [...section.querySelectorAll('input, menulist, textbox, checkbox')]
      .map((f) => f.localName + '#' + (f.id || '') + '.' + (f.getAttribute('preference') || ''))
      .filter((name) => !name.startsWith('input#')),
  );
  step('help', () => {
    const help = section.querySelector('[data-l10n-id="ztts-help-deepgram"]');
    const text = help ? help.getAttribute('help') || '' : '';
    return { length: text.length, start: text.slice(0, 80) };
  });
  step('buttons', () =>
    ['ztts-enable-deepgram', 'ztts-test-deepgram'].map((id) => {
      const button = win.document.getElementById(id);
      return { id, present: !!button, label: button?.getAttribute('label') ?? null, disabled: button ? !!button.disabled : null };
    }),
  );
  step('resultLine', () => win.document.getElementById('ztts-test-result-deepgram')?.textContent ?? null);

  try {
    const report = JSON.parse(await Zotero.ZoteroTTS.diagnostics.secrets());
    out.secrets = {
      pane: report.pane,
      deepgram: (report.fields || []).filter((field) => field.pref === 'deepgram.apiKey'),
    };
  } catch (e) {
    out.secrets = 'ERR ' + String((e && e.message) || e);
  }
  out.settingsWindowOpen = true;
  return JSON.stringify(out);
})()
