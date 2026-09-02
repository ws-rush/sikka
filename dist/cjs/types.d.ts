/** A compiled render function produced by the compiler. */
export interface RenderFunction {
    (props: Record<string, unknown>, slots?: Record<string, string>): Promise<string>;
    render(props: Record<string, unknown>, slots?: Record<string, string | AsyncIterable<string>>): Promise<string>;
    renderSync(props: Record<string, unknown>, slots?: Record<string, string>): string;
}
/** A named Template returned by a source-mode resolver. */
export interface SourceTemplate {
    /** Canonical Template identity for caches and diagnostics. */
    id: string;
    /** Template source to compile. */
    source: string;
}
/** Resolves a Template request synchronously. */
export type SourceResolver = (request: string, importer?: string) => SourceTemplate;
interface SikkaRuntimeOptions {
    /** Enables pretty-printing of runtime errors. */
    debug?: boolean;
    /** Whether to cache templates. */
    cache?: boolean | Cache;
    /** Maximum number of cache entries; LRU eviction when exceeded. Default: unlimited. */
    cacheSize?: number;
    /** Whether to automatically escape HTML. Default: true. */
    autoEscape?: boolean;
    /** Whether to automatically filter values. */
    autoFilter?: boolean;
    /** Custom filter function. */
    filterFunction?: (val: unknown) => unknown;
    /** Whether to aggregate <script> and <style> tags. */
    aggregateAssets?: boolean;
}
/** Options for named source Template rendering. */
export interface SourceModeOptions extends SikkaRuntimeOptions {
    mode: 'source';
    resolver: SourceResolver;
    /** Compile-time custom name for the props variable (default: "Astro"). */
    varName?: string;
}
/** A statically generated Template module that has already been loaded by its host. */
export interface PrecompiledModule {
    /** Named regular Render export. */
    render(props: Record<string, unknown>, slots?: Record<string, string>): string;
    /** Named Streaming render export. */
    stream(props: Record<string, unknown>, slots?: Record<string, string>): AsyncGenerator<string>;
}
/** Synchronously resolves an entry key to an already-loaded generated module. */
export type PrecompiledResolver = (entry: string) => PrecompiledModule;
/** Options for named precompiled Template rendering. */
export interface PrecompiledModeOptions extends SikkaRuntimeOptions {
    mode: 'precompiled';
    resolver: PrecompiledResolver;
}
/** The root AST node produced by the parser. */
export interface TemplateAST {
    frontmatter: FrontmatterNode;
    body: TemplateNode[];
    imports: ComponentImport[];
}
/** The raw JS/TS source extracted from between the `---` fences. */
export interface FrontmatterNode {
    source: string;
    /** Whether the Frontmatter contains an `await` expression. */
    hasAwait: boolean;
}
/** A component import recorded from the frontmatter. */
export interface ComponentImport {
    /** The local identifier used in the template body, e.g. `"Button"`. */
    localName: string;
    /** The module specifier, e.g. `"./Button.astro"`. */
    specifier: string;
    /** Whether this import has the `.astro` Component specifier required by Sikka. */
    isComponent: boolean;
}
/** Union of all possible template body nodes. */
export type TemplateNode = ElementNode | ExpressionNode | TextNode | SlotNode | ScriptNode | StyleNode | RawNode;
export interface SpreadAttrNode {
    type: 'spread';
    /** The expression inside the spread. */
    expression: ExpressionNode;
}
export interface ElementNode {
    type: 'element';
    tag: string;
    attrs: (AttrNode | SpreadAttrNode)[];
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
    /** Nested nodes if any (for JSX support). */
    nodes?: (string | TemplateNode)[];
}
export interface TextNode {
    type: 'text';
    value: string;
}
export interface SlotNode {
    type: 'slot';
    /** Empty string for the default slot; a name string for named slots. */
    name: string;
    /** Dynamic expression for the slot name (takes precedence over `name` at runtime). */
    nameExpr?: ExpressionNode;
    /** Slot assignment when this Slot forwards content to a child Component. */
    slot?: string;
    /** Dynamic expression for the forwarded Slot assignment. */
    slotExpr?: ExpressionNode;
    /** Fallback content. */
    children: TemplateNode[];
}
export interface ScriptNode {
    type: 'script';
    content: string;
    attrs: (AttrNode | SpreadAttrNode)[];
}
export interface StyleNode {
    type: 'style';
    content: string;
    attrs: (AttrNode | SpreadAttrNode)[];
}
export interface RawNode {
    type: 'raw';
    html: string;
}
/** Stable category for every public Sikka failure. */
export type SikkaDiagnosticCategory = 'Parse' | 'Resolve' | 'Compile' | 'Render';
/** Stable machine-readable diagnostic context. Message wording is not stable API. */
export interface SikkaDiagnostic {
    message: string;
    category: SikkaDiagnosticCategory;
    template?: string;
    request?: string;
    importer?: string;
    construct?: string;
    cause?: unknown;
}
export interface ParseError extends SikkaDiagnostic {
    category: 'Parse';
    line: number;
    column: number;
}
export type ParseResult = {
    ok: true;
    ast: TemplateAST;
} | {
    ok: false;
    error: ParseError;
};
/** A compiled streaming render function that yields HTML chunks incrementally. */
export type StreamingRenderFunction = (props: Record<string, unknown>, slots?: Record<string, string>) => AsyncGenerator<string>;
export interface CompileError extends SikkaDiagnostic {
    message: string;
    /** The import specifier that could not be resolved, if applicable. */
    specifier?: string;
    /** The dependency cycle path, if applicable. */
    cycle?: string[];
}
export type CompileResult = {
    ok: true;
    fn: RenderFunction;
    source: string;
} | {
    ok: false;
    error: CompileError;
};
export type StreamingCompileResult = {
    ok: true;
    fn: StreamingRenderFunction;
    source: string;
} | {
    ok: false;
    error: CompileError;
};
export interface Cache {
    get(key: string): RenderFunction | undefined;
    set(key: string, fn: RenderFunction): void;
    delete(key: string): void;
    clear(): void;
}
export {};
