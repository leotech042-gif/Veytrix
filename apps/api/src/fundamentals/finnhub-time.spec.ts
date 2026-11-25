import assert from "node:assert/strict";
import test from "node:test";
import { parseFinnhubReleaseTime } from "./finnhub-time";

test("parses Finnhub space-separated release time as UTC", () => {
  assert.equal(
    parseFinnhubReleaseTime("2026-11-25 13:30:00"),
    "2026-11-25T13:30:00.000Z",
  );
});

test("parses ISO release time without an offset as UTC", () => {
  assert.equal(
    parseFinnhubReleaseTime("2026-11-25T13:30:00"),
    "2026-11-25T13:30:00.000Z",
  );
});

test("preserves and normalizes an explicit timezone offset", () => {
  assert.equal(
    parseFinnhubReleaseTime("2026-11-25T13:30:00-05:00"),
    "2026-11-25T18:30:00.000Z",
  );
});

test("rejects missing or malformed release timestamps instead of using now", () => {
  assert.equal(parseFinnhubReleaseTime(undefined), null);
  assert.equal(parseFinnhubReleaseTime(null), null);
  assert.equal(parseFinnhubReleaseTime("not-a-date"), null);
});
