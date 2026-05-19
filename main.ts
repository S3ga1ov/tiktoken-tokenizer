import {
    Plugin,
    PluginSettingTab,
    Setting,
    MarkdownView,
    debounce,
    type App,
} from 'obsidian';
import { Tiktoken, type TiktokenBPE } from 'js-tiktoken/lite';
import o200k_base from 'js-tiktoken/ranks/o200k_base';
import cl100k_base from 'js-tiktoken/ranks/cl100k_base';

type TokenizerMode = 'gpt' | 'claude';

interface TiktokenTokenizerSettings {
    mode: TokenizerMode;
}

const DEFAULT_SETTINGS: TiktokenTokenizerSettings = {
    mode: 'gpt',
};

const CLAUDE_SAFETY_MARGIN = 1.15;

export default class TiktokenTokenizerPlugin extends Plugin {
    settings: TiktokenTokenizerSettings = { ...DEFAULT_SETTINGS };
    private statusBarItemEl!: HTMLElement;
    private enc: Tiktoken | null = null;
    private updateTokenCountDebounced = debounce(
        () => this.updateTokenCount(),
        150,
        true,
    );

    async onload() {
        await this.loadSettings();

        this.statusBarItemEl = this.addStatusBarItem();
        this.refreshEncoder();

        this.addSettingTab(new TiktokenTokenizerSettingTab(this.app, this));

        this.registerEvent(
            this.app.workspace.on('editor-change', () =>
                this.updateTokenCountDebounced(),
            ),
        );
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', () =>
                this.updateTokenCountDebounced(),
            ),
        );

        this.updateTokenCount();
    }

    async loadSettings() {
        this.settings = Object.assign(
            {},
            DEFAULT_SETTINGS,
            await this.loadData(),
        );
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    refreshEncoder() {
        const ranks: TiktokenBPE =
            this.settings.mode === 'claude' ? cl100k_base : o200k_base;
        this.enc = new Tiktoken(ranks);
        this.updateTokenCount();
    }

    private updateTokenCount() {
        if (!this.enc) return;

        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view?.editor) {
            this.statusBarItemEl.setText('');
            return;
        }

        try {
            const raw = this.enc.encode(view.editor.getValue()).length;
            const count =
                this.settings.mode === 'claude'
                    ? Math.ceil(raw * CLAUDE_SAFETY_MARGIN)
                    : raw;
            this.statusBarItemEl.setText(`Tokens: ${count.toLocaleString()}`);
        } catch {
            this.statusBarItemEl.setText('');
        }
    }

    onunload() {
        this.enc = null;
    }
}

class TiktokenTokenizerSettingTab extends PluginSettingTab {
    plugin: TiktokenTokenizerPlugin;

    constructor(app: App, plugin: TiktokenTokenizerPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName('Tokenizer model')
            .setDesc(
                'Choose which model family to count tokens for. Claude mode is an approximation (cl100k_base + 15% safety margin) — see the README for methodology.',
            )
            .addDropdown((dropdown) =>
                dropdown
                    .addOption('gpt', 'GPT-4o / GPT-5 (exact)')
                    .addOption('claude', 'Claude (approximate)')
                    .setValue(this.plugin.settings.mode)
                    .onChange(async (value) => {
                        this.plugin.settings.mode =
                            value === 'claude' ? 'claude' : 'gpt';
                        await this.plugin.saveSettings();
                        this.plugin.refreshEncoder();
                    }),
            );
    }
}
