# Hyper Cards

[![License](https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0.0-blue)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS-lightgrey)](#requirements)
[![Hyper](https://img.shields.io/badge/Hyper-plugin-000000?logo=hyper&logoColor=white)](https://hyper.is)
[![Shell](https://img.shields.io/badge/shell-zsh-lightgrey)](https://www.zsh.org/)
[![Release](https://img.shields.io/github/v/release/drabhikroy/HyperCards)](https://github.com/drabhikroy/HyperCards/releases)

Hyper Cards turns terminal commands and their output into separate visual cards inside [Hyper](https://hyper.is).

Each command stays connected to its output, making long terminal sessions easier to scan, copy, collapse, and revisit.

![Hyper Cards overview](assets/screenshots/hyper-cards-overview.png)

> **Current scope**
>
> Hyper Cards is currently built and tested on macOS with Hyper and zsh.

## Features

- Places each completed command and its output in a separate card
- Keeps card controls visible while long output scrolls
- Copies output, the command, or both together
- Selects multiple cards and copies their output, commands, or both in terminal order
- Groups commands from the same multiline paste into a numbered batch with shared copy controls
- Collapses output and reclaims the terminal rows it occupied
- Restores collapsed output when needed
- Removes cards when the terminal is cleared
- Handles pasted groups of independent commands one at a time
- Adds searchable command history through fzf
- Keeps standard `Ctrl+R` history access available
- Adds a configurable Mac history shortcut
- Includes matching Hyper and Starship presets
- Supports keyboard navigation within card controls
- Uses text and symbols rather than color alone to communicate controls and state

## Card controls

Each completed card includes controls in its upper-right corner.

The `○` control selects a card for multi-card copying. It changes to `✓` when the card is selected.

**Copy** copies the card output.

The menu beside Copy includes:

- Copy output
- Copy command
- Copy command + output

![Copy menu](assets/screenshots/copy-menu.png)

The `−` control collapses a card.

The `+` control restores it.

Collapsed cards remove their output rows from the visible terminal rather than simply hiding them.

![Collapsed card](assets/screenshots/collapsed-card.png)

## Multi-card copy

Multiple cards can be selected and copied together without combining them manually.

Select the `○` control on each card you want to include. Selected cards are marked with `✓` and a compact control bar appears with the number of selected cards.

![Multi-card selection](assets/screenshots/multi-select.png)

The bulk Copy menu provides the same three choices as an individual card:

- Copy output
- Copy command
- Copy command + output

Selected cards are copied in their original terminal order, regardless of the order in which they were selected.

A successful bulk copy clears the selection. **Cancel** or `Esc` clears the selection without copying.

## Command batches

When several independent commands are pasted together, Hyper Cards keeps each command in its own card and marks the related cards as one batch.

A compact numbered badge sits beside the batch rail. The badge remains associated with the batch as its cards move through the terminal.

![Command batch count](assets/screenshots/batch-count.png)

Hover over or move keyboard focus to the batch badge to reveal its **Copy** control. The batch menu provides the same three choices as an individual card:

- Copy output
- Copy command
- Copy command + output

Each command remains a normal Hyper Card with its own selection, Copy, and collapse controls. Batch copying simply provides a second way to work with commands that arrived together.

When more than one batch is present, each count remains tied to its own group as terminal content moves.

| Batch Copy menu | Multiple batch counts |
| --- | --- |
| <img src="assets/screenshots/batch-copy-menu.png" alt="Hyper Cards batch Copy menu with output, command, and command plus output options"> | <img src="assets/screenshots/batch-count-stack.png" alt="Hyper Cards showing separate numbered command batches while terminal content moves"> |

## Keyboard access

Card controls can be used from the keyboard once focus moves into them.

- `Tab` moves forward through the controls
- `Shift+Tab` moves backward
- `Enter` or `Space` activates the selected control
- Arrow keys move through the Copy menu
- `Home` and `End` jump within the Copy menu
- `Esc` clears an active multi-card selection or returns focus to the terminal

No default shortcut is assigned for moving focus into the card controls. This avoids taking over another commonly used Hyper or macOS shortcut.

## Command history

Hyper Cards adds a Mac history shortcut while keeping the standard terminal shortcut available.

![Command history picker](assets/screenshots/history-picker.png)

| Shortcut | Action |
| --- | --- |
| `⌘R` | Open command history |
| `⌘R` again | Close command history |
| `Esc` | Close command history |
| `Ctrl+R` | Open history with the standard zsh/fzf shortcut |
| `Enter` | Place the selected command at the prompt |

> **Important**
>
> `Ctrl+R` is not a toggle. Pressing it again does not close the history window. Use `Esc` to close history opened with `Ctrl+R`.

### Changing the history shortcut

`⌘R` is the default Hyper Cards shortcut, but it can be changed without editing the plugin.

Add a custom binding to the `keymaps` section of `~/.hyper.js`.

```js
keymaps: {
  "hyper-command-cards:history": "command+e",
},
```

In this example, `⌘E` replaces `⌘R`.

A user-defined Hyper binding takes precedence over the Hyper Cards default. Removing the custom entry restores `⌘R`.

The standard `Ctrl+R` zsh/fzf shortcut is separate and remains available regardless of the Hyper Cards binding.

## Multiline paste

Hyper Cards can process several independent shell commands pasted at the same time.

For example:

```sh
printf 'one\n'
printf 'two\n'
printf 'three\n'
```

The shell module checks whether each nonblank line is valid zsh syntax on its own.

If it is, the commands are queued and sent one at a time as each new prompt becomes ready.

Commands queued from the same paste are marked as one batch. Each command still keeps its own card and controls.

Some shell structures naturally span several lines. Heredocs are one example.

In those cases, zsh may display continuation marks after the text is pasted. Press Enter once after the complete block has been entered.

## Long output

Cards can span many terminal rows while staying connected to the command that produced them.

![Long command output](assets/screenshots/long-output.png)

Card placement and controls remain connected to the correct output while the terminal scrolls.

## Clearing the terminal

Hyper Cards recognizes a full terminal clear and removes its card overlays and markers along with the terminal contents.

For example:

```sh
clear
```

After the clear completes, no card panels or controls should remain.

New commands continue creating cards normally afterward.

## Requirements

### Required

- macOS
- [Hyper](https://hyper.is)
- [zsh](https://www.zsh.org/)

### Recommended

- [Starship](https://starship.rs/) for the supplied prompt preset
- [fzf](https://github.com/junegunn/fzf) for searchable command history
- The included modified [FiraCode Nerd Font Mono](https://github.com/ryanoasis/nerd-fonts/tree/master/patched-fonts/FiraCode) for the intended prompt appearance

The card system does not depend on Starship.

If fzf is not installed, the shell module falls back to the standard zsh reverse history search.

## Installation

See [INSTALL.md](INSTALL.md) for complete setup instructions.

The installation guide includes separate paths for:

1. A new Hyper setup
2. An existing Hyper setup

Back up existing Hyper, zsh, and Starship configuration before making manual changes.

Hyper Cards does not automatically replace an existing Hyper or Starship configuration.

## Included files

The repository contains the plugin, shell module, appearance presets, documentation, screenshots, font files, licensing material, and installation helpers.

```text
HyperCards/
├── index.js
├── package.json
├── README.md
├── INSTALL.md
├── LICENSE
├── NOTICE
├── assets/
│   └── screenshots/
│       ├── batch-copy-menu.png
│       ├── batch-count.png
│       ├── batch-count-stack.png
│       ├── collapsed-card.png
│       ├── copy-menu.png
│       ├── history-picker.png
│       ├── hyper-cards-overview.png
│       ├── long-output.png
│       ├── multi-select.png
│       └── prompt-main.png
├── fonts/
│   ├── FiraCodeNerdFontMonoShort76-Regular.ttf
│   ├── FONT-NOTICE.md
│   ├── NERD-FONTS-LICENSE.txt
│   └── OFL.txt
├── presets/
│   ├── hyper.js
│   └── starship.toml
├── scripts/
└── shell/
    └── hyper-command-cards.zsh
```

## Appearance

The supplied presets use a dark terminal background with restrained borders and clear separation between commands, output, prompt information, and controls.

![Hyper Cards prompt](assets/screenshots/prompt-main.png)

The Starship preset displays:

- current directory
- Git branch and state
- language runtime when present
- current time
- separate success and error prompt markers

The full directory path remains visible rather than being shortened.

## Modified FiraCode Nerd Font Mono

The supplied prompt uses a modified version of [FiraCode Nerd Font Mono](https://github.com/ryanoasis/nerd-fonts/tree/master/patched-fonts/FiraCode) from [Nerd Fonts](https://www.nerdfonts.com/).

For this project, the modified font is referred to as **Short76**. Short76 is not an official Nerd Fonts typeface or family name.

The modification shortens the Powerline separator glyph at U+E0B1 vertically so it sits more naturally beside the surrounding prompt text.

The included font is based on Fira Code 6.002 with Nerd Fonts 3.0.2.

The font remains under the SIL Open Font License 1.1. The applicable license and copyright notices are included in the `fonts` folder.

See:

- [`FONT-NOTICE.md`](fonts/FONT-NOTICE.md) for information about the modification
- [`OFL.txt`](fonts/OFL.txt) for the Fira Code license
- [`NERD-FONTS-LICENSE.txt`](fonts/NERD-FONTS-LICENSE.txt) for Nerd Fonts licensing information

## Hyper configuration

`presets/hyper.js` is a reference configuration.

It is not meant to replace an existing `~/.hyper.js` automatically.

People with an existing Hyper setup can compare the preset with their current configuration and copy only the sections they want.

## Starship configuration

`presets/starship.toml` contains the matching prompt configuration used during development and testing.

People with an existing Starship setup can copy the sections they want rather than replacing their current configuration.

## Tested behavior

The following have been tested on macOS:

- card creation
- copy controls
- multi-card selection
- bulk output copying
- bulk command copying
- bulk command + output copying
- terminal-order copying when cards are selected out of order
- selection clearing with Cancel and `Esc`
- command batch creation from multiline pastes
- batch-level output copying
- batch-level command copying
- batch-level command + output copying
- batch count tracking while terminal content moves
- multiple batch counts in the same session
- card collapse and restore
- terminal-row reclamation after collapse
- long-output scrolling
- multiline command queuing
- full terminal clear with no card remnants
- new card creation after a clear
- searchable history
- `⌘R` history open and close
- custom Hyper history shortcut overrides
- `Ctrl+R` history access
- `Esc` history close
- keyboard navigation within card controls

## Screenshots and privacy

The screenshots in this repository were reviewed before publication for visible personal information, sensitive strings, and image metadata.

They use example terminal content and document how Hyper Cards looks and behaves. Appearance may vary with the terminal theme, font, shell configuration, and Starship settings.

## License

Hyper Cards is licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE).

Personal use, personal study, hobby projects, teaching, academic research, and other noncommercial uses are permitted. The license also permits use by charitable organizations, educational institutions, public research organizations, public safety or health organizations, environmental protection organizations, and government institutions.

Commercial use requires a separate license.

Required Notice: Copyright 2026 Abhik Roy.

Hyper Cards is an independent project made for use with [Hyper](https://hyper.is). Hyper is separate software and is distributed under the MIT License. Hyper's license applies to Hyper and its source code. The PolyForm Noncommercial License applies to the original Hyper Cards software in this repository.

Nothing in the Hyper Cards license changes the terms that apply to Hyper itself.

The modified [FiraCode Nerd Font Mono](https://github.com/ryanoasis/nerd-fonts/tree/master/patched-fonts/FiraCode) included with this project remains under the SIL Open Font License 1.1. Its license and copyright notices are included with the font files.

Other third-party software or assets remain under their respective licenses.
