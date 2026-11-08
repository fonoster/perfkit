/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { entryAddressOf } from "../../src/orchestrate/entryAddressOf.js";

const services = (name: string, ingress: unknown[]) =>
  JSON.stringify({
    items: [
      {
        metadata: { name },
        spec: { ports: [{ port: 5060 }] },
        status: { loadBalancer: { ingress } }
      }
    ]
  });

describe("entryAddressOf", () => {
  it("should return the load balancer's address and the Service port, with or without the release name", () => {
    const ingress = [{ ip: "198.51.100.4" }];
    expect(
      entryAddressOf(services("sipp-tcp", ingress), "sipp-tcp", 5060)
    ).to.deep.equal({ ip: "198.51.100.4", port: 5060 });
    expect(
      entryAddressOf(
        services("perfkit-routr-edgeport-tcp", ingress),
        "routr-edgeport-tcp",
        5060
      )
    ).to.deep.equal({ ip: "198.51.100.4", port: 5060 });
  });

  it("should return null while there is no address, for another port or Service, or for bad JSON", () => {
    const ingress = [{ ip: "198.51.100.4" }];
    expect(entryAddressOf(services("sipp-tcp", []), "sipp-tcp", 5060)).to.equal(
      null
    );
    expect(
      entryAddressOf(services("sipp-tcp", ingress), "sipp-tcp", 5061)
    ).to.equal(null);
    expect(
      entryAddressOf(services("sipp-tcp", ingress), "other", 5060)
    ).to.equal(null);
    expect(entryAddressOf("not json", "sipp-tcp", 5060)).to.equal(null);
  });
});
