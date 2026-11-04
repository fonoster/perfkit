/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { z } from "zod/v4";
import { formatIssueMessage } from "../../src/errors/index.js";

function messageOf(schema: z.ZodType, value: unknown): string {
  const result = schema.safeParse(value, { reportInput: true });
  const issue = result.error?.issues[0];
  if (!issue) throw new Error("expected an issue");
  return formatIssueMessage(issue);
}

describe("formatIssueMessage", () => {
  it("should say required for a missing field", () => {
    expect(messageOf(z.object({ a: z.string() }), {})).to.equal("required");
  });

  it("should name the expected and actual types", () => {
    expect(messageOf(z.number(), "5")).to.equal('expected number; got "5"');
  });

  it("should list enum values", () => {
    expect(messageOf(z.enum(["a", "b"]), "c")).to.equal(
      'expected one of a, b; got "c"'
    );
  });

  it("should list discriminator values", () => {
    const schema = z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("x") }),
      z.object({ kind: z.literal("y") })
    ]);
    expect(messageOf(schema, { kind: "z" })).to.equal(
      'expected one of x, y; got "z"'
    );
    expect(messageOf(schema, {})).to.equal("required");
  });

  it("should say unknown key for an unrecognized key", () => {
    expect(messageOf(z.strictObject({}), { extra: 1 })).to.equal("unknown key");
  });

  it("should append the value to a format error", () => {
    expect(
      messageOf(z.string().regex(/^a$/, { error: "expected a" }), "b")
    ).to.equal('expected a; got "b"');
  });
});
