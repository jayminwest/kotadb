import { describe, expect, it } from "bun:test";
import { buildSnippet } from "../src/indexer/extractors";

describe("buildSnippet", () => {
  it("highlights the needle inside the snippet", () => {
    const content = "const answer = 42; console.log(answer);";
    const snippet = buildSnippet(content, "answer");

    expect(snippet.toLowerCase()).toContain("answer");
  });

  it("falls back to truncation when the term is missing", () => {
    const content = "export const something = 'value';";
    const snippet = buildSnippet(content, "not-present", 5);

    expect(snippet.length).toBeGreaterThan(0);
  });
});
