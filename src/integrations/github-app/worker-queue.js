"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function queueKey(dispatchId) {
  return crypto.createHash("sha256").update(String(dispatchId)).digest("hex");
}

class FileWorkerQueue {
  constructor({ directory, concurrency = 1, pollMs = 250, maxHistory = 2000 } = {}) {
    if (typeof directory !== "string" || !directory) throw new Error("Worker queue directory is required");
    this.directory = path.resolve(directory);
    this.concurrency = Math.max(1, Math.min(8, Number(concurrency) || 1));
    this.pollMs = Math.max(100, Math.min(5000, Number(pollMs) || 250));
    this.maxHistory = Math.max(100, Math.min(10000, Number(maxHistory) || 2000));
    this.active = 0;
    this.timer = null;
    this.handler = null;
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    this.recover();
  }

  file(key, state) { return path.join(this.directory, `${key}.${state}.json`); }

  recover() {
    for (const name of fs.readdirSync(this.directory)) {
      if (!name.endsWith(".running.json")) continue;
      const source = path.join(this.directory, name);
      const target = source.replace(/\.running\.json$/, ".pending.json");
      if (!fs.existsSync(target)) fs.renameSync(source, target);
      else fs.rmSync(source, { force: true });
    }
  }

  enqueue(payload) {
    if (!payload || typeof payload.dispatch_id !== "string" || !payload.dispatch_id) throw new Error("Worker dispatch_id is required");
    const key = queueKey(payload.dispatch_id);
    const done = this.file(key, "done");
    const pending = this.file(key, "pending");
    const running = this.file(key, "running");
    const failed = this.file(key, "failed");
    if (fs.existsSync(done)) return { accepted: false, duplicate: true, state: "done" };
    if (fs.existsSync(pending) || fs.existsSync(running)) return { accepted: false, duplicate: true, state: fs.existsSync(running) ? "running" : "pending" };
    if (fs.existsSync(failed)) fs.renameSync(failed, path.join(this.directory, `${key}.failed-${Date.now()}.json`));
    const temporary = path.join(this.directory, `${key}.${process.pid}.${Date.now()}.tmp`);
    fs.writeFileSync(temporary, `${JSON.stringify(payload)}\n`, { flag: "wx", mode: 0o600 });
    fs.renameSync(temporary, pending);
    this.pump();
    return { accepted: true, duplicate: false, state: "pending" };
  }

  start(handler) {
    if (typeof handler !== "function") throw new Error("Worker queue handler is required");
    this.handler = handler;
    if (!this.timer) {
      this.timer = setInterval(() => this.pump(), this.pollMs);
      this.timer.unref?.();
    }
    this.pump();
    return this;
  }

  close() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  pendingFiles() {
    return fs.readdirSync(this.directory).filter(name => name.endsWith(".pending.json")).sort();
  }

  pump() {
    if (!this.handler) return;
    while (this.active < this.concurrency) {
      const name = this.pendingFiles()[0];
      if (!name) break;
      const pending = path.join(this.directory, name);
      const running = pending.replace(/\.pending\.json$/, ".running.json");
      try { fs.renameSync(pending, running); }
      catch (error) { if (error.code === "ENOENT") continue; throw error; }
      let payload;
      try { payload = JSON.parse(fs.readFileSync(running, "utf8")); }
      catch (error) { this.finish(running, "failed", { error: `Invalid queued job: ${error.message}` }); continue; }
      this.active++;
      Promise.resolve().then(() => this.handler(payload)).then(
        result => this.finish(running, "done", { result }),
        error => this.finish(running, "failed", { error: String(error?.message || error) })
      ).finally(() => { this.active--; this.prune(); this.pump(); });
    }
  }

  finish(running, state, detail) {
    const target = running.replace(/\.running\.json$/, `.${state}.json`);
    const payload = { completed_at: new Date().toISOString(), ...detail };
    fs.writeFileSync(target, `${JSON.stringify(payload)}\n`, { mode: 0o600 });
    fs.rmSync(running, { force: true });
  }

  prune() {
    const history = fs.readdirSync(this.directory).filter(name => /\.(?:done|failed|failed-\d+)\.json$/.test(name)).map(name => ({ name, stat: fs.statSync(path.join(this.directory, name)) })).sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
    for (const entry of history.slice(this.maxHistory)) fs.rmSync(path.join(this.directory, entry.name), { force: true });
  }
}

module.exports = { FileWorkerQueue, queueKey };
