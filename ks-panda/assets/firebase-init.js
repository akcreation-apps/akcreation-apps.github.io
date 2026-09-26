import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-functions.js";

// Shared with anvisha-travels and prompt-gallery under the akcreation-apps
// Firebase project. All attendance data lives under attn_* collections so it
// never collides with anvisha_* or prompt-gallery data.
const firebaseConfig = {
  apiKey: "AIzaSyDmRlc8N_b_WishIy3QHDLGpyApowRSOUM",
  authDomain: "akcreation-apps.firebaseapp.com",
  projectId: "akcreation-apps",
  storageBucket: "akcreation-apps.firebasestorage.app",
  messagingSenderId: "277581009443",
  appId: "1:277581009443:web:d9a9ff0b3847a03a381796",
  measurementId: "G-8XLJJ1C5YL"
};

const existing = getApps().find(a => a.name === "kspanda");
export const app = existing ?? initializeApp(firebaseConfig, "kspanda");
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);
export const googleProvider = new GoogleAuthProvider();

export const COL = {
  CONFIG:   "attn_config",
  SITES:    "attn_sites",
  USERS:    "attn_users",
  PENDING:  "attn_pendingApprovals",
  ATTEND:   "attn_attendance",
  AUDIT:    "attn_auditLog",
};
