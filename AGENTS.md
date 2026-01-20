# Agent Guidelines

This is a Chrome Extension (Manifest V3) built with React 19, TypeScript, Vite, and Tailwind CSS v4.

## Build/Lint/Test Commands

Package manager: **pnpm** (v10.5.2)

```bash
# Development
pnpm dev              # Start Vite dev server
pnpm build            # TypeScript compile + Vite build (outputs to build/)
pnpm preview          # Preview production build

# Linting & Formatting (Biome)
pnpm lint             # Check for lint and format issues
pnpm lint:fix         # Fix lint and format issues
pnpm format           # Format code only

# Testing (Vitest)
pnpm test             # Run all tests (single run)
pnpm test:watch       # Run tests in watch mode
pnpm test <file>      # Run single test file: pnpm test src/lib/tabManager.test.ts
pnpm test -t "name"   # Run tests matching pattern: pnpm test -t "strips query"
```

## Project Structure

```
src/
├── main.tsx              # React entry point
├── App.tsx               # Main app component
├── background.ts         # Chrome extension service worker
├── components/
│   ├── ui/               # shadcn/ui components
│   └── *.tsx             # Feature components
└── lib/
    ├── chrome.ts         # Chrome API helpers and message types
    ├── tabManager.ts     # Tab management logic
    ├── smartTimeout.ts   # Timeout calculation logic
    └── utils.ts          # General utilities (cn function)
```

Path alias: `@/*` maps to `./src/*`

## Code Style Guidelines

### Imports

- External packages first, then internal modules with `@/` alias
- Use named imports for multiple exports, default imports for components

```typescript
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { normalizeUrl } from "@/lib/tabManager";
```

### TypeScript

- Use `type` keyword for type definitions (not `interface`)
- Use discriminated unions with `kind` field for message types
- Use `satisfies` for type-safe object literals
- Avoid `any` - use proper types or `unknown`
- Prefix unused parameters with underscore: `_unusedParam`

```typescript
export type CloseAllTabsMessage = {
  kind: "closeAllTabs";
};

chrome.runtime.sendMessage({
  kind: "closeAllTabs",
} satisfies CloseAllTabsMessage);
```

### Naming Conventions

| Element             | Convention           | Example                             |
| ------------------- | -------------------- | ----------------------------------- |
| Variables/Functions | camelCase            | `tabManager`, `getEffectiveTimeout` |
| Types               | PascalCase           | `TabId`, `Message`                  |
| React Components    | PascalCase           | `OpenTabsTable`, `ThemeProvider`    |
| Constants           | SCREAMING_SNAKE_CASE | `MAX_HISTORY_ENTRIES`, `MS_PER_DAY` |

### Functions

- Use regular `function` declarations for top-level and React components
- Use arrow functions for callbacks and inline functions

```typescript
// Top-level function
export function normalizeUrl(url: string): string {
  // ...
}

// React component
export default function Settings() {
  // Arrow for callbacks
  const handleClick = () => {
    // ...
  };
}
```

### Error Handling

- Use try/catch with silent recovery for non-critical operations
- Use early returns (guard clauses) for undefined/null checks

```typescript
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url;
  }
}

public recordAccess(url: string | undefined) {
  if (!url) return;
  // ...
}
```

### React Patterns

- Functional components only (no class components)
- Use hooks for state and effects
- Use Context for global state (see ThemeProvider)
- Style with Tailwind CSS and `cn()` utility for conditional classes

```typescript
import { cn } from "@/lib/utils";

<Button className={cn("base-class", isActive && "active-class")}>
```

### Exports

- Default exports for React components
- Named exports for types, utilities, and constants

```typescript
// Component file
export default function MyComponent() { ... }

// Utility file
export type MyType = { ... };
export function myUtil() { ... }
export const MY_CONSTANT = 100;
```

### Comments

- Avoid comments that restate what code does
- Use JSDoc only for complex business logic
- Use `console.debug()` for development logging

```typescript
/**
 * Close all tabs excluding:
 * 1. Active tab
 * 2. Pinned tabs
 * 3. Audible tabs
 * 4. Locked tabs
 */
public async closeAllTabs() { ... }
```

## Testing

Test files are colocated with source: `*.test.ts` next to `*.ts`

Prefer `toEqual` over `toBe` for all equality checks:

```typescript
import { describe, it, expect } from "vitest";

describe("normalizeUrl", () => {
  it("strips query parameters", () => {
    expect(normalizeUrl("https://example.com/page?foo=bar")).toEqual(
      "https://example.com/page",
    );
  });
});

// toEqual works consistently for primitives and objects
expect(count).toEqual(5);
expect(result).toEqual(true);
expect(obj).toEqual({ a: 1, b: 2 });
```

## Chrome Extension Specifics

- Manifest V3 located at `public/manifest.json`
- Service worker at `src/background.ts`
- Use message passing with typed messages from `@/lib/chrome`
- Storage keys defined in `storageKeys` object

```typescript
import { storageKeys, type Message } from "@/lib/chrome";

// Sending messages
chrome.runtime.sendMessage({ kind: "closeAllTabs" } satisfies Message);

// Storage access
const result = await chrome.storage.local.get([storageKeys.timeoutMinutes]);
```
