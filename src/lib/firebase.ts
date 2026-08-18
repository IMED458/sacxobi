/**
 * Firebase-ის ინიციალიზაცია.
 *
 * ყველა მონაცემი ინახება Cloud Firestore-ში. ავტორიზაცია საკუთარია —
 * მომხმარებლის სახელი + პაროლი (იხ. `src/services/auth.ts`), Firebase
 * Authentication არ გამოიყენება.
 */
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';

const env = import.meta.env;

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || 'AIzaSyCfoM3sel9xMM4wWgg5QutlNbBaGee8iIg',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'bakery-2eea2.firebaseapp.com',
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'bakery-2eea2',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || 'bakery-2eea2.firebasestorage.app',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '29212278449',
  appId: env.VITE_FIREBASE_APP_ID || '1:29212278449:web:0772d1ea7510ac3d74ac90',
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID || 'G-L44KW2E514'
};

export const firebaseApp: FirebaseApp = initializeApp(firebaseConfig);
export const db: Firestore = getFirestore(firebaseApp);
