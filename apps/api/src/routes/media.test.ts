import assert from "node:assert/strict";
import { test } from "node:test";
import { Readable } from "node:stream";
import Fastify from "fastify";
import type { MediaStorage } from "@senoy/media";
import { mediaRoutes, SVG_CONTENT_SECURITY_POLICY } from "./media.ts";

const KEY = "library/micro/gram-positive-cocci-phil-2296.jpg";
const BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
const SVG_KEY = "library/drums/rebound-stroke.svg";
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>');

/** A bucket holding one JPEG, recording every key read. */
function bucket(): MediaStorage & { reads: string[] } {
  const reads: string[] = [];
  return {
    reads,
    async put() {},
    async head() { return null; },
    async get(key) {
      reads.push(key);
      if (key === SVG_KEY) return { body: Readable.from([SVG]), contentType: "image/svg+xml", byteSize: SVG.length };
      return key === KEY ? { body: Readable.from([BYTES]), contentType: "image/jpeg", byteSize: BYTES.length } : null;
    },
  };
}

/**
 * Starts the route with a lookup that says which keys a published Lesson shows.
 * @param shown - Storage keys published Lessons use
 * @param storage - The bucket
 */
async function app(shown: string[], storage: MediaStorage) {
  const server = Fastify();
  await server.register(mediaRoutes, { published: async (key: string) => shown.includes(key), storage });
  return server;
}

test("A file a published Lesson shows streams from its storage key with its type", async () => {
  const storage = bucket();
  const server = await app([KEY], storage);
  try {
    const response = await server.inject({ method: "GET", url: `/media/${KEY}` });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["content-type"], "image/jpeg");
    assert.equal(response.headers["x-content-type-options"], "nosniff");
    assert.deepEqual(response.rawPayload, BYTES);
    assert.deepEqual(storage.reads, [KEY]);
    assert.equal(response.headers["content-security-policy"], undefined);
  } finally {
    await server.close();
  }
});

test("An SVG diagram is served as SVG under a policy that lets it draw itself and nothing else", async () => {
  const server = await app([SVG_KEY], bucket());
  try {
    const response = await server.inject({ method: "GET", url: `/media/${SVG_KEY}` });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["content-type"], "image/svg+xml");
    assert.equal(response.headers["content-security-policy"], SVG_CONTENT_SECURITY_POLICY);
    assert.deepEqual(response.rawPayload, SVG);
  } finally {
    await server.close();
  }
});

test("A file no published Lesson shows is 404 and the bucket is never read", async () => {
  const storage = bucket();
  const server = await app([], storage);
  try {
    const response = await server.inject({ method: "GET", url: `/media/${KEY}` });
    assert.equal(response.statusCode, 404);
    assert.deepEqual(storage.reads, []);
  } finally {
    await server.close();
  }
});

test("A malformed key is 404 before any lookup", async () => {
  const storage = bucket();
  let lookups = 0;
  const server = Fastify();
  await server.register(mediaRoutes, { published: async () => { lookups++; return true; }, storage });
  try {
    for (const url of ["/media/", "/media/Library/X.jpg", "/media/library/..%2fsecret", "/media/library/x%20y.jpg", "/media/library//x.jpg"]) {
      assert.equal((await server.inject({ method: "GET", url })).statusCode, 404, url);
    }
    assert.equal(lookups, 0);
  } finally {
    await server.close();
  }
});

test("A published file missing from the bucket is 404, and a failing lookup is 502", async () => {
  const missing = await app(["library/micro/gone.jpg"], bucket());
  const failing = Fastify();
  await failing.register(mediaRoutes, { published: async () => { throw new Error("db down"); }, storage: bucket() });
  try {
    assert.equal((await missing.inject({ method: "GET", url: "/media/library/micro/gone.jpg" })).statusCode, 404);
    assert.equal((await failing.inject({ method: "GET", url: `/media/${KEY}` })).statusCode, 502);
  } finally {
    await missing.close();
    await failing.close();
  }
});
