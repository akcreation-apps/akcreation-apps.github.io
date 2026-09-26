import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

export function requireRole(allowedRoles, { redirect = "../login.html" } = {}) {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) return void (location.href = redirect);
      const snap = await getDoc(doc(db, "attn_users", user.uid));
      const data = snap.data();
      if (!data || data.status !== "approved" || !allowedRoles.includes(data.role)) {
        await signOut(auth);
        alert("Access denied — this portal is for approved admins/managers only.");
        location.href = redirect;
        return;
      }
      resolve({ user, profile: data });
    });
  });
}
