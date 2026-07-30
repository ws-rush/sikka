/**
 * Compiler
 */
import { escapeHtml, RawHtml } from './escape.js';
import { parse, VOID_ELEMENTS } from './parser.js';
const STREAMING_TARGET = '__buf';
function createRuntimeHelpers(options) {
    return {
        classListHelper,
        styleObjectHelper,
        filterHelper: options?.autoFilter
            ? options.filterFunction || ((value) => value)
            : (value) => value,
    };
}
function classListHelper(arg) {
    if (typeof arg === 'string')
        return arg;
    if (arg instanceof Set)
        return Array.from(arg).join(' ');
    if (Array.isArray(arg))
        return arg.map(classListHelper).filter(Boolean).join(' ');
    return classListObject(arg);
}
function classListObject(arg) {
    if (!arg || typeof arg !== 'object')
        return '';
    return Object.entries(arg)
        .filter(([_, value]) => value)
        .map(([key]) => key)
        .join(' ');
}
function styleObjectHelper(arg) {
    if (typeof arg === 'string')
        return arg;
    if (!arg || typeof arg !== 'object')
        return '';
    return stringifiedStyleObject(arg);
}
function stringifiedStyleObject(arg) {
    if (typeof arg.toString === 'function' && arg.toString !== Object.prototype.toString) {
        return arg.toString();
    }
    return Object.entries(arg)
        .map(([key, value]) => `${key.replace(/[A-Z]/g, toKebabCase)}:${value}`)
        .join(';');
}
function toKebabCase(match) {
    return '-' + match.toLowerCase();
}
/**
 * Recursively resolve and compile all component imports in an AST (Synchronous).
 */
function resolveComponentsSync(imports, fileReader, basePath, options, inProgress = new Set()) {
    const components = {};
    for (const imp of imports.filter((item) => !options.components?.[item.localName])) {
        const result = resolveComponentImport(imp, fileReader, basePath, options, inProgress);
        if (!result.ok)
            return result;
        components[imp.localName] = result.fn;
    }
    return { ok: true, components };
}
function resolveComponentImport(imp, fileReader, basePath, options, inProgress) {
    if (!fileReader)
        return missingComponentReader(imp);
    const pathResult = resolveComponentPath(imp, basePath, inProgress);
    if (!pathResult.ok)
        return pathResult;
    return compileResolvedComponent(imp, fileReader, pathResult.path, options, inProgress);
}
function resolveComponentPath(imp, basePath, inProgress) {
    const path = resolvePath(basePath, imp.specifier);
    if (inProgress.has(path))
        return circularComponentError(imp, inProgress, path);
    return { ok: true, path };
}
function compileResolvedComponent(imp, fileReader, resolvedPath, options, inProgress) {
    const astResult = readComponentAST(imp, fileReader, resolvedPath);
    if (!astResult.ok)
        return astResult;
    const childResult = resolveComponentsSync(astResult.ast.imports, fileReader, resolvedPath, options, new Set([...inProgress, resolvedPath]));
    if (!childResult.ok)
        return childResult;
    return compileResolvedComponentAST(astResult.ast, options, childResult.components);
}
function compileResolvedComponentAST(ast, options, childComponents) {
    const result = compileAST(ast, {
        ...options,
        components: { ...options.components, ...childComponents },
    });
    return result.ok ? { ok: true, fn: result.fn } : result;
}
function missingComponentReader(imp) {
    return {
        ok: false,
        error: {
            message: `Cannot resolve component: ${imp.specifier} (no readFileSync provided)`,
            specifier: imp.specifier,
        },
    };
}
function circularComponentError(imp, inProgress, resolvedPath) {
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
function readComponentAST(imp, fileReader, resolvedPath) {
    const sourceResult = readComponentSource(imp, fileReader, resolvedPath);
    if (!sourceResult.ok)
        return sourceResult;
    return parseComponentSource(imp, sourceResult.source);
}
function readComponentSource(imp, fileReader, resolvedPath) {
    try {
        const source = fileReader(resolvedPath);
        return source == null ? unresolvedComponentError(imp) : { ok: true, source };
    }
    catch {
        return unresolvedComponentError(imp);
    }
}
function unresolvedComponentError(imp) {
    return {
        ok: false,
        error: { message: `Cannot resolve component: ${imp.specifier}`, specifier: imp.specifier },
    };
}
function parseComponentSource(imp, source) {
    const result = parse(source);
    if (result.ok)
        return { ok: true, ast: result.ast };
    return {
        ok: false,
        error: {
            message: `Parse error in component ${imp.specifier}: ${result.error.message}`,
            specifier: imp.specifier,
        },
    };
}
export const compile = compileSync;
/**
 * Higher-level compile entry point (Synchronous): resolves component imports then compiles the AST.
 */
function compileSync(ast, options) {
    const result = resolveCompileOptions(ast, options);
    if (!result.ok)
        return result;
    return compileAST(ast, { ...options, components: result.components });
}
function resolveCompileOptions(ast, options) {
    return ast.imports.length === 0
        ? resolvedInitialComponents(options)
        : resolveImportedComponents(ast.imports, options);
}
function resolvedInitialComponents(options) {
    return { ok: true, components: initialComponents(options) };
}
function resolveImportedComponents(imports, options) {
    const components = initialComponents(options);
    const result = resolveComponentImports(imports, options, components);
    return mergeResolvedComponents(result, components);
}
function resolveComponentImports(imports, options, components) {
    return resolveComponentsSync(imports, componentFileReader(options), componentBasePath(options), {
        ...options,
        components,
    });
}
function componentFileReader(options) {
    return options?.fileReader;
}
function componentBasePath(options) {
    return options?.basePath ?? '';
}
function mergeResolvedComponents(result, components) {
    if (!result.ok)
        return result;
    return { ok: true, components: { ...result.components, ...components } };
}
function initialComponents(options) {
    return options?.components ?? {};
}
function resolvePath(basePath, specifier) {
    if (!isRelativeSpecifier(specifier))
        return specifier;
    const lastSlash = basePath.lastIndexOf('/');
    const baseDir = lastSlash >= 0 ? basePath.slice(0, lastSlash) : '';
    return normalisePath(baseDir ? `${baseDir}/${specifier}` : specifier);
}
function isRelativeSpecifier(specifier) {
    return specifier.startsWith('./') || specifier.startsWith('../');
}
function normalisePath(path) {
    const resolved = [];
    for (const part of path.split('/')) {
        appendPathSegment(resolved, part);
    }
    return (path.startsWith('/') ? '/' : '') + resolved.join('/');
}
function appendPathSegment(resolved, part) {
    if (part === '.' || part === '')
        return;
    if (part === '..')
        resolved.pop();
    else
        resolved.push(part);
}
function compileAST(ast, options) {
    try {
        return compileASTUnsafe(ast, options);
    }
    catch (err) {
        return { ok: false, error: { message: err instanceof Error ? err.message : String(err) } };
    }
}
function compileASTUnsafe(ast, options) {
    const components = options?.components ?? {};
    const source = buildFunctionBody(ast, components, options, '__out', 'return __out;');
    const renderFn = createRenderFunction(createSyncFunction(source), components, createRuntimeHelpers(options), options?.debug);
    return { ok: true, fn: renderFn, source };
}
function createSyncFunction(source) {
    return new Function('props', 'slots', '__escape', '__RawHtml', '__components', '__classList', '__styleObject', '__filter', source);
}
function createRenderFunction(syncFn, components, helpers, debug) {
    const renderFn = (async (props, slots) => renderFn.renderSync(props, slots));
    renderFn.render = async function (props, slots) {
        const syncSlots = {};
        for (const [key, value] of Object.entries(slots ?? {})) {
            if (typeof value === 'string')
                syncSlots[key] = value;
        }
        return renderFn.renderSync(props, syncSlots);
    };
    renderFn.renderSync = (props, slots) => executeSyncFunction(syncFn, props, slots ?? {}, components, helpers, debug);
    return renderFn;
}
function executeSyncFunction(syncFn, props, slots, components, helpers, debug) {
    try {
        return syncFn(props, slots, escapeHtml, RawHtml, components, helpers.classListHelper, helpers.styleObjectHelper, helpers.filterHelper);
    }
    catch (err) {
        if (debug) {
            throw new Error(`Runtime Error: ${err instanceof Error ? err.message : String(err)}`, {
                cause: err,
            });
        }
        throw err;
    }
}
function buildFunctionBody(ast, components, options, target, completion) {
    const lines = [`let ${target} = "";`, ...buildFunctionPreamble(ast, options)];
    const bodyLines = ast.body.flatMap((node) => emitNode(node, components, options, target));
    lines.push(...mergeLines(bodyLines, target), completion);
    return lines.join('\n');
}
function buildFunctionPreamble(ast, options) {
    const varName = options?.varName || 'Astro';
    return [
        ...buildAstroPreamble(ast, varName),
        '',
        ...buildComponentPreamble(ast.imports),
        ...buildFrontmatterPreamble(ast.frontmatter.source),
    ];
}
function buildAstroPreamble(ast, varName) {
    if (!usesAstroGlobal(ast, varName))
        return [];
    return [
        `const ${varName} = {
      props,
      slots: {
        ...slots,
        render: (name) => new __RawHtml(slots[name] || ""),
        has: (name) => slots[name] !== undefined || (name === "default" && slots[""] !== undefined)
      }
    };`,
    ];
}
function usesAstroGlobal(ast, varName) {
    return ast.frontmatter.source.includes(varName) || JSON.stringify(ast.body).includes(varName);
}
function buildComponentPreamble(imports) {
    return imports.map(({ localName }) => `const ${localName} = __components[${JSON.stringify(localName)}];`);
}
function buildFrontmatterPreamble(source) {
    if (!source.trim())
        return [];
    const cleanSource = source
        .replace(/^\s*import\s+[\s\S]*?from\s+['"].*?['"];?\s*$/gm, '')
        .replace(/^\s*export\s+/gm, '');
    return [cleanSource, ''];
}
function mergeLines(bodyLines, target) {
    const lines = [];
    const prefix = `${target} += `;
    let index = 0;
    while (index < bodyLines.length) {
        const result = mergeLineAt(bodyLines, index, prefix, target);
        lines.push(result.line);
        index = result.nextIndex;
    }
    return lines;
}
function mergeLineAt(bodyLines, index, prefix, target) {
    const expression = outputExpression(bodyLines[index], prefix);
    if (expression === undefined)
        return { line: bodyLines[index], nextIndex: index + 1 };
    const merged = mergeAdjacentOutputExpressions(bodyLines, index + 1, prefix, expression);
    return { line: `${target} += ${merged.expression};`, nextIndex: merged.nextIndex };
}
function outputExpression(line, prefix) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(prefix))
        return undefined;
    const expression = trimmed.slice(prefix.length);
    return expression.endsWith(';') ? expression.slice(0, -1) : expression;
}
function mergeAdjacentOutputExpressions(bodyLines, index, prefix, expression) {
    let merged = expression;
    let nextIndex = index;
    while (nextIndex < bodyLines.length) {
        const nextExpression = outputExpression(bodyLines[nextIndex], prefix);
        if (nextExpression === undefined)
            break;
        merged = combineOutputExpressions(merged, nextExpression);
        nextIndex++;
    }
    return { expression: merged, nextIndex };
}
function combineOutputExpressions(previous, next) {
    return previous.endsWith('"') && next.startsWith('"')
        ? previous.slice(0, -1) + next.slice(1)
        : previous + ' + ' + next;
}
function emitChildren(children, components, options, target, indent = '') {
    return children.flatMap((child) => emitNode(child, components, options, target).map((line) => indent + line));
}
const NODE_EMITTERS = {
    text: emitTextNode,
    expression: emitExpressionTemplateNode,
    element: emitElementTemplateNode,
    slot: emitSlotTemplateNode,
    script: emitScriptTemplateNode,
    style: emitStyleTemplateNode,
    raw: emitRawTemplateNode,
};
function emitNode(node, components, options, target = '__out') {
    const emitter = NODE_EMITTERS[node.type];
    if (!emitter)
        throw new Error(`Unknown node type: ${node.type}`);
    return emitter(node, components, options, target);
}
function emitTextNode(node, _, __, target) {
    const value = node.value;
    return value ? [`${target} += ${JSON.stringify(value)};`] : [];
}
function emitExpressionTemplateNode(node, components, options, target) {
    return emitExpressionNode(node, components, options, target);
}
function emitElementTemplateNode(node, components, options, target) {
    return emitElement(node, components, options, target);
}
function emitSlotTemplateNode(node, components, options, target) {
    return emitSlotNode(node, components, options, target);
}
function emitScriptTemplateNode(node, components, options, target) {
    const asset = node;
    return emitAssetNode('script', asset.content, asset.attrs, components, options, target);
}
function emitStyleTemplateNode(node, components, options, target) {
    const asset = node;
    return emitAssetNode('style', asset.content, asset.attrs, components, options, target);
}
function emitRawTemplateNode(node, _, __, target) {
    return [`${target} += ${JSON.stringify(node.html)};`];
}
function emitExpressionNode(node, components, options, target) {
    const source = expressionSource(node, components, options);
    if (isCommentExpression(source))
        return [];
    return [`${target} += ${applyExpressionOptions(source, options)};`];
}
function expressionSource(node, components, options) {
    return node.nodes?.length === 1 && typeof node.nodes[0] === 'string'
        ? node.source
        : transformExpression(node, components, options);
}
function isCommentExpression(source) {
    return /^\s*(\/\*[\s\S]*\*\/|\/\/.*)\s*$/.test(source);
}
function applyExpressionOptions(source, options) {
    let expression = source;
    if (shouldFilterExpression(options))
        expression = `__filter(${expression})`;
    if (shouldEscapeExpression(options))
        expression = `__escape(${expression})`;
    return expression;
}
function shouldFilterExpression(options) {
    return options?.autoFilter === true;
}
function shouldEscapeExpression(options) {
    return options?.autoEscape !== false;
}
function emitSlotNode(node, components, options, target) {
    return node.nameExpr
        ? emitDynamicSlot(node, components, options, target)
        : emitStaticSlot(node, components, options, target);
}
function emitDynamicSlot(node, components, options, target) {
    const emit = (value) => `${target} += ${value};`;
    const source = transformExpression(node.nameExpr, components, options);
    const lines = [
        `{ const __slotName = String(${source});`,
        `  if (slots[__slotName] !== undefined) {`,
        `    ${emit('slots[__slotName]')}`,
        `  } else if (slots["" ] !== undefined && __slotName === "default") {`,
        `    ${emit('slots[""]')}`,
    ];
    if (node.children.length > 0) {
        lines.push(`  } else {`, ...emitChildren(node.children, components, options, target, '    '));
    }
    lines.push(`  }`, `}`);
    return lines;
}
function emitStaticSlot(node, components, options, target) {
    const emit = (value) => `${target} += ${value};`;
    const slotName = node.name || 'default';
    const slotKey = JSON.stringify(slotName);
    const lines = [
        `if (slots[${slotKey}] !== undefined) {`,
        `  ${emit(`slots[${slotKey}]`)}`,
        `} else if (slots[${JSON.stringify('')}] !== undefined && ${JSON.stringify(slotName)} === "default") {`,
        `  ${emit(`slots[${JSON.stringify('')}]`)}`,
    ];
    if (node.children.length > 0) {
        lines.push(`} else {`, ...emitChildren(node.children, components, options, target, '  '));
    }
    lines.push(`}`);
    return lines;
}
function emitAssetNode(tag, content, attrs, components, options, target) {
    if (options?.aggregateAssets)
        return [];
    const emit = (value) => `${target} += ${value};`;
    const lines = [emit(JSON.stringify(`<${tag}`))];
    for (const attr of attrs)
        lines.push(...emitAttr(attr, components, options, target));
    lines.push(emit(`">" + ${JSON.stringify(content)} + ${JSON.stringify(`</${tag}>`)}`));
    return lines;
}
function emitElement(node, components, options, target = '__out') {
    if (!node.tag || node.tag === 'Fragment')
        return emitFragment(node, components, options, target);
    if (isComponentElement(node, components))
        return emitComponentCall(node, components, options, target);
    return emitHtmlElement(node, components, options, target);
}
function isComponentElement(node, components) {
    return node.tag in components || /^[A-Z]/.test(node.tag);
}
function emitHtmlElement(node, components, options, target) {
    const attributes = partitionElementAttributes(node.attrs);
    const lines = emitElementOpeningTag(node.tag, attributes, components, options, target);
    if (isVoidOrDeclaration(node.tag)) {
        lines.push(`${target} += ${node.tag.startsWith('!') ? '">"' : '" />"'};`);
        return lines;
    }
    return emitNonVoidElement(node, attributes, lines, components, options, target);
}
function emitElementOpeningTag(tag, attributes, components, options, target) {
    return attributes.hasSpread
        ? emitSpreadOpeningTag(tag, attributes.standardAttrs, components, options, target)
        : emitStaticOpeningTag(tag, attributes.standardAttrs, components, options, target);
}
function isVoidOrDeclaration(tag) {
    return VOID_ELEMENTS.has(tag) || tag.startsWith('!');
}
function emitNonVoidElement(node, attributes, lines, components, options, target) {
    lines.push(`${target} += ">";`);
    lines.push(...emitElementContent(node, attributes, components, options, target));
    lines.push(`${target} += ${JSON.stringify(`</${node.tag}>`)};`);
    return lines;
}
function emitFragment(node, components, options, target) {
    const attributes = partitionFragmentAttributes(node.attrs);
    if (attributes.setHtml)
        return emitHtmlDirective(attributes.setHtml, components, options, target);
    if (attributes.setText) {
        if (node.children.length > 0)
            throw new Error('Cannot use set:text with children');
        return emitTextDirective(attributes.setText, components, options, target);
    }
    return emitChildren(node.children, components, options, target);
}
function partitionFragmentAttributes(attrs) {
    const directives = {};
    for (const attr of attrs) {
        const directive = fragmentDirectiveName(attr);
        if (directive)
            directives[directive] = attr;
    }
    return directives;
}
const FRAGMENT_DIRECTIVES = {
    'set:html': 'setHtml',
    'set:text': 'setText',
};
function fragmentDirectiveName(attr) {
    if ('type' in attr)
        throw new Error('CompileError: Fragments cannot have spread attributes');
    return FRAGMENT_DIRECTIVES[attr.name] ?? validateFragmentAttribute(attr.name);
}
function validateFragmentAttribute(name) {
    if (name === 'slot')
        return undefined;
    throw new Error(`CompileError: Fragments cannot have attributes or directives (found: ${name})`);
}
function partitionElementAttributes(attrs) {
    const result = { standardAttrs: [], hasSpread: false };
    for (const attr of attrs) {
        const directive = elementDirectiveName(attr);
        if (directive)
            result[directive] = attr;
        else
            addStandardAttribute(result, attr);
    }
    return result;
}
function elementDirectiveName(attr) {
    if ('type' in attr)
        return undefined;
    if (attr.name === 'set:html')
        return 'setHtml';
    return attr.name === 'set:text' ? 'setText' : undefined;
}
function addStandardAttribute(result, attr) {
    result.standardAttrs.push(attr);
    if ('type' in attr)
        result.hasSpread = true;
}
function emitStaticOpeningTag(tag, attrs, components, options, target) {
    const { tagOpen, dynamicAttrs } = collectStaticOpeningAttributes(tag, attrs);
    return [
        `${target} += ${JSON.stringify(tagOpen)};`,
        ...emitDynamicAttributes(dynamicAttrs, components, options, target),
    ];
}
function collectStaticOpeningAttributes(tag, attrs) {
    let tagOpen = `<${tag}`;
    const dynamicAttrs = [];
    for (const attr of attrs) {
        const attribute = classifyStaticAttribute(attr);
        if (typeof attribute === 'string')
            tagOpen += attribute;
        else if (attribute)
            dynamicAttrs.push(attribute);
    }
    return { tagOpen, dynamicAttrs };
}
function classifyStaticAttribute(attr) {
    const kind = specialAttributeKind(attr.name);
    return kind ? classifySpecialStaticAttribute(attr, kind) : classifyOrdinaryStaticAttribute(attr);
}
const SPECIAL_ATTRIBUTE_KINDS = {
    class: 'class',
    className: 'class',
    'class:list': 'classList',
    style: 'style',
};
function specialAttributeKind(name) {
    return SPECIAL_ATTRIBUTE_KINDS[name];
}
function classifySpecialStaticAttribute(attr, kind) {
    if (typeof attr.value === 'string')
        return ` ${attributeOutputName(kind)}="${escapeHtml(attr.value)}"`;
    if (attr.value === true)
        return undefined;
    return { name: attributeOutputName(kind), value: attr.value, type: dynamicAttributeType(kind) };
}
function attributeOutputName(kind) {
    return kind === 'style' ? 'style' : 'class';
}
function dynamicAttributeType(kind) {
    if (kind === 'classList')
        return 'list';
    return kind === 'style' ? 'style' : undefined;
}
function classifyOrdinaryStaticAttribute(attr) {
    if (attr.value === true)
        return ` ${attr.name}`;
    if (typeof attr.value === 'string')
        return ` ${attr.name}="${escapeHtml(attr.value)}"`;
    return { name: attr.name, value: attr.value };
}
function emitDynamicAttributes(attrs, components, options, target) {
    return attrs.map((attr) => emitDynamicAttribute(attr, components, options, target));
}
function emitDynamicAttribute(attr, components, options, target) {
    const source = transformExpression(attr.value, components, options);
    if (attr.name === 'class')
        return emitDynamicClassAttribute(source, attr.type, target);
    if (attr.name === 'style')
        return emitDynamicStyleAttribute(source, attr.type, target);
    return `${target} += ${JSON.stringify(` ${attr.name}="`)} + __escape(${source}) + ${JSON.stringify('"')};`;
}
function emitDynamicClassAttribute(source, type, target) {
    const value = type === 'list' ? `__classList(${source})` : source;
    return `${target} += ${JSON.stringify(' class="')} + __escape(${value}) + ${JSON.stringify('"')};`;
}
function emitDynamicStyleAttribute(source, type, target) {
    const value = type === 'style' ? `__styleObject(${source})` : source;
    return `${target} += ${JSON.stringify(' style="')} + __escape(${value}) + ${JSON.stringify('"')};`;
}
function emitSpreadOpeningTag(tag, attrs, components, options, target) {
    const lines = [
        `${target} += ${JSON.stringify('<' + tag)};`,
        `{`,
        `  const __attrs = {};`,
        `  const __classes = [];`,
        `  const __styles = [];`,
    ];
    for (const attr of attrs)
        lines.push(...emitSpreadAttribute(attr, components, options));
    lines.push(...emitCollectedSpreadValues(target), `}`);
    return lines;
}
function emitSpreadAttribute(attr, components, options) {
    return 'type' in attr
        ? emitSpreadObject(attr, components, options)
        : emitSpreadNamedAttribute(attr, components, options);
}
function emitSpreadObject(attr, components, options) {
    const source = transformExpression(attr.expression, components, options);
    return [
        `  {`,
        `    const __s = (${source});`,
        `    for (const __k in __s) {`,
        `      if (__k === "class" || __k === "className" || __k === "class:list") {`,
        `        __classes.push(__k === "class:list" ? __classList(__s[__k]) : __s[__k]);`,
        `      } else if (__k === "style") {`,
        `        const __v = __s[__k];`,
        `        if (typeof __v === "string") __styles.push(__v);`,
        `        else __styles.push(__styleObject(__v));`,
        `      } else {`,
        `        __attrs[__k] = __s[__k];`,
        `      }`,
        `    }`,
        `  }`,
    ];
}
function emitSpreadNamedAttribute(attr, components, options) {
    if (isClassAttribute(attr.name))
        return emitSpreadClassAttribute(attr, components, options);
    if (attr.name === 'style')
        return emitSpreadStyleAttribute(attr, components, options);
    return emitSpreadOrdinaryAttribute(attr, components, options);
}
function isClassAttribute(name) {
    return name === 'class' || name === 'className' || name === 'class:list';
}
function emitSpreadClassAttribute(attr, components, options) {
    return [`  __classes.push(${spreadAttributeValue(attr, '__classList', components, options)});`];
}
function emitSpreadStyleAttribute(attr, components, options) {
    return [`  __styles.push(${spreadAttributeValue(attr, '__styleObject', components, options)});`];
}
function spreadAttributeValue(attr, helper, components, options) {
    if (attr.value === true)
        return '""';
    if (typeof attr.value === 'string')
        return JSON.stringify(attr.value);
    return `${helper}(${transformExpression(attr.value, components, options)})`;
}
function emitSpreadOrdinaryAttribute(attr, components, options) {
    const name = JSON.stringify(attr.name);
    return [`  __attrs[${name}] = ${spreadOrdinaryAttributeValue(attr, components, options)};`];
}
function spreadOrdinaryAttributeValue(attr, components, options) {
    if (attr.value === true)
        return 'true';
    if (typeof attr.value === 'string')
        return `new __RawHtml(${JSON.stringify(attr.value)})`;
    return `(${transformExpression(attr.value, components, options)})`;
}
function emitCollectedSpreadValues(target) {
    const emit = (value) => `${target} += ${value};`;
    return [
        `  for (const __k in __attrs) {`,
        `    const __v = __attrs[__k];`,
        `    if (__v === true) ${emit('" " + __escape(__k)')}`,
        `    else if (__v !== false && __v != null) ${emit('" " + __escape(__k) + \'="\' + __escape(__v) + \'"\'')}`,
        `  }`,
        `  const __finalCls = __classes.filter(Boolean).join(' ');`,
        `  if (__finalCls) ${emit("' class=\"' + __escape(__finalCls) + '\"'")}`,
        `  const __finalSty = __styles.map(s => typeof s === "string" ? s.trim().replace(/;$/, "") : s).filter(Boolean).join(';');`,
        `  if (__finalSty) ${emit("' style=\"' + __escape(__finalSty) + '\"'")}`,
    ];
}
function emitElementContent(node, attrs, components, options, target) {
    if (attrs.setHtml)
        return emitHtmlElementContent(node, attrs, components, options, target);
    if (attrs.setText)
        return emitTextElementContent(node, attrs.setText, components, options, target);
    return emitChildren(node.children, components, options, target);
}
function emitHtmlElementContent(node, attrs, components, options, target) {
    if (attrs.setText)
        throw new Error('Cannot use both set:html and set:text');
    if (node.children.length > 0)
        throw new Error('Cannot use set:html with children');
    return emitHtmlDirective(attrs.setHtml, components, options, target);
}
function emitTextElementContent(node, attr, components, options, target) {
    if (node.children.length > 0)
        throw new Error('Cannot use set:text with children');
    return emitTextDirective(attr, components, options, target);
}
function emitHtmlDirective(attr, components, options, target) {
    const emit = (value) => `${target} += ${value};`;
    if (typeof attr.value === 'string')
        return [emit(JSON.stringify(attr.value))];
    if (attr.value === true)
        return [];
    const source = transformExpression(attr.value, components, options);
    return [
        `{ const __h = (${source}); ${emit('[].concat(__h).map(v => (v && typeof v === \'object\' && v.__isRawHtml) ? v.value : v).join("")')} }`,
    ];
}
function emitTextDirective(attr, components, options, target) {
    const emit = (value) => `${target} += ${value};`;
    if (typeof attr.value === 'string')
        return [emit(`__escape(${JSON.stringify(attr.value)})`)];
    return attr.value === true
        ? []
        : [emit(`__escape(${transformExpression(attr.value, components, options)})`)];
}
function emitAttr(attr, components, options, target = '__out') {
    return 'type' in attr
        ? emitSpreadAttr(attr, components, options, target)
        : emitNamedAttr(attr, components, options, target);
}
function emitSpreadAttr(attr, components, options, target) {
    const emit = (value) => `${target} += ${value};`;
    return [
        `{`,
        `  const __spread = (${transformExpression(attr.expression, components, options)});`,
        `  for (const __k in __spread) {`,
        `    const __val = __spread[__k];`,
        `    if (__k === "class" || __k === "className" || __k === "class:list") {`,
        `      ${emit(`" class=\\"" + __escape(__classList(__val)) + "\\""`)}`,
        `    } else if (__k === "style" && typeof __val === "object") {`,
        `      ${emit(`" style=\\"" + __escape(__styleObject(__val)) + "\\""`)}`,
        `    } else if (__val === true) {`,
        `      ${emit(`" " + __escape(__k)`)}`,
        `    } else if (__val !== false && __val != null) {`,
        `      ${emit(`" " + __escape(__k) + '="' + __escape(__val) + '"'`)}`,
        `    }`,
        `  }`,
        `}`,
    ];
}
function emitNamedAttr(attr, components, options, target) {
    if (attr.value === true)
        return [emitTargetValue(target, JSON.stringify(' ' + attr.name))];
    if (typeof attr.value === 'string') {
        return [emitTargetValue(target, JSON.stringify(' ' + attr.name + '="' + attr.value + '"'))];
    }
    return emitDynamicNamedAttr(attr, components, options, target);
}
function emitDynamicNamedAttr(attr, components, options, target) {
    const source = transformExpression(attr.value, components, options);
    const expression = dynamicAttributeExpression(attr.name, source);
    return [emitTargetValue(target, expression)];
}
function dynamicAttributeExpression(name, source) {
    if (name === 'class:list')
        return JSON.stringify(` class="`) + ` + __escape(__classList(${source})) + "\\""`;
    if (name === 'style')
        return JSON.stringify(` style="`) + ` + __escape(__styleObject(${source})) + "\\""`;
    return JSON.stringify(` ${name}="`) + ` + __escape(${source}) + "\\""`;
}
function emitTargetValue(target, value) {
    return `${target} += ${value};`;
}
function emitComponentCall(node, components, options, target = '__out') {
    const localName = node.tag;
    const props = buildComponentPropsExpression(node.attrs, components, options);
    const lines = [
        `{`,
        `  let __component = __components[${JSON.stringify(localName)}];`,
        `  try { if (!__component && typeof ${localName} !== 'undefined') __component = ${localName}; } catch (e) {}`,
        `  if (typeof __component === 'function') {`,
        `    const __childSlots = {};`,
        ...emitComponentSlots(node.children, components, options),
        ...emitResolvedComponentCall(localName, props, target),
        ...emitComponentFallbacks(node, components, options, target),
        `  }`,
        `}`,
    ];
    return lines;
}
function buildComponentPropsExpression(attrs, components, options) {
    return `{${attrs.map((attr) => componentPropPart(attr, components, options)).join(', ')}}`;
}
function componentPropPart(attr, components, options) {
    if ('type' in attr)
        return `...(${transformExpression(attr.expression, components, options)})`;
    const staticPart = staticComponentPropPart(attr);
    return staticPart ?? dynamicComponentPropPart(attr, components, options);
}
function staticComponentPropPart(attr) {
    if (attr.value === true)
        return `${JSON.stringify(attr.name)}: true`;
    if (typeof attr.value === 'string')
        return `${JSON.stringify(attr.name)}: ${JSON.stringify(attr.value)}`;
    return undefined;
}
function dynamicComponentPropPart(attr, components, options) {
    const name = attr.name === 'class:list' ? 'class:list' : attr.name;
    return `${JSON.stringify(name)}: (${transformExpression(attr.value, components, options)})`;
}
function emitComponentSlots(children, components, options) {
    return children.flatMap((child, index) => emitComponentSlot(child, index, components, options));
}
function emitComponentSlot(child, index, components, options) {
    const { slotName, node } = getComponentSlot(child, components, options);
    const variable = `__slot_${index}`;
    return [
        `    let ${variable} = "";`,
        ...emitNode(node, components, options, variable).map((line) => '    ' + line),
        `    {`,
        `      const __sname = ${slotName};`,
        `      if (__sname === "" || __sname === "default") {`,
        `        if (!__childSlots[""]) __childSlots[""] = "";`,
        `        if (!__childSlots["default"]) __childSlots["default"] = "";`,
        `        __childSlots[""] += ${variable};`,
        `        __childSlots["default"] += ${variable};`,
        `      } else {`,
        `        if (!__childSlots[__sname]) __childSlots[__sname] = "";`,
        `        __childSlots[__sname] += ${variable};`,
        `      }`,
        `    }`,
    ];
}
function getComponentSlot(child, components, options) {
    if (child.type !== 'element')
        return { slotName: JSON.stringify(''), node: child };
    const slotAttr = child.attrs.find((attr) => !('type' in attr) && attr.name === 'slot');
    if (!slotAttr)
        return { slotName: JSON.stringify(''), node: child };
    const slotName = getSlotName(slotAttr, components, options);
    return {
        slotName,
        node: { ...child, attrs: child.attrs.filter((attr) => attr !== slotAttr) },
    };
}
function getSlotName(attr, components, options) {
    if (typeof attr.value === 'string')
        return JSON.stringify(attr.value);
    return attr.value === true
        ? JSON.stringify('')
        : transformExpression(attr.value, components, options);
}
function emitResolvedComponentCall(localName, props, target) {
    if (target === STREAMING_TARGET) {
        return [
            `    if (__buf) { yield __buf; __buf = ""; }`,
            `    yield await __component(${props}, __childSlots);`,
        ];
    }
    return [
        `    if (!__component.renderSync) throw new Error("Component " + ${JSON.stringify(localName)} + " does not support synchronous rendering.");`,
        `    ${target} += __component.renderSync(${props}, __childSlots);`,
    ];
}
function emitComponentFallbacks(node, components, options, target) {
    const lines = [
        `  } else if (typeof __component === 'string') {`,
        `${target} += "<" + __component;`,
    ];
    for (const attr of node.attrs) {
        lines.push(...emitAttr(attr, components, options, target).map((line) => '    ' + line));
    }
    lines.push(`${target} += ">";`, ...emitChildren(node.children, components, options, target, '    '));
    lines.push(`${target} += "</" + __component + ">";`, `  } else {`, `${target} += "<${node.tag}";`);
    for (const attr of node.attrs) {
        lines.push(...emitAttr(attr, components, options, target).map((line) => '    ' + line));
    }
    if (node.selfClosing)
        lines.push(`${target} += " />";`);
    else {
        lines.push(`${target} += ">";`, ...emitChildren(node.children, components, options, target, '    '));
        lines.push(`${target} += ${JSON.stringify(`</${node.tag}>`)};`);
    }
    return lines;
}
function transformExpression(expr, components, options) {
    if (isPlainExpression(expr))
        return expr.source;
    return (expr.nodes ?? [])
        .map((part) => transformExpressionPart(part, components, options))
        .join('');
}
function isPlainExpression(expr) {
    return !expr.nodes || (expr.nodes.length === 1 && typeof expr.nodes[0] === 'string');
}
function transformExpressionPart(part, components, options) {
    if (typeof part === 'string')
        return part;
    return rawHtmlExpressionFromNode(part, components, options);
}
function rawHtmlExpressionFromNode(node, components, options) {
    const lines = mergeLines(emitNode(node, components, options, '__out'), '__out');
    if (isSingleOutputLine(lines))
        return `new __RawHtml(${lines[0].slice(9, -1)})`;
    return `((() => { let __out = ""; ${lines.join(' ')} return new __RawHtml(__out); })())`;
}
function isSingleOutputLine(lines) {
    return lines.length === 1 && lines[0].startsWith('__out += ') && lines[0].endsWith(';');
}
// ─── Streaming Compiler ─────────────────────────────────────────────────────
/**
 * Higher-level streaming compile entry point: resolves component imports then
 * compiles the AST for streaming.
 */
function compileStreamingInternal(ast, options) {
    const result = resolveCompileOptions(ast, options);
    if (!result.ok)
        return result;
    return compileStreamingAST(ast, { ...options, components: result.components });
}
export const compileStreaming = compileStreamingInternal;
function compileStreamingAST(ast, options) {
    try {
        return compileStreamingASTUnsafe(ast, options);
    }
    catch (err) {
        return {
            ok: false,
            error: { message: err instanceof Error ? err.message : String(err) },
        };
    }
}
function compileStreamingASTUnsafe(ast, options) {
    const components = options?.components ?? {};
    const source = buildStreamingFunctionBody(ast, components, options);
    const fn = createStreamingRenderFunction(createStreamingFunction(source), components, options);
    return { ok: true, fn, source };
}
function createStreamingFunction(source) {
    const AsyncGenCtor = Object.getPrototypeOf(async function* () { }).constructor;
    return new AsyncGenCtor('props', 'slots', '__escape', '__RawHtml', '__components', '__classList', '__styleObject', '__filter', source);
}
function createStreamingRenderFunction(streamingFn, components, options) {
    const helpers = createRuntimeHelpers(options);
    return (props, slots) => streamingFn(props, slots ?? {}, escapeHtml, RawHtml, components, helpers.classListHelper, helpers.styleObjectHelper, helpers.filterHelper);
}
/**
 * Build the function body for a streaming (async generator) template.
 * Uses a `__buf` accumulator that flushes at component boundaries.
 */
function buildStreamingFunctionBody(ast, components, options) {
    return buildFunctionBody(ast, components, options, STREAMING_TARGET, 'if (__buf) { yield __buf; }');
}
//# sourceMappingURL=compiler.js.map