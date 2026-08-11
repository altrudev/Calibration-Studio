#!/usr/bin/env node
"use strict";

const { loadGithubWorkerConfigFromEnv, startGithubWorker } = require("../src/integrations/github-app/worker-server");

async function main() {
  const config = loadGithubWorkerConfigFromEnv();
  const { server } = await startGithubWorker(config);
  const address = server.address();
  const host = typeof address === "object" && address ? address.address : config.host;
  const port = typeof address === "object" && address ? address.port : config.port;
  console.log(`Calibration Studio GitHub worker listening on http://${host}:${port}`);
  console.log("Worker endpoint: /jobs");
}

main().catch(error => {
  console.error(`Calibration GitHub worker error: ${error.message}`);
  process.exitCode = 1;
});
