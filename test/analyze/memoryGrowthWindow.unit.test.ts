/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { memoryGrowthWindow } from "../../src/analyze/index.js";

describe("memoryGrowthWindow", () => {
  it("should start after the settle period and end at the end of the load", () => {
    expect(
      memoryGrowthWindow({ warmupEndMs: 1000, settleS: 2, loadEndMs: 9000 })
    ).to.deep.equal({ fromMs: 3000, toMs: 9000 });
  });

  it("should be empty when the load ended within the settle period", () => {
    expect(
      memoryGrowthWindow({ warmupEndMs: 1000, settleS: 10, loadEndMs: 5000 })
    ).to.deep.equal({ fromMs: 5000, toMs: 5000 });
  });
});
