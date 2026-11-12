JC AV TIMER v0.9.1 — WEBSITE DOWNLOAD FIX

WHY YOU STILL DOWNLOADED 0.8.7
Your website index.html currently links to downloads/JC-AV-Timer-Companion-v0.8.7-Safe-Fix.tgz. The source in GitHub still reports version 0.9.0. Merely uploading new source does not replace the built .tgz.

HOW TO FIX
1. Extract this ZIP and upload the companion-module folder contents and .github/workflows/build-companion.yml to the ROOT of RustinPlays/AV-Timer (preserve folder paths).
2. Important: GitHub's browser Upload files may SKIP the hidden .github folder. Confirm .github/workflows/build-companion.yml exists by browsing the repo after upload. If missing, create the file using Add file > Create new file and type the full path .github/workflows/build-companion.yml, then paste the file contents.
3. Open GitHub Actions > Build and Publish JC AV Timer Companion v0.9.1 > Run workflow (if push did not run it automatically).
4. The successful workflow packages the module and commits downloads/JC-AV-Timer-Companion-v0.9.1.tgz, updating the website button in index.html. It also provides an Actions artifact for manual installation.
5. Wait until your website hosting has deployed that commit. Refresh the page bypassing cache (Ctrl+F5), then download the Companion module again. It should now be v0.9.1.

If the workflow gets HTTP 403 on git push, enable repository Settings > Actions > General > Workflow permissions > Read and write permissions (if available), then rerun the workflow; or manually copy the built artifact's .tgz into downloads/ and update index.html link to downloads/JC-AV-Timer-Companion-v0.9.1.tgz.

NOTE
This is a new source implementation; it has not been proven importable in your Companion 5.1.0. If the workflow build/import fails, send the failure log and do not replace your working v0.8.7 module yet.
