// ─── Render / Engine types ────────────────────────────────────────────────────
// ─── Error classes ────────────────────────────────────────────────────────────
/** Base class for all errors thrown by the template engine. */
export class TemplateEngineError extends Error {
    code;
    cause;
    constructor(message, code, cause) {
        super(message);
        this.name = 'TemplateEngineError';
        this.code = code;
        this.cause = cause;
    }
}
export class LoadError extends TemplateEngineError {
    path;
    constructor(path, cause) {
        super(`Failed to load template: ${path}`, 'LOAD_ERROR', cause);
        this.name = 'LoadError';
        this.path = path;
    }
}
export class RenderError extends TemplateEngineError {
    expressionSource;
    constructor(message, expressionSource, cause) {
        super(message, 'RENDER_ERROR', cause);
        this.name = 'RenderError';
        this.expressionSource = expressionSource;
    }
}
//# sourceMappingURL=types.js.map