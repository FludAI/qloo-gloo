// Health never waits long on the Qloo harness: readinessCached answers from the cache while it is fresh, races a
// live check against a short timeout otherwise, and marks a timed-out answer `pending` while the live check fills
// the cache behind it. Nothing here spawns the harness: the check is injected.
import { test } from "node:test";
import assert from "node:assert/strict";
const { readinessCached, resetReadinessCache } = await import("../src/qloo.mjs");

const hang = () => new Promise(() => {});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test("a hanging check answers within the timeout as pending, then the live answer fills the cache", async () => {
  resetReadinessCache();
  let release;
  const check = () => new Promise((r) => { release = r; });
  const t0 = Date.now();
  const first = await readinessCached({ timeoutMs: 50, check });
  assert.ok(Date.now() - t0 < 500, "answered at the timeout, not at the check");
  assert.deepEqual(first, { ready: false, contract_version: null, pending: true });
  release({ ready: true, contract_version: "1.2" });
  await sleep(10);
  // The cache is fresh now: no new check, no wait.
  const second = await readinessCached({ timeoutMs: 50, check: hang });
  assert.deepEqual(second, { ready: true, contract_version: "1.2", pending: false });
});

test("a stale cache keeps serving the last value as pending while the next check runs", async () => {
  resetReadinessCache();
  let now = 1000;
  await readinessCached({ timeoutMs: 0, check: async () => ({ ready: true, contract_version: "1" }), now: () => now });
  now += 10 * 60e3; // older than maxAge
  const r = await readinessCached({ timeoutMs: 20, check: hang, now: () => now });
  assert.deepEqual(r, { ready: true, contract_version: "1", pending: true });
});

test("one live check at a time: concurrent callers share it", async () => {
  resetReadinessCache();
  let calls = 0;
  const check = async () => { calls++; await sleep(20); return { ready: true, contract_version: null }; };
  const [a, b, c] = await Promise.all([1, 2, 3].map(() => readinessCached({ timeoutMs: 500, check })));
  assert.equal(calls, 1);
  assert.deepEqual(a, b); assert.deepEqual(b, c);
  assert.equal(a.ready, true); assert.equal(a.pending, false);
});

test("a failing check answers ready false with the error and caches nothing", async () => {
  resetReadinessCache();
  const r = await readinessCached({ timeoutMs: 500, check: async () => { throw new Error("harness down"); } });
  assert.equal(r.ready, false); assert.equal(r.pending, false); assert.equal(r.error, "harness down");
  let calls = 0;
  await readinessCached({ timeoutMs: 500, check: async () => { calls++; return { ready: true }; } });
  assert.equal(calls, 1, "the failure was not cached");
});
