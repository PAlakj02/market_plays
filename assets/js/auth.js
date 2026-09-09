// Firebase Authentication wrapper for MarketMinds, exposed as window.MMAuth so the existing
// plain (non-module) scripts on each page can use it the same way they use MMAccount/MMApp.
//
// Scope of this pass: authentication only (sign up, sign in, sign out, auth-state-aware nav).
// Portfolio data (account.js) syncs to Firestore per signed-in user -- see account.js.

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { firebaseAuth } from './firebase-config.js';

async function signUpWithEmail(email, password, displayName) {
  const cred = await createUserWithEmailAndPassword(firebaseAuth, email, password);
  if (displayName) {
    await updateProfile(cred.user, { displayName });
  }
  return cred.user;
}

async function signInWithEmail(email, password) {
  const cred = await signInWithEmailAndPassword(firebaseAuth, email, password);
  return cred.user;
}

async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  const cred = await signInWithPopup(firebaseAuth, provider);
  return cred.user;
}

async function signOutUser() {
  await signOut(firebaseAuth);
}

async function sendPasswordReset(email) {
  await sendPasswordResetEmail(firebaseAuth, email);
}

function getCurrentUser() {
  return firebaseAuth.currentUser;
}

function onAuthChange(callback) {
  return onAuthStateChanged(firebaseAuth, callback);
}

// If a page wants to require sign-in (not applied anywhere by default yet), it can call this --
// redirects to login.html, remembering where to return to afterward.
function requireAuth(redirectTo) {
  return new Promise((resolve) => {
    onAuthChange((user) => {
      if (user) {
        resolve(user);
      } else {
        const returnTo = redirectTo || window.location.pathname + window.location.search;
        window.location.href = 'login.html?return=' + encodeURIComponent(returnTo);
      }
    });
  });
}

function friendlyAuthError(err) {
  const code = err && err.code ? err.code : '';
  const map = {
    'auth/email-already-in-use': 'That email already has an account -- try signing in instead.',
    'auth/invalid-email': 'That email address doesn’t look right.',
    'auth/weak-password': 'Password should be at least 6 characters.',
    'auth/user-not-found': 'No account found with that email.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/popup-closed-by-user': 'Sign-in popup closed before completing.',
    'auth/network-request-failed': 'Network error -- check your connection and try again.',
  };
  return map[code] || (err && err.message) || 'Something went wrong. Please try again.';
}

// Auto-wire the nav's auth indicator on every page that includes this script -- mirrors how
// navCashBadge is already updated per-page today, just done centrally instead of per-file.
function wireNavAuthUI() {
  const navLinks = document.querySelector('.nav-links');
  if (!navLinks) return;

  let authLink = document.getElementById('navAuthLink');
  if (!authLink) {
    authLink = document.createElement('a');
    authLink.id = 'navAuthLink';
    authLink.href = 'login.html';
    navLinks.appendChild(authLink);
  }

  onAuthChange((user) => {
    if (user) {
      const label = user.displayName || user.email || 'Account';
      authLink.textContent = label + ' · Sign out';
      authLink.href = '#';
      authLink.onclick = async (e) => {
        e.preventDefault();
        await signOutUser();
        window.location.reload();
      };
    } else {
      authLink.textContent = 'Sign in';
      authLink.href = 'login.html';
      authLink.onclick = null;
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', wireNavAuthUI);
} else {
  wireNavAuthUI();
}

window.MMAuth = {
  signUpWithEmail,
  signInWithEmail,
  signInWithGoogle,
  signOutUser,
  sendPasswordReset,
  getCurrentUser,
  onAuthChange,
  requireAuth,
  friendlyAuthError,
};
