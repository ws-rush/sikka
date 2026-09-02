import { escapeHtml, RawHtml, stringifyHtml } from './escape.js';

/** The generated-runtime ABI version. */
export const RUNTIME_ABI_VERSION = 3;

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
  expression: (value: unknown) => string;
  RawHtml: typeof RawHtml;
  components: Record<string, import('./types.js').RenderFunction>;
  classList: (value: ClassListArg) => string;
  styleObject: (value: StyleObjectArg) => string;
  filter: (value: unknown) => unknown;
  autoFilter: boolean;
  aggregateAssets: boolean;
}

type ClassListArg =
  | string
  | Record<string, unknown>
  | ClassListArg[]
  | Set<ClassListArg>
  | null
  | undefined
  | boolean;
type StyleObjectArg = string | Record<string, unknown> | null | undefined;

const RUNTIME_HELPERS = Symbol('sikka.runtime-helpers');
type RuntimeCache = { [RUNTIME_HELPERS]?: RuntimeHelpers };

/** Binds one stable helper set to a host receiver. */
export function bindRuntime(receiver: object, helpers: RuntimeHelpers): void {
  Object.defineProperty(receiver, RUNTIME_HELPERS, { value: helpers });
}

/**
 * Returns the stable helper set for a generated module. Generated `render` and
 * `stream` exports call this with their `this` receiver, so a host runtime can
 * supply rendering options without rebuilding the artifact.
 */
export function runtime(receiver: RuntimeReceiver | undefined): RuntimeHelpers {
  const cached = receiver && (receiver as RuntimeCache)[RUNTIME_HELPERS];
  if (cached) return cached;
  const options = receiver?.options ?? receiver;
  const escape = options?.autoEscape === false ? stringifyHtml : escapeHtml;
  const filter = options?.autoFilter ? (options.filterFunction ?? identity) : identity;
  return {
    escape,
    expression: options?.autoFilter ? (value) => escape(filter(value)) : escape,
    RawHtml,
    components: options?.components ?? {},
    classList,
    styleObject,
    filter,
    autoFilter: options?.autoFilter === true,
    aggregateAssets: options?.aggregateAssets === true,
  };
}

function identity(value: unknown): unknown {
  return value;
}

function classList(value: ClassListArg): string {
  if (typeof value === 'string') return value;
  if (value instanceof Set || Array.isArray(value))
    return Array.from(value, classList).filter(Boolean).join(' ');
  if (!value || typeof value !== 'object') return '';
  return Object.entries(value)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name)
    .join(' ');
}

function styleObject(value: StyleObjectArg): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  if (typeof value.toString === 'function' && value.toString !== Object.prototype.toString)
    return String(value.toString());
  return Object.entries(value)
    .filter(([, item]) => item != null && typeof item !== 'boolean' && item !== '')
    .map(([name, item]) => `${name.replace(/[A-Z]/g, toKebabCase)}:${item}`)
    .join(';');
}

function toKebabCase(match: string): string {
  return '-' + match.toLowerCase();
}
