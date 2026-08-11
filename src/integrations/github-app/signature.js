"use strict";

const crypto = require("node:crypto");

function toBuffer(rawBody) {
  if (Buffer.isBuffer(rawBody)) return rawBody;
  if (typeof rawBody === "string") return Buffer.from(rawBody, "utf8");
  throw new TypeError("rawBody must be a Buffer or UTF-8 string");
}

function verifyWebhookSignature({ secret, rawBody, signature }) {
  if (typeof secret !== "string" || !secret) return false;
  if (typeof signature !== "string" || !signature.startsWith("sha256=")) return false;

  const expected = `sha256=${crypto.createHmac("sha256", secret).update(toBuffer(rawBody)).digest("hex")}`;
  const expectedBytes = Buffer.from(expected, "utf8");
  const actualBytes = Buffer.from(signature, "utf8");
  if (expectedBytes.length !== actualBytes.length) return false;
  return crypto.timingSafeEqual(expectedBytes, actualBytes);
}

module.exports = { verifyWebhookSignature };
