/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { entryAddressOf } from "../../src/orchestrate/entryAddressOf.js";

const service = (ingress: unknown[]) =>
  JSON.stringify({
    spec: { ports: [{ port: 5060, nodePort: 31060 }] },
    status: { loadBalancer: { ingress } }
  });

describe("entryAddressOf", () => {
  it("should return the load balancer's address and the Service port", () => {
    expect(
      entryAddressOf(service([{ ip: "198.51.100.4" }]), 5060)
    ).to.deep.equal({
      ip: "198.51.100.4",
      port: 5060
    });
  });

  it("should return null while there is no address, for another port, or for bad JSON", () => {
    expect(entryAddressOf(service([]), 5060)).to.equal(null);
    expect(entryAddressOf(service([{ ip: "198.51.100.4" }]), 5061)).to.equal(
      null
    );
    expect(entryAddressOf("not json", 5060)).to.equal(null);
  });
});
