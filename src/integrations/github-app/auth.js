"use strict";

const crypto = require("node:crypto");

function base64url(value) {
  const input = Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8");
  return input.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function createAppJwt({ appId, privateKeyPem, nowMs = Date.now() }) {
  if (!appId && appId !== 0) throw new Error("GitHub App ID is required");
  if (typeof privateKeyPem !== "string" || !privateKeyPem.includes("PRIVATE KEY")) {
    throw new Error("GitHub App private key PEM is required");
  }

  const now = Math.floor(nowMs / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iat: now - 60,
    exp: now + 540,
    iss: String(appId)
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(unsigned, "utf8"), privateKeyPem);
  return `${unsigned}.${base64url(signature)}`;
}

module.exports = { createAppJwt };
