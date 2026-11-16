JC AV Timer Companion v0.9.2 - GitHub Build Fix
================================================

WHAT THIS FIXES
- Sets companion-module/package.json "license" to MIT (Bitfocus build tools require this).
- Corrects manifest module type and runtime (connection, node22).
- Updates the old v0.9.1 GitHub Actions workflow to build v0.9.2.
- Automatically publishes the built v0.9.2 TGZ to the website download button.

HOW TO INSTALL
1. Extract this ZIP.
2. Open your RustinPlays/AV-Timer GitHub repository clone with GitHub Desktop.
3. Copy BOTH folders from this ZIP (companion-module and .github) into the
   existing repository, MERGING folders and REPLACING the matching files.
   Important: the .github folder can be hidden in Windows.
4. Commit and Push. Open GitHub > Actions > Build and Publish JC AV Timer Companion v0.9.2.
5. Expand any failing red step in Actions if the build still fails. The screenshot
   of the check title is not the step log, so we cannot yet confirm any other errors.
6. The website's top 'Download Companion Module' button should point to v0.9.2.

You do not need to replace the website clock files again.

The previously supplied .tgz at downloads/JC-AV-Timer-Companion-v0.9.2.tgz
is already available with the clock update, so the download can work while
GitHub Actions is being repaired.

CHECKS COMPLETED
- package.json and manifest JSON valid
- v0.9.2 module state tests passed (6 of 6)
- workflow shell checked for syntax
- Actual online npm/Companion packaging is NOT verified in this environment.
