import test from "node:test";
import assert from "node:assert/strict";

import {
  PHOTO_MAX_EDGE,
  fitWithin,
  photoFilename,
  prepareCapturedPhoto,
} from "../lib/capture-photo";

// fitWithin ------------------------------------------------------------------

test("fitWithin: scales a landscape photo down to the long edge", () => {
  assert.deepEqual(fitWithin(4000, 3000), { width: 2048, height: 1536 });
});

test("fitWithin: scales a portrait photo down to the long edge", () => {
  assert.deepEqual(fitWithin(3000, 4000), { width: 1536, height: 2048 });
});

test("fitWithin: keeps an image that is already inside the cap", () => {
  assert.deepEqual(fitWithin(1000, 750), { width: 1000, height: 750 });
  assert.deepEqual(fitWithin(2048, 1000), { width: 2048, height: 1000 });
});

test("fitWithin: never scales up, and respects a custom cap", () => {
  assert.deepEqual(fitWithin(600, 400, 1024), { width: 600, height: 400 });
  assert.deepEqual(fitWithin(600, 400, 300), { width: 300, height: 200 });
});

test("fitWithin: degenerate dimensions collapse to zero", () => {
  assert.deepEqual(fitWithin(0, 0), { width: 0, height: 0 });
  assert.deepEqual(fitWithin(Number.NaN, 100), { width: 0, height: 0 });
});

test("PHOTO_MAX_EDGE stays at the documented 2048 px", () => {
  assert.equal(PHOTO_MAX_EDGE, 2048);
});

// photoFilename --------------------------------------------------------------

test("photoFilename: date and time are zero padded", () => {
  assert.equal(
    photoFilename(new Date(2026, 10, 8, 20, 3, 5)),
    "photo-20261108-200305.jpg",
  );
  assert.equal(
    photoFilename(new Date(2026, 0, 1, 0, 0, 0)),
    "photo-20260101-000000.jpg",
  );
});

// prepareCapturedPhoto -------------------------------------------------------

test("prepareCapturedPhoto: leaves non-images untouched", async () => {
  const file = new File(["hello"], "notes.txt", { type: "text/plain" });
  assert.equal(await prepareCapturedPhoto(file), file);
});

test("prepareCapturedPhoto: leaves unknown types untouched", async () => {
  const file = new File(["pdf"], "paper.pdf", { type: "" });
  assert.equal(await prepareCapturedPhoto(file), file);
});
