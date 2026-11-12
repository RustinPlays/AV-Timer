JC AV TIMER - Companion feedback fix source (v0.9.0)

This is a NEW source implementation, NOT a modified copy of the existing v0.8.7 binary.
It preserves the existing website's localhost API at port 3210.

WHAT IS INCLUDED
- companion-module/src/main.js : local HTTP bridge, feedbacks, actions, presets
- companion-module/src/state.js: typed live state normalization
- companion-module/companion/manifest.json: module metadata
- companion-module/package.json: dependencies and build instructions
- companion-module/tests/: state tests
- .github/workflows/build-companion.yml: GitHub Actions package builder

GITHUB UPLOAD
1. In RustinPlays/AV-Timer, upload the contents of this ZIP into the repo root.
2. The source folder MUST be called companion-module (not module).
3. GitHub Actions > Build JC AV Timer Companion module > Run workflow.
4. Download artifact from completed workflow; inside is the .tgz for Companion's Import Module Package.
5. In Companion 5.1.0, install/import the built module. Restart the connection if needed.
6. In the website, select port 3210 and press Test Companion.
7. In Companion, add new presets: Live Timer, Live Hours, Live Minutes, Live Seconds, Status, Start/Pause.

NOTE: Existing buttons may refer to the previous module's internal ID or older feedback IDs.
The new module's presets are self-contained; drag NEW presets rather than editing old ones.
There is no need to replace the website/Cloudflare worker or offline zip for this live-feedback change.

LIMITATION
This source has passed syntax and state normalization tests locally, but was not built
with companion-module-build or imported into your actual Companion 5.1.0 installation.
Run the workflow and check module logs, as the packaging compatibility is not yet verified.
