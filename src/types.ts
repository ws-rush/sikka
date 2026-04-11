// ─── Render / Engine types ────────────────────────────────────────────────────

/** A compiled render function produced by the compiler. */
export type RenderFunction = (
  props: Record<string, unknown>,
  slots?: Record<string, string>
) => string;

/** Injectable file-reader for runtime-agnostic file loading. */
export type FileReader = (path: string) => Promise<string>;

/** Options accepted by `render` and `compile`. */
export interface RenderOptions {
  /** Disables caching when true — templates are recompiled on every call. */
  devMode?: boolean;
  /** Injectable I/O implementation for loading templates from disk. */
  fileReader?: FileReader;
  /** Pre-rendered slot content keyed by slot name ("" = default slot). */
  slots?: Record<string, string>;
}

/** Options accepted by `new Engine()`. */
export interface EngineOptions {
  /** Directory path for template resolution. */
  views?: string;
  /** Async function to read file content. */
  readFile?: (path: string) => Promise<string>;
  /** Sync/Async function to resolve paths. */
  resolvePath?: (base: string, specifier: string) => string | Promise<string>;
  /** Custom name for the props variable (default: "Astro"). */
  varName?: string;
  /** Enables pretty-printing of runtime errors. */
  debug?: boolean;
  /** Whether to cache templates. */
  cache?: boolean;
  /** Maximum number of cache entries; LRU eviction when exceeded. Default: unlimited. */
  cacheSize?: number;
  /** Whether to automatically escape HTML. Default: true. */
  autoEscape?: boolean;
  /** Whether to automatically filter values. */
  autoFilter?: boolean;
  /** Custom filter function. */
  filterFunction?: (val: unknown) => unknown;
}

export interface EngineInstance {
  render(template: string, props?: Record<string, unknown>): Promise<string>;
  renderAsync(template: string, props?: Record<string, unknown>): Promise<string>;
  renderString(template: string, props?: Record<string, unknown>): Promise<string>;
  renderStringAsync(template: string, props?: Record<string, unknown>): Promise<string>;
  loadComponent(name: string, template: string): void;
  invalidate(key?: string): void;
}

// ─── AST types ────────────────────────────────────────────────────────────────

/** The root AST node produced by the parser. */
export interface TemplateAST {
  frontmatter: FrontmatterNode;
  body: TemplateNode[];
  imports: ComponentImport[];
}

/** The raw JS/TS source extracted from between the `---` fences. */
export interface FrontmatterNode {
  source: string;
}

/** A component import recorded from the frontmatter. */
export interface ComponentImport {
  /** The local identifier used in the template body, e.g. `"Button"`. */
  localName: string;
  /** The module specifier, e.g. `"./Button.astro"`. */
  specifier: string;
}

/** Union of all possible template body nodes. */
export type TemplateNode =
  | ElementNode
  | ExpressionNode
  | TextNode
  | SlotNode
  | ScriptNode
  | StyleNode
  | RawNode;

export interface ElementNode {
  type: 'element';
  tag: string;
  attrs: AttrNode[];
  children: TemplateNode[];
  selfClosing: boolean;
}

export interface AttrNode {
  name: string;
  /** String literal value, a dynamic expression, or `true` for boolean attributes. */
  value: string | ExpressionNode | true;
}

export interface ExpressionNode {
  type: 'expression';
  /** Raw JS/TS expression source, e.g. `"user.name"`. */
  source: string;
}

export interface TextNode {
  type: 'text';
  value: string;
}

export interface SlotNode {
  type: 'slot';
  /** Empty string for the default slot; a name string for named slots. */
  name: string;
  /** Fallback content. */
  children: TemplateNode[];
}

export interface ScriptNode {
  type: 'script';
  content: string;
}

export interface StyleNode {
  type: 'style';
  content: string;
}

export interface RawNode {
  type: 'raw';
  html: string;
}

// ─── Parser result types ──────────────────────────────────────────────────────

export interface ParseError {
  message: string;
  line: number;
  column: number;
}

export type ParseResult = { ok: true; ast: TemplateAST } | { ok: false; error: ParseError };

// ─── Compiler result types ────────────────────────────────────────────────────

export interface CompileError {
  message: string;
  /** The import specifier that could not be resolved, if applicable. */
  specifier?: string;
  /** The dependency cycle path, if applicable. */
  cycle?: string[];
}

export type CompileResult = { ok: true; fn: RenderFunction } | { ok: false; error: CompileError };

// ─── Cache interface ──────────────────────────────────────────────────────────

export interface Cache {
  get(key: string): RenderFunction | undefined;
  set(key: string, fn: RenderFunction): void;
  delete(key: string): void;
  clear(): void;
}

// ─── Error classes ────────────────────────────────────────────────────────────

/** Base class for all errors thrown by the template engine. */
export class TemplateEngineError extends Error {
  readonly code: string;
  readonly cause?: unknown;

  constructor(message: string, code: string, cause?: unknown) {
    super(message);
    this.name = 'TemplateEngineError';
    this.code = code;
    this.cause = cause;
  }
}

export class LoadError extends TemplateEngineError {
  readonly path: string;

  constructor(path: string, cause?: unknown) {
    super(`Failed to load template: ${path}`, 'LOAD_ERROR', cause);
    this.name = 'LoadError';
    this.path = path;
  }
}

export class RenderError extends TemplateEngineError {
  readonly expressionSource?: string;

  constructor(message: string, expressionSource?: string, cause?: unknown) {
    super(message, 'RENDER_ERROR', cause);
    this.name = 'RenderError';
    this.expressionSource = expressionSource;
  }
}
