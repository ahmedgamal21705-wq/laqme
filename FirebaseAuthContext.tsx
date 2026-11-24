import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleAuthProvider,
  handleFirestoreError,
  OperationType,
  testConnection,
} from '../lib/firebase';
import { Language, User } from '../types/database';

export const PRIMARY_ADMIN_EMAIL = 'ahmedgamal21705@gmail.com';

export interface LoginReturnTarget {
  view: 'landing' | 'onboarding' | 'student' | 'provider' | 'delivery' | 'events' | 'admin';
  eventId?: string | null;
}

export type SignupRoleChoice = 'student' | 'provider' | 'delivery_partner';
export type IntendedDashboard = 'student' | 'provider' | 'delivery';

interface SyncedUser {
  id: string;
  name: string;
  email: string;
}

export type ServerUserRole = 'admin' | 'user';

export interface EmailRegisterInput {
  fullName: string;
  email: string;
  password: string;
  phone: string;
  role: SignupRoleChoice;
}

interface PendingSignupData {
  email: string;
  phone: string;
  firestoreRole: 'student' | 'provider';
  intendedDashboard: IntendedDashboard;
}

interface FirebaseAuthContextValue {
  firebaseUser: FirebaseUser | null;
  syncedUser: SyncedUser | null;
  userDoc: User | null;
  isAdmin: boolean;
  needsEmailVerification: boolean;
  authLoading: boolean;
  userDocLoading: boolean;
  signingIn: boolean;
  authError: string | null;
  authErrorCode: string | null;
  authNotice: string | null;
  firestoreConfigError: string | null;
  clearAuthError: () => void;
  clearAuthNotice: () => void;
  returnTarget: LoginReturnTarget;
  setReturnTarget: (target: LoginReturnTarget) => void;
  intendedDashboard: IntendedDashboard | null;
  clearIntendedDashboard: () => void;
  signInWithGoogle: (preferredRole?: SignupRoleChoice) => Promise<boolean>;
  registerWithEmail: (input: EmailRegisterInput) => Promise<boolean>;
  signInWithEmail: (email: string, password: string) => Promise<boolean>;
  resetPassword: (email: string) => Promise<boolean>;
  resendVerificationEmail: () => Promise<boolean>;
  refreshEmailVerification: () => Promise<boolean>;
  signOutUser: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
}

const FirebaseAuthContext = createContext<FirebaseAuthContextValue | undefined>(undefined);

const PENDING_SIGNUP_KEY = 'lokma_pending_signup';
const INTENDED_DASHBOARD_KEY = 'lokma_intended_dashboard';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getActiveLang(): Language {
  if (typeof document !== 'undefined' && document.documentElement.lang === 'en') {
    return 'en';
  }
  return 'ar';
}

function tsToIso(val: unknown): string {
  if (val instanceof Timestamp) return val.toDate().toISOString();
  if (typeof val === 'string') return val;
  return new Date().toISOString();
}

function extractAuthErrorCode(error: unknown): string {
  const rawCode =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code || '')
      : '';
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message || '')
      : '';

  if (rawCode) return rawCode;

  if (
    rawMessage.includes('PASSWORD_LOGIN_DISABLED') ||
    rawMessage.includes('OPERATION_NOT_ALLOWED') ||
    rawMessage.includes('Email and Password sign-in is not enabled')
  ) {
    return 'auth/operation-not-allowed';
  }
  return '';
}

function mapFirebaseAuthError(error: unknown, lang: Language = getActiveLang()): {
  code: string | null;
  message: string;
} {
  const code = extractAuthErrorCode(error);
  const isAr = lang === 'ar';

  switch (code) {
    case 'auth/popup-closed-by-user':
      return {
        code,
        message: isAr
          ? 'تم إغلاق نافذة تسجيل الدخول بحساب جوجل قبل إتمام العملية. يمكنك المحاولة مرة أخرى.'
          : 'Google sign-in popup was closed before completing sign-in. You can try again.',
      };
    case 'auth/cancelled-popup-request':
      return {
        code,
        message: isAr
          ? 'تم إلغاء طلب تسجيل الدخول السابق. يرجى المحاولة مرة أخرى.'
          : 'Previous sign-in request was cancelled. Please try again.',
      };
    case 'auth/popup-blocked':
      return {
        code,
        message: isAr
          ? 'حظر المتصفح نافذة تسجيل الدخول المنبثقة. يرجى السماح بالنوافذ المنبثقة لهذا الموقع ثم المحاولة مجدداً.'
          : 'The browser blocked the sign-in popup. Please allow popups for this site and try again.',
      };
    case 'auth/network-request-failed':
      return {
        code,
        message: isAr
          ? 'تعذر الاتصال بالشبكة أثناء المصادقة. تأكد من اتصالك بالإنترنت وحاول مرة أخرى.'
          : 'Network error during authentication. Please check your internet connection and try again.',
      };
    case 'auth/user-disabled':
      return {
        code,
        message: isAr
          ? 'تم تعطيل هذا الحساب حالياً. يرجى التواصل مع إدارة المنصة.'
          : 'This account has been disabled. Please contact platform support.',
      };
    case 'auth/account-exists-with-different-credential':
      return {
        code,
        message: isAr
          ? 'يوجد حساب مسجل مسبقاً بنفس البريد الإلكتروني بطريقة دخول مختلفة (مثل حساب Google).'
          : 'An account already exists with this email using a different sign-in method (such as Google).',
      };
    case 'auth/unauthorized-domain': {
      const host = typeof window !== 'undefined' ? window.location.hostname : '';
      return {
        code,
        message: isAr
          ? host
            ? `نطاق الموقع الحالي (${host}) غير مصرح به في إعدادات Firebase Authentication (Authorized domains).`
            : 'نطاق الموقع الحالي غير مصرح به في إعدادات Firebase Authentication.'
          : host
          ? `The current domain (${host}) is not authorized in Firebase Authentication (Authorized domains).`
          : 'The current domain is not authorized in Firebase Authentication.',
      };
    }
    case 'auth/email-already-in-use':
      return {
        code,
        message: isAr
          ? 'هذا البريد الإلكتروني مسجل بالفعل. يمكنك تسجيل الدخول أو استعادة كلمة المرور.'
          : 'This email address is already registered. Please sign in or reset your password.',
      };
    case 'auth/invalid-email':
    case 'auth/missing-email':
      return {
        code,
        message: isAr
          ? 'صيغة البريد الإلكتروني غير صحيحة. يرجى إدخال بريد إلكتروني صحيح.'
          : 'The email address is invalid. Please enter a valid email address.',
      };
    case 'auth/weak-password':
      return {
        code,
        message: isAr
          ? 'كلمة المرور ضعيفة جداً. يجب ألا تقل عن 6 أحرف.'
          : 'Password is too weak. It must be at least 6 characters long.',
      };
    case 'auth/missing-password':
      return {
        code,
        message: isAr
          ? 'يرجى إدخال كلمة المرور.'
          : 'Please enter your password.',
      };
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/user-not-found':
      return {
        code,
        message: isAr
          ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة.'
          : 'Invalid email address or password.',
      };
    case 'auth/too-many-requests':
      return {
        code,
        message: isAr
          ? 'تم إجراء محاولات متكررة كثيرة. يرجى الانتظار قليلاً ثم المحاولة مرة أخرى.'
          : 'Too many failed attempts. Please wait a moment and try again.',
      };
    case 'auth/operation-not-allowed':
    case 'auth/admin-restricted-operation':
      return {
        code: 'auth/operation-not-allowed',
        message: isAr
          ? 'تسجيل الدخول بالبريد الإلكتروني وكلمة المرور غير مفعّل حالياً في Firebase Console (Authentication ← Sign-in method ← Email/Password). يمكنك تفعيله من لوحة تحكم Firebase أو المتابعة الآن بحساب Google.'
          : 'Email/Password sign-in is currently disabled in the Firebase Console (Authentication -> Sign-in method -> Email/Password). Enable it in Firebase Console or continue with Google.',
      };
    case 'auth/expired-action-code':
    case 'auth/invalid-action-code':
      return {
        code,
        message: isAr
          ? 'انتهت صلاحية رابط التحقق أو إعادة التعيين. يرجى طلب رابط جديد.'
          : 'The verification or reset link has expired or is invalid. Please request a new one.',
      };
    case 'auth/requires-recent-login':
      return {
        code,
        message: isAr
          ? 'يرجى إعادة تسجيل الدخول لتنفيذ هذه العملية الأمنية.'
          : 'Please sign in again to complete this security-sensitive action.',
      };
    default:
      return {
        code: code || null,
        message: isAr
          ? 'تعذر إتمام عملية المصادقة حالياً. يرجى التحقق من البيانات والمحاولة مرة أخرى.'
          : 'Unable to complete authentication right now. Please check your details and try again.',
      };
  }
}

function readPendingSignup(): PendingSignupData | null {
  try {
    const raw =
      (typeof window !== 'undefined' &&
        (window.localStorage.getItem(PENDING_SIGNUP_KEY) ||
          window.sessionStorage.getItem(PENDING_SIGNUP_KEY))) ||
      null;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingSignupData> & { role?: string };
    const firestoreRole: 'student' | 'provider' =
      parsed.firestoreRole === 'provider' || parsed.role === 'provider' ? 'provider' : 'student';
    const intendedDashboard: IntendedDashboard =
      parsed.intendedDashboard === 'delivery' || parsed.role === 'delivery_partner'
        ? 'delivery'
        : firestoreRole === 'provider'
        ? 'provider'
        : 'student';
    return {
      email: typeof parsed.email === 'string' ? parsed.email : '',
      phone: typeof parsed.phone === 'string' ? parsed.phone : '',
      firestoreRole,
      intendedDashboard,
    };
  } catch {
    return null;
  }
}

function writePendingSignup(data: PendingSignupData): void {
  const serialized = JSON.stringify(data);
  try {
    window.localStorage.setItem(PENDING_SIGNUP_KEY, serialized);
  } catch {
    // ignore
  }
  try {
    window.sessionStorage.setItem(PENDING_SIGNUP_KEY, serialized);
  } catch {
    // ignore
  }
}

function clearPendingSignup(): void {
  try {
    window.localStorage.removeItem(PENDING_SIGNUP_KEY);
  } catch {
    // ignore
  }
  try {
    window.sessionStorage.removeItem(PENDING_SIGNUP_KEY);
  } catch {
    // ignore
  }
}

function readStoredIntendedDashboard(): IntendedDashboard | null {
  try {
    const val =
      typeof window !== 'undefined' ? window.localStorage.getItem(INTENDED_DASHBOARD_KEY) : null;
    if (val === 'student' || val === 'provider' || val === 'delivery') {
      return val;
    }
  } catch {
    // ignore
  }
  return null;
}

function writeStoredIntendedDashboard(val: IntendedDashboard | null): void {
  try {
    if (!val) {
      window.localStorage.removeItem(INTENDED_DASHBOARD_KEY);
    } else {
      window.localStorage.setItem(INTENDED_DASHBOARD_KEY, val);
    }
  } catch {
    // ignore
  }
}

export const FirebaseAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [emailVerified, setEmailVerified] = useState<boolean>(false);
  const [syncedUser, setSyncedUser] = useState<SyncedUser | null>(null);
  const [serverRole, setServerRole] = useState<ServerUserRole>('user');
  const [userDoc, setUserDoc] = useState<User | null>(null);
  const [userDocLoading, setUserDocLoading] = useState<boolean>(false);
  const [hasAdminDoc, setHasAdminDoc] = useState<boolean>(false);
  const [hasUserRoleAdmin, setHasUserRoleAdmin] = useState<boolean>(false);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [signingIn, setSigningIn] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authErrorCode, setAuthErrorCode] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [firestoreConfigError, setFirestoreConfigError] = useState<string | null>(null);
  const [returnTarget, setReturnTarget] = useState<LoginReturnTarget>({
    view: 'landing',
    eventId: null,
  });
  const [intendedDashboard, setIntendedDashboard] = useState<IntendedDashboard | null>(() =>
    readStoredIntendedDashboard()
  );

  const clearIntendedDashboard = useCallback(() => {
    setIntendedDashboard(null);
    writeStoredIntendedDashboard(null);
  }, []);

  useEffect(() => {
    void testConnection().then((res) => {
      if (!res.ok && res.message) {
        setFirestoreConfigError(res.message);
      }
    });
  }, []);

  const syncUserWithBackend = useCallback(async (user: FirebaseUser): Promise<SyncedUser | null> => {
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        setServerRole('user');
        return null;
      }
      const data = await res.json();
      setServerRole(data?.role === 'admin' ? 'admin' : 'user');
      if (data?.user) {
        setSyncedUser(data.user);
        return data.user as SyncedUser;
      }
      return null;
    } catch {
      setServerRole('user');
      return null;
    }
  }, []);

  const ensuringUsersRef = React.useRef<Map<string, Promise<void>>>(new Map());

  const ensureFirestoreUserDoc = useCallback(
    async (
      user: FirebaseUser,
      preferredRole: SignupRoleChoice = 'student',
      phoneOverride = ''
    ) => {
      if (!user.emailVerified) return;

      const existingPromise = ensuringUsersRef.current.get(user.uid);
      if (existingPromise) {
        await existingPromise;
        return;
      }

      const task = (async () => {
        const userPath = `users/${user.uid}`;
        const userRef = doc(db, 'users', user.uid);
        const isPrimaryAdmin =
          user.email?.toLowerCase() === PRIMARY_ADMIN_EMAIL && user.emailVerified;

        let pendingPhone = phoneOverride;
        let pendingRole: 'student' | 'provider' =
          preferredRole === 'provider' ? 'provider' : 'student';

        const pending = readPendingSignup();
        if (pending && pending.email.toLowerCase() === (user.email || '').toLowerCase()) {
          pendingPhone = pendingPhone || pending.phone || '';
          pendingRole = pending.firestoreRole;
          setIntendedDashboard(pending.intendedDashboard);
          writeStoredIntendedDashboard(pending.intendedDashboard);
          clearPendingSignup();
        } else if (preferredRole === 'delivery_partner') {
          setIntendedDashboard('delivery');
          writeStoredIntendedDashboard('delivery');
        }

        if (isPrimaryAdmin) {
          const adminPath = `admins/${user.uid}`;
          try {
            const adminSnap = await getDoc(doc(db, 'admins', user.uid));
            if (!adminSnap.exists()) {
              await setDoc(doc(db, 'admins', user.uid), {
                email: (user.email || PRIMARY_ADMIN_EMAIL).slice(0, 150),
                createdAt: serverTimestamp(),
              });
            }
            setHasAdminDoc(true);
          } catch (err) {
            handleFirestoreError(err, OperationType.WRITE, adminPath);
          }
        }

        const rolePath = `user_roles/${user.uid}`;
        try {
          const roleRef = doc(db, 'user_roles', user.uid);
          const roleSnap = await getDoc(roleRef);
          if (!roleSnap.exists()) {
            await setDoc(roleRef, {
              user_id: user.uid,
              email: (user.email || 'user@lokma.local').slice(0, 150),
              role: isPrimaryAdmin ? 'admin' : 'user',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, rolePath);
        }

        try {
          const existingSnap = await getDoc(userRef);
          if (!existingSnap.exists()) {
            const safeName = (
              user.displayName ||
              (user.email ? user.email.split('@')[0] : '') ||
              'LOKMA User'
            )
              .trim()
              .slice(0, 120);
            const safeEmail = (user.email || 'user@lokma.local').slice(0, 150);
            const safePhone = pendingPhone.trim().slice(0, 30);
            const targetRole = isPrimaryAdmin ? 'admin' : pendingRole;

            await setDoc(userRef, {
              id: user.uid,
              full_name: safeName || 'LOKMA User',
              email: safeEmail,
              phone: safePhone,
              role: targetRole,
              status: 'active',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });

            if (targetRole === 'student') {
              const stuPath = `student_profiles/${user.uid}`;
              try {
                const stuRef = doc(db, 'student_profiles', user.uid);
                const stuSnap = await getDoc(stuRef);
                if (!stuSnap.exists()) {
                  await setDoc(stuRef, {
                    user_id: user.uid,
                    university_id: '',
                    university_name: '',
                    faculty: '',
                    daily_budget: 0,
                    weekly_budget: 0,
                    delivery_location: '',
                    allergen_ids: [],
                    dietary_pref_ids: [],
                    category_prefs: {},
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                  });
                }
              } catch (stuErr) {
                handleFirestoreError(stuErr, OperationType.WRITE, stuPath);
              }
            }
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, userPath);
        }
      })();

      ensuringUsersRef.current.set(user.uid, task);
      try {
        await task;
      } finally {
        ensuringUsersRef.current.delete(user.uid);
      }
    },
    []
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      setEmailVerified(Boolean(user?.emailVerified));
      if (user) {
        void syncUserWithBackend(user);
        if (user.emailVerified) {
          setUserDocLoading(true);
          try {
            await ensureFirestoreUserDoc(user);
          } catch (err) {
            console.error('Failed ensuring Firestore user doc:', err);
          }
        } else {
          setUserDocLoading(false);
        }
      } else {
        setSyncedUser(null);
        setServerRole('user');
        setUserDoc(null);
        setUserDocLoading(false);
        setHasAdminDoc(false);
        setHasUserRoleAdmin(false);
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, [ensureFirestoreUserDoc, syncUserWithBackend]);

  // Listen to own Firestore /users/{uid}, /admins/{uid}, and /user_roles/{uid} when verified
  useEffect(() => {
    if (!firebaseUser || !emailVerified) {
      setUserDoc(null);
      setUserDocLoading(false);
      setHasAdminDoc(false);
      setHasUserRoleAdmin(false);
      return;
    }

    setUserDocLoading(true);
    const userPath = `users/${firebaseUser.uid}`;
    const unsubUser = onSnapshot(
      doc(db, 'users', firebaseUser.uid),
      (snap) => {
        if (!snap.exists()) {
          setUserDoc(null);
          setUserDocLoading(false);
          return;
        }
        const d = snap.data();
        setUserDoc({
          id: String(d.id || snap.id),
          full_name: String(d.full_name || ''),
          email: String(d.email || ''),
          phone: String(d.phone || ''),
          role: d.role || 'student',
          status: d.status || 'active',
          created_at: tsToIso(d.createdAt),
          updated_at: tsToIso(d.updatedAt),
        });
        setUserDocLoading(false);
      },
      (err) => {
        setUserDocLoading(false);
        handleFirestoreError(err, OperationType.GET, userPath);
      }
    );

    const adminPath = `admins/${firebaseUser.uid}`;
    const unsubAdmin = onSnapshot(
      doc(db, 'admins', firebaseUser.uid),
      (snap) => {
        setHasAdminDoc(snap.exists());
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, adminPath);
      }
    );

    const rolePath = `user_roles/${firebaseUser.uid}`;
    const unsubRole = onSnapshot(
      doc(db, 'user_roles', firebaseUser.uid),
      (snap) => {
        setHasUserRoleAdmin(snap.exists() && snap.data()?.role === 'admin');
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, rolePath);
      }
    );

    return () => {
      unsubUser();
      unsubAdmin();
      unsubRole();
    };
  }, [firebaseUser, emailVerified]);

  const signInWithGoogle = async (
    preferredRole: SignupRoleChoice = 'student'
  ): Promise<boolean> => {
    setAuthError(null);
    setAuthErrorCode(null);
    setAuthNotice(null);
    setSigningIn(true);
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      setEmailVerified(Boolean(cred.user.emailVerified));
      await ensureFirestoreUserDoc(cred.user, preferredRole);
      await syncUserWithBackend(cred.user);
      return true;
    } catch (error: unknown) {
      const mapped = mapFirebaseAuthError(error);
      if (
        mapped.code === 'auth/popup-closed-by-user' ||
        mapped.code === 'auth/cancelled-popup-request'
      ) {
        setAuthNotice(mapped.message);
        return false;
      }
      console.error('Google Sign-In failed:', error);
      setAuthErrorCode(mapped.code);
      setAuthError(mapped.message);
      return false;
    } finally {
      setSigningIn(false);
    }
  };

  const registerWithEmail = async (input: EmailRegisterInput): Promise<boolean> => {
    const lang = getActiveLang();
    const cleanEmail = input.email.trim();
    const cleanName = input.fullName.trim();

    setAuthError(null);
    setAuthErrorCode(null);
    setAuthNotice(null);

    if (!cleanName) {
      setAuthError(
        lang === 'ar' ? 'يرجى إدخال الاسم الكامل.' : 'Please enter your full name.'
      );
      return false;
    }
    if (!EMAIL_REGEX.test(cleanEmail)) {
      setAuthErrorCode('auth/invalid-email');
      setAuthError(
        lang === 'ar'
          ? 'صيغة البريد الإلكتروني غير صحيحة.'
          : 'Please enter a valid email address.'
      );
      return false;
    }
    if (!input.password || input.password.length < 6) {
      setAuthErrorCode('auth/weak-password');
      setAuthError(
        lang === 'ar'
          ? 'كلمة المرور يجب ألا تقل عن 6 أحرف.'
          : 'Password must be at least 6 characters.'
      );
      return false;
    }

    setSigningIn(true);
    const firestoreRole: 'student' | 'provider' =
      input.role === 'provider' ? 'provider' : 'student';
    const nextIntended: IntendedDashboard =
      input.role === 'delivery_partner'
        ? 'delivery'
        : input.role === 'provider'
        ? 'provider'
        : 'student';

    try {
      writePendingSignup({
        email: cleanEmail,
        phone: input.phone.trim(),
        firestoreRole,
        intendedDashboard: nextIntended,
      });
      setIntendedDashboard(nextIntended);
      writeStoredIntendedDashboard(nextIntended);

      const cred = await createUserWithEmailAndPassword(auth, cleanEmail, input.password);
      await updateProfile(cred.user, {
        displayName: cleanName.slice(0, 120),
      });

      try {
        await sendEmailVerification(cred.user);
      } catch (verifyErr) {
        console.warn('Initial verification email could not be sent immediately:', verifyErr);
      }

      setAuthNotice(
        lang === 'ar'
          ? 'تم إنشاء الحساب وإرسال رابط التفعيل إلى بريدك الإلكتروني. يرجى تأكيد البريد ثم الضغط على "تحققت من بريدي — متابعة".'
          : 'Account created and verification link sent to your email. Please verify your inbox, then click "I Verified My Email — Continue".'
      );
      return true;
    } catch (error: unknown) {
      clearPendingSignup();
      const mapped = mapFirebaseAuthError(error, lang);
      setAuthErrorCode(mapped.code);
      setAuthError(mapped.message);
      return false;
    } finally {
      setSigningIn(false);
    }
  };

  const signInWithEmail = async (email: string, password: string): Promise<boolean> => {
    const lang = getActiveLang();
    const cleanEmail = email.trim();

    setAuthError(null);
    setAuthErrorCode(null);
    setAuthNotice(null);

    if (!EMAIL_REGEX.test(cleanEmail)) {
      setAuthErrorCode('auth/invalid-email');
      setAuthError(
        lang === 'ar'
          ? 'صيغة البريد الإلكتروني غير صحيحة.'
          : 'Please enter a valid email address.'
      );
      return false;
    }
    if (!password) {
      setAuthErrorCode('auth/missing-password');
      setAuthError(
        lang === 'ar' ? 'يرجى إدخال كلمة المرور.' : 'Please enter your password.'
      );
      return false;
    }

    setSigningIn(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
      setEmailVerified(Boolean(cred.user.emailVerified));
      if (!cred.user.emailVerified) {
        setAuthNotice(
          lang === 'ar'
            ? 'يرجى تفعيل بريدك الإلكتروني عبر الرابط المرسل إليك قبل متابعة الاستخدام.'
            : 'Please verify your email via the link sent to your inbox before continuing.'
        );
        return false;
      }
      await ensureFirestoreUserDoc(cred.user);
      await syncUserWithBackend(cred.user);
      return true;
    } catch (error: unknown) {
      const mapped = mapFirebaseAuthError(error, lang);
      setAuthErrorCode(mapped.code);
      setAuthError(mapped.message);
      return false;
    } finally {
      setSigningIn(false);
    }
  };

  const resetPassword = async (email: string): Promise<boolean> => {
    const lang = getActiveLang();
    const cleanEmail = email.trim();
    setAuthError(null);
    setAuthErrorCode(null);
    setAuthNotice(null);
    if (!cleanEmail || !EMAIL_REGEX.test(cleanEmail)) {
      setAuthErrorCode('auth/invalid-email');
      setAuthError(
        lang === 'ar'
          ? 'أدخل بريدًا إلكترونيًا صحيحًا لإرسال رابط استعادة كلمة المرور.'
          : 'Enter a valid email address to receive a password reset link.'
      );
      return false;
    }
    setSigningIn(true);
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      setAuthNotice(
        lang === 'ar'
          ? 'تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني.'
          : 'A password reset link has been sent to your email address.'
      );
      return true;
    } catch (error: unknown) {
      const mapped = mapFirebaseAuthError(error, lang);
      setAuthErrorCode(mapped.code);
      setAuthError(mapped.message);
      return false;
    } finally {
      setSigningIn(false);
    }
  };

  const resendVerificationEmail = async (): Promise<boolean> => {
    const lang = getActiveLang();
    setAuthError(null);
    setAuthErrorCode(null);
    if (!auth.currentUser) return false;
    setSigningIn(true);
    try {
      await sendEmailVerification(auth.currentUser);
      setAuthNotice(
        lang === 'ar'
          ? 'تم إعادة إرسال رسالة التفعيل إلى بريدك الإلكتروني.'
          : 'Verification email resent to your inbox.'
      );
      return true;
    } catch (error: unknown) {
      const mapped = mapFirebaseAuthError(error, lang);
      setAuthErrorCode(mapped.code);
      setAuthError(mapped.message);
      return false;
    } finally {
      setSigningIn(false);
    }
  };

  const refreshEmailVerification = async (): Promise<boolean> => {
    const lang = getActiveLang();
    setAuthError(null);
    setAuthErrorCode(null);
    if (!auth.currentUser) return false;
    setSigningIn(true);
    try {
      await reload(auth.currentUser);
      const refreshed = auth.currentUser;
      setFirebaseUser(refreshed);
      const isNowVerified = Boolean(refreshed?.emailVerified);
      setEmailVerified(isNowVerified);
      if (refreshed && isNowVerified) {
        setUserDocLoading(true);
        await ensureFirestoreUserDoc(refreshed);
        await syncUserWithBackend(refreshed);
        setAuthNotice(null);
        return true;
      }
      setAuthError(
        lang === 'ar'
          ? 'لم يتم تأكيد البريد الإلكتروني بعد. افتح رسالة التفعيل في بريدك واضغط على الرابط.'
          : 'Email is not verified yet. Open the verification email in your inbox and click the link.'
      );
      return false;
    } catch (error: unknown) {
      const mapped = mapFirebaseAuthError(error, lang);
      setAuthErrorCode(mapped.code);
      setAuthError(mapped.message);
      return false;
    } finally {
      setSigningIn(false);
    }
  };

  const signOutUser = async (): Promise<void> => {
    setAuthError(null);
    setAuthErrorCode(null);
    setAuthNotice(null);
    clearPendingSignup();
    clearIntendedDashboard();
    await signOut(auth);
    setFirebaseUser(null);
    setEmailVerified(false);
    setSyncedUser(null);
    setServerRole('user');
    setUserDoc(null);
    setUserDocLoading(false);
    setHasAdminDoc(false);
    setHasUserRoleAdmin(false);
  };

  const getIdToken = async (): Promise<string | null> => {
    if (!auth.currentUser) return null;
    return await auth.currentUser.getIdToken();
  };

  const isPrimaryAdmin =
    Boolean(firebaseUser && emailVerified) &&
    firebaseUser?.email?.toLowerCase() === PRIMARY_ADMIN_EMAIL;
  const isAdmin = Boolean(
    firebaseUser &&
      emailVerified &&
      (serverRole === 'admin' ||
        isPrimaryAdmin ||
        hasAdminDoc ||
        hasUserRoleAdmin ||
        userDoc?.role === 'admin')
  );
  const needsEmailVerification = Boolean(firebaseUser && !emailVerified);

  return (
    <FirebaseAuthContext.Provider
      value={{
        firebaseUser,
        syncedUser,
        userDoc,
        isAdmin,
        needsEmailVerification,
        authLoading,
        userDocLoading,
        signingIn,
        authError,
        authErrorCode,
        authNotice,
        firestoreConfigError,
        clearAuthError: () => {
          setAuthError(null);
          setAuthErrorCode(null);
        },
        clearAuthNotice: () => setAuthNotice(null),
        returnTarget,
        setReturnTarget,
        intendedDashboard,
        clearIntendedDashboard,
        signInWithGoogle,
        registerWithEmail,
        signInWithEmail,
        resetPassword,
        resendVerificationEmail,
        refreshEmailVerification,
        signOutUser,
        getIdToken,
      }}
    >
      {children}
    </FirebaseAuthContext.Provider>
  );
};

export function useFirebaseAuth(): FirebaseAuthContextValue {
  const ctx = useContext(FirebaseAuthContext);
  if (!ctx) throw new Error('useFirebaseAuth must be used inside FirebaseAuthProvider');
  return ctx;
}
