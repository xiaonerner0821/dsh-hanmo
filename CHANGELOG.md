# Changelog

## 1.0.0

First public release. Earlier builds (1.9.x) were private and shipped as
`@local/magpie-sidebar`.

- Sidebar: outlined tiles with a cyan glow, a selection that slides between rows on a spring, a comet trace on New Session.
- Main panel: glass composer, a stats chip and a separate context-meter chip.
- Colour themes: Han (default), One Dark Pro, Dracula, Monokai, Night Owl, Solarized and GitHub. Each is also registered with DSH's theme service, so it appears in Settings > General.
- Appearance popover in the session header: theme, light/dark, UI and code fonts, font sizes, text colour (per theme) and panel opacity.
- File preview tab in the main panel with Shiki highlighting and a diff toolbar.

### Changes from the private builds

- Package renamed to `@xiaonerner0821/dsh-hanmo`; the DOM marker is now `data-hanmo`.
- localStorage keys moved from `creator-skin:*` / `magpie-sidebar:*` to `hanmo:*`. On first load, settings saved by a private build (theme, fonts, text colour, panel opacity, diff options) are copied to the new keys. The old keys are left untouched.
- Disable or remove `@local/magpie-sidebar` before enabling this package: both register the same theme ids and restyle the same sidebar.

## 1.0.1

- Appearance popover: added font-weight controls for body text and code (four steps: 300 · 400 · 500 · 600). The selection is persisted in `hanmo:look` and migrates forward with all other look settings.
- New **DeepSeek Harness** entry in the theme picker (also in Settings > General): one click returns DSH to its unthemed look. It lifts the sidebar and main-panel skins, Han's dark palette, the text-colour, opacity and weight layers, and resets the fonts and sizes to DSH's built-in stack; the sizes come back when you leave it. The appearance button, the Settings row and the file preview tab stay, so switching back is one click. The plugin's own controls hide while it is active.
