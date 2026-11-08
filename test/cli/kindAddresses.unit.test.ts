/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { kindAddresses } from "../../src/cli/kindAddresses.js";

describe("kindAddresses", () => {
  it("should put MetalLB's pool and SIPp in the second-to-last /24 of a /16", () => {
    expect(kindAddresses("172.18.0.0/16")).to.deep.equal({
      pool: "172.18.254.200-172.18.254.250",
      sippIps: {
        uac: "172.18.254.251",
        register: "172.18.254.252",
        uas: "172.18.254.253"
      }
    });
  });

  it("should use the top of a /24", () => {
    expect(kindAddresses("10.1.2.0/24")?.pool).to.equal(
      "10.1.2.200-10.1.2.250"
    );
  });

  it("should return null for IPv6, a subnet smaller than /24 or text", () => {
    expect(kindAddresses("fc00:f853:ccd:e793::/64")).to.equal(null);
    expect(kindAddresses("10.1.2.0/28")).to.equal(null);
    expect(kindAddresses("kind")).to.equal(null);
  });
});
