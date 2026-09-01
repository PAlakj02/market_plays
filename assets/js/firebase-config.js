// Firebase initialization for MarketMinds -- project market-minds-8a754.
//
// This file is safe to commit: a Firebase web config is a public identifier, not a secret --
// access is controlled by Firestore/Auth security rules, not by hiding this object. (The
// separate Admin SDK service account key is NOT this -- that one must never appear here or
// anywhere in this repo.)
//
// SDK version: check https://firebase.google.com/docs/web/setup for the current version and
// bump the two gstatic URLs below (and in auth.js) if you upgrade.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDq06BpyG9moS3w4rieNmz2nS4q3rGOH1w',
  authDomain: 'market-minds-8a754.firebaseapp.com',
  databaseURL: 'https://market-minds-8a754-default-rtdb.firebaseio.com',
  projectId: 'market-minds-8a754',
  storageBucket: 'market-minds-8a754.firebasestorage.app',
  messagingSenderId: '439454833397',
  appId: '1:439454833397:web:4603f3433a9298421983bc',
  measurementId: 'G-F7YK5TKNLR',
};

export const firebaseApp = initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);
