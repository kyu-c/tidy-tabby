import { describe, expect, it } from "vitest";
import { isUrlExcluded, normalizeUrl } from "./urls";

describe("normalizeUrl", () => {
  it("strips query parameters", () => {
    expect(normalizeUrl("https://example.com/page?foo=bar&baz=qux")).toEqual(
      "https://example.com/page",
    );
  });

  it("strips hash fragments", () => {
    expect(normalizeUrl("https://example.com/page#section")).toEqual(
      "https://example.com/page",
    );
  });

  it("strips both query params and hash", () => {
    expect(normalizeUrl("https://example.com/page?foo=bar#section")).toEqual(
      "https://example.com/page",
    );
  });

  it("preserves the path", () => {
    expect(normalizeUrl("https://example.com/foo/bar/baz")).toEqual(
      "https://example.com/foo/bar/baz",
    );
  });

  it("preserves the port", () => {
    expect(normalizeUrl("https://localhost:3000/page")).toEqual(
      "https://localhost:3000/page",
    );
  });

  it("handles URLs without a path", () => {
    expect(normalizeUrl("https://example.com")).toEqual("https://example.com/");
  });

  it("returns original string for invalid URLs", () => {
    expect(normalizeUrl("not-a-valid-url")).toEqual("not-a-valid-url");
  });

  it("handles chrome:// URLs", () => {
    expect(normalizeUrl("chrome://extensions/?id=abc")).toEqual(
      "chrome://extensions/",
    );
  });
});

describe("isUrlExcluded", () => {
  it("returns false for undefined URL", () => {
    expect(isUrlExcluded(undefined, ["google.com"])).toEqual(false);
  });

  it("returns false for empty patterns array", () => {
    expect(isUrlExcluded("https://mail.google.com/inbox", [])).toEqual(false);
  });

  it("returns true when URL contains pattern", () => {
    expect(
      isUrlExcluded("https://mail.google.com/inbox", ["mail.google.com"]),
    ).toEqual(true);
  });

  it("returns false when URL does not contain pattern", () => {
    expect(
      isUrlExcluded("https://docs.google.com/document", ["mail.google.com"]),
    ).toEqual(false);
  });

  it("matches any pattern in the array", () => {
    const patterns = ["mail.google.com", "notion.so", "github.com"];
    expect(isUrlExcluded("https://notion.so/workspace", patterns)).toEqual(
      true,
    );
    expect(isUrlExcluded("https://github.com/repo", patterns)).toEqual(true);
    expect(isUrlExcluded("https://twitter.com", patterns)).toEqual(false);
  });

  it("performs substring match, not exact match", () => {
    expect(
      isUrlExcluded("https://mail.google.com/u/0/inbox", ["google.com"]),
    ).toEqual(true);
  });

  it("is case-sensitive", () => {
    expect(
      isUrlExcluded("https://mail.google.com/inbox", ["GOOGLE.COM"]),
    ).toEqual(false);
  });
});
