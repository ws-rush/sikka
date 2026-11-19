export interface ExtractAssetsOptions {
    /** Inject extracted `<style>` and `<script>` tags before `</head>` when present. Default: `true`. */
    inject?: boolean;
}
export interface ExtractAssetsResult {
    html: string;
    styles: string[];
    scripts: string[];
}
/**
 * Extracts and deduplicates `<style>` and `<script>` tags from rendered HTML.
 * When `inject` is not `false` and `</head>` is present, injects them before `</head>`.
 */
export declare function extractAssets(html: string, options?: ExtractAssetsOptions): ExtractAssetsResult;
export interface HtmlAttrHelpers {
    classList: (value: unknown) => string;
    styleObject: (value: unknown) => string;
}
/**
 * Coerces a `set:html` value, strips leading XML declarations, and merges
 * attribute maps onto the root element if present.
 */
export declare function mergeHtmlAttributes(raw: unknown, attrMaps: unknown[], helpers: HtmlAttrHelpers): string;
//# sourceMappingURL=html.d.ts.map