// Global components registered via sikka.loadComponent() at runtime.
// This file gives TypeScript knowledge of them so .astro templates
// do not produce "Cannot find name" errors.

declare function Card(props: { title: string; description: string; href: string }): void;
