import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, User as FirebaseUser, onAuthStateChanged, signOut } from 'firebase/auth';

// TODO: Replace with your actual Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyD7GHlZ7FqUREYGbBZlu5gEl6I7VtP_uKU",
  authDomain: "kanban-56fe0.firebaseapp.com",
  projectId: "kanban-56fe0",
  storageBucket: "kanban-56fe0.firebasestorage.app",
  messagingSenderId: "983191714255",
  appId: "1:983191714255:web:57439f03e14001f5e5baba",
  measurementId: "G-6Q2N1LTMVC"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
const provider = new GoogleAuthProvider();

export const signInWithGoogle = async (): Promise<FirebaseUser | null> => {
  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (error) {
    console.error("Error signing in with Google:", error);
    throw error;
  }
};

export const logout = async (): Promise<void> => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Error signing out:", error);
    throw error;
  }
};

export { onAuthStateChanged };
