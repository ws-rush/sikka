"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveSourceTemplate = resolveSourceTemplate;
const error_js_1 = require("./error.js");
/** Resolves and validates a Template through the shared source resolver contract. */
function resolveSourceTemplate(request, resolver, importer) {
    const context = importer ? ` imported by canonical identity ${JSON.stringify(importer)}` : '';
    let template;
    try {
        template = resolver(request, importer);
    }
    catch (error) {
        throw new error_js_1.SikkaError(`ResolveError for ${JSON.stringify(request)}${context}: ${errorMessage(error)}`, { category: 'Resolve', request, importer, cause: error });
    }
    if (isSourceTemplate(template))
        return template;
    const identity = sourceIdentity(template);
    const suffix = identity ? ` (canonical identity ${JSON.stringify(identity)})` : '';
    throw new error_js_1.SikkaError(`ResolveError: invalid result for ${JSON.stringify(request)}${context}${suffix}`, { category: 'Resolve', request, importer, template: identity });
}
function isSourceTemplate(value) {
    const template = sourceTemplateRecord(value);
    return !!template && isTemplateIdentity(template.id) && typeof template.source === 'string';
}
function sourceTemplateRecord(value) {
    return value && typeof value === 'object' ? value : undefined;
}
function isTemplateIdentity(value) {
    return typeof value === 'string' && value.trim().length > 0;
}
function sourceIdentity(value) {
    const template = sourceTemplateRecord(value);
    return template && typeof template.id === 'string' ? template.id : undefined;
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
//# sourceMappingURL=template-resolution.js.map