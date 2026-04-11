/**
 * Compiler — Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 6.3, 7.1, 7.4
 *
 * Transforms a TemplateAST into a RenderFunction JS closure.
 *
 * Strategy:
 *   1. Walk the AST and emit a JS function body string
 *   2. Inject frontmatter source so props are in scope
 *   3. Emit __escape(expr) for ExpressionNode values
 *   4. Emit verbatim content for ScriptNode and StyleNode
 *   5. Substitute SlotNode with slot content from the `slots` argument
 *   6. Use new AsyncFunction(...) to support await in frontmatter
 *   7. Recursively resolve component imports via FileReader
 *   8. Detect circular dependencies via an in-progress path set
 */
import { escapeHtml, RawHtml } from './escape.js';
import { parse } from './parser.js';
/**
 * Recursively resolve and compile all component imports in an AST.
 *
 * Requirements: 2.6, 2.8, 7.1, 7.4
 *
 * @param imports     The `imports` array from the AST being compiled.
 * @param fileReader  Injectable file-reader for loading component source.
 * @param basePath    The path of the file that owns these imports (for relative resolution).
 * @param inProgress  Set of paths currently being compiled (cycle detection).
 */
export async function resolveComponents(imports, fileReader, basePath, inProgress = new Set()) {
    const components = {};
    for (const imp of imports) {
        // Resolve the specifier relative to the current file's directory.
        const resolvedPath = resolvePath(basePath, imp.specifier);
        // Circular dependency check — Requirement 7.4
        if (inProgress.has(resolvedPath)) {
            const cycle = [...inProgress, resolvedPath];
            return {
                ok: false,
                error: {
                    message: `Circular component dependency detected: ${cycle.join(' → ')}`,
                    specifier: imp.specifier,
                    cycle,
                },
            };
        }
        // Load the component source — Requirement 2.8 / 7.1
        let source;
        try {
            source = await fileReader(resolvedPath);
        }
        catch {
            return {
                ok: false,
                error: {
                    message: `Cannot resolve component: ${imp.specifier}`,
                    specifier: imp.specifier,
                },
            };
        }
        // Parse the component source
        const parseResult = parse(source);
        if (!parseResult.ok) {
            return {
                ok: false,
                error: {
                    message: `Parse error in component ${imp.specifier}: ${parseResult.error.message}`,
                    specifier: imp.specifier,
                },
            };
        }
        // Recursively resolve this component's own imports
        const childInProgress = new Set([...inProgress, resolvedPath]);
        const childResult = await resolveComponents(parseResult.ast.imports, fileReader, resolvedPath, childInProgress);
        if (!childResult.ok) {
            return childResult;
        }
        // Compile the component
        const compileResult = compileAST(parseResult.ast, { components: childResult.components });
        if (!compileResult.ok) {
            return { ok: false, error: compileResult.error };
        }
        components[imp.localName] = compileResult.fn;
    }
    return { ok: true, components };
}
/**
 * Higher-level compile entry point: resolves component imports then compiles the AST.
 *
 * Requirements: 2.6, 2.8, 7.1, 7.4, 6.3
 *
 * @param ast        The parsed TemplateAST.
 * @param options    Compile options including an optional fileReader and basePath.
 */
export async function compile(ast, options) {
    let components = options?.components ?? {};
    if (ast.imports.length > 0) {
        const fileReader = options?.fileReader;
        if (!fileReader) {
            // No file reader — any import is unresolvable
            const first = ast.imports[0];
            return {
                ok: false,
                error: {
                    message: `Cannot resolve component: ${first.specifier} (no fileReader provided)`,
                    specifier: first.specifier,
                },
            };
        }
        const basePath = options?.basePath ?? '';
        const result = await resolveComponents(ast.imports, fileReader, basePath);
        if (!result.ok) {
            return result;
        }
        // Merge resolved components with any pre-supplied ones
        components = { ...result.components, ...components };
    }
    return compileAST(ast, { ...options, components });
}
// ─── Path resolution helper ───────────────────────────────────────────────────
/**
 * Resolve a relative specifier against a base file path.
 * Keeps the engine free of Node.js `path` module — uses simple string manipulation.
 */
function resolvePath(basePath, specifier) {
    // If specifier is absolute or has no relative prefix, return as-is
    if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
        return specifier;
    }
    // Get the directory of the base path
    const lastSlash = basePath.lastIndexOf('/');
    const baseDir = lastSlash >= 0 ? basePath.slice(0, lastSlash) : '';
    // Join and normalise
    const joined = baseDir ? `${baseDir}/${specifier}` : specifier;
    return normalisePath(joined);
}
/**
 * Normalise a path by resolving `.` and `..` segments.
 */
function normalisePath(path) {
    const parts = path.split('/');
    const resolved = [];
    for (const part of parts) {
        if (part === '.' || part === '') {
            // skip
        }
        else if (part === '..') {
            resolved.pop();
        }
        else {
            resolved.push(part);
        }
    }
    // Preserve leading slash if present
    const prefix = path.startsWith('/') ? '/' : '';
    return prefix + resolved.join('/');
}
// AsyncFunction constructor — supports await in the function body.
// Functions created via `new Function` / `new AsyncFunction` run in sloppy
// mode (no inherited 'use strict'), which allows `with(props)` for prop scoping.
const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
/**
 * Compile a TemplateAST into a RenderFunction.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.7
 */
export function compileAST(ast, options) {
    try {
        const components = options?.components ?? {};
        const body = buildFunctionBody(ast, components, options);
        // The async render function receives injected helpers as named parameters:
        //   props        — the props object
        //   slots        — pre-rendered slot content strings keyed by slot name
        //   __escape     — escapeHtml helper
        //   __RawHtml    — RawHtml class
        //   __components — resolved child component render functions
        //   __classList  — class:list helper
        //   __styleObject — style object helper
        //   __filter      - optional filter function
        const asyncFn = new AsyncFunction('props', 'slots', '__escape', '__RawHtml', '__components', '__classList', '__styleObject', '__filter', body);
        const classListHelper = (arg) => {
            if (typeof arg === 'string')
                return arg;
            if (Array.isArray(arg))
                return arg.map(classListHelper).filter(Boolean).join(' ');
            if (arg && typeof arg === 'object') {
                return Object.entries(arg)
                    .filter(([_, v]) => v)
                    .map(([k]) => k)
                    .join(' ');
            }
            return '';
        };
        const styleObjectHelper = (arg) => {
            if (typeof arg === 'string')
                return arg;
            if (arg && typeof arg === 'object') {
                return Object.entries(arg)
                    .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}:${v}`)
                    .join(';');
            }
            return '';
        };
        const filterHelper = options?.autoFilter
            ? options.filterFunction || ((v) => v)
            : (v) => v;
        const renderFn = (props, slots) => {
            return asyncFn(props, slots ?? {}, escapeHtml, RawHtml, components, classListHelper, styleObjectHelper, filterHelper).catch((err) => {
                if (options?.debug) {
                    throw new Error(`Runtime Error: ${err instanceof Error ? err.message : String(err)}`);
                }
                throw err;
            });
        };
        return { ok: true, fn: renderFn };
    }
    catch (err) {
        return {
            ok: false,
            error: { message: err instanceof Error ? err.message : String(err) },
        };
    }
}
// ─── Function body builder ────────────────────────────────────────────────────
/**
 * Build the JS function body string for the compiled render function.
 *
 * The body:
 *   1. Opens a `with(props)` block so frontmatter can reference props by name
 *   2. Injects the frontmatter source verbatim
 *   3. Emits each template body node as `__out +=` statements
 *   4. Returns `__out`
 */
function buildFunctionBody(ast, components, options) {
    const lines = [];
    const varName = options?.varName || 'Astro';
    lines.push('let __out = "";');
    lines.push('');
    // Open with(props) block — sloppy mode (AsyncFunction via constructor) allows this.
    // This makes all prop keys available as bare identifiers in the frontmatter.
    lines.push(`const ${varName} = { props };`);
    lines.push('with (props) {');
    lines.push('');
    // Inject components into local scope
    for (const imp of ast.imports) {
        lines.push(`const ${imp.localName} = __components[${JSON.stringify(imp.localName)}];`);
    }
    if (ast.frontmatter.source.trim()) {
        lines.push('// --- frontmatter ---');
        // Remove import statements from frontmatter source to prevent runtime errors
        const cleanFM = ast.frontmatter.source.replace(/^\s*import\s+.*from\s+['"].*['"];?\s*$/gm, '');
        lines.push(cleanFM);
        lines.push('');
    }
    lines.push('// --- template body ---');
    for (const node of ast.body) {
        for (const l of emitNode(node, components, options)) {
            lines.push(l);
        }
    }
    lines.push('');
    lines.push('} // end with(props)');
    lines.push('');
    lines.push('return __out;');
    return lines.join('\n');
}
// ─── Node emitters ────────────────────────────────────────────────────────────
function emitNode(node, components, options) {
    switch (node.type) {
        case 'text':
            return emitText(node.value);
        case 'expression': {
            // Requirements 2.3, 2.4, 2.5 — escape the expression result
            const source = transformExpression(node.source);
            let expr = `__filter(${source})`;
            if (options?.autoEscape !== false) {
                expr = `__escape(${expr})`;
            }
            return [`__out += ${expr};`];
        }
        case 'element':
            return emitElement(node, components, options);
        case 'slot': {
            const slotName = node.name || 'default';
            const slotNameKey = JSON.stringify(slotName);
            const lines = [];
            lines.push(`if (slots[${slotNameKey}] !== undefined) {`);
            lines.push(`  __out += slots[${slotNameKey}];`);
            lines.push(`} else if (slots[${JSON.stringify('')}] !== undefined && ${JSON.stringify(slotName)} === "default") {`);
            lines.push(`  __out += slots[${JSON.stringify('')}];`);
            if (node.children.length > 0) {
                lines.push(`} else {`);
                for (const child of node.children) {
                    lines.push(...emitNode(child, components, options).map((l) => '  ' + l));
                }
            }
            lines.push(`}`);
            return lines;
        }
        case 'script':
            return [`__out += ${JSON.stringify('<script>' + node.content + '</script>')};`];
        case 'style':
            return [`__out += ${JSON.stringify('<style>' + node.content + '</style>')};`];
        case 'raw':
            return [`__out += ${JSON.stringify(node.html)};`];
        default:
            throw new Error(`Unknown node type: ${node.type}`);
    }
}
function emitText(value) {
    if (!value)
        return [];
    return [`__out += ${JSON.stringify(value)};`];
}
function emitElement(node, components, options) {
    const lines = [];
    // Check if this tag matches a known component or is an imported one
    if (node.tag in components) {
        return emitComponentCall(node, components, options);
    }
    // Opening tag
    lines.push(`__out += ${JSON.stringify('<' + node.tag)};`);
    // Attributes
    for (const attr of node.attrs) {
        lines.push(...emitAttr(attr));
    }
    if (node.selfClosing) {
        lines.push(`__out += " />";`);
        return lines;
    }
    lines.push(`__out += ">";`);
    // Children
    for (const child of node.children) {
        lines.push(...emitNode(child, components, options));
    }
    // Closing tag
    lines.push(`__out += ${JSON.stringify('</' + node.tag + '>')};`);
    return lines;
}
function emitAttr(attr) {
    if (attr.value === true) {
        // Boolean attribute
        return [`__out += ${JSON.stringify(' ' + attr.name)};`];
    }
    if (typeof attr.value === 'string') {
        return [`__out += ${JSON.stringify(' ' + attr.name + '="' + attr.value + '"')};`];
    }
    // Dynamic expression attribute
    const source = transformExpression(attr.value.source);
    if (attr.name === 'class:list') {
        return [`__out += " class=\\"" + __escape(__classList(${source})) + "\\"";`];
    }
    if (attr.name === 'style') {
        return [`__out += " style=\\"" + __escape(__styleObject(${source})) + "\\"";`];
    }
    return [`__out += " " + ${JSON.stringify(attr.name)} + '="' + __escape(${source}) + '"';`];
}
function emitComponentCall(node, components, options) {
    const lines = [];
    const localName = node.tag;
    // Build props object from JSX attributes
    const propParts = [];
    for (const attr of node.attrs) {
        if (attr.value === true) {
            propParts.push(`${JSON.stringify(attr.name)}: true`);
        }
        else if (typeof attr.value === 'string') {
            propParts.push(`${JSON.stringify(attr.name)}: ${JSON.stringify(attr.value)}`);
        }
        else {
            const source = transformExpression(attr.value.source);
            if (attr.name === 'class:list') {
                // For components, we might want to pass the raw class list or a processed one.
                // Astro passes a string if it's class:list on a component?
                // Actually, it passes the object/array to the component.
                propParts.push(`"class:list": (${source})`);
            }
            else {
                propParts.push(`${JSON.stringify(attr.name)}: (${source})`);
            }
        }
    }
    const propsExpr = `{${propParts.join(', ')}}`;
    // Build slot content from children
    lines.push(`{`);
    lines.push(`  const __childSlots = {};`);
    // Simple implementation: render all children into the default slot
    lines.push(`  let __defaultOut = "";`);
    for (const child of node.children) {
        const childLines = emitNode(child, components, options);
        for (const l of childLines) {
            lines.push('  ' + l.replace(/__out\b/g, '__defaultOut'));
        }
    }
    lines.push(`  if (__defaultOut !== "") {`);
    lines.push(`    __childSlots[""] = __defaultOut;`);
    lines.push(`    __childSlots["default"] = __defaultOut;`);
    lines.push(`  }`);
    lines.push(`  __out += await __components[${JSON.stringify(localName)}](${propsExpr}, __childSlots);`);
    lines.push(`}`);
    return lines;
}
/** Naive JSX-to-html transform for expressions. */
function transformExpression(source) {
    return source;
}
//# sourceMappingURL=compiler.js.map