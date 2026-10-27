import { createHighlighterCore, type HighlighterCore, type ThemedToken } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import { bundledLanguages, bundledLanguagesAlias } from "shiki/langs";
import { bundledThemes } from "shiki/themes";
import { filePath, type DiffFile } from "../../../shared/types";

export type Token = { content: string; style?: Record<string, string> };
export type HighlightedFile = { old?: Token[][]; new?: Token[][] };

const SPECIAL_NAMES: Record<string, string> = {
  dockerfile: "docker",
  containerfile: "docker",
  makefile: "make",
  gnumakefile: "make",
  "cmakelists.txt": "cmake",
  gemfile: "ruby",
  rakefile: "ruby",
  justfile: "just",
  ".gitignore": "ini",
  ".npmrc": "ini",
  ".editorconfig": "ini",
};

const EXTENSION_ALIASES: Record<string, string> = {
  mjs: "javascript",
  cjs: "javascript",
  mts: "typescript",
  cts: "typescript",
  h: "c",
  hh: "cpp",
  hpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  htm: "html",
  jsonl: "json",
  lock: "json",
  zsh: "shellscript",
  conf: "ini",
};

export function detectLanguage(path: string): string | null {
  const name = (path.split("/").at(-1) ?? path).toLowerCase();
  if (name.startsWith(".env")) return "dotenv";
  const special = SPECIAL_NAMES[name];
  if (special) return special;
  const dot = name.lastIndexOf(".");
  if (dot === -1) return null;
  const ext = name.slice(dot + 1);
  const id = EXTENSION_ALIASES[ext] ?? ext;
  if (Object.hasOwn(bundledLanguages, id)) return id;
  if (Object.hasOwn(bundledLanguagesAlias, id)) return id;
  return null;
}

let highlighter: Promise<HighlighterCore> | null = null;

function getHighlighter(): Promise<HighlighterCore> {
  highlighter ??= createHighlighterCore({
    themes: [bundledThemes["github-light"](), bundledThemes["github-dark"]()],
    langs: [],
    engine: createJavaScriptRegexEngine({ forgiving: true }),
  });
  return highlighter;
}

async function ensureLanguage(core: HighlighterCore, lang: string): Promise<void> {
  if (core.getLoadedLanguages().includes(lang)) return;
  const load =
    bundledLanguages[lang as keyof typeof bundledLanguages] ??
    bundledLanguagesAlias[lang as keyof typeof bundledLanguagesAlias];
  if (load) await core.loadLanguage(load);
}

function toTokens(core: HighlighterCore, code: string, lang: string): Token[][] {
  const { tokens } = core.codeToTokens(code, {
    lang,
    themes: { light: "github-light", dark: "github-dark" },
    defaultColor: false,
    tokenizeMaxLineLength: 2000,
  });
  return tokens.map((line) =>
    line.map((token: ThemedToken) => ({ content: token.content, style: token.htmlStyle })),
  );
}

// Highlighting is synchronous CPU work, so run one file at a time and yield in between.
let queue: Promise<unknown> = Promise.resolve();
const yieldToEventLoop = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job);
  queue = run.then(yieldToEventLoop, yieldToEventLoop);
  return run;
}

export function highlightFile(file: DiffFile): Promise<HighlightedFile | null> {
  const lang = detectLanguage(filePath(file));
  if (!lang || file.binary || (file.oldContent === undefined && file.newContent === undefined)) {
    return Promise.resolve(null);
  }
  return enqueue(async () => {
    const core = await getHighlighter();
    await ensureLanguage(core, lang);
    if (!core.getLoadedLanguages().includes(lang)) return null;
    return {
      old: file.oldContent === undefined ? undefined : toTokens(core, file.oldContent, lang),
      new: file.newContent === undefined ? undefined : toTokens(core, file.newContent, lang),
    };
  });
}

/** Tokens for a diff line, or null if they don't match its content (the file changed since). */
export function lineTokens(tokens: Token[][] | undefined, lineNo: number | null, content: string) {
  if (!tokens || lineNo === null) return null;
  const line = tokens[lineNo - 1];
  if (!line) return null;
  const expected = content.replace(/\r$/, "");
  return line.map((token) => token.content).join("") === expected ? line : null;
}
