# Agent Guidelines

## Testing

When writing JavaScript/TypeScript tests, prefer `toEqual` over `toBe` for all equality checks. This provides consistent behavior across primitive and non-primitive values.

```typescript
// Preferred
expect(count).toEqual(5);
expect(result).toEqual(true);
expect(name).toEqual("hello");
expect(obj).toEqual({ a: 1, b: 2 });
expect(arr).toEqual([1, 2, 3]);
```
