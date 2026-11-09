/**
 * Copyright (C) 2026 by Fonoster Inc (https://fonoster.com). MIT License.
 */
import { z } from "zod/v4";
import { ValidationError } from "../errors/index.js";
import { DO_API_URL } from "./constants.js";
import { DigitalOceanError } from "./errors.js";
import type {
  DoClient,
  DoDroplet,
  DoFirewall,
  DoKubernetesCluster,
  DoSshKey,
  DoVpc,
  DoVpcMember
} from "./types.js";

const PER_PAGE = 200;
const REQUEST_TIMEOUT_MS = 30 * 1000;

const doClientInputSchema = z.strictObject({
  token: z.string().min(1, { error: "DIGITALOCEAN_TOKEN must not be empty" }),
  fetch: z.custom<typeof fetch>((value) => typeof value === "function", {
    error: "expected a fetch function"
  })
});

export type DoClientInput = z.infer<typeof doClientInputSchema>;

/**
 * Creates the DigitalOcean API v2 client: every call is a `fetch` against
 * https://api.digitalocean.com/v2 with the token as a bearer header. The token
 * goes nowhere else: errors carry DigitalOcean's message, never the request.
 *
 * @param input - The token and the fetch to call the API with (injected)
 * @returns The client; lists follow every page
 */
export function createDoClient(input: DoClientInput): DoClient {
  const parsed = doClientInputSchema.safeParse(input, { reportInput: false });
  if (!parsed.success) throw new ValidationError(parsed.error);
  const { token, fetch: doFetch } = parsed.data;

  const send = async (method: string, path: string, body?: unknown) => {
    const response = await doFetch(`${DO_API_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    return response;
  };

  const request = async <T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T | null> => {
    const response = await send(method, path, body);
    if (response.status === 404 && method !== "POST") return null;
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new DigitalOceanError(
        messageFrom(text, response.status),
        response.status,
        method,
        path
      );
    }
    if (response.status === 204) return null;
    const text = await response.text();
    return text === "" ? null : (JSON.parse(text) as T);
  };

  const required = async <T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> => {
    const out = await request<T>(method, path, body);
    if (out === null) {
      throw new DigitalOceanError("not found", 404, method, path);
    }
    return out;
  };

  const remove = async (path: string): Promise<void> => {
    await request("DELETE", path);
  };

  const listAll = async <T>(
    path: string,
    key: string,
    page = 1
  ): Promise<T[]> => {
    const joiner = path.includes("?") ? "&" : "?";
    const out = await required<
      Record<string, unknown> & { links?: { pages?: { next?: string } } }
    >("GET", `${path}${joiner}per_page=${PER_PAGE}&page=${page}`);
    const items = (out[key] as T[] | undefined) ?? [];
    return out.links?.pages?.next
      ? [...items, ...(await listAll<T>(path, key, page + 1))]
      : items;
  };

  return {
    listSshKeys: () => listAll<DoSshKey>("/account/keys", "ssh_keys"),
    getSshKey: async (fingerprint) => {
      const out = await request<{ ssh_key: DoSshKey }>(
        "GET",
        `/account/keys/${encodeURIComponent(fingerprint)}`
      );
      return out?.ssh_key ?? null;
    },
    createSshKey: async (body) =>
      (await required<{ ssh_key: DoSshKey }>("POST", "/account/keys", body))
        .ssh_key,
    deleteSshKey: (id) => remove(`/account/keys/${id}`),

    listVpcs: () => listAll<DoVpc>("/vpcs", "vpcs"),
    createVpc: async (body) =>
      (await required<{ vpc: DoVpc }>("POST", "/vpcs", body)).vpc,
    listVpcMembers: (id) =>
      listAll<DoVpcMember>(
        `/vpcs/${encodeURIComponent(id)}/members`,
        "members"
      ),
    deleteVpc: (id) => remove(`/vpcs/${encodeURIComponent(id)}`),

    listDroplets: ({ tag }) =>
      listAll<DoDroplet>(
        `/droplets?tag_name=${encodeURIComponent(tag)}`,
        "droplets"
      ),
    getDroplet: async (id) =>
      (await required<{ droplet: DoDroplet }>("GET", `/droplets/${id}`))
        .droplet,
    createDroplet: async (body) =>
      (await required<{ droplet: DoDroplet }>("POST", "/droplets", body))
        .droplet,
    deleteDroplet: (id) => remove(`/droplets/${id}`),

    listFirewalls: () => listAll<DoFirewall>("/firewalls", "firewalls"),
    createFirewall: async (body) =>
      (await required<{ firewall: DoFirewall }>("POST", "/firewalls", body))
        .firewall,
    updateFirewall: async (id, body) =>
      (
        await required<{ firewall: DoFirewall }>(
          "PUT",
          `/firewalls/${encodeURIComponent(id)}`,
          body
        )
      ).firewall,
    deleteFirewall: (id) => remove(`/firewalls/${encodeURIComponent(id)}`),

    deleteTag: (name) => remove(`/tags/${encodeURIComponent(name)}`),

    listKubernetesClusters: () =>
      listAll<DoKubernetesCluster>(
        "/kubernetes/clusters",
        "kubernetes_clusters"
      ),
    createKubernetesCluster: async (body) =>
      (
        await required<{ kubernetes_cluster: DoKubernetesCluster }>(
          "POST",
          "/kubernetes/clusters",
          body
        )
      ).kubernetes_cluster,
    getKubernetesCluster: async (id) =>
      (
        await required<{ kubernetes_cluster: DoKubernetesCluster }>(
          "GET",
          `/kubernetes/clusters/${encodeURIComponent(id)}`
        )
      ).kubernetes_cluster,
    getKubeconfig: async (id, expirySeconds) => {
      const path = `/kubernetes/clusters/${encodeURIComponent(id)}/kubeconfig?expiry_seconds=${Math.round(expirySeconds)}`;
      const response = await send("GET", path);
      const text = await response.text().catch(() => "");
      if (!response.ok) {
        throw new DigitalOceanError(
          messageFrom(text, response.status),
          response.status,
          "GET",
          path
        );
      }
      return text;
    },
    deleteKubernetesCluster: (id) =>
      remove(
        `/kubernetes/clusters/${encodeURIComponent(id)}/destroy_with_associated_resources/dangerous`
      )
  };
}

function messageFrom(text: string, status: number): string {
  try {
    const body = JSON.parse(text) as { message?: unknown };
    if (typeof body.message === "string" && body.message !== "") {
      return body.message;
    }
  } catch {
    // not JSON; fall through
  }
  return `HTTP ${status}`;
}
