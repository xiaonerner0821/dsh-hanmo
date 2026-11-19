// CodeMirror 6 editor chunk shared by dsh-hanmo and magpie-sidebar.
// Only the lines in (and near) the viewport are rendered, so large files
// stay responsive. Colours come from CSS variables, so the DSH theme and the
// hanmo theme sheet repaint the editor without any JS reconfigure.
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, highlightSpecialChars } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentMore, indentLess } from '@codemirror/commands';
import { indentOnInput, indentUnit, bracketMatching, syntaxHighlighting, HighlightStyle, StreamLanguage } from '@codemirror/language';
import { searchKeymap, highlightSelectionMatches, search } from '@codemirror/search';
import { tags as t, highlightTree, highlightCode } from '@lezer/highlight';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { python } from '@codemirror/lang-python';
import { sql } from '@codemirror/lang-sql';
import { go } from '@codemirror/legacy-modes/mode/go';
import { rust } from '@codemirror/legacy-modes/mode/rust';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { yaml } from '@codemirror/legacy-modes/mode/yaml';
import { diff } from '@codemirror/legacy-modes/mode/diff';

const legacy = (mode) => () => StreamLanguage.define(mode);
const LANGS = {
  js: () => javascript(), mjs: () => javascript(), cjs: () => javascript(),
  jsx: () => javascript({ jsx: true }),
  ts: () => javascript({ typescript: true }), mts: () => javascript({ typescript: true }), cts: () => javascript({ typescript: true }),
  tsx: () => javascript({ typescript: true, jsx: true }),
  json: () => json(), jsonc: () => json(),
  md: () => markdown(), markdown: () => markdown(), mdx: () => markdown(),
  css: () => css(), scss: () => css(), less: () => css(),
  html: () => html(), htm: () => html(), xml: () => html(), svg: () => html(), vue: () => html(),
  py: () => python(), sql: () => sql(),
  go: legacy(go), rs: legacy(rust),
  sh: legacy(shell), bash: legacy(shell), zsh: legacy(shell),
  yml: legacy(yaml), yaml: legacy(yaml),
  diff: legacy(diff), patch: legacy(diff),
};

function languageFor(path) {
  const m = /\.([^./\\]+)$/.exec(path || '');
  const make = m && LANGS[m[1].toLowerCase()];
  return make ? make() : [];
}

const ACCENT = 'var(--cm-accent, var(--dsw-alias-interactive-primary, #3b82f6))';
const mix = (pct) => `color-mix(in srgb, ${ACCENT} ${pct}%, transparent)`;
const BORDER = 'var(--dsw-alias-border-l1, rgba(127,127,127,.18))';

const theme = EditorView.theme({
  '&': { height: '100%', color: 'var(--dsw-alias-label-primary)', backgroundColor: 'transparent', fontSize: '13px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--ds-font-family-code, ui-monospace, monospace)', lineHeight: '1.6', overflow: 'auto' },
  '.cm-content': { caretColor: ACCENT, padding: '14px 0' },
  '.cm-line': { padding: '0 24px 0 8px' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: ACCENT, borderLeftWidth: '2px' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': { backgroundColor: mix(26) },
  '.cm-activeLine': { backgroundColor: mix(5) },
  '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--dsw-alias-label-tertiary)', border: 'none' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--dsw-alias-label-secondary)' },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 6px 0 14px', minWidth: '26px' },
  '.cm-selectionMatch': { backgroundColor: mix(14) },
  '&.cm-focused .cm-matchingBracket': { backgroundColor: mix(20), outline: 'none' },
  '&.cm-focused .cm-nonmatchingBracket': { backgroundColor: 'rgba(220,38,38,.18)' },
  '.cm-searchMatch': { backgroundColor: 'rgba(234,179,8,.22)', outline: '1px solid rgba(234,179,8,.5)' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'rgba(234,179,8,.45)' },
  '.cm-panels': { backgroundColor: 'var(--dsw-alias-bg-layer-1, rgba(127,127,127,.06))', color: 'var(--dsw-alias-label-primary)' },
  '.cm-panels.cm-panels-top': { borderBottom: `1px solid ${BORDER}` },
  '.cm-panels.cm-panels-bottom': { borderTop: `1px solid ${BORDER}` },
  '.cm-panel.cm-search': { padding: '6px 10px', fontSize: '12px' },
  '.cm-textfield': { backgroundColor: 'var(--dsw-alias-bg-base)', border: `1px solid ${BORDER}`, borderRadius: '5px', padding: '3px 6px', color: 'inherit' },
  '.cm-button': { backgroundImage: 'none', backgroundColor: 'var(--dsw-alias-bg-base)', border: `1px solid ${BORDER}`, borderRadius: '5px', color: 'inherit', cursor: 'pointer' },
  '.cm-specialChar': { color: 'rgba(220,38,38,.8)' },
});

// Syntax colours are CSS classes, not literal values: the plugin stylesheet
// maps them to the DSH / hanmo theme tokens (--shiki-token-*), so the editor
// and the static preview blocks repaint with the theme and never need a
// JS reconfigure. The same class names are used by highlightCode() below, so a
// read-only Markdown code block and the editor colour a token identically.
const C = {
  kw: 'cmk-kw', str: 'cmk-str', num: 'cmk-num', com: 'cmk-com', fn: 'cmk-fn',
  type: 'cmk-type', prop: 'cmk-prop', tag: 'cmk-tag', fg: 'cmk-fg',
  ok: 'cmk-ok', err: 'cmk-err',
  h: 'cmk-md-h', b: 'cmk-md-b', i: 'cmk-md-i', u: 'cmk-md-u',
};

export const TOKEN_CSS = `
.cmk-kw{color:var(--shiki-token-keyword,#c678dd)}
.cmk-str{color:var(--shiki-token-string,#98c379)}
.cmk-num{color:var(--shiki-token-constant,#d19a66)}
.cmk-com{color:var(--shiki-token-comment,#7f848e);font-style:italic}
.cmk-fn{color:var(--shiki-token-function,#61afef)}
.cmk-type{color:var(--shiki-token-parameter,#e5c07b)}
.cmk-prop{color:var(--shiki-token-function,#61afef)}
.cmk-tag{color:var(--shiki-token-keyword,#e06c75)}
.cmk-fg{color:var(--shiki-foreground,inherit)}
.cmk-ok{color:var(--dsw-alias-state-success-primary,#2f9e44)}
.cmk-err{color:var(--dsw-alias-state-error-primary,#c92a2a)}
.cmk-md-h{font-weight:700;color:var(--shiki-token-keyword,#c678dd)}
.cmk-md-b{font-weight:700}
.cmk-md-i{font-style:italic}
.cmk-md-u{text-decoration:underline}
`;

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.operatorKeyword, t.modifier, t.controlKeyword, t.self, t.moduleKeyword], class: C.kw },
  { tag: [t.string, t.special(t.string), t.regexp], class: C.str },
  { tag: [t.number, t.bool, t.null, t.atom], class: C.num },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], class: C.com },
  // standard(variableName) = a legacy mode's "builtin" (shell commands like git / echo)
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.standard(t.variableName)], class: C.fn },
  { tag: [t.typeName, t.className, t.namespace], class: C.type },
  { tag: [t.propertyName, t.attributeName], class: C.prop },
  { tag: [t.tagName], class: C.tag },
  { tag: [t.variableName, t.operator, t.punctuation, t.bracket], class: C.fg },
  { tag: t.heading, class: C.h },
  { tag: t.strong, class: C.b },
  { tag: t.emphasis, class: C.i },
  { tag: t.link, class: C.u },
  { tag: t.url, class: C.fn },
  { tag: t.monospace, class: C.str },
  { tag: t.inserted, class: C.ok },
  { tag: t.deleted, class: C.err },
  { tag: t.invalid, class: C.err },
]);

// insert the class rules once per page; the editor needs them too, and the
// stylesheet must exist even when no editor was ever mounted (preview only)
if (typeof document !== 'undefined' && !document.querySelector('style[data-cm-tokens]')) {
  const s = document.createElement('style');
  s.setAttribute('data-cm-tokens', '');
  s.textContent = TOKEN_CSS;
  document.head.appendChild(s);
}

// Chinese UI strings for the search / go-to-line panels and screen-reader
// announcements (CodeMirror looks every label up through state.phrase)
const PHRASES = EditorState.phrases.of({
  'Find': '查找',
  'Replace': '替换',
  'next': '下一个',
  'previous': '上一个',
  'all': '全选',
  'match case': '区分大小写',
  'regexp': '正则',
  'by word': '全词匹配',
  'replace': '替换',
  'replace all': '全部替换',
  'close': '关闭',
  'current match': '当前匹配',
  'on line': '位于第',
  'replaced match on line $': '已替换第 $ 行的匹配',
  'replaced $ matches': '已替换 $ 处匹配',
  'Go to line': '跳转到行',
  'go': '跳转',
  'Control character': '控制字符',
  'Selection deleted': '已删除选中内容',
  'folded code': '已折叠代码',
  'unfold': '展开',
  'to': '至',
});

/**
 * Mount an editor in `parent`.
 * opts: { text, path, label, useTabs, onChange(view), onSave(), onEscape() -> bool }
 * The document is always LF text; only the visible lines are in the DOM.
 */
export function createEditor(parent, opts) {
  const langSlot = new Compartment();
  const editableSlot = new Compartment();
  const tabUnit = opts.useTabs ? '\t' : '  ';
  const extensions = [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    highlightSpecialChars(),
    history(),
    drawSelection(),
    indentOnInput(),
    bracketMatching(),
    highlightSelectionMatches(),
    search({ top: true }),
    indentUnit.of(tabUnit),
    EditorState.tabSize.of(4),
    syntaxHighlighting(highlight),
    theme,
    PHRASES,
    langSlot.of(languageFor(opts.path)),
    editableSlot.of(EditorView.editable.of(true)),
    // a read-only view (the 源码 mode) keeps the caret, selection and Ctrl+F
    // but rejects every edit
    EditorState.readOnly.of(!!opts.readOnly),
    keymap.of([
      { key: 'Mod-s', preventDefault: true, run: () => { opts.onSave?.(); return true; } },
      // Escape exits the editor only when clean, and only with no panel open
      // (an open search panel closes itself on Escape).
      { key: 'Escape', run: (view) => (!view.dom.querySelector('.cm-panels') && !!opts.onEscape?.()) },
      // Tab indents a selection, or inserts one indent unit at the caret
      {
        key: 'Tab',
        preventDefault: true,
        run: (view) => (view.state.readOnly ? false : view.state.selection.ranges.some((r) => !r.empty)
          ? indentMore(view)
          : (view.dispatch(view.state.replaceSelection(tabUnit)), true)),
      },
      { key: 'Shift-Tab', preventDefault: true, run: indentLess },
      ...searchKeymap, ...historyKeymap, ...defaultKeymap,
    ]),
    EditorView.contentAttributes.of({
      spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off',
      'aria-label': opts.label || 'editor',
    }),
    EditorView.updateListener.of((u) => { if (u.docChanged) opts.onChange?.(u.view); }),
  ];
  const view = new EditorView({ parent, state: EditorState.create({ doc: opts.text || '', extensions }) });
  return {
    view,
    getText: () => view.state.doc.toString(),
    length: () => view.state.doc.length,
    lines: () => view.state.doc.lines,
    /** Replace the whole document (a reload from disk); drops undo history. */
    setText(text) {
      const top = view.scrollDOM.scrollTop;
      view.setState(EditorState.create({ doc: text, extensions }));
      view.scrollDOM.scrollTop = top;
    },
    setPath(path) {
      view.dispatch({ effects: langSlot.reconfigure(languageFor(path)) });
    },
    setReadOnly(ro) {
      view.dispatch({ effects: editableSlot.reconfigure(EditorView.editable.of(!ro)) });
    },
    focus: () => view.focus(),
    destroy: () => view.destroy(),
  };
}

// fence info strings / Shiki language names that differ from a file extension
const LANG_ALIAS = {
  javascript: 'js', node: 'js', typescript: 'ts', python: 'py', py3: 'py',
  shell: 'sh', shellscript: 'sh', console: 'sh', ps: 'sh', rust: 'rs', golang: 'go',
  json5: 'json', yml: 'yml', html: 'html', xhtml: 'html', markdown: 'md',
};

/**
 * Statically highlight `code` in `lang` (a fence info string or extension).
 * Returns an HTML string (lines joined by "\n", tokens wrapped in
 * <span class="cmk-*">), or null when there is no parser for `lang`.
 */
export function highlightCodeBlock(code, lang) {
  let ext = (lang || '').trim().toLowerCase().replace(/^\./, '').split(/[\s{]/)[0];
  ext = LANG_ALIAS[ext] || ext;
  const make = LANGS[ext];
  if (!make) return null;
  const langSupport = make();
  // StreamLanguage wraps a parser; first-class Language has .parser directly
  const parser = langSupport && (langSupport.language ? langSupport.language.parser : (langSupport.parser || null));
  if (!parser) return null;
  const tree = parser.parse(code);
  let out = '';
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  highlightCode(
    code, tree, highlight,
    (text, classes) => {
      if (classes) out += `<span class="${classes}">${esc(text)}</span>`;
      else out += esc(text);
    },
    () => { out += '\n'; },
  );
  return out;
}
