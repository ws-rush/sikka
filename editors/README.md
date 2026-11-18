# Editor Support for Sikka

Syntax highlighting and language support for `.sikka` template files. After `npm install sikka`, these files are also available at `node_modules/sikka/editors/`.

## VS Code / Cursor / Windsurf / VSCodium / Antigravity

Copy or symlink `editors/vscode/` into your editor's extensions directory, or package it with `vsce package`:

```bash
ln -s "$(pwd)/editors/vscode" ~/.vscode/extensions/sikka
```

(Replace `~/.vscode/extensions/` with `~/.cursor/extensions/`, `~/.windsurf/extensions/`, `~/.vscode-oss/extensions/`, or `~/.antigravity/extensions/` as needed.)

## JetBrains IDEs (WebStorm, IntelliJ IDEA, etc.)

1. Open **Settings / Preferences** → **Editor** → **TextMate Bundles**.
2. Click **+** and select the `editors/vscode/` directory.
3. Apply and reopen `.sikka` files.

## Sublime Text / TextMate / Shiki / Monaco

Use the TextMate grammar at `editors/vscode/syntaxes/sikka.tmLanguage.json`:

- **Sublime Text / TextMate**: Copy `sikka.tmLanguage.json` into your `Packages/User/` (Sublime) or `Bundles/` (TextMate) directory.
- **Shiki / Monaco**: Pass `sikka.tmLanguage.json` as a custom TextMate language (`scopeName: "source.sikka"`).

## Vim / Neovim

### Vimscript (`editors/vim/`)

Add `editors/vim/` to your runtimepath (e.g. with `vim-plug`, `lazy.nvim`, or `~/.vim/`):

```vim
set runtimepath+=/path/to/sikka/editors/vim
```

### Neovim Tree-sitter (`editors/tree-sitter-sikka/`)

Register the parser and copy or symlink `editors/tree-sitter-sikka/queries/` into your `queries/sikka/` directory:

```lua
local parser_config = require("nvim-treesitter.parsers").get_parser_configs()
parser_config.sikka = {
  install_info = {
    url = "/path/to/sikka/editors/tree-sitter-sikka",
    files = { "src/parser.c" },
  },
  filetype = "sikka",
}
vim.filetype.add({ extension = { sikka = "sikka" } })
```

## Helix / Zed

Point your editor's Tree-sitter grammar configuration to `editors/tree-sitter-sikka/` and its `queries/` (`highlights.scm` and `injections.scm`):

- **Helix**: Add `sikka` to `languages.toml` with `grammar` pointing to `editors/tree-sitter-sikka/` and link `queries/` to `~/.config/helix/runtime/queries/sikka/`.
- **Zed**: Reference `editors/tree-sitter-sikka/` in your Zed extension's `extension.toml` and `languages/sikka/`.

## Emacs

Load `editors/emacs/sikka-mode.el` in your init file:

```elisp
(load "/path/to/sikka/editors/emacs/sikka-mode.el")
```

This enables `sikka-mode` (derived from `html-mode`) automatically for `*.sikka` files. For Tree-sitter (`treesit`) support in Emacs 29+, compile the grammar in `editors/tree-sitter-sikka/`.
