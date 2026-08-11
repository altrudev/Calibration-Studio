"use strict";

const fs = require("node:fs");
const path = require("node:path");

function safeSnapshotPath(root, relative) {
  if (typeof relative !== "string" || !relative || relative.includes("\\") || relative.includes("\0") || path.posix.isAbsolute(relative)) throw new Error("Git tree contains an unsafe path");
  const normalized = path.posix.normalize(relative);
  if (normalized !== relative || normalized === "." || normalized === ".." || normalized.startsWith("../") || normalized === ".git" || normalized.startsWith(".git/")) throw new Error(`Git tree path '${relative}' is not safe to materialize`);
  const destination = path.resolve(root, ...normalized.split("/"));
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (!destination.startsWith(prefix)) throw new Error(`Git tree path '${relative}' escapes snapshot root`);
  return destination;
}

async function mapConcurrent(items, concurrency, mapper) {
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const current = index++;
      await mapper(items[current], current);
    }
  });
  await Promise.all(workers);
}

async function materializeRepositorySnapshot({ client, token, owner, repo, commitSha, targetDir, limits }) {
  if (!client || typeof client.getGitCommit !== "function" || typeof client.getGitTree !== "function" || typeof client.getGitBlob !== "function") throw new Error("GitHub snapshot client is incomplete");
  if (typeof commitSha !== "string" || !/^[0-9a-f]{40}$/i.test(commitSha)) throw new Error("Snapshot commit SHA is invalid");
  fs.mkdirSync(targetDir, { recursive: true, mode: 0o755 });
  const root = path.resolve(targetDir);
  const commit = await client.getGitCommit({ token, owner, repo, commitSha });
  const treeSha = commit?.tree?.sha;
  if (typeof treeSha !== "string" || !/^[0-9a-f]{40}$/i.test(treeSha)) throw new Error("GitHub commit did not contain a valid tree SHA");
  const tree = await client.getGitTree({ token, owner, repo, treeSha, recursive: true });
  if (!tree || !Array.isArray(tree.tree)) throw new Error("GitHub tree response is invalid");
  if (tree.truncated) throw new Error("GitHub recursive tree was truncated; snapshot refused");
  const unsupported = tree.tree.filter(entry => entry.type === "commit" || entry.mode === "120000" || entry.mode === "160000");
  if (unsupported.length) throw new Error(`Repository snapshot contains unsupported symlink/submodule entry '${unsupported[0].path}'`);
  const files = tree.tree.filter(entry => entry.type === "blob");
  if (files.length > limits.max_files) throw new Error(`Repository snapshot has ${files.length} files; policy limit is ${limits.max_files}`);
  let declaredBytes = 0;
  for (const file of files) {
    safeSnapshotPath(root, file.path);
    const size = Number(file.size || 0);
    if (size > limits.max_blob_bytes) throw new Error(`Repository blob '${file.path}' exceeds the per-file size limit`);
    declaredBytes += size;
    if (declaredBytes > limits.max_bytes) throw new Error("Repository snapshot exceeds total byte limit");
  }
  let actualBytes = 0;
  await mapConcurrent(files, 8, async file => {
    const blob = await client.getGitBlob({ token, owner, repo, blobSha: file.sha });
    if (!blob || blob.encoding !== "base64" || typeof blob.content !== "string") throw new Error(`GitHub blob '${file.path}' is not base64 encoded`);
    const bytes = Buffer.from(blob.content.replace(/\s/g, ""), "base64");
    if (bytes.length > limits.max_blob_bytes) throw new Error(`Repository blob '${file.path}' exceeds the per-file size limit`);
    actualBytes += bytes.length;
    if (actualBytes > limits.max_bytes) throw new Error("Repository snapshot exceeds total byte limit");
    const destination = safeSnapshotPath(root, file.path);
    fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o755 });
    fs.writeFileSync(destination, bytes, { mode: file.mode === "100755" ? 0o755 : 0o644 });
  });
  return { commit_sha: commitSha.toLowerCase(), tree_sha: treeSha.toLowerCase(), file_count: files.length, byte_count: actualBytes };
}

module.exports = { materializeRepositorySnapshot, safeSnapshotPath, mapConcurrent };
