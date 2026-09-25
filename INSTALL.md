# Installing Hyper Cards

These instructions currently cover **macOS, [Hyper](https://hyper.is), and [zsh](https://www.zsh.org/)**.

Hyper Cards has two core parts:

- a local Hyper plugin
- a small zsh module

The repository also includes optional appearance files for Hyper and [Starship](https://starship.rs/), along with a modified FiraCode Nerd Font Mono used by the supplied prompt preset.

## Choose your setup

Use **Fresh setup** if you are starting with a new or mostly unchanged Hyper installation.

Use **Existing Hyper setup** if you already have Hyper settings, plugins, a custom prompt, or a Starship configuration that you want to keep.

## Fresh setup

### 1. Install Hyper

With Homebrew:

```sh
brew update
brew install --cask hyper
```

Open Hyper once after installation.

### 2. Confirm zsh

Run:

```sh
echo "$SHELL"
```

A standard macOS zsh setup normally returns:

```text
/bin/zsh
```

### 3. Install fzf

[fzf](https://github.com/junegunn/fzf) provides the searchable command-history window used by Hyper Cards.

With Homebrew:

```sh
brew install fzf
```

You do not need to add fzf initialization code manually.

The Hyper Cards shell module loads the fzf zsh integration when fzf is available.

If fzf is not installed, the module falls back to the standard zsh reverse history search.

### 4. Install Starship

Starship is not required for command cards, but it is required for the supplied prompt appearance.

With Homebrew:

```sh
brew install starship
```

Add this line to `~/.zshrc` if it is not already present:

```sh
eval "$(starship init zsh)"
```

### 5. Install Hyper Cards

Hyper Cards is loaded by Hyper as a local plugin. Keep the repository itself in Hyper's local-plugin folder so the plugin and shell module come from the same installation.

Create the local-plugin directory:

```sh
mkdir -p "$HOME/.hyper_plugins/local"
```

Clone Hyper Cards directly into it:

```sh
git clone https://github.com/drabhikroy/HyperCards.git \
  "$HOME/.hyper_plugins/local/hyper-command-cards"
```

After cloning, the plugin should be available at:

```text
~/.hyper_plugins/local/hyper-command-cards
```

If that path already contains an existing Hyper Cards Git installation, do not clone over it. See **Updating Hyper Cards** below.

If you downloaded the repository as a ZIP instead, extract it and place the extracted HyperCards folder at:

```text
~/.hyper_plugins/local/hyper-command-cards
```

The final folder must contain `index.js`, `package.json`, `shell/`, `presets/`, and the other repository files directly.

### 6. Install the modified FiraCode Nerd Font Mono

The supplied prompt uses the included modified [FiraCode Nerd Font Mono](https://github.com/ryanoasis/nerd-fonts/tree/master/patched-fonts/FiraCode) from [Nerd Fonts](https://www.nerdfonts.com/).

This project refers to the modified font as **Short76**. Short76 is not an official Nerd Fonts typeface or family name.

The included font file is:

```text
FiraCodeNerdFontMonoShort76-Regular.ttf
```

Copy it to your user font folder:

```sh
cp fonts/FiraCodeNerdFontMonoShort76-Regular.ttf \
  "$HOME/Library/Fonts/"
```

Restart Hyper if the newly installed font does not appear right away.

### 7. Enable the Hyper plugin

Open:

```text
~/.hyper.js
```

Find the `localPlugins` array and add:

```js
"hyper-command-cards"
```

For example:

```js
localPlugins: [
  "hyper-command-cards"
]
```

If other local plugins are already listed, keep them and add Hyper Cards as another entry.

Hyper Cards belongs in `localPlugins`, not the normal `plugins` array.

### 8. Load the shell module

Add this line to `~/.zshrc`:

```sh
source "$HOME/.hyper_plugins/local/hyper-command-cards/shell/hyper-command-cards.zsh"
```

Add the line only once.

Place it near the end of `.zshrc`, after any shell setup that should load first.

Using the module directly from the Hyper Cards installation keeps the Hyper plugin and zsh integration on the same version.

### 9. Install the Starship preset

Skip this step if you do not want the supplied prompt appearance.

Create the configuration folder if needed:

```sh
mkdir -p "$HOME/.config"
```

If you do not already have a Starship configuration:

```sh
cp presets/starship.toml \
  "$HOME/.config/starship.toml"
```

If `~/.config/starship.toml` already exists, follow the instructions under **Existing Hyper setup** rather than replacing it.

### 10. Review the Hyper preset

The repository includes:

```text
presets/hyper.js
```

This file contains the colors, font, cursor, spacing, and terminal settings used with Hyper Cards.

It is a reference configuration and should not replace an existing `~/.hyper.js`.

For a fresh setup, compare the preset with the configuration Hyper created and copy the settings you want.

### 11. Restart Hyper

Quit Hyper completely with `⌘Q`.

Open Hyper again.

### 12. Test card creation

Run:

```sh
printf 'Hyper Cards is working\n'
```

The command and its output should appear together in a card.

### 13. Test long output

Run:

```sh
seq 1 20
```

The card should remain in the correct position while its output fills multiple terminal rows.

### 14. Test collapse

Run:

```sh
seq 1 20
```

Select the `−` control on the card.

The output should disappear and the terminal rows it occupied should be reclaimed.

Select `+` to restore the output.

### 15. Test multiline paste

Paste all of the following commands together:

```sh
printf 'one\n'
sleep 1
printf 'two\n'
seq 1 10
printf 'three\n'
```

Press Enter once.

The independent commands should run in order and receive separate cards.

### 16. Test terminal clearing

Create several cards, then run:

```sh
clear
```

The terminal should clear completely.

No card panel, border, control, collapsed shell, or other Hyper Cards element should remain visible.

Then run:

```sh
printf 'after clear\n'
```

A new card should appear normally.

### 17. Test command history

Press `⌘R`.

The searchable history window should open.

Press `⌘R` again.

The history window should close.

The tested history controls are:

| Shortcut | Action |
| --- | --- |
| `⌘R` | Open history |
| `⌘R` again | Close history |
| `Esc` | Close history |
| `Ctrl+R` | Open history with the standard zsh/fzf shortcut |
| `Enter` | Place the selected command at the prompt |

> **Important**
>
> `Ctrl+R` keeps its standard zsh/fzf behavior and is not a Hyper Cards toggle. Use `Esc` to close history opened with `Ctrl+R`.

### 18. Change the default history shortcut

Hyper Cards uses `⌘R` by default.

If that shortcut conflicts with another setting or you prefer another key, add a custom binding to the `keymaps` section of `~/.hyper.js`.

For example:

```js
keymaps: {
  "hyper-command-cards:history": "command+e",
},
```

After restarting Hyper:

- `⌘E` opens and closes Hyper Cards history
- `⌘R` is no longer assigned by Hyper Cards
- `Ctrl+R` still opens the standard zsh/fzf history search
- `Esc` still closes the history window

To return to the default `⌘R` binding, remove the custom `hyper-command-cards:history` entry and restart Hyper.

A user-defined Hyper binding takes precedence over the Hyper Cards default.

## Existing Hyper setup

Use these instructions if you already have Hyper, Starship, plugins, or shell customizations that you want to keep.

### 1. Back up your existing configuration

Back up only the files that already exist.

For Hyper:

```sh
[ -f "$HOME/.hyper.js" ] && \
  cp "$HOME/.hyper.js" "$HOME/.hyper.js.backup"
```

For zsh:

```sh
[ -f "$HOME/.zshrc" ] && \
  cp "$HOME/.zshrc" "$HOME/.zshrc.backup"
```

For Starship:

```sh
[ -f "$HOME/.config/starship.toml" ] && \
  cp "$HOME/.config/starship.toml" \
     "$HOME/.config/starship.toml.backup"
```

These backup files stay outside the HyperCards repository.

### 2. Install fzf if needed

Check whether fzf is already installed:

```sh
command -v fzf
```

If the command returns nothing and you want searchable history:

```sh
brew install fzf
```

### 3. Install Hyper Cards

If Hyper Cards is not already installed, create Hyper's local-plugin directory:

```sh
mkdir -p "$HOME/.hyper_plugins/local"
```

Then clone the repository directly into it:

```sh
git clone https://github.com/drabhikroy/HyperCards.git \
  "$HOME/.hyper_plugins/local/hyper-command-cards"
```

If `~/.hyper_plugins/local/hyper-command-cards` already contains a Hyper Cards Git installation, do not clone it again. See **Updating Hyper Cards** below.

### 4. Add the plugin to Hyper

Open:

```text
~/.hyper.js
```

Find `localPlugins`.

Add:

```js
"hyper-command-cards"
```

Keep any local plugins already listed.

For example:

```js
localPlugins: [
  "another-local-plugin",
  "hyper-command-cards"
]
```

### 5. Load the shell module

Add this line to `~/.zshrc` if it is not already present:

```sh
source "$HOME/.hyper_plugins/local/hyper-command-cards/shell/hyper-command-cards.zsh"
```

The shell module is loaded directly from the same installation Hyper uses for the local plugin.

Place the line near the end of `.zshrc`, after any shell setup that should load first.

### 6. Compare the Hyper preset

Compare your existing:

```text
~/.hyper.js
```

with:

```text
presets/hyper.js
```

Copy only the settings you want.

You do not need to replace your entire Hyper configuration to install the cards.

### 7. Compare the Starship preset

If you already use Starship, compare:

```text
~/.config/starship.toml
```

with:

```text
presets/starship.toml
```

The supplied preset controls the matching directory, Git, runtime, time, separator, and prompt-marker appearance.

You can copy those sections into your existing configuration rather than replacing the file.

### 8. Install the modified font if desired

The supplied prompt uses the same modified [FiraCode Nerd Font Mono](https://github.com/ryanoasis/nerd-fonts/tree/master/patched-fonts/FiraCode) described in the Fresh setup section.

Hyper Cards refers to this modified font as **Short76**. It is not an official Nerd Fonts typeface or family name.

Copy the font:

```sh
cp fonts/FiraCodeNerdFontMonoShort76-Regular.ttf \
  "$HOME/Library/Fonts/"
```

Then select `FiraCode Nerd Font Mono Short76` in your Hyper configuration if you want the supplied prompt proportions.

### 9. Restart Hyper

Quit Hyper completely with `⌘Q`, then reopen it.

Run the verification tests from the Fresh setup section.

### 10. Change the history shortcut if desired

The default history shortcut is `⌘R`.

To replace it, add a custom Hyper keymap entry:

```js
keymaps: {
  "hyper-command-cards:history": "command+e",
},
```

Restart Hyper after changing the binding.

The custom key takes precedence over the default.

`Ctrl+R` remains available separately as the standard zsh/fzf history shortcut.

## Updating Hyper Cards

If Hyper Cards was installed with Git, update the existing installation rather than cloning it again:

```sh
cd "$HOME/.hyper_plugins/local/hyper-command-cards"
git pull
```

The Hyper plugin and shell module update together because both are loaded from this directory.

After updating, quit Hyper completely with `⌘Q` and reopen it.

You can confirm the installed version with:

```sh
grep '"version"' \
  "$HOME/.hyper_plugins/local/hyper-command-cards/package.json" \
  | head -1
```

If Hyper Cards was installed from a ZIP rather than Git, replace the existing installation folder with the contents of the newer ZIP, then restart Hyper.

## Troubleshooting

### Cards do not appear

Check that the local plugin exists:

```sh
ls -la "$HOME/.hyper_plugins/local/hyper-command-cards"
```

You should see:

```text
index.js
package.json
```

Then check that `~/.hyper.js` contains:

```js
"hyper-command-cards"
```

inside `localPlugins`.

Quit and reopen Hyper after changing the plugin configuration.

### A card remains after `clear`

A full terminal clear should remove all visible Hyper Cards elements.

First, confirm that the current plugin files are in:

```text
~/.hyper_plugins/local/hyper-command-cards
```

Then quit Hyper completely and reopen it.

Run:

```sh
printf 'test\n'
clear
```

The terminal should be blank after `clear`.

### Command history does not open

Check for fzf:

```sh
command -v fzf
```

If it is not installed:

```sh
brew install fzf
```

Quit and reopen Hyper.

### `Ctrl+R` does not close history

This is expected.

`Ctrl+R` keeps the standard zsh/fzf behavior and is not used as the Hyper Cards toggle.

Use `Esc` to close the history window.

The configurable Hyper Cards shortcut, `⌘R` by default, opens and closes history.

### The history shortcut conflicts with another shortcut

Change the Hyper Cards binding in `~/.hyper.js`.

For example:

```js
keymaps: {
  "hyper-command-cards:history": "command+e",
},
```

Restart Hyper afterward.

Removing the custom entry restores the default `⌘R` binding.

### The prompt looks different from the screenshots

The cards and the Starship prompt are separate.

Check Starship:

```sh
starship --version
```

Confirm that `~/.zshrc` contains:

```sh
eval "$(starship init zsh)"
```

Then compare your configuration with:

```text
presets/starship.toml
```

### The Powerline separator looks too tall

The supplied prompt was designed around the included modified FiraCode Nerd Font Mono.

Hyper Cards refers to this modified font as **Short76**.

Confirm that the font is installed and that Hyper is configured to use:

```text
FiraCode Nerd Font Mono Short76
```

### A pasted block waits for another Enter press

Some valid shell expressions naturally span several lines.

zsh may display continuation marks while waiting for the complete expression.

After the complete block has been pasted, press Enter once.

### Searchable history is unavailable

Hyper Cards can still use the standard zsh reverse history search without fzf.

Install fzf if you want the searchable history window:

```sh
brew install fzf
```

## Removing Hyper Cards

Remove the local plugin:

```sh
rm -rf "$HOME/.hyper_plugins/local/hyper-command-cards"
```

Remove the shell module:

```sh
rm -rf "$HOME/.config/hyper-command-cards"
```

Remove:

```js
"hyper-command-cards"
```

from the `localPlugins` array in `~/.hyper.js`.

Remove this line from `~/.zshrc`:

```sh
source "$HOME/.config/hyper-command-cards/hyper-command-cards.zsh"
```

Remove any custom Hyper Cards entry from the `keymaps` section of `~/.hyper.js`.

Quit and reopen Hyper.

The Hyper and Starship appearance settings can remain unless you also want to remove them.

If you installed the modified font only for Hyper Cards and no longer want it, remove:

```text
~/Library/Fonts/FiraCodeNerdFontMonoShort76-Regular.ttf
```
