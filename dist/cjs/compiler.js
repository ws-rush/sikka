/**
 * Compiler
 */
import { escapeHtml, RawHtml } from './escape.js';
import { parse, VOID_ELEMENTS } from './parser.js';
/**
 * Recursively resolve and compile all component imports in an AST (Synchronous).
 */
function resolveComponentsSync(imports, fileReader, basePath, options, inProgress = new Set()) {
    const components = {};
    for (const imp of imports) {
        if (options.components && options.components[imp.localName]) {
            continue;
        }
        if (!fileReader) {
            return {
                ok: false,
                error: {
                    message: `Cannot resolve component: ${imp.specifier} (no readFileSync provided)`,
                    specifier: imp.specifier,
                },
            };
        }
        const resolvedPath = resolvePath(basePath, imp.specifier);
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
        let source;
        try {
            source = fileReader(resolvedPath);
            if (source === undefined || source === null) {
                throw new Error('Not found');
            }
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
        const childInProgress = new Set([...inProgress, resolvedPath]);
        const childResult = resolveComponentsSync(parseResult.ast.imports, fileReader, resolvedPath, options, childInProgress);
        if (!childResult.ok) {
            return childResult;
        }
        const compileResult = compileAST(parseResult.ast, {
            ...options,
            components: { ...options.components, ...childResult.components },
        });
        if (!compileResult.ok) {
            return { ok: false, error: compileResult.error };
        }
        components[imp.localName] = compileResult.fn;
    }
    return { ok: true, components };
}
export const compile = compileSync;
/**
 * Higher-level compile entry point (Synchronous): resolves component imports then compiles the AST.
 */
function compileSync(ast, options) {
    let components = options?.components ?? {};
    if (ast.imports.length > 0) {
        const fileReader = options?.fileReader;
        const basePath = options?.basePath ?? '';
        const result = resolveComponentsSync(ast.imports, fileReader, basePath, {
            ...options,
            components,
        });
        if (!result.ok) {
            return result;
        }
        components = { ...result.components, ...components };
    }
    return compileAST(ast, { ...options, components });
}
function resolvePath(basePath, specifier) {
    if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
        return specifier;
    }
    const lastSlash = basePath.lastIndexOf('/');
    const baseDir = lastSlash >= 0 ? basePath.slice(0, lastSlash) : '';
    const joined = baseDir ? `${baseDir}/${specifier}` : specifier;
    return normalisePath(joined);
}
function normalisePath(path) {
    const parts = path.split('/');
    const resolved = [];
    for (const part of parts) {
        if (part === '.' || part === '')
            continue;
        if (part === '..') {
            resolved.pop();
        }
        else {
            resolved.push(part);
        }
    }
    const prefix = path.startsWith('/') ? '/' : '';
    return prefix + resolved.join('/');
}
/**
 * Compile a TemplateAST into a RenderFunction.
 */
function compileAST(ast, options) {
    try {
        const components = options?.components ?? {};
        const renderSyncBody = buildFunctionBody(ast, components, options);
        const syncFn = new Function('props', 'slots', '__escape', '__RawHtml', '__components', '__classList', '__styleObject', '__filter', renderSyncBody);
        const classListHelper = (arg) => {
            // ... (omitting for brevity in this thought, will use full edit)
            if (typeof arg === 'string')
                return arg;
            if (arg instanceof Set)
                return Array.from(arg).join(' ');
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
                if (typeof arg.toString === 'function' && arg.toString !== Object.prototype.toString) {
                    return arg.toString();
                }
                return Object.entries(arg)
                    .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}:${v}`)
                    .join(';');
            }
            return '';
        };
        const filterHelper = options?.autoFilter
            ? options.filterFunction || ((v) => v)
            : (v) => v;
        const renderFn = (async (props, slots) => {
            return renderFn.renderSync(props, slots);
        });
        renderFn.renderSync = function (props, slots) {
            try {
                const s = slots ?? {};
                return syncFn(props, s, escapeHtml, RawHtml, components, classListHelper, styleObjectHelper, filterHelper);
            }
            catch (err) {
                if (options?.debug) {
                    throw new Error(`Runtime Error: ${err instanceof Error ? err.message : String(err)}`, {
                        cause: err,
                    });
                }
                throw err;
            }
        };
        return { ok: true, fn: renderFn, source: renderSyncBody };
    }
    catch (err) {
        return {
            ok: false,
            error: { message: err instanceof Error ? err.message : String(err) },
        };
    }
}
function buildFunctionBody(ast, components, options) {
    const lines = [];
    const varName = options?.varName || 'Astro';
    lines.push(`let __out = "";`);
    // Heuristic: only create Astro if it's explicitly used in the template or frontmatter
    const isAstroUsed = ast.frontmatter.source.includes(varName) ||
        JSON.stringify(ast.body).includes(varName);
    if (isAstroUsed) {
        lines.push(`const ${varName} = {
      props,
      slots: {
        ...slots,
        render: (name) => new __RawHtml(slots[name] || ""),
        has: (name) => slots[name] !== undefined || (name === "default" && slots[""] !== undefined)
      }
    };`);
    }
    lines.push('');
    const importNames = ast.imports.map((imp) => imp.localName);
    if (importNames.length > 0) {
        for (const name of importNames) {
            lines.push(`const ${name} = __components[${JSON.stringify(name)}];`);
        }
    }
    if (ast.frontmatter.source.trim()) {
        const cleanFM = ast.frontmatter.source
            .replace(/^\s*import\s+[\s\S]*?from\s+['"].*?['"];?\s*$/gm, '')
            .replace(/^\s*export\s+/gm, '');
        lines.push(cleanFM);
        lines.push('');
    }
    const bodyLines = [];
    for (const node of ast.body) {
        bodyLines.push(...emitNode(node, components, options, '__out'));
    }
    const mergedLines = mergeLines(bodyLines, '__out');
    lines.push(...mergedLines);
    lines.push(`return __out;`);
    return lines.join('\n');
}
function mergeLines(bodyLines, target) {
    const lines = [];
    const prefix = `${target} += `;
    let i = 0;
    while (i < bodyLines.length) {
        const line = bodyLines[i].trim();
        if (line.startsWith(prefix)) {
            let combined = line.slice(prefix.length);
            if (combined.endsWith(';'))
                combined = combined.slice(0, -1);
            let j = i + 1;
            while (j < bodyLines.length) {
                const nextLine = bodyLines[j].trim();
                if (nextLine.startsWith(prefix)) {
                    let nextExpr = nextLine.slice(prefix.length);
                    if (nextExpr.endsWith(';'))
                        nextExpr = nextExpr.slice(0, -1);
                    // Fold constant string concatenations like "a" + "b"
                    if (combined.endsWith('"') && nextExpr.startsWith('"')) {
                        combined = combined.slice(0, -1) + nextExpr.slice(1);
                    }
                    else {
                        combined += ' + ' + nextExpr;
                    }
                    j++;
                }
                else {
                    break;
                }
            }
            lines.push(`${target} += ${combined};`);
            i = j;
        }
        else {
            lines.push(bodyLines[i]);
            i++;
        }
    }
    return lines;
}
function emitNode(node, components, options, target = '__out') {
    const emit = (val) => `${target} += ${val};`;
    switch (node.type) {
        case 'text':
            return node.value ? [emit(JSON.stringify(node.value))] : [];
        case 'expression': {
            if (!node.nodes || node.nodes.length === 1 && typeof node.nodes[0] === 'string') {
                let expr = node.source;
                if (options?.autoFilter)
                    expr = `__filter(${expr})`;
                if (options?.autoEscape !== false)
                    expr = `__escape(${expr})`;
                return [emit(expr)];
            }
            const source = transformExpression(node, components, options);
            if (/^\s*(\/\*[\s\S]*\*\/|\/\/.*)\s*$/.test(source)) {
                return [];
            }
            let expr = source;
            if (options?.autoFilter) {
                expr = `__filter(${expr})`;
            }
            if (options?.autoEscape !== false) {
                expr = `__escape(${expr})`;
            }
            return [emit(expr)];
        }
        case 'element':
            return emitElement(node, components, options, target);
        case 'slot': {
            const slotName = node.name || 'default';
            const slotNameKey = JSON.stringify(slotName);
            const lines = [];
            lines.push(`if (slots[${slotNameKey}] !== undefined) {`);
            lines.push(`  ${emit(`slots[${slotNameKey}]`)}`);
            lines.push(`} else if (slots[${JSON.stringify('')}] !== undefined && ${JSON.stringify(slotName)} === "default") {`);
            lines.push(`  ${emit(`slots[${JSON.stringify('')}]`)}`);
            if (node.children.length > 0) {
                lines.push(`} else {`);
                for (const child of node.children) {
                    lines.push(...emitNode(child, components, options, target).map((l) => '  ' + l));
                }
            }
            lines.push(`}`);
            return lines;
        }
        case 'script': {
            if (options?.aggregateAssets) {
                // In render mode, assets are ignored (or could be collected if we passed an asset array)
                return [];
            }
            const lines = [emit(`"<script"`)];
            for (const attr of node.attrs) {
                lines.push(...emitAttr(attr, components, options, target));
            }
            lines.push(emit(`">" + ${JSON.stringify(node.content)} + "</script>"`));
            return lines;
        }
        case 'style': {
            if (options?.aggregateAssets) {
                return [];
            }
            const lines = [emit(`"<style"`)];
            for (const attr of node.attrs) {
                lines.push(...emitAttr(attr, components, options, target));
            }
            lines.push(emit(`">" + ${JSON.stringify(node.content)} + "</style>"`));
            return lines;
        }
        case 'raw':
            return [emit(JSON.stringify(node.html))];
        default:
            throw new Error(`Unknown node type: ${node.type}`);
    }
}
function emitElement(node, components, options, target = '__out') {
    const lines = [];
    const emit = (val) => `${target} += ${val};`;
    if (!node.tag || node.tag === 'Fragment') {
        let setHtml;
        let setText;
        for (const attr of node.attrs) {
            if (!('type' in attr)) {
                if (attr.name === 'set:html')
                    setHtml = attr;
                if (attr.name === 'set:text')
                    setText = attr;
            }
        }
        if (setHtml) {
            const val = setHtml.value;
            if (typeof val === 'string') {
                lines.push(emit(JSON.stringify(val)));
            }
            else if (val !== true) {
                lines.push(`{ const __h = (${transformExpression(val, components, options)}); ${emit(`[].concat(__h).map(v => (v && typeof v === 'object' && v.__isRawHtml) ? v.value : v).join("")`)} }`);
            }
        }
        else if (setText) {
            const val = setText.value;
            if (node.children.length > 0)
                throw new Error('Cannot use set:text with children');
            if (typeof val === 'string') {
                lines.push(emit(`__escape(${JSON.stringify(val)})`));
            }
            else if (val !== true) {
                lines.push(emit(`__escape(${transformExpression(val, components, options)})`));
            }
        }
        else {
            for (const child of node.children) {
                lines.push(...emitNode(child, components, options, target));
            }
        }
        return lines;
    }
    const isCapitalized = /^[A-Z]/.test(node.tag);
    if (node.tag in components || isCapitalized) {
        return emitComponentCall(node, components, options, target);
    }
    let setHtml;
    let setText;
    const standardAttrs = [];
    for (const attr of node.attrs) {
        if (!('type' in attr)) {
            if (attr.name === 'set:html') {
                setHtml = attr;
                continue;
            }
            if (attr.name === 'set:text') {
                setText = attr;
                continue;
            }
        }
        standardAttrs.push(attr);
    }
    const hasSpread = node.attrs.some((a) => 'type' in a);
    if (!hasSpread) {
        let tagOpen = `<${node.tag}`;
        const dynamicAttrs = [];
        for (const attr of standardAttrs) {
            if (attr.name === 'class' || attr.name === 'className' || attr.name === 'class:list') {
                if (typeof attr.value === 'string') {
                    tagOpen += ` class="${escapeHtml(attr.value)}"`;
                }
                else if (attr.value !== true) {
                    dynamicAttrs.push({ name: 'class', value: attr.value, type: attr.name === 'class:list' ? 'list' : undefined });
                }
            }
            else if (attr.name === 'style') {
                if (typeof attr.value === 'string') {
                    tagOpen += ` style="${escapeHtml(attr.value)}"`;
                }
                else if (attr.value !== true) {
                    dynamicAttrs.push({ name: 'style', value: attr.value, type: 'style' });
                }
            }
            else {
                if (attr.value === true) {
                    tagOpen += ` ${attr.name}`;
                }
                else if (typeof attr.value === 'string') {
                    tagOpen += ` ${attr.name}="${escapeHtml(attr.value)}"`;
                }
                else {
                    dynamicAttrs.push({ name: attr.name, value: attr.value });
                }
            }
        }
        lines.push(emit(JSON.stringify(tagOpen)));
        for (const attr of dynamicAttrs) {
            const source = transformExpression(attr.value, components, options);
            if (attr.name === 'class') {
                const valExpr = attr.type === 'list' ? `__classList(${source})` : source;
                lines.push(emit(JSON.stringify(` class="`) + ` + __escape(${valExpr}) + "\\""`));
            }
            else if (attr.name === 'style') {
                const valExpr = attr.type === 'style' ? `__styleObject(${source})` : source;
                lines.push(emit(JSON.stringify(` style="`) + ` + __escape(${valExpr}) + "\\""`));
            }
            else {
                lines.push(emit(JSON.stringify(` ${attr.name}="`) + ` + __escape(${source}) + "\\""`));
            }
        }
    }
    else {
        lines.push(emit(JSON.stringify('<' + node.tag)));
        lines.push(`{`);
        lines.push(`  const __attrs = {};`);
        lines.push(`  const __classes = [];`);
        lines.push(`  const __styles = [];`);
        for (const attr of standardAttrs) {
            if ('type' in attr) {
                lines.push(`  {`);
                lines.push(`    const __s = (${transformExpression(attr.expression, components, options)});`);
                lines.push(`    for (const __k in __s) {`);
                lines.push(`      if (__k === "class" || __k === "className" || __k === "class:list") {`);
                lines.push(`        __classes.push(__k === "class:list" ? __classList(__s[__k]) : __s[__k]);`);
                lines.push(`      } else if (__k === "style") {`);
                lines.push(`        const __v = __s[__k];`);
                lines.push(`        if (typeof __v === "string") __styles.push(__v);`);
                lines.push(`        else __styles.push(__styleObject(__v));`);
                lines.push(`      } else {`);
                lines.push(`        __attrs[__k] = __s[__k];`);
                lines.push(`      }`);
                lines.push(`    }`);
                lines.push(`  }`);
            }
            else {
                if (attr.name === 'class' || attr.name === 'className' || attr.name === 'class:list') {
                    if (attr.value === true)
                        lines.push(`  __classes.push("");`);
                    else if (typeof attr.value === 'string')
                        lines.push(`  __classes.push(${JSON.stringify(attr.value)});`);
                    else
                        lines.push(`  __classes.push(__classList(${transformExpression(attr.value, components, options)}));`);
                }
                else if (attr.name === 'style') {
                    if (attr.value === true)
                        lines.push(`  __styles.push("");`);
                    else if (typeof attr.value === 'string')
                        lines.push(`  __styles.push(${JSON.stringify(attr.value)});`);
                    else
                        lines.push(`  __styles.push(__styleObject(${transformExpression(attr.value, components, options)}));`);
                }
                else {
                    if (attr.value === true)
                        lines.push(`  __attrs[${JSON.stringify(attr.name)}] = true;`);
                    else if (typeof attr.value === 'string')
                        lines.push(`  __attrs[${JSON.stringify(attr.name)}] = new __RawHtml(${JSON.stringify(attr.value)});`);
                    else
                        lines.push(`  __attrs[${JSON.stringify(attr.name)}] = (${transformExpression(attr.value, components, options)});`);
                }
            }
        }
        lines.push(`  for (const __k in __attrs) {`);
        lines.push(`    const __v = __attrs[__k];`);
        lines.push(`    if (__v === true) ${emit(`" " + __escape(__k)`)}`);
        lines.push(`    else if (__v !== false && __v != null) ${emit(`" " + __escape(__k) + '="' + __escape(__v) + '"'`)}`);
        lines.push(`  }`);
        lines.push(`  const __finalCls = __classes.filter(Boolean).join(' ');`);
        lines.push(`  if (__finalCls) ${emit(`' class="' + __escape(__finalCls) + '"'`)}`);
        lines.push(`  const __finalSty = __styles.map(s => typeof s === "string" ? s.trim().replace(/;$/, "") : s).filter(Boolean).join(';');`);
        lines.push(`  if (__finalSty) ${emit(`' style="' + __escape(__finalSty) + '"'`)}`);
        lines.push(`}`);
    }
    const isVoid = VOID_ELEMENTS.has(node.tag) || node.tag.startsWith('!');
    if (isVoid) {
        if (node.tag.startsWith('!'))
            lines.push(emit(`">"`));
        else
            lines.push(emit(`" />"`));
        return lines;
    }
    lines.push(emit(`">"`));
    if (setHtml) {
        if (setText)
            throw new Error('Cannot use both set:html and set:text');
        if (node.children.length > 0)
            throw new Error('Cannot use set:html with children');
        if (typeof setHtml.value === 'string') {
            lines.push(emit(JSON.stringify(setHtml.value)));
        }
        else if (setHtml.value !== true) {
            lines.push(`{ const __h = (${transformExpression(setHtml.value, components, options)}); ${emit(`[].concat(__h).map(v => (v && typeof v === 'object' && v.__isRawHtml) ? v.value : v).join("")`)} }`);
        }
    }
    else if (setText) {
        if (node.children.length > 0)
            throw new Error('Cannot use set:text with children');
        if (typeof setText.value === 'string') {
            lines.push(emit(`__escape(${JSON.stringify(setText.value)})`));
        }
        else if (setText.value !== true) {
            lines.push(emit(`__escape(${transformExpression(setText.value, components, options)})`));
        }
    }
    else {
        for (const child of node.children) {
            lines.push(...emitNode(child, components, options, target));
        }
    }
    if (!isVoid) {
        lines.push(emit(JSON.stringify('</' + node.tag + '>')));
    }
    return lines;
}
function emitAttr(attr, components, options, target = '__out') {
    const emit = (val) => `${target} += ${val};`;
    if ('type' in attr) {
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
    if (attr.value === true) {
        return [emit(JSON.stringify(' ' + attr.name))];
    }
    const val = attr.value;
    if (typeof val === 'string') {
        return [emit(JSON.stringify(' ' + attr.name + '="' + val + '"'))];
    }
    const source = transformExpression(val, components, options);
    if (attr.name === 'class:list') {
        return [emit(JSON.stringify(` class="`) + ` + __escape(__classList(${source})) + "\\""`)];
    }
    if (attr.name === 'style') {
        return [emit(JSON.stringify(` style="`) + ` + __escape(__styleObject(${source})) + "\\""`)];
    }
    return [emit(JSON.stringify(` ${attr.name}="`) + ` + __escape(${source}) + "\\""`)];
}
function emitComponentCall(node, components, options, target = '__out') {
    const lines = [];
    const localName = node.tag;
    const emit = (val) => `${target} += ${val};`;
    const propParts = [];
    for (const attr of node.attrs) {
        if ('type' in attr) {
            propParts.push(`...(${transformExpression(attr.expression, components, options)})`);
        }
        else {
            if (attr.value === true) {
                propParts.push(`${JSON.stringify(attr.name)}: true`);
            }
            else if (typeof attr.value === 'string') {
                propParts.push(`${JSON.stringify(attr.name)}: ${JSON.stringify(attr.value)}`);
            }
            else {
                const val = attr.value;
                const source = transformExpression(val, components, options);
                if (attr.name === 'class:list') {
                    propParts.push(`"class:list": (${source})`);
                }
                else {
                    propParts.push(`${JSON.stringify(attr.name)}: (${source})`);
                }
            }
        }
    }
    const propsExpr = `{${propParts.join(', ')}}`;
    lines.push(`{`);
    lines.push(`  let __component = __components[${JSON.stringify(localName)}];`);
    lines.push(`  try { if (!__component && typeof ${localName} !== 'undefined') __component = ${localName}; } catch (e) {}`);
    lines.push(`  if (typeof __component === 'function') {`);
    lines.push(`    const __childSlots = {};`);
    for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        let slotName;
        const childSlotVarName = `__slot_${i}`;
        if (child.type === 'element') {
            const slotAttr = child.attrs.find((a) => !('type' in a) && a.name === 'slot');
            let childAttrs = child.attrs;
            if (slotAttr) {
                if (typeof slotAttr.value === 'string') {
                    slotName = JSON.stringify(slotAttr.value);
                }
                else if (slotAttr.value !== true) {
                    slotName = transformExpression(slotAttr.value, components, options);
                }
                else {
                    slotName = JSON.stringify('');
                }
                childAttrs = child.attrs.filter((a) => a !== slotAttr);
            }
            else {
                slotName = JSON.stringify('');
            }
            lines.push(`    let ${childSlotVarName} = "";`);
            const tempChild = { ...child, attrs: childAttrs };
            lines.push(...emitNode(tempChild, components, options, childSlotVarName).map((l) => '    ' + l));
        }
        else {
            slotName = JSON.stringify('');
            lines.push(`    let ${childSlotVarName} = "";`);
            lines.push(...emitNode(child, components, options, childSlotVarName).map((l) => '    ' + l));
        }
        lines.push(`    {`);
        lines.push(`      const __sname = ${slotName};`);
        lines.push(`      if (__sname === "" || __sname === "default") {`);
        lines.push(`        if (!__childSlots[""]) __childSlots[""] = "";`);
        lines.push(`        if (!__childSlots["default"]) __childSlots["default"] = "";`);
        lines.push(`        __childSlots[""] += ${childSlotVarName};`);
        lines.push(`        __childSlots["default"] += ${childSlotVarName};`);
        lines.push(`      } else {`);
        lines.push(`        if (!__childSlots[__sname]) __childSlots[__sname] = "";`);
        lines.push(`        __childSlots[__sname] += ${childSlotVarName};`);
        lines.push(`      }`);
        lines.push(`    }`);
    }
    lines.push(`    if (!__component.renderSync) throw new Error("Component " + ${JSON.stringify(localName)} + " does not support synchronous rendering.");`);
    lines.push(`    ${emit(`__component.renderSync(${propsExpr}, __childSlots)`)}`);
    lines.push(`  } else if (typeof __component === 'string') {`);
    lines.push(emit(`"<" + __component`));
    for (const attr of node.attrs) {
        lines.push(...emitAttr(attr, components, options, target).map((l) => '    ' + l));
    }
    lines.push(emit(`">"`));
    for (const child of node.children) {
        lines.push(...emitNode(child, components, options, target).map((l) => '    ' + l));
    }
    lines.push(emit(`"</" + __component + ">"`));
    lines.push(`  } else {`);
    lines.push(emit(`"<${localName}"`));
    for (const attr of node.attrs) {
        lines.push(...emitAttr(attr, components, options, target).map((l) => '    ' + l));
    }
    if (node.selfClosing) {
        lines.push(emit(`" />"`));
    }
    else {
        lines.push(emit(`">"`));
        for (const child of node.children) {
            lines.push(...emitNode(child, components, options, target).map((l) => '    ' + l));
        }
        lines.push(emit(`"</${localName}>"`));
    }
    lines.push(`  }`);
    lines.push(`}`);
    return lines;
}
function transformExpression(expr, components, options) {
    if (!expr.nodes || (expr.nodes.length === 1 && typeof expr.nodes[0] === 'string')) {
        return expr.source;
    }
    let result = '';
    for (const part of expr.nodes) {
        if (typeof part === 'string') {
            result += part;
        }
        else {
            const bodyLines = emitNode(part, components, options, '__out');
            const lines = mergeLines(bodyLines, '__out');
            if (lines.length === 1 && lines[0].startsWith('__out += ') && lines[0].endsWith(';')) {
                const exprContent = lines[0].slice(9, -1); // '__out += '.length === 9
                result += `new __RawHtml(${exprContent})`;
            }
            else {
                result += `((() => { let __out = ""; ${lines.join(' ')} return new __RawHtml(__out); })())`;
            }
        }
    }
    return result;
}
//# sourceMappingURL=compiler.js.map