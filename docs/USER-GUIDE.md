# Calibration Studio v0.11 user guide

## Install once, then use the visual Studio

Requirements:

- Node.js 24 or newer
- Git

Clone the repository once:

```bash
git clone https://github.com/altrudev/Calibration-Studio.git
cd Calibration-Studio
```

Launch with the OS shortcut:

- Windows: `launch/Calibration-Studio.cmd`
- Ubuntu/Linux: `launch/calibration-studio.sh`
- macOS: `launch/Calibration-Studio.command`

Or run:

```bash
npm start
```

The launcher performs first-run setup only when required: exact locked dependencies are installed with package lifecycle scripts disabled, the pinned Chromium test runtime is installed/verified, the loopback Studio service starts, and the browser opens to `http://127.0.0.1:4317`.

Normal operation happens in the browser UI. The terminal remains the host process for the local service but requires no commands after launch.

## Visual operations

The Run view exposes the main Calibration Core operations without an arbitrary terminal bridge:

- Inspect project
- Discover contract
- Capture observations
- Calibrate
- Create baseline
- Compare to baseline
- Continuous gate
- Trace first bad
- Repair scope
- Verify repair
- Repair rerun
- Runtime / adapter / product status

Execution-sensitive actions keep explicit operator controls for CLI execution, effectful API plans, remote game targets, persistent state, headed browser runs and environment inheritance.

Results are shown live in the Studio and can be downloaded as JSON. Supported Calibration artifacts can also be opened in the local artifact viewer.

## Local service boundary

Calibration Studio binds to loopback only by default:

```text
http://127.0.0.1:4317
```

The server exposes a small local API and an allow-listed command mapper. User input is converted into known Calibration CLI arguments and executed with `shell:false`; arbitrary shell commands are not accepted.

Useful endpoints for development are:

```text
GET  /api/health
GET  /api/status
POST /api/command
```

## CLI remains available

The CLI is still the automation surface for scripts, Git hooks and advanced workflows:

```bash
node bin/calibrate-entry.js adapters
node bin/calibrate-entry.js discover --type web-pwa --project /path/to/project
node bin/calibrate-entry.js capture --type web-pwa --url http://127.0.0.1:8080
```

For ordinary interactive use, prefer the visual Studio.

## Artifact viewer

The Artifact Viewer tab reads supported JSON artifacts locally in the browser and verifies supported artifact fingerprints before rendering them as valid evidence.
