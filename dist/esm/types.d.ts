/** A compiled render function produced by the compiler. */
export type RenderFunction = (props: Record<string, unknown>, slots?: Record<string, string>) => string;
/** Injectable file-reader for runtime-agnostic file loading. */
export type FileReader = (path: string) => Promise<string>;
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
export type TemplateNode = ElementNode | ExpressionNode | TextNode | SlotNode | ScriptNode | StyleNode | RawNode;
export interface SpreadAttrNode {
    type: 'spread';
    /** The expression inside the spread (including or excluding `...`, wait, if source is `...props` we can just keep it as source, or expression string) */
    expression: string;
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
export interface ParseError {
    message: string;
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
export interface CompileError {
    message: string;
    /** The import specifier that could not be resolved, if applicable. */
    specifier?: string;
    /** The dependency cycle path, if applicable. */
    cycle?: string[];
}
export type CompileResult = {
    ok: true;
    fn: RenderFunction;
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
//# sourceMappingURL=types.d.ts.map