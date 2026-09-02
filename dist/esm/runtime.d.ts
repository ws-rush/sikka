import { RawHtml } from './escape.js';
/** The generated-runtime ABI version. */
export declare const RUNTIME_ABI_VERSION = 2;
/** Runtime behavior supplied by a generated module's receiver. */
export interface RuntimeReceiver {
    autoEscape?: boolean;
    autoFilter?: boolean;
    filterFunction?: (value: unknown) => unknown;
    aggregateAssets?: boolean;
    components?: Record<string, import('./types.js').RenderFunction>;
    /** Runtime options, as carried by a Sikka receiver. */
    options?: Omit<RuntimeReceiver, 'options'>;
}
/** Shared helpers supplied to generated render bodies. */
export interface RuntimeHelpers {
    escape: (value: unknown) => string;
    RawHtml: typeof RawHtml;
    components: Record<string, import('./types.js').RenderFunction>;
    classList: (value: ClassListArg) => string;
    styleObject: (value: StyleObjectArg) => string;
    filter: (value: unknown) => unknown;
    aggregateAssets: boolean;
}
type ClassListArg = string | Record<string, unknown> | ClassListArg[] | Set<ClassListArg> | null | undefined | boolean;
type StyleObjectArg = string | Record<string, unknown> | null | undefined;
/**
 * Returns the stable helper set for a generated module. Generated `render` and
 * `stream` exports call this with their `this` receiver, so a host runtime can
 * supply rendering options without rebuilding the artifact.
 */
export declare function runtime(receiver: RuntimeReceiver | undefined): RuntimeHelpers;
export {};
//# sourceMappingURL=runtime.d.ts.map