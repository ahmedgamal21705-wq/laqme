import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bike,
  ChefHat,
  GraduationCap,
  KeyRound,
  Loader2,
  MailCheck,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { SignupRoleChoice, useFirebaseAuth } from '../context/FirebaseAuthContext';
import { AppView, useLokma } from '../context/LokmaContext';
import { LokmaLogo } from './LokmaLogo';

type AuthMode = 'login' | 'register' | 'reset';

export const AuthView: React.FC = () => {
  const { lang, setView, pushToast, myDeliveryPartnerProfile } = useLokma();
  const {
    firebaseUser,
    userDoc,
    isAdmin,
    needsEmailVerification,
    authLoading,
    userDocLoading,
    signingIn,
    authError,
    authErrorCode,
    authNotice,
    clearAuthError,
    clearAuthNotice,
    returnTarget,
    intendedDashboard,
    clearIntendedDashboard,
    signInWithGoogle,
    registerWithEmail,
    signInWithEmail,
    resetPassword,
    resendVerificationEmail,
    refreshEmailVerification,
    signOutUser,
  } = useFirebaseAuth();

  const [mode, setMode] = useState<AuthMode>('login');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<SignupRoleChoice>('student');

  const BackIcon = lang === 'ar' ? ArrowRight : ArrowLeft;

  const resolvePostAuthView = useCallback((): Exclude<AppView, 'auth'> => {
    if (returnTarget.eventId || returnTarget.view === 'events') {
      return 'events';
    }
    if (returnTarget.view === 'admin') {
      return isAdmin ? 'admin' : 'student';
    }
    if (
      returnTarget.view === 'provider' ||
      returnTarget.view === 'delivery' ||
      returnTarget.view === 'student'
    ) {
      return returnTarget.view;
    }

    if (isAdmin || userDoc?.role === 'admin') {
      return 'admin';
    }
    if (userDoc?.role === 'provider' || intendedDashboard === 'provider') {
      return 'provider';
    }
    if (
      userDoc?.role === 'delivery_partner' ||
      intendedDashboard === 'delivery' ||
      Boolean(myDeliveryPartnerProfile)
    ) {
      return 'delivery';
    }
    return 'student';
  }, [
    returnTarget.eventId,
    returnTarget.view,
    isAdmin,
    userDoc?.role,
    intendedDashboard,
    myDeliveryPartnerProfile,
  ]);

  const navigateAfterAuth = useCallback(() => {
    const destView = resolvePostAuthView();
    const nextUrl =
      destView === 'events' && returnTarget.eventId
        ? `/events?event=${encodeURIComponent(returnTarget.eventId)}`
        : destView === 'landing'
        ? '/'
        : `/${destView}`;
    clearIntendedDashboard();
    window.history.replaceState({}, '', nextUrl);
    setView(destView);
  }, [resolvePostAuthView, returnTarget.eventId, clearIntendedDashboard, setView]);

  const navigateCancelBack = () => {
    const destView = returnTarget.view || 'landing';
    const nextUrl =
      destView === 'events' && returnTarget.eventId
        ? `/events?event=${encodeURIComponent(returnTarget.eventId)}`
        : destView === 'landing'
        ? '/'
        : `/${destView}`;
    window.history.replaceState({}, '', nextUrl);
    setView(destView);
  };

  useEffect(() => {
    if (
      !authLoading &&
      !userDocLoading &&
      !signingIn &&
      !authError &&
      firebaseUser &&
      firebaseUser.emailVerified
    ) {
      navigateAfterAuth();
    }
  }, [authLoading, userDocLoading, signingIn, authError, firebaseUser, navigateAfterAuth]);

  const handleModeSwitch = (next: AuthMode) => {
    clearAuthError();
    clearAuthNotice();
    setMode(next);
  };

  const handleGoogleLogin = async () => {
    clearAuthError();
    const ok = await signInWithGoogle(role);
    if (ok) {
      pushToast(
        lang === 'ar' ? 'تم تسجيل الدخول بنجاح' : 'Signed in successfully',
        'success'
      );
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAuthError();
    if (mode === 'login') {
      const ok = await signInWithEmail(email, password);
      if (ok) {
        pushToast(
          lang === 'ar' ? 'تم تسجيل الدخول بنجاح' : 'Signed in successfully',
          'success'
        );
      }
      return;
    }
    if (mode === 'register') {
      if (!fullName.trim()) {
        pushToast(
          lang === 'ar' ? 'يرجى كتابة الاسم الكامل' : 'Please enter your full name',
          'error'
        );
        return;
      }
      await registerWithEmail({
        fullName,
        email,
        password,
        phone,
        role,
      });
      return;
    }
    if (mode === 'reset') {
      await resetPassword(email);
    }
  };

  // Pending email verification screen
  if (!authLoading && firebaseUser && needsEmailVerification) {
    return (
      <div className="max-w-md mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <div className="bg-white rounded-3xl border border-[#0B3D2E]/12 p-7 sm:p-9 shadow-sm space-y-5">
          <div className="w-12 h-12 rounded-2xl bg-[#F7931E]/20 text-[#8A5A00] flex items-center justify-center">
            <MailCheck className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-extrabold text-[#0B3D2E]">
            {lang === 'ar' ? 'تأكيد البريد الإلكتروني' : 'Verify Your Email'}
          </h1>
          <p className="text-sm text-[#4E6359] leading-relaxed">
            {lang === 'ar'
              ? `أرسلنا رابط التفعيل إلى ${firebaseUser.email}. اضغط على الرابط في بريدك ثم اضغط هنا للمتابعة.`
              : `We sent a verification link to ${firebaseUser.email}. Open the link in your inbox, then continue below.`}
          </p>

          {authError && (
            <div
              role="alert"
              className="px-4 py-3 rounded-2xl bg-[#E97858]/12 border border-[#E97858]/35 text-xs text-[#9E3F24] font-semibold"
            >
              {authError}
            </div>
          )}
          {authNotice && (
            <div className="px-4 py-3 rounded-2xl bg-[#0B3D2E]/10 border border-[#0B3D2E]/25 text-xs text-[#0B3D2E] font-semibold">
              {authNotice}
            </div>
          )}

          <div className="space-y-2.5">
            <button
              type="button"
              disabled={signingIn}
              onClick={async () => {
                const verified = await refreshEmailVerification();
                if (verified) {
                  pushToast(
                    lang === 'ar' ? 'تم تفعيل حسابك بنجاح!' : 'Account verified!',
                    'success'
                  );
                }
              }}
              className="w-full py-3 rounded-2xl bg-[#0B3D2E] text-white font-bold text-sm hover:bg-[#072B20] disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer"
            >
              {signingIn ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              <span>
                {lang === 'ar'
                  ? 'تحققت من بريدي — متابعة'
                  : 'I Verified My Email — Continue'}
              </span>
            </button>

            <button
              type="button"
              disabled={signingIn}
              onClick={() => resendVerificationEmail()}
              className="w-full py-2.5 rounded-2xl border border-[#0B3D2E]/20 text-xs font-bold text-[#0B3D2E] hover:bg-[#FFF7E6] cursor-pointer"
            >
              {lang === 'ar' ? 'إعادة إرسال رابط التفعيل' : 'Resend Verification Email'}
            </button>

            <button
              type="button"
              onClick={() => signOutUser()}
              className="w-full py-2 text-xs font-semibold text-[#4E6359] hover:underline cursor-pointer"
            >
              {lang === 'ar' ? 'استخدام بريد إلكتروني آخر' : 'Use a different account'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <div className="bg-white rounded-3xl border border-[#0B3D2E]/12 p-7 sm:p-9 shadow-sm space-y-6">
        <div className="flex items-center justify-between">
          <LokmaLogo variant="primary" size="sm" />
          <button
            type="button"
            onClick={navigateCancelBack}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0B3D2E] hover:underline cursor-pointer"
          >
            <BackIcon className="w-3.5 h-3.5" />
            <span>{lang === 'ar' ? 'رجوع' : 'Back'}</span>
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#FFF7E6] rounded-2xl border border-[#0B3D2E]/10">
          <button
            type="button"
            onClick={() => handleModeSwitch('login')}
            className={`py-2.5 min-h-[42px] rounded-xl text-xs font-bold transition-colors cursor-pointer ${
              mode === 'login' ? 'bg-[#0B3D2E] text-white' : 'text-[#4E6359]'
            }`}
          >
            {lang === 'ar' ? 'تسجيل الدخول' : 'Sign In'}
          </button>
          <button
            type="button"
            onClick={() => handleModeSwitch('register')}
            className={`py-2.5 min-h-[42px] rounded-xl text-xs font-bold transition-colors cursor-pointer ${
              mode === 'register' ? 'bg-[#0B3D2E] text-white' : 'text-[#4E6359]'
            }`}
          >
            {lang === 'ar' ? 'إنشاء حساب جديد' : 'Create Account'}
          </button>
        </div>

        <div className="space-y-1.5">
          <h1 className="text-2xl font-extrabold text-[#0B3D2E]">
            {mode === 'login'
              ? lang === 'ar'
                ? 'مرحباً بعودتك إلى لقمة'
                : 'Welcome Back to LOKMA'
              : mode === 'register'
              ? lang === 'ar'
                ? 'انضم إلى مجتمع لقمة'
                : 'Create Your LOKMA Account'
              : lang === 'ar'
              ? 'استعادة كلمة المرور'
              : 'Reset Password'}
          </h1>
          <p className="text-xs sm:text-sm text-[#4E6359] leading-relaxed">
            {returnTarget.eventId
              ? lang === 'ar'
                ? 'سجّل الدخول لتأكيد تسجيلك في الفعالية، وسيتم إرجاعك إليها مباشرة.'
                : 'Sign in to complete your event registration and return directly to the event.'
              : lang === 'ar'
              ? 'سجّل بحساب جوجل أو بالبريد الإلكتروني وكلمة المرور لإدارة طلباتك أو مطبخك أو التوصيل.'
              : 'Sign in with Google or email & password to place orders, manage a kitchen, or deliver meals.'}
          </p>
        </div>

        {authError && (
          <div
            role="alert"
            className="px-4 py-3 rounded-2xl bg-[#E97858]/12 border border-[#E97858]/35 text-xs sm:text-sm text-[#9E3F24] font-semibold leading-relaxed space-y-2"
          >
            <p>{authError}</p>
            {authErrorCode === 'auth/operation-not-allowed' && (
              <button
                type="button"
                disabled={signingIn || authLoading}
                onClick={handleGoogleLogin}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#0B3D2E] text-white text-xs font-bold hover:bg-[#072B20] cursor-pointer"
              >
                {lang === 'ar' ? 'الدخول بحساب Google الآن' : 'Continue with Google now'}
              </button>
            )}
          </div>
        )}

        {authNotice && (
          <div className="px-4 py-3 rounded-2xl bg-[#0B3D2E]/10 border border-[#0B3D2E]/25 text-xs sm:text-sm text-[#0B3D2E] font-semibold leading-relaxed">
            {authNotice}
          </div>
        )}

        {/* Role Picker for Registration (Student, Food Provider / Kitchen, or Delivery Partner — never Admin) */}
        {mode === 'register' && (
          <div className="space-y-2">
            <label className="block text-xs font-bold text-[#4E6359]">
              {lang === 'ar' ? 'نوع الحساب' : 'Account Role'}
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setRole('student')}
                className={`p-2.5 min-h-[44px] rounded-2xl border text-xs font-bold flex flex-col sm:flex-row items-center justify-center gap-1.5 cursor-pointer ${
                  role === 'student'
                    ? 'bg-[#0B3D2E] text-white border-[#0B3D2E]'
                    : 'bg-[#FFF7E6]/70 text-[#13221C] border-[#0B3D2E]/15'
                }`}
              >
                <GraduationCap className="w-4 h-4 shrink-0" />
                <span>{lang === 'ar' ? 'طالب' : 'Student'}</span>
              </button>
              <button
                type="button"
                onClick={() => setRole('provider')}
                className={`p-2.5 min-h-[44px] rounded-2xl border text-xs font-bold flex flex-col sm:flex-row items-center justify-center gap-1.5 cursor-pointer ${
                  role === 'provider'
                    ? 'bg-[#0B3D2E] text-white border-[#0B3D2E]'
                    : 'bg-[#FFF7E6]/70 text-[#13221C] border-[#0B3D2E]/15'
                }`}
              >
                <ChefHat className="w-4 h-4 shrink-0" />
                <span>{lang === 'ar' ? 'مطبخ' : 'Kitchen'}</span>
              </button>
              <button
                type="button"
                onClick={() => setRole('delivery_partner')}
                className={`p-2.5 min-h-[44px] rounded-2xl border text-xs font-bold flex flex-col sm:flex-row items-center justify-center gap-1.5 cursor-pointer ${
                  role === 'delivery_partner'
                    ? 'bg-[#0B3D2E] text-white border-[#0B3D2E]'
                    : 'bg-[#FFF7E6]/70 text-[#13221C] border-[#0B3D2E]/15'
                }`}
              >
                <Bike className="w-4 h-4 shrink-0" />
                <span>{lang === 'ar' ? 'توصيل' : 'Delivery'}</span>
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleEmailSubmit} className="space-y-3.5">
          {mode === 'register' && (
            <>
              <div>
                <label className="block text-xs font-bold text-[#4E6359] mb-1">
                  {lang === 'ar' ? 'الاسم الكامل' : 'Full Name'}
                </label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={lang === 'ar' ? 'الاسم ثلاثي' : 'Your full name'}
                  className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-[#FFF7E6]/60 border border-[#0B3D2E]/20 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B3D2E]/40"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#4E6359] mb-1">
                  {lang === 'ar' ? 'رقم الهاتف (اختياري)' : 'Phone Number (optional)'}
                </label>
                <input
                  type="tel"
                  maxLength={30}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="010xxxxxxxx"
                  className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-[#FFF7E6]/60 border border-[#0B3D2E]/20 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B3D2E]/40"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-bold text-[#4E6359] mb-1">
              {lang === 'ar' ? 'البريد الإلكتروني' : 'Email Address'}
            </label>
            <input
              type="email"
              required
              maxLength={150}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-[#FFF7E6]/60 border border-[#0B3D2E]/20 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B3D2E]/40"
            />
          </div>

          {mode !== 'reset' && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-[#4E6359]">
                  {lang === 'ar' ? 'كلمة المرور' : 'Password'}
                </label>
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => handleModeSwitch('reset')}
                    className="text-[11px] font-bold text-[#0B3D2E] hover:underline cursor-pointer"
                  >
                    {lang === 'ar' ? 'نسيت كلمة المرور؟' : 'Forgot password?'}
                  </button>
                )}
              </div>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-[#FFF7E6]/60 border border-[#0B3D2E]/20 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B3D2E]/40"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={signingIn || authLoading}
            className="w-full py-3 min-h-[44px] rounded-2xl bg-[#F7931E] hover:bg-[#E08112] disabled:opacity-60 text-[#13221C] font-extrabold text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            {signingIn && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === 'reset' && !signingIn && <KeyRound className="w-4 h-4" />}
            <span>
              {mode === 'login'
                ? lang === 'ar'
                  ? 'تسجيل الدخول بالبريد'
                  : 'Sign In with Email'
                : mode === 'register'
                ? lang === 'ar'
                  ? 'إنشاء الحساب وإرسال التفعيل'
                  : 'Create Account'
                : lang === 'ar'
                ? 'إرسال رابط إعادة التعيين'
                : 'Send Reset Link'}
            </span>
          </button>

          {mode === 'reset' && (
            <button
              type="button"
              onClick={() => handleModeSwitch('login')}
              className="w-full min-h-[38px] text-xs font-bold text-[#0B3D2E] hover:underline cursor-pointer"
            >
              {lang === 'ar' ? 'العودة لتسجيل الدخول' : 'Back to Sign In'}
            </button>
          )}
        </form>

        <div className="relative flex items-center py-1">
          <div className="flex-grow border-t border-[#0B3D2E]/12" />
          <span className="shrink mx-3 text-[11px] font-bold text-[#4E6359]">
            {lang === 'ar' ? 'أو' : 'OR'}
          </span>
          <div className="flex-grow border-t border-[#0B3D2E]/12" />
        </div>

        <button
          type="button"
          disabled={signingIn || authLoading}
          onClick={handleGoogleLogin}
          className="w-full py-3.5 px-5 min-h-[46px] rounded-2xl bg-[#0B3D2E] hover:bg-[#072B20] disabled:opacity-60 text-white font-bold text-sm transition-colors flex items-center justify-center gap-3 cursor-pointer shadow-sm"
        >
          {signingIn ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>
                {lang === 'ar' ? 'جاري الدخول بحساب جوجل...' : 'Signing in with Google...'}
              </span>
            </>
          ) : (
            <>
              <span className="w-6 h-6 rounded-full bg-white flex items-center justify-center shrink-0">
                <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                  />
                </svg>
              </span>
              <span>{lang === 'ar' ? 'الدخول بحساب جوجل' : 'Continue with Google'}</span>
            </>
          )}
        </button>

        <div className="pt-4 border-t border-[#0B3D2E]/10 flex items-center gap-2 text-xs text-[#4E6359]">
          <ShieldCheck className="w-4 h-4 text-[#0B3D2E] shrink-0" />
          <span>
            {lang === 'ar'
              ? 'جلسات آمنة ومتصلة مباشرة بقاعدة بيانات Cloud Firestore'
              : 'Secured via Firebase Authentication & Cloud Firestore'}
          </span>
        </div>
      </div>
    </div>
  );
};
