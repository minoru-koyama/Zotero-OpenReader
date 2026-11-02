# Driving Zotero from a host without MCP tools

[Checklist index](../README.md) · [Tester workflow](../../../.agents/zotero-tester.md)

The tester's own route is `mcp__zotero-dev__*` tools. A host that exposes no
MCP tools at all — this agent harness is one — can still drive the same
**MCP server for Zotero plugin development** (introfini), over its stdio
protocol. Nothing here replaces the bridge: it is the same server, spoken to
by hand.

Verified on 2026-11-02, the Deepgram case's run.

## What is needed

1. **The bridge inside Zotero.** `mcp-rdp@zotero.org` ("MCP Bridge for Zotero")
   installed in the profile being driven. The isolated test profile already
   carries 1.0.6 and pins its port in `profile/user.js`:
   `extensions.mcp-rdp.port` = **6101** (a daily profile normally uses 6100).
2. **The server on the host**, once:

   ```sh
   mkdir -p test/zotero-dev/mcp && cd test/zotero-dev/mcp
   npm init -y && npm i @introfini/mcp-server-zotero-dev
   ```

   `node_modules/` stays untracked.
3. **Zotero running.** For the isolated profile, launch it exactly as the
   wizard's own stage does — as a *supervised service*, not with a bare `&`
   (a backgrounded launch does not survive its shell, and the bridge then
   answers nothing):

   ```sh
   cd .tmp/zotero-isolated
   MOZ_NO_REMOTE=1 exec /Applications/Zotero.app/Contents/MacOS/zotero \
     -no-remote -profile "$PWD/profile" -datadir "$PWD/data" -ZoteroDebugText
   ```

   Readiness is the bridge's own listener: wait for `127.0.0.1:6101`.

## The two calls

```sh
ZOTERO_RDP_PORT=6101 node call.mjs zotero_ping
ZOTERO_RDP_PORT=6101 node call.mjs --list
ZOTERO_RDP_PORT=6101 node call.mjs zotero_plugin_install \
  '{"path":"/abs/path/build/Zotero-OpenReader.xpi"}'
ZOTERO_RDP_PORT=6101 node exec.mjs ../scripts/deepgram/00-baseline.js
```

`call.mjs` takes a tool and JSON arguments (or `@file.json`); `exec.mjs` sends
a script file as `zotero_execute_js` code with `awaitPromise`, so a kit
script's `(async () => { … })()` resolves and its JSON string prints. Both
spawn the server per call, initialize, call, and exit; both take
`ZOTERO_RDP_HOST`, `ZOTERO_RDP_PORT` and `MCP_SERVER_DIR`.

## What the run taught about the bridge

- **30 s per call.** A script that polls longer comes back as a bare
  `undefined` with no error logged. Split long steps; the kit runner
  (`../scripts/_shared/run.js`) is for work that needs longer.
- **A bare `undefined` is a throw or that timeout.** Read
  `zotero_read_errors` straight after: a throw is there with its message, a
  timeout is not. A wrong host-API signature (`Zotero.Items.getAll` with four
  arguments, say) looks exactly like a broken build this way.
- **Closing a tab or window inside a script can kill the call.** Close tabs
  and the Settings window in one phase, then verify in the next.
- **A cleared preference can be rewritten.** The plugin's observers own
  several prefs; restore by writing the baseline value, waiting, *then*
  clearing the user flag, and read back what stuck.
- **A script-started reading meets the autoplay gate.** Start playback with a
  trusted `Shift+Space` (`nsITextInputProcessor` on the main window, the
  reader's tab selected); with the library tab selected the key is consumed
  elsewhere and nothing moves.
- **The player's catalog loads when a session prepares.** A freshly opened
  reader has `_allVoices` 0; `toggleReadAloudPopup(true)` loads it. A
  `selectVoice` before that is silent.

Cleanup: quit Zotero through the bridge
(`Zotero.Utilities.Internal.quitZotero()`), confirm the port closes, and
never leave a bridge listening unused.
