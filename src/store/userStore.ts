import { create } from 'zustand';
import { auth, signInWithGoogle, logout as firebaseLogout } from '../auth/firebase';
import { db, User } from '../db/db';

interface UserState {
  currentUser: User | null;
  users: User[];
  username: string;
  loading: boolean;
  setCurrentUser: (user: User | null) => void;
  setUsername: (value: string) => void;
  setLoading: (value: boolean) => void;
  loadUsers: () => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  loginWithUsername: () => Promise<void>;
  logout: () => Promise<void>;
  updateGlobalRole: (userId: string, role: 'Admin' | 'User') => Promise<void>;
}

export const useUserStore = create<UserState>((set, get) => ({
  currentUser: null,
  users: [],
  username: '',
  loading: true,
  setCurrentUser: (currentUser) => set({ currentUser }),
  setUsername: (username) => set({ username }),
  setLoading: (loading) => set({ loading }),
  loadUsers: async () => {
    const users = await db.getAll<User>('users');
    set({ users });
  },
  loginWithGoogle: async () => {
    await signInWithGoogle();
  },
  loginWithUsername: async () => {
    const username = get().username.trim();
    if (!username) return;

    const user: User = {
      id: `local:${username}`,
      displayName: username,
      email: '',
      photoURL: '',
      globalRole: username.toLowerCase() === 'admin' ? 'Admin' : 'User',
    };

    await db.put('users', user);
    localStorage.setItem('localUserId', user.id);
    set({ currentUser: user, username: '' });
    await get().loadUsers();
  },
  logout: async () => {
    const currentUser = get().currentUser;
    const isLocal = currentUser?.id.startsWith('local:');

    set({ currentUser: null, users: [] });
    localStorage.removeItem('localUserId');

    if (!isLocal) {
      await firebaseLogout();
    } else {
      await auth.signOut().catch(() => {
        // Local users do not rely on Firebase sessions.
      });
    }
  },
  updateGlobalRole: async (userId, role) => {
    const user = await db.getById<User>('users', userId);
    if (!user) return;

    const updatedUser = { ...user, globalRole: role };
    await db.put('users', updatedUser);
    await get().loadUsers();

    const { currentUser } = get();
    if (currentUser?.id === userId) {
      set({ currentUser: updatedUser });
    }
  },
}));
