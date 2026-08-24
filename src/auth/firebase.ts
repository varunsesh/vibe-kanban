import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithCredential, signInWithPopup, User as FirebaseUser, onAuthStateChanged, signOut } from 'firebase/auth';

// True when running inside a Tauri webview; false in a plain browser.
const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;

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
const TOKEN_KEY = 'googleAccessToken';

// Google OAuth credentials. Get from Google Cloud Console → APIs & Services → Credentials.
// Web application clients require VITE_GOOGLE_CLIENT_SECRET.
// Desktop app clients (recommended) use PKCE and need no secret.
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const GOOGLE_CLIENT_SECRET = import.meta.env.VITE_GOOGLE_CLIENT_SECRET as string | undefined;

const setTokenStorage = (token: string) => {
  sessionStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(TOKEN_KEY, token);
  document.cookie = `${TOKEN_KEY}=${encodeURIComponent(token)}; path=/; max-age=2592000; samesite=lax`;
};

const clearTokenStorage = () => {
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
  document.cookie = `${TOKEN_KEY}=; path=/; max-age=0; samesite=lax`;
};

function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// Opens Google OAuth in the system browser (Tauri: PKCE + local port; web: popup).
export const signInWithGoogle = async (): Promise<FirebaseUser | null> => {
  // ── Web path: Firebase popup handles OAuth + token exchange ──────────────────
  if (!isTauri) {
    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/spreadsheets');
    provider.addScope('https://www.googleapis.com/auth/drive.file');
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) setTokenStorage(credential.accessToken);
    return result.user;
  }

  // ── Tauri desktop path: PKCE + local OAuth server ───────────────────────────
  if (!GOOGLE_CLIENT_ID) {
    alert('Google Client ID not configured. Add VITE_GOOGLE_CLIENT_ID to your .env file.');
    return null;
  }

  const { invoke } = await import('@tauri-apps/api/core');
  const { open } = await import('@tauri-apps/plugin-shell');
  const { listen } = await import('@tauri-apps/api/event');

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  const port = await invoke<number>('plugin:oauth|start');
  const redirectUri = `http://localhost:${port}`;

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.file',
    ].join(' '),
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });

  await open(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);

  return new Promise((resolve) => {
    const unlistenPromise = listen<string>('oauth://url', async (event) => {
      const unlisten = await unlistenPromise;
      unlisten();

      try {
        const url = new URL(event.payload);
        const code = url.searchParams.get('code');
        if (!code) { resolve(null); return; }

        const tokenParams: Record<string, string> = {
          code,
          client_id: GOOGLE_CLIENT_ID!,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
          grant_type: 'authorization_code',
        };
        if (GOOGLE_CLIENT_SECRET) tokenParams.client_secret = GOOGLE_CLIENT_SECRET;

        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(tokenParams),
        });

        const tokens = await tokenRes.json() as { id_token?: string; access_token?: string; error?: string; error_description?: string };
        if (!tokenRes.ok) {
          console.error('Token exchange failed:', tokens.error, tokens.error_description);
          alert(`Google sign-in failed: ${tokens.error} — ${tokens.error_description}`);
          resolve(null);
          return;
        }
        if (!tokens.id_token) { resolve(null); return; }

        const credential = GoogleAuthProvider.credential(tokens.id_token, tokens.access_token ?? null);
        const result = await signInWithCredential(auth, credential);
        if (tokens.access_token) setTokenStorage(tokens.access_token);
        resolve(result.user);
      } catch (error) {
        console.error('OAuth error:', error);
        resolve(null);
      }
    });
  });
};

// No-op — redirect flow is no longer used.
export const handleRedirectResult = async (): Promise<FirebaseUser | null> => null;

export const logout = async (): Promise<void> => {
  try {
    await signOut(auth);
    clearTokenStorage();
  } catch (error) {
    console.error("Error signing out:", error);
    throw error;
  }
};

export { onAuthStateChanged };
