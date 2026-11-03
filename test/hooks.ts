/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
/**
 * Mocha root hooks. No unit test may reach the network or see a DigitalOcean
 * token: nock blocks every outbound connection, and the token is removed from
 * the environment before any test runs.
 */
import * as chai from "chai";
import nock from "nock";
import sinonChai from "sinon-chai";

chai.use(sinonChai);

export const mochaHooks = {
  beforeAll(): void {
    nock.disableNetConnect();
    delete process.env.DIGITALOCEAN_TOKEN;
  },
  afterAll(): void {
    nock.cleanAll();
    nock.enableNetConnect();
  }
};
