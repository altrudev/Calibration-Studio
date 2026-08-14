"use strict";

function isPinnedImage(value) {
  const image = String(value || "").trim();
  if (!image || image.startsWith("-") || /[\u0000-\u0020\u007f]/.test(image)) return false;
  return /^sha256:[a-f0-9]{64}$/i.test(image) || /^[a-zA-Z0-9][a-zA-Z0-9._/:@+-]*@sha256:[a-f0-9]{64}$/i.test(image);
}

function requirePinnedImage(value, label = "container image") {
  const image = String(value || "").trim();
  if (!isPinnedImage(image)) {
    throw new Error(`${label} must be pinned by immutable sha256 digest`);
  }
  return image;
}

module.exports = { isPinnedImage, requirePinnedImage };
