import { describe, expect, it } from "vitest";
import { normalizeUrl } from "./tabManager";

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
