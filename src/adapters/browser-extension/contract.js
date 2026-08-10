"use strict";
function contractFromDiscovery(discovery, options = {}) {
  if (!discovery || discovery.adapter !== "browser-extension") throw new Error("browser-extension discovery is required");
  const checks = (discovery.inferred_expectations || []).map((item) => ({
    id:item.id,
    domain:item.domain,
    title:item.title,
    expected:item.expected,
    required:true,
    origin:"browser-extension discovery",
    investigate:`Review the manifest/runtime evidence for ${item.id} and confirm whether this is required behavior.`,
    provenance:{source:"inferred",confidence:item.confidence || "medium",reviewed:false}
  }));
  return {protocol:"calibration-contract/0.2",product:options.product || discovery.manifest?.name || "Detected Browser Extension",adapter:"browser-extension",source:"inferred",review_required:true,checks};
}
module.exports = {contractFromDiscovery};
