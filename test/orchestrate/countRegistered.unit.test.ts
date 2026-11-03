/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { countRegistered } from "../../src/orchestrate/countRegistered.js";

const HEADER =
  "CurrentTime;ElapsedTime;0_REGISTER_Sent;0_REGISTER_Retrans;2_401_Recv;3_REGISTER_Sent;5_200_Recv;5_200_Retrans;7_Pause_Sessions;";
const row = (sent: number, ok: number) =>
  `2026-11-03\t23:04:28.236386\t1793747068.236386;00:00:10:016000;${sent};0;${sent};${sent};${ok};3;${ok};`;

describe("countRegistered", () => {
  it("should read the 200 OK counter of the last row", () => {
    // Arrange
    const csv = [HEADER, row(0, 0), row(150, 120), row(200, 199), ""].join(
      "\n"
    );

    // Act
    const registered = countRegistered(csv);

    // Assert
    expect(registered).to.equal(199);
  });

  it("should take the highest of several 200 OK counters", () => {
    // Arrange
    const csv = [
      "CurrentTime;ElapsedTime;0_INVITE_Sent;1_200_Recv;4_200_Recv;",
      "t;e;10;10;7;"
    ].join("\n");

    // Act
    const registered = countRegistered(csv);

    // Assert
    expect(registered).to.equal(10);
  });

  it("should count 0 for a file with only its header, or none", () => {
    expect(countRegistered(`${HEADER}\n`)).to.equal(0);
    expect(countRegistered("")).to.equal(0);
  });
});
