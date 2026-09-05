import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizeHandle, isValidHandle, canViewProfile, isFeedVisible } from "../visibility";

// ---------------- handle normalisation + validation ----------------

test("normalizeHandle: strips @, trims, lowercases", () => {
  assert.equal(normalizeHandle("  @Dani_MK "), "dani_mk");
  assert.equal(normalizeHandle("@@weird"), "weird");
});

test("isValidHandle: accepts 3-20 lowercase / digits / _ / - (inner)", () => {
  assert.equal(isValidHandle("abc"), true);
  assert.equal(isValidHandle("dani_mk_2026"), true);
  assert.equal(isValidHandle("dani_mk-smo12"), true); // hyphen in the middle
  assert.equal(isValidHandle("a-b"), true);
  assert.equal(isValidHandle("a".repeat(20)), true);
});

test("isValidHandle: rejects too short / too long / bad chars / edge separators", () => {
  assert.equal(isValidHandle("ab"), false);
  assert.equal(isValidHandle("a".repeat(21)), false);
  assert.equal(isValidHandle("Dani"), false); // uppercase
  assert.equal(isValidHandle("dan i"), false); // space
  assert.equal(isValidHandle("-dani"), false); // leading separator
  assert.equal(isValidHandle("dani-"), false); // trailing separator
  assert.equal(isValidHandle("dani_"), false); // trailing underscore
  assert.equal(isValidHandle("café"), false); // accent
  assert.equal(isValidHandle(""), false);
});

// ---------------- profile visibility rule ----------------

test("canViewProfile: public profile is visible to anyone", () => {
  assert.equal(canViewProfile({ isPublic: true, isOwner: false }), true);
  assert.equal(canViewProfile({ isPublic: true, isOwner: true }), true);
});

test("canViewProfile: private profile is visible only to its owner", () => {
  assert.equal(canViewProfile({ isPublic: false, isOwner: true }), true);
  assert.equal(canViewProfile({ isPublic: false, isOwner: false }), false);
});

// ---------------- feed visibility rule (§13 Phase B) ----------------

test("isFeedVisible: needs the owner profile public + (published OR public on YouTube)", () => {
  assert.equal(isFeedVisible({ publicationIsPublic: true, ownerProfileIsPublic: true }), true);
  assert.equal(isFeedVisible({ publicationIsPublic: true, ownerProfileIsPublic: false }), false);
  assert.equal(isFeedVisible({ publicationIsPublic: false, ownerProfileIsPublic: true }), false);
  assert.equal(isFeedVisible({ publicationIsPublic: false, ownerProfileIsPublic: false }), false);
  // auto-mirrored public YouTube video
  assert.equal(isFeedVisible({ publicationIsPublic: false, youtubePublic: true, ownerProfileIsPublic: true }), true);
  assert.equal(isFeedVisible({ publicationIsPublic: false, youtubePublic: true, ownerProfileIsPublic: false }), false);
});
