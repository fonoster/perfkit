/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ngrokBindingCommand } from "../../src/live/ngrokBindingCommand.js";
import { ngrokVersion } from "../../src/live/ngrokVersion.js";
import { NODE_IMAGE } from "../../src/tools.js";

describe("ngrokBindingCommand", () => {
  it("should install the pinned @ngrok/ngrok in NODE_IMAGE and copy its scope into the agent, never failing", () => {
    // Act
    const command = ngrokBindingCommand({
      agentDir: "/opt/perfkit/agent",
      version: "1.7.0"
    });

    // Assert
    expect(command).to.contain(NODE_IMAGE);
    expect(command).to.contain("@ngrok/ngrok@1.7.0");
    expect(command).to.contain("--ignore-scripts");
    expect(command).to.contain("/opt/perfkit/agent/node_modules/@ngrok/");
    expect(command.endsWith("; true")).to.equal(true);
  });
});

describe("ngrokVersion", () => {
  it("should read the exact @ngrok/ngrok version from package.json", async () => {
    const dir = await mkdtemp(join(tmpdir(), "perfkit-ngrok-"));
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ dependencies: { "@ngrok/ngrok": "^1.7.0" } })
    );
    expect(await ngrokVersion(dir)).to.equal("1.7.0");
  });
});
