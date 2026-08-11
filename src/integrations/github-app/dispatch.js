"use strict";

const crypto = require("node:crypto");

function workerSignature(secret, rawBody) {
  if (typeof secret !== "string" || !secret) throw new Error("GitHub worker dispatch secret is required");
  return `sha256=${crypto.createHmac("sha256", secret).update(rawBody).digest("hex")}`;
}

function validateWorkerUrl(value) {
  const url = new URL(value);
  if (url.protocol === "https:") return url;
  const loopback = url.protocol === "http:" && ["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname);
  if (!loopback) throw new Error("GitHub worker URL must use HTTPS unless it is loopback HTTP");
  return url;
}

function createHttpWorkerDispatcher({ url, secret, fetchImpl = globalThis.fetch, timeoutMs = 5000 } = {}) {
  if (typeof fetchImpl !== "function") throw new Error("A fetch implementation is required for worker dispatch");
  const workerUrl = validateWorkerUrl(url);
  if (typeof secret !== "string" || secret.length < 32) throw new Error("GitHub worker dispatch secret must be at least 32 characters");
  return async function dispatch({ job, checkRunId, deliveryId }) {
    const payload = {
      schema: "altru-calibration-github-dispatch/0.1",
      dispatch_id: `${deliveryId}:${checkRunId}`,
      check_run_id: Number(checkRunId),
      job
    };
    const rawBody = Buffer.from(JSON.stringify(payload), "utf8");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    timer.unref?.();
    try {
      const response = await fetchImpl(workerUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-calibration-worker-signature": workerSignature(secret, rawBody),
          "user-agent": "Calibration-Studio-GitHub-App"
        },
        body: rawBody,
        redirect: "error",
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`Calibration worker dispatch failed with HTTP ${response.status}`);
      return response.json();
    } catch (error) {
      if (error?.name === "AbortError") throw new Error("Calibration worker dispatch timed out");
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };
}

module.exports = { createHttpWorkerDispatcher, workerSignature, validateWorkerUrl };
