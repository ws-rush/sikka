import { escapeHtml, RawHtml } from './escape.js';

/** The generated-runtime ABI version. */
export const RUNTIME_ABI_VERSION = 2;

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

type ClassListArg = string | Record<string, unknown> | ClassListArg[] | null | undefined | boolean;
type StyleObjectArg =
  | string
  | Record<string, string | number | null | undefined>
  | null
  | undefined;

/**
 * Returns the stable helper set for a generated module. Generated `render` and
 * `stream` exports call this with their `this` receiver, so a host runtime can
 * supply rendering options without rebuilding the artifact.
 */
// fallow-ignore-next-line complexity
export function runtime(receiver: RuntimeReceiver | undefined): RuntimeHelpers {
  const options = receiver?.options ?? receiver;
  return {
    escape: options?.autoEscape === false ? unescapedHtml : escapeHtml,
    RawHtml,
    components: options?.components ?? {},
    classList,
    styleObject,
    filter: options?.autoFilter ? (options.filterFunction ?? identity) : identity,
    aggregateAssets: options?.aggregateAssets === true,
  };
}

function identity(value: unknown): unknown {
  return value;
}

function unescapedHtml(value: unknown): string {
  return value instanceof RawHtml ? value.value : String(value);
}

// fallow-ignore-next-line complexity
function classList(value: ClassListArg): string {
  if (typeof value === 'string') return value;
  if (value instanceof Set) return Array.from(value).join(' ');
  if (Array.isArray(value)) return value.map(classList).filter(Boolean).join(' ');
  if (!value || typeof value !== 'object') return '';
  return Object.entries(value)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name)
    .join(' ');
}

// fallow-ignore-next-line complexity
function styleObject(value: StyleObjectArg): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  if (typeof value.toString === 'function' && value.toString !== Object.prototype.toString)
    return value.toString();
  return Object.entries(value)
    .map(([name, item]) => `${name.replace(/[A-Z]/g, toKebabCase)}:${item}`)
    .join(';');
}

function toKebabCase(match: string): string {
  return '-' + match.toLowerCase();
}
