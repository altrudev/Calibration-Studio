#!/usr/bin/env node
"use strict";

const { loadGithubAppConfigFromEnv, startGithubAppServer } = require("../src/integrations/github-app/server");

async function main() {
  const config = loadGithubAppConfigFromEnv();
  const server = await startGithubAppServer(config);
  const address = server.address();
  const host = typeof address === "object" && address ? address.address : config.host;
  const port = typeof address === "object" && address ? address.port : config.port;
  console.log(`Calibration Studio GitHub App listening on http://${host}:${port}`);
  console.log("Webhook endpoint: /github/webhook");
}

main().catch(error => {
  console.error(`Calibration GitHub App error: ${error.message}`);
  process.exitCode = 1;
});
