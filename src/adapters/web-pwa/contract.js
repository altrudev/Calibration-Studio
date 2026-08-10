"use strict";
function contractFromDiscovery(discovery, options = {}) {
  if (!discovery || discovery.adapter !== "web-pwa") throw new Error("web-pwa discovery is required");
  const checks = (discovery.inferred_expectations || []).map((item) => ({
    id: item.id,
    domain: item.domain,
    title: item.title,
    expected: item.expected,
    required: true,
    origin: "web-pwa discovery",
    investigate: `Review the evidence for ${item.id} and confirm whether this is a required product behavior.`,
    provenance: {source:"inferred", confidence:item.confidence || "medium", reviewed:false}
  }));
  return {
    protocol: "calibration-contract/0.2",
    product: options.product || "Detected Web/PWA project",
    adapter: "web-pwa",
    source: "inferred",
    review_required: true,
    checks
  };
}
module.exports = {contractFromDiscovery};
