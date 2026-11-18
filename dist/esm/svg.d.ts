import { RawHtml } from './escape.js';
export type SvgAttributes = Record<string, string | number | boolean | null | undefined>;
/**
 * Normalizes raw SVG markup and merges attributes (such as `class` and `aria-*`)
 * onto the root `<svg>` element, returning trusted `RawHtml`.
 */
export declare function inlineSvg(svg: string, attrs?: SvgAttributes): RawHtml;
//# sourceMappingURL=svg.d.ts.map