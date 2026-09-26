# KS Panda — Attendance Portal (Web)

Admin + manager portal for the KS Panda attendance system. Static HTML served by GitHub Pages from `akcreation-apps.github.io`. Firestore + Cloud Functions live in the shared `akcreation-apps` Firebase project.

**Live URL:** `https://akcreation-apps.com/ks-panda/login.html`
**Companion Android app:** `C:\Users\anil.sahoo_aeccgloba\AndroidStudioProjects\ks-panda`

## Firebase project — shared with anvisha-travels

This app **reuses** the existing `akcreation-apps` Firebase project (same one used by `/anvisha-travels/` and `/prompt-gallery/`).

Because everything sits inside one project, we avoid all collisions by prefixing:
- **Firestore collections**: `attn_config`, `attn_sites`, `attn_users`, `attn_pendingApprovals`, `attn_attendance`, `attn_auditLog`.
- **Cloud Functions**: `attnVerifyAccessCode`, `attnRotateAccessCode`, `attnSubmitSignupRequest`, `attnApproveUser`, `attnRejectUser`, `attnEditPunch`. Deployed under codebase `kspanda` in `firebase.json`.
- **Web Firebase app instance name**: `"kspanda"` (see `assets/firebase-init.js`).

## Hosting

Static files (`login.html`, `admin/`, `manager/`, `assets/`) are served by **GitHub Pages** as part of the parent repo — no Firebase Hosting site needed. All internal links use the `/ks-panda/` prefix.

## Setup (backend only)

```bash
npm i -g firebase-tools
firebase login
firebase use akcreation-apps          # already the default in .firebaserc
cd functions && npm install && cd ..
```

### ⚠️ Firestore rules — MERGE, don't overwrite

`firestore.rules` here only defines rules for `attn_*` collections. The `akcreation-apps` project already has rules for `anvisha_*` and prompt-gallery. Before deploying:

1. Fetch the currently-deployed rules from the Firebase console.
2. Copy the `match /attn_*` blocks from this file into that combined file (inside the same `service cloud.firestore { match /databases/{database}/documents { ... } }` wrapper).
3. Deploy the merged file from wherever you keep the canonical rules — **not** with `firebase deploy --only firestore:rules` from here.

## Deploy (safe, narrow)

```bash
firebase deploy --only functions:kspanda,firestore:indexes
```

The static HTML deploys automatically via `git push` on the parent repo (GitHub Pages).

## Bootstrap the first admin

1. Google sign-in is already enabled on the `akcreation-apps` project.
2. Sign in once at `https://akcreation-apps.com/ks-panda/login.html` — this creates a Firebase Auth user but no Firestore profile.
3. In Firestore, manually create `attn_users/{yourUid}`:
   ```json
   { "name": "You", "contact": "…", "email": "…", "role": "admin", "status": "approved", "assignedSiteIds": [] }
   ```
4. Set the initial access code at `attn_config/app`:
   *(Skip — the Android app uses a rotating daily code computed from the
   current date. Nothing to store server-side.)*
5. Log back in. The dashboard shows today's code as a live reference.

**Daily access code formula** (both the Android app and the admin dashboard
compute it identically, no server round-trip):

```
CC + DD + MM + YY
where YYYY is the current year, CC = first two digits, YY = last two.
Example: 22 Sept 2026 → 20 22 09 26 → "20220926"
```

## Structure

- `firestore.rules` — attendance-only rules (merge before deploying)
- `firestore.indexes.json` — collection-group index for `punches`
- `functions/src/` — callable Cloud Functions (all `attn*`)
- `login.html`, `admin/*.html`, `manager/*.html`, `assets/` — static portal
