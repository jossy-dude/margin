/*
 * Margin Bridge 0.8 — the Obsidian half of Margin's sync (v0.8 SPEC §1.1, D1/D4).
 *
 * Margin's own sync engine on the phone is the ONLY thing that reads or writes synced files there. This plugin no
 * longer moves files or writes bridge files (`.margin/obsidian.json` is retired, and so are the tasks/timetable
 * notes it used to write; Margin writes those itself). What is left:
 *   · phone: a thin link to Margin on 127.0.0.1:7429 (20_live.js). It tells Margin which note is being typed in
 *     ("editing") and when it was saved ("saved"), so Margin never writes under the cursor; Margin tells it which
 *     files it rewrote ("changed"), and Obsidian re-reads them; a plugin updated from the desktop is reloaded.
 *     Pairing needs no code: Margin leaves a key in `link.local.json` next to this file (never synced).
 *   · both: the shared focus timer (30_timer.js). Desktop: a small link straight to bone-syncd.
 * Plain JavaScript; `node build.mjs` joins src/ (with vault-sync's sync-core) into main.js.
 */
const obsidian = require('obsidian');

class MarginBridge extends obsidian.Plugin {
  async onload() {
    this.status = this.addStatusBarItem();
    this.addSettingTab(new MarginSettings(this.app, this));
    this.live = new LiveSync(this);
    this.live.start();
    this.timerLink = new TimerLink(this);
    this.timerLink.startDesktop();
    this.renderStatus();
  }
  onunload() { this.live?.stop(); this.timerLink?.stop(); }
  liveChanged(state, note) {
    this.liveState = state;
    if (note) new obsidian.Notice(`Margin: ${note}`);
    this.renderStatus();
  }
  renderStatus() {
    if (!this.status) return;
    if (!obsidian.Platform.isMobile) { this.status.setText(this.timerLink?.online ? 'Margin ✓' : ''); return; }
    const s = this.liveState || 'off';
    this.status.setText(s === 'live' ? 'Margin ✓' : s === 'connecting' ? 'Margin …' : s === 'waiting' ? 'Margin: not running' : 'Margin: not linked');
  }
}

class MarginSettings extends obsidian.PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    const { containerEl: el } = this, live = this.plugin.live;
    el.empty();
    new obsidian.Setting(el).setHeading().setName('Margin');
    if (!obsidian.Platform.isMobile) {
      new obsidian.Setting(el).setName('On this computer')
        .setDesc('The desktop hub (bone-syncd) keeps this vault in step with the phone. Margin writes its own notes (Margin/…); nothing to set up here. The shared focus timer works while the hub runs.');
      return;
    }
    new obsidian.Setting(el).setName('Link with Margin')
      .setDesc(live.enabled
        ? `Status: ${live.state}. Margin writes this vault; Obsidian tells it which note you are typing in, so nothing is written under your cursor.`
        : 'Open Margin once with this vault chosen in Settings → Obsidian & sync: it links itself. No code to type.')
      .addButton((b) => b.setButtonText(live.enabled ? 'Reconnect' : 'Look again').onClick(async () => { await live.loadKey(); live.close(); live.open(); this.display(); }));
    new obsidian.Setting(el).setName('Older Margin: link with a code')
      .setDesc('Only for Margin before 0.8: Settings → Sync → "Connect phone Obsidian" shows six digits.')
      .addText((t) => { t.setPlaceholder('6-digit code'); t.inputEl.inputMode = 'numeric'; this.code = t; })
      .addButton((b) => b.setButtonText('Link').onClick(async () => {
        try { await live.pairWithCode(this.code.getValue()); new obsidian.Notice('Margin: connecting…'); } catch (e) { new obsidian.Notice(`Margin: ${e.message}`); }
        this.display();
      }));
  }
}
