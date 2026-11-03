/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { expect } from "chai";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import sinon from "sinon";
import { createSshTools, type RunProgram } from "../../src/infra/index.js";
import { PRIVATE_KEY, PUBLIC_KEY } from "./fakes.js";

describe("createSshTools", () => {
  afterEach(() => {
    sinon.restore();
  });

  it("should run ssh as root with the key in a 0600 file, then remove it", async () => {
    // Arrange
    let keyFile = "";
    const run = sinon
      .stub<Parameters<RunProgram>, ReturnType<RunProgram>>()
      .callsFake(async (_file, args) => {
        keyFile = args[args.indexOf("-i") + 1]!;
        expect(readFileSync(keyFile, "utf8")).to.equal(PRIVATE_KEY);
        expect(statSync(keyFile).mode & 0o777).to.equal(0o600);
        return { code: 0, stdout: "status: done\n", stderr: "" };
      });

    // Act
    const out = await createSshTools({ run }).exec({
      host: "203.0.113.9",
      privateKey: PRIVATE_KEY,
      command: "cloud-init status --wait",
      timeoutMs: 1000
    });

    // Assert
    expect(out.code).to.equal(0);
    const [file, args] = run.firstCall.args;
    expect(file).to.equal("ssh");
    expect(args.slice(-2)).to.deep.equal([
      "root@203.0.113.9",
      "cloud-init status --wait"
    ]);
    expect(args).to.include("BatchMode=yes");
    expect(existsSync(keyFile)).to.equal(false);
  });

  it("should generate an ed25519 key pair with ssh-keygen", async () => {
    // Arrange
    const run: RunProgram = async (_file, args) => {
      const keyFile = args[args.indexOf("-f") + 1]!;
      writeFileSync(keyFile, PRIVATE_KEY);
      writeFileSync(`${keyFile}.pub`, `${PUBLIC_KEY}\n`);
      return { code: 0, stdout: "", stderr: "" };
    };

    // Act
    const pair = await createSshTools({ run }).generateKeyPair();

    // Assert
    expect(pair).to.deep.equal({
      privateKey: PRIVATE_KEY,
      publicKey: PUBLIC_KEY
    });
  });

  it("should derive the public key, and reject a key ssh-keygen can't read", async () => {
    // Arrange
    const run = sinon.stub();
    run.onCall(0).resolves({ code: 0, stdout: `${PUBLIC_KEY}\n`, stderr: "" });
    run.onCall(1).resolves({ code: 255, stdout: "", stderr: "invalid format" });
    const ssh = createSshTools({ run });

    // Act
    const publicKey = await ssh.publicKeyOf(PRIVATE_KEY);
    const err = await ssh.publicKeyOf("junk").catch((e: unknown) => e);

    // Assert
    expect(publicKey).to.equal(PUBLIC_KEY);
    expect(run.firstCall.args[0]).to.equal("ssh-keygen");
    expect((err as Error).message).to.equal(
      "not an OpenSSH private key without a passphrase"
    );
  });
});
