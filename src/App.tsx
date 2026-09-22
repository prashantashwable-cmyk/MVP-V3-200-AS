import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { User, UserRole, UserStatus } from './types';
import { DbManager } from './lib/db';
import { getOrCreateFirestoreUser, updateFirestoreUser } from './lib/firestoreUsers';
import { Button } from './components/Common';
import { RoleSelectionWizard } from './components/RoleSelectionWizard';
import { SurveyorOnboarding } from './components/SurveyorOnboarding';
import { TechnicianOnboarding } from './components/TechnicianOnboarding';
import { SupplierOnboarding } from './components/SupplierOnboarding';
import { CustomerQuickSignup } from './components/CustomerQuickSignup';
import { ForgotPasswordReset } from './components/ForgotPasswordReset';
import { PermissionsPrimer } from './components/PermissionsPrimer';
import {
  Building,
  Phone,
  Shield,
  ArrowRight,
  User as UserIcon,
  Lock,
  CheckCircle2,
  ChevronRight,
  LogOut,
  Settings,
  Layers,
  Hammer,
  Truck,
  Users,
  LayoutDashboard,
  Sparkles,
  MapPin,
  Compass,
  Award,
  FileText,
  AlertTriangle,
  AlertCircle,
  Globe,
  Activity,
  Flame,
  TrendingUp,
  HelpCircle,
  ShieldCheck,
  LineChart,
  Grid,
  Cpu,
  Landmark,
  Split,
  Calendar,
  FileSpreadsheet,
  MessageSquare,
  GitMerge,
  Send,
  Bot,
  Inbox,
  Tag,
  DollarSign,
  Palette,
  Eye,
  History,
  Percent,
  Sliders,
  CreditCard,
  SlidersHorizontal,
  ClipboardCheck,
  FileCheck,
  BarChart2,
  Scale,
  Wrench,
  Camera,
  ClipboardList,
  Bell,
  GitCommit,
  Clock,
  Zap,
  Gift,
  Database,
  Info,
  Search,
  X
} from 'lucide-react';
import { useLanguage, translations as appTranslations, Language } from './lib/language';
import { useTheme } from './lib/theme';
import { auth } from './lib/firebase';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { AdminRouter } from './routers/AdminRouter';
import { TechnicianRouter } from './routers/TechnicianRouter';
import { SurveyorRouter } from './routers/SurveyorRouter';
import { CustomerRouter } from './routers/CustomerRouter';
import { SupplierRouter } from './routers/SupplierRouter';
import { SharedRoutes } from './routers/SharedRoutes';

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [showCarousel, setShowCarousel] = useState(false);
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [carouselStep, setCarouselStep] = useState(0);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showMobileMoreMenu, setShowMobileMoreMenu] = useState(false);
  const [mobileNavSearch, setMobileNavSearch] = useState('');
  const { language: appLanguage, setLanguage: setAppLanguage, t } = useLanguage(currentUser);
  const { theme: appTheme, setTheme: setAppTheme } = useTheme(currentUser);
  const [loginPhone, setLoginPhone] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [activeTab, setActiveTab] = useState('Home');
  const [selectedTechJobId, setSelectedTechJobId] = useState<string>('job_2026_101');
  const [selectedApplicantId, setSelectedApplicantId] = useState<string>('app_2026_01');
  const [selectedSopStepId, setSelectedSopStepId] = useState<string | undefined>(undefined);
  const [trackingPoId, setTrackingPoId] = useState<string | undefined>(undefined);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string>('pay_101');
  const [selectedTrainingModuleId, setSelectedTrainingModuleId] = useState<string>('tm_001');
  const [selectedTrainingLessonId, setSelectedTrainingLessonId] = useState<string>('les_101');
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string>('assess_001');
  const [activeAuthTab, setActiveAuthTab] = useState<'phone' | 'demo'>('demo');
  const [errorMsg, setErrorMsg] = useState('');
  const [showForgotReset, setShowForgotReset] = useState(false);

  // Google Maps Platform API Key variables
  const [googleMapsApiKey, setGoogleMapsApiKey] = useState<string>('');
  const [hasValidGoogleMapsKey, setHasValidGoogleMapsKey] = useState<boolean>(false);

  useEffect(() => {
    // Attempt to load from build-time config first
    const buildKey = (process.env.GOOGLE_MAPS_PLATFORM_KEY as string) ||
      (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
      (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY ||
      '';
    if (buildKey && buildKey !== 'YOUR_API_KEY') {
      setGoogleMapsApiKey(buildKey);
      setHasValidGoogleMapsKey(true);
    }

    // Always fetch the freshest runtime key from the server with robust retry mechanism
    const fetchWithRetry = async (retries = 3, delay = 1000) => {
      try {
        const res = await fetch('/api/config/maps-key');
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        const data = await res.json();
        if (data.apiKey) {
          setGoogleMapsApiKey(data.apiKey);
          setHasValidGoogleMapsKey(true);
        }
      } catch (err) {
        if (retries > 0) {
          setTimeout(() => {
            fetchWithRetry(retries - 1, delay * 1.5);
          }, delay);
        } else {
          // Log as warning instead of console.error to prevent false positive error indicators
          // in the diagnostics portal, since the app gracefully falls back to offline Vector maps.
          console.warn('Could not fetch dynamic Google Maps key at root, running in offline vector map mode:', err);
        }
      }
    };

    fetchWithRetry();
  }, []);

  useEffect(() => {
    const handleSwitch = (e: Event) => {
      const ce = e as CustomEvent<string>;
      if (ce.detail) {
        setActiveTab(ce.detail);
      }
    };
    window.addEventListener('aiec_switch_tab', handleSwitch);
    return () => {
      window.removeEventListener('aiec_switch_tab', handleSwitch);
    };
  }, []);

  // Real (non-demo) sessions subscribe DbManager's Leads API to Firestore;
  // demo sessions (or no session) keep it 100% local. See DbManager.setSessionMode.
  useEffect(() => {
    DbManager.setSessionMode(currentUser);
  }, [currentUser?.id, currentUser?.isDemo]);

  const renderTabContent = () => {
    if (!currentUser) return null;
    const routerProps = {
      currentUser,
      activeTab,
      setActiveTab,
      appLanguage,
      selectedTechJobId,
      setSelectedTechJobId,
      selectedApplicantId,
      setSelectedApplicantId,
      selectedSopStepId,
      setSelectedSopStepId,
      trackingPoId,
      setTrackingPoId,
      selectedPaymentId,
      setSelectedPaymentId,
      selectedTrainingModuleId,
      setSelectedTrainingModuleId,
      selectedTrainingLessonId,
      setSelectedTrainingLessonId,
      selectedAssessmentId,
      setSelectedAssessmentId,
      handleLogout,
      renderPreferencesSection,
    };
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.25 }}
        >
          {currentUser.role === 'admin' && (
            <AdminRouter {...routerProps} googleMapsApiKey={googleMapsApiKey} hasValidGoogleMapsKey={hasValidGoogleMapsKey} />
          )}
          {currentUser.role === 'technician' && <TechnicianRouter {...routerProps} />}
          {currentUser.role === 'surveyor' && <SurveyorRouter {...routerProps} />}
          {currentUser.role === 'customer' && <CustomerRouter {...routerProps} />}
          {currentUser.role === 'supplier' && <SupplierRouter {...routerProps} />}
          <SharedRoutes {...routerProps} />
        </motion.div>
      </AnimatePresence>
    );
  };

  // Extended fields for Screen 2 (Login/Demo)
  const [loginMethod, setLoginMethod] = useState<'phone' | 'email'>('phone');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [otpAttempts, setOtpAttempts] = useState(0);
  const [cooldownTime, setCooldownTime] = useState(0);
  const [otp6Digits, setOtp6Digits] = useState<string[]>(Array(6).fill(''));

  // Extended states for Prompt 003 — OTP Verification Screen
  const [resendCountdown, setResendCountdown] = useState(0);
  const [resendCount, setResendCount] = useState(0);
  const [otpSentTimestamp, setOtpSentTimestamp] = useState<number>(0);
  const [verificationStatus, setVerificationStatus] = useState<'idle' | 'verifying' | 'success' | 'error'>('idle');
  const [simulateSmsToast, setSimulateSmsToast] = useState(false);
  const [isExpired, setIsExpired] = useState(false);
  const [countryCode, setCountryCode] = useState('+91');

  // Local helper to log analytics events
  const logLaunchAnalytics = (role: string) => {
    const deviceId = localStorage.getItem('aiec_device_id') || 'unknown';
    const newEvent = {
      timestamp: new Date().toISOString(),
      deviceId,
      deviceType: window.innerWidth < 768 ? 'mobile' : 'desktop',
      appVersion: '1.0.1',
      role,
      networkStatus: navigator.onLine ? 'online' : 'offline'
    };
    try {
      const events = JSON.parse(localStorage.getItem('aiec_launch_analytics') || '[]');
      events.push(newEvent);
      localStorage.setItem('aiec_launch_analytics', JSON.stringify(events.slice(-50)));
    } catch (e) {
      localStorage.setItem('aiec_launch_analytics', JSON.stringify([newEvent]));
    }
  };

  // Cold start checks: session recovery, device ID, first launch flag, version checking
  useEffect(() => {
    // 1. Ensure Device ID exists
    let deviceId = localStorage.getItem('aiec_device_id');
    if (!deviceId) {
      deviceId = `aiec_dev_${Math.floor(100000 + Math.random() * 900000)}`;
      localStorage.setItem('aiec_device_id', deviceId);
    }

    // 2. Background check for active session token
    const savedToken = localStorage.getItem('aiec_session_token');
    let authenticatedUser: User | null = null;

    if (savedToken) {
      if (savedToken.startsWith('session_')) {
        const userId = savedToken.replace('session_', '');
        const foundUser = DbManager.getUsers().find(u => u.id === userId);
        if (foundUser) {
          authenticatedUser = foundUser;
        } else {
          // Silent clear if invalid user association (tampered/deleted)
          localStorage.removeItem('aiec_session_token');
          localStorage.removeItem('aiec_last_role_used');
        }
      } else {
        // Silent clear if corrupted formatting
        localStorage.removeItem('aiec_session_token');
        localStorage.removeItem('aiec_last_role_used');
      }
    }

    // 3. Play splash screen animation and auto-route
    const timer = setTimeout(() => {
      setShowSplash(false);
      
      const isFirstLaunch = localStorage.getItem('aiec_first_launch_flag') !== 'false';

      if (authenticatedUser) {
        // Safe auto-route with zero taps for returning authenticated users
        setCurrentUser(authenticatedUser);
        logLaunchAnalytics(authenticatedUser.role);
        
        // Show What's New afterward if there was a version update
        const lastVersion = localStorage.getItem('aiec_app_version');
        if (lastVersion !== '1.0.1') {
          setShowWhatsNew(true);
        }
      } else {
        // Log guest/anonymous visit
        logLaunchAnalytics('guest');

        if (isFirstLaunch) {
          setShowCarousel(true);
        } else {
          // Version checking for non-first-time guest
          const lastVersion = localStorage.getItem('aiec_app_version');
          if (lastVersion !== '1.0.1') {
            setShowWhatsNew(true);
          }
        }
      }
    }, 2500);

    return () => clearTimeout(timer);
  }, []);

  // Cooldown timer for incorrect OTP attempts
  useEffect(() => {
    if (cooldownTime > 0) {
      const interval = setInterval(() => {
        setCooldownTime((prev) => {
          if (prev <= 1) {
            setOtpAttempts(0);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [cooldownTime]);

  // Resend Countdown, Auto-Expiration Check and simulated SMS retrieval timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (otpSent) {
      interval = setInterval(() => {
        // Tick down resend countdown limit
        setResendCountdown((prev) => (prev > 0 ? prev - 1 : 0));

        // Check for 120-second OTP expiration limit
        if (otpSentTimestamp > 0) {
          const secondsElapsed = Math.floor((Date.now() - otpSentTimestamp) / 1000);
          if (secondsElapsed >= 120) {
            setIsExpired(true);
          }
        }
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [otpSent, otpSentTimestamp]);

  const handlePhoneSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (cooldownTime > 0) {
      setErrorMsg(`Security cooldown active. Please wait ${cooldownTime} seconds.`);
      return;
    }
    if (!loginPhone.trim()) return;

    // Detect international numbers
    const cleaned = loginPhone.replace(/\D/g, '');
    const isIntl = cleaned.length > 10 || loginPhone.startsWith('+');
    
    setOtpSent(true);
    setOtp6Digits(Array(6).fill(''));
    setErrorMsg('');
    setIsExpired(false);
    setResendCountdown(30);
    setOtpSentTimestamp(Date.now());
    setVerificationStatus('idle');

    // Fire simulated incoming SMS Toast
    setSimulateSmsToast(true);
    setTimeout(() => {
      setSimulateSmsToast(false);
    }, 12000); // give 12 seconds for friendly demonstration
  };

  const handleResendOtp = () => {
    if (resendCountdown > 0) return;
    if (resendCount >= 5) {
      setErrorMsg('Strict Limit: Maximum of 5 OTP resends allowed per 10 minutes to protect mobility channels.');
      return;
    }
    setResendCount((prev) => prev + 1);
    setResendCountdown(30);
    setOtpSentTimestamp(Date.now());
    setIsExpired(false);
    setOtp6Digits(Array(6).fill(''));
    setErrorMsg('');
    setVerificationStatus('idle');

    // Fire simulated incoming SMS Toast
    setSimulateSmsToast(true);
    setTimeout(() => {
      setSimulateSmsToast(false);
    }, 12000);
  };

  const triggerInstantVerification = (code: string) => {
    if (cooldownTime > 0 || isExpired) return;

    // Format validation: 6-digits, or the '1234' demo bypass code
    const isBypass = code === '1234' || code === '123456';
    const isSixDigit = /^\d{6}$/.test(code);
    if (!isBypass && !isSixDigit) {
      return;
    }

    setVerificationStatus('verifying');
    setErrorMsg('');

    // Simulated secure handshaking with server-side proxy
    setTimeout(() => {
      if (code === '123456' || code === '1234' || code === '888888') {
        setVerificationStatus('success');
        setErrorMsg('');
        setOtpAttempts(0);

        // Instant delay before auto-navigation
        setTimeout(() => {
          const list = DbManager.getUsers();
          let found = list.find((u) => u.phone.includes(loginPhone));

          if (!found) {
            found = {
              id: `real_${Date.now()}`,
              role: 'pending_selection' as any, // default role
              name: `Partner ${countryCode} ${loginPhone}`,
              phone: `${countryCode} ${loginPhone}`,
              status: 'pending', // Pending approval holding state
              avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
            };
            DbManager.addUser(found);
          }

          // Phase 05: this OTP flow is entirely client-side (no real SMS
          // provider — see triggerInstantVerification above); tag it so
          // authz.ts can withhold high-risk permissions from it even
          // though the role itself may otherwise qualify.
          setCurrentUser({ ...found, isDemo: false, authMethod: 'otp_unverified' });

          if (rememberMe) {
            localStorage.setItem('aiec_session_token', `session_${found.id}`);
            localStorage.setItem('aiec_last_role_used', found.role);
          }
          logLaunchAnalytics(found.role);
          setActiveTab('Home');
          setVerificationStatus('idle');
          setOtpSent(false);
          setSimulateSmsToast(false);
        }, 800);
      } else {
        setVerificationStatus('error');
        const nextAttempts = otpAttempts + 1;
        setOtpAttempts(nextAttempts);
        if (nextAttempts >= 3) {
          setCooldownTime(60);
          setErrorMsg('3 incorrect OTP attempts. Security cooldown triggered for 60 seconds.');
        } else {
          setErrorMsg(`Invalid verification PIN. Attempts remaining: ${3 - nextAttempts}`);
        }
      }
    }, 900);
  };

  const handleOtpVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (cooldownTime > 0 || isExpired) return;
    const code = otp6Digits.join('');
    triggerInstantVerification(code);
  };

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    
    const emailLower = loginEmail.toLowerCase().trim();
    const list = DbManager.getUsers();
    
    // Seeded email definitions
    const emailToRoleMap: Record<string, { role: UserRole; name: string; phone: string; status: UserStatus }> = {
      'admin@aiec.com': { role: 'admin', name: 'Mr. Prashant Vasant Wable', phone: '+91 98765 43210', status: 'active' },
      'surveyor@aiec.com': { role: 'surveyor', name: 'Amit Sharma', phone: '+91 98765 43211', status: 'active' },
      'technician@aiec.com': { role: 'technician', name: 'Rajesh Patel', phone: '+91 98765 43212', status: 'active' },
      'supplier@aiec.com': { role: 'supplier', name: 'Sun Elevators Manufacturing', phone: '+91 98765 43213', status: 'active' },
      'customer@aiec.com': { role: 'customer', name: 'Rohan Deshmukh', phone: '+91 98765 43214', status: 'active' },
      'pending@aiec.com': { role: 'surveyor', name: 'Rahul Joshi (Pending)', phone: '+91 98765 43299', status: 'pending' },
    };

    if (emailToRoleMap[emailLower] && loginPassword === 'password123') {
      const mapped = emailToRoleMap[emailLower];
      let found = list.find(u => u.phone === mapped.phone);
      if (!found) {
        found = {
          id: `user_${Date.now()}`,
          role: mapped.role,
          name: mapped.name,
          phone: mapped.phone,
          status: mapped.status,
          avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150'
        };
        DbManager.addUser(found);
      }
      
      // Phase 05: this email/password check is entirely client-side
      // (hardcoded demo credentials, no real auth backend) — tag it so
      // authz.ts can withhold high-risk permissions from it.
      setCurrentUser({ ...found, isDemo: false, authMethod: 'password_unverified' });
      if (rememberMe) {
        localStorage.setItem('aiec_session_token', `session_${found.id}`);
        localStorage.setItem('aiec_last_role_used', found.role);
      }
      logLaunchAnalytics(found.role);
      setActiveTab('Home');
    } else {
      setErrorMsg('Invalid email or password. Use email fallback (e.g. admin@aiec.com / password123)');
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg('');
    if (!auth) {
      setErrorMsg('Firebase Authentication is not initialized. Please configure/deploy properly.');
      return;
    }
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const firebaseUser = result.user;
      
      if (!firebaseUser) {
        throw new Error('No user credentials returned from Google Sign-In.');
      }

      // Real sign-ins resolve their identity against Firestore (users/{uid}), not the
      // local demo array, so the account and its role survive a refresh or new session.
      const found = await getOrCreateFirestoreUser(firebaseUser);

      // Mirror into the local array too, so this session's admin/staff views
      // (which still read DbManager.getUsers()) can see this real user.
      // Phase 05: this is the ONE login path backed by a real,
      // server-verifiable Firebase Auth ID token — authz.ts's high-risk
      // permission gate keys off exactly this value.
      const mirroredUser: User = { ...found, isDemo: false, authMethod: 'firebase_auth' };
      const localList = DbManager.getUsers();
      if (!localList.find(u => u.id === mirroredUser.id)) {
        DbManager.addUser(mirroredUser);
      } else {
        DbManager.updateUser(mirroredUser);
      }

      setCurrentUser(mirroredUser);
      if (rememberMe) {
        localStorage.setItem('aiec_session_token', `session_${found.id}`);
        localStorage.setItem('aiec_last_role_used', found.role);
      }
      logLaunchAnalytics(found.role);
      setActiveTab('Home');
    } catch (error: any) {
      console.error('Google Sign-In Error:', error);
      if (error.code === 'auth/popup-blocked') {
        setErrorMsg('Sign-In popup was blocked by your browser. Please enable popups and try again.');
      } else if (error.code === 'auth/unauthorized-domain') {
        setErrorMsg('This domain is not authorized for Google Sign-In in Firebase Console.');
      } else {
        setErrorMsg(error.message || 'An error occurred during Google Sign-In.');
      }
    }
  };

  const handleDemoBypass = (role: UserRole) => {
    const list = DbManager.getUsers();
    const found = list.find(u => u.role === role) || list[0];
    
    // Create flagged demo session with active status and completed onboarding
    const demoUser: User = {
      ...found,
      status: 'active',
      onboardingCompleted: true,
      primer_shown_flag: true,
      isDemo: true,
      authMethod: 'demo'
    };
    setCurrentUser(demoUser);
    setShowCarousel(false);
    localStorage.setItem('aiec_first_launch_flag', 'false');
    
    // Demo mode bypass has no persistent session token saved
    localStorage.setItem('aiec_last_role_used', role);
    logLaunchAnalytics(`${role}_demo`);
    setActiveTab('Home');
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('aiec_session_token');
    localStorage.removeItem('aiec_last_role_used');
    setOtpSent(false);
    setLoginPhone('');
    setOtpCode('');
    setShowMobileMoreMenu(false);
    setMobileNavSearch('');
    setOtp6Digits(Array(6).fill(''));
    setLoginEmail('');
    setLoginPassword('');
    setErrorMsg('');
    setOtpAttempts(0);
    setActiveTab('Home');
  };

  const handleOtpDigitChange = (index: number, val: string) => {
    const sanitized = val.replace(/\D/g, '').slice(-1);
    const updated = [...otp6Digits];
    updated[index] = sanitized;
    setOtp6Digits(updated);

    // Auto-advance Focus if character was typed
    if (sanitized && index < 5) {
      const nextInput = document.getElementById(`otp-input-${index + 1}`);
      if (nextInput) (nextInput as HTMLInputElement).focus();
    }

    // Auto-verify the instant all 6 digits are filled
    const fullCode = updated.join('');
    if (fullCode.length === 6) {
      triggerInstantVerification(fullCode);
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!otp6Digits[index] && index > 0) {
        const prevInput = document.getElementById(`otp-input-${index - 1}`);
        if (prevInput) {
          (prevInput as HTMLInputElement).focus();
          const updated = [...otp6Digits];
          updated[index - 1] = '';
          setOtp6Digits(updated);
        }
      } else {
        const updated = [...otp6Digits];
        updated[index] = '';
        setOtp6Digits(updated);
      }
    }
  };

  const renderPreferencesSection = () => {
    return (
      <div className="space-y-4 text-left border-t border-[rgba(184,135,61,0.15)] pt-4 mt-4">
        <div>
          <h4 className="font-serif text-sm font-bold text-charcoal">App Display Preferences / डिस्प्ले प्राथमिकताएं</h4>
          <p className="text-[10px] text-warmgray">Customize your language and theme modes. Changes save instantly to your secure profile.</p>
        </div>
        
        {/* Language Selection */}
        <div className="space-y-2">
          <label className="text-[10px] uppercase font-mono font-bold text-antiquegold flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5" />
            <span>Preferred Language / भाषा पसंद</span>
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(['en', 'hi', 'mr'] as const).map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => setAppLanguage(lang)}
                className={`py-2 px-3 text-xs font-bold rounded-xl border cursor-pointer transition-all ${
                  appLanguage === lang
                    ? 'bg-antiquegold border-antiquegold text-white shadow-xs font-extrabold'
                    : 'bg-white border-[rgba(184,135,61,0.15)] text-charcoal hover:bg-alabaster'
                }`}
              >
                {lang === 'en' ? '🇬🇧 English' : lang === 'hi' ? '🇮🇳 हिंदी' : '🇮🇳 मराठी'}
              </button>
            ))}
          </div>
        </div>

        {/* Theme Selection */}
        <div className="space-y-2">
          <label className="text-[10px] uppercase font-mono font-bold text-antiquegold flex items-center gap-1.5">
            <Settings className="w-3.5 h-3.5" />
            <span>Visual Theme Mode / थीम मोड</span>
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(['light', 'snow', 'dark', 'system'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setAppTheme(mode)}
                className={`py-2 px-1 text-center text-xs font-bold rounded-xl border cursor-pointer transition-all capitalize ${
                  appTheme === mode
                    ? 'bg-antiquegold border-antiquegold text-white shadow-xs font-extrabold'
                    : 'bg-white border-[rgba(184,135,61,0.15)] text-charcoal hover:bg-alabaster'
                }`}
              >
                {mode === 'light' ? '🎨 Alabaster' : mode === 'snow' ? '⚪ Snow White' : mode === 'dark' ? '🌑 Dark' : '💻 System'}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // Sidebar / bottom tab items per role
  const getTabsByRole = (role: UserRole) => {
    switch (role) {
      case 'admin':
        return [
          { id: 'Home', label: 'Overview', icon: LayoutDashboard },
          { id: 'CustomerHomeDashboard', label: 'Customer Portal 🏠', icon: Building },
          { id: 'ProjectStatusTracker', label: 'Project Status Tracker ⏱️', icon: Clock },
          { id: 'LeadInbox', label: 'Lead Inbox 📥', icon: FileText },
          { id: 'LeadPipeline', label: 'Lead Kanban 📋', icon: Layers },
          { id: 'LeadAssignment', label: 'Lead Assignment 📋', icon: Users },
          { id: 'LeadMerge', label: 'Merge Studio ⛓️', icon: Split },
          { id: 'LeadScoring', label: 'Lead Scoring 📈', icon: Award },
          { id: 'LeadFollowUp', label: 'Follow-Ups 📅', icon: Calendar },
          { id: 'LeadSource', label: 'Source & Campaigns 📊', icon: TrendingUp },
          { id: 'LeadLost', label: 'Disqualify Lead 🚨', icon: AlertCircle },
          { id: 'LeadMigrate', label: 'Bulk Import/Export 📊', icon: FileSpreadsheet },
          { id: 'CommTemplates', label: 'Comm Templates 💬', icon: MessageSquare },
          { id: 'CommSequences', label: 'Comm Sequences ⚙️', icon: GitMerge },
          { id: 'CommWhatsApp', label: 'WhatsApp Console 💬', icon: MessageSquare },
          { id: 'CommCalls', label: 'Auto-Dialer & Logs 📞', icon: Phone },
          { id: 'CommSMS', label: 'SMS Broadcast ✉️', icon: Send },
          { id: 'CommBot', label: 'AI Bot Config 🤖', icon: Bot },
          { id: 'CommInbox', label: 'Reply Inbox 📥', icon: Inbox },
          { id: 'CommCompliance', label: 'Compliance & DND 🛡️', icon: Shield },
          { id: 'CommRules', label: 'Stage Trigger Rules ⚙️', icon: Settings },
          { id: 'CommAnalytics', label: 'Comm Analytics 📊', icon: LineChart },
          { id: 'QuoteSpecs', label: 'Quotation Specs ⚙️', icon: FileText },
          { id: 'QuotePricing', label: 'Cost & Profit 💰', icon: DollarSign },
          { id: 'QuoteBranding', label: 'Quote Branding 🎨', icon: Palette },
          { id: 'QuotePreview', label: 'Quote Preview 👁️', icon: Eye },
          { id: 'QuoteCompare', label: 'Quote Compare ⚖️', icon: Split },
          { id: 'QuoteHistory', label: 'Quote History ⏳', icon: History },
          { id: 'QuoteDiscount', label: 'Discount Control 🏷️', icon: Percent },
          { id: 'QuoteDelivery', label: 'E-Delivery Hub 📨', icon: Send },
          { id: 'QuoteAnalytics', label: 'Quote Win/Loss 📈', icon: LineChart },
          { id: 'QuotePricingRules', label: 'Pricing & Margin ⚙️', icon: Sliders },
          { id: 'QuoteNegotiationBot', label: 'Negotiation Bot 🤖', icon: Bot },
          { id: 'QuoteNegotiationThread', label: 'Live Thread 💬', icon: MessageSquare },
          { id: 'QuoteCounterOfferApproval', label: 'Counter Approvals ⚖️', icon: Sliders },
          { id: 'QuoteDealTermsFinalization', label: 'Deal Finalization 🤝', icon: Landmark },
          { id: 'QuoteDigitalContract', label: 'Contract Generator 📄', icon: FileText },
          { id: 'QuoteESignature', label: 'E-Sign Capture ✍️', icon: FileText },
          { id: 'QuoteDealClosure', label: 'Deal Closure 🏆', icon: Award },
          { id: 'QuoteObjectionHandling', label: 'Objection Library 💡', icon: HelpCircle },
          { id: 'QuoteCompetitorBattlecard', label: 'Competitor Battlecards ⚔️', icon: ShieldCheck },
          { id: 'QuoteDealWonCelebration', label: 'Win Celebration 🏆', icon: Award },
          { id: 'PaymentStageScheduleSetup', label: 'Payment Schedule 💳', icon: DollarSign },
          { id: 'PaymentCollectionDashboard', label: 'Payment Collection 💰', icon: CreditCard },
          { id: 'PaymentReminderConfig', label: 'Reminder Rules ⚙️', icon: SlidersHorizontal },
          { id: 'OnlinePaymentCheckout', label: 'Digital Checkout 💳', icon: Lock },
          { id: 'LoanEmiApplication', label: 'Loan & EMI Application 🏦', icon: Landmark },
          { id: 'LoanPartnerIntegration', label: 'Loan Desk & Reconciliation 🤝', icon: Landmark },
          { id: 'InvoiceGenerator', label: 'Invoices & Credit Notes 📄', icon: FileText },
          { id: 'PaymentReceiptHistory', label: 'Payment Ledger & Receipts 🧾', icon: History },
          { id: 'OverduePaymentEscalation', label: 'Overdue Escalations 🚨', icon: AlertTriangle },
          { id: 'RefundDisputeManagement', label: 'Disputes & Refunds 🛡️', icon: ShieldCheck },
          { id: 'LiveMap', label: 'Live Operations', icon: MapPin },
          { id: 'RouteOpt', label: 'Route Match 🗺️', icon: Compass },
          { id: 'SOSDesk', label: 'SOS Desk 🚨', icon: AlertTriangle },
          { id: 'LiveFeed', label: 'Live Feed', icon: Activity },
          { id: 'SurveyorAudit', label: 'Surveyor Audit', icon: Compass },
          { id: 'TechnicianAudit', label: 'Technician Audit', icon: Hammer },
          { id: 'Territories', label: 'Territory Control', icon: Globe },
          { id: 'Heatmap', label: 'Lead Heatmap', icon: Flame },
          { id: 'SiteVerify', label: 'Geo-Verification', icon: Shield },
          { id: 'Funnel', label: 'Sales Funnel', icon: TrendingUp },
          { id: 'RevenueProfit', label: 'Revenue & Profit', icon: LineChart },
          { id: 'FinancialCashFlow', label: 'Cash Flow & Aging 💵', icon: Landmark },
          { id: 'AlertsExceptions', label: 'Exceptions & Alerts ⚠️', icon: AlertTriangle },
          { id: 'CustomReport', label: 'Custom Report Builder 📊', icon: FileText },
          { id: 'Leaderboard', label: 'Worker Leaderboard 🏆', icon: Award },
          { id: 'Conversion', label: 'Region Conversions 📈', icon: Grid },
          { id: 'SupplierScorecard', label: 'Supplier SLA 🏆', icon: Truck },
          { id: 'SupplierDirectory', label: 'Supplier Directory 🏢', icon: Building },
          { id: 'SupplierCatalogPricing', label: 'Supplier Catalog 🏷️', icon: Tag },
          { id: 'PurchaseOrderGenerator', label: 'PO Generator 📦', icon: FileText },
          { id: 'AutoPoTriggerRules', label: 'Auto-PO Rules ⚙️', icon: Sliders },
          { id: 'SupplierOrderStatusTracking', label: 'PO Tracking 🚚', icon: Truck },
          { id: 'ManufacturerProductionStatus', label: 'Production Status 🏭', icon: Hammer },
          { id: 'SupplierRatingScorecard', label: 'Supplier Scorecards 🏆', icon: Award },
          { id: 'SupplierContractSla', label: 'Contract & SLA 📄', icon: Shield },
          { id: 'SupplierCommThreads', label: 'Supplier Threads 💬', icon: MessageSquare },
          { id: 'SupplierPaymentTerms', label: 'Payment Terms Config 💳', icon: DollarSign },
          { id: 'DeliveryScheduling', label: 'Delivery Scheduling 📅', icon: Calendar },
          { id: 'LiveShipmentTracking', label: 'Shipment GPS Tracking 🚚', icon: MapPin },
          { id: 'SiteDeliveryChecklist', label: 'Delivery Checklist 📋', icon: ClipboardCheck },
          { id: 'MaterialReceivedConfirmation', label: 'Material Receipt Sign-off ✍️', icon: FileCheck },
          { id: 'DeliveryDelayAlerts', label: 'Delivery Delay Alerts ⚠️', icon: AlertTriangle },
          { id: 'StockInTransit', label: 'Stock in Transit 📦', icon: Layers },
          { id: 'DeliverySopConfig', label: 'Delivery SOP Config ⚙️', icon: FileText },
          { id: 'DamagedMissingPartsReport', label: 'Damaged/Missing Parts ⚠️', icon: AlertTriangle },
          { id: 'DeliveryPartnerManagement', label: 'Delivery Partners 🚚', icon: Truck },
          { id: 'DeliveryAnalytics', label: 'Delivery Analytics 📊', icon: BarChart2 },
          { id: 'SupplierPaymentApproval', label: 'Supplier Payment Queue 💳', icon: DollarSign },
          { id: 'MilestonePaymentRelease', label: 'Milestone Release Chain ⛓️', icon: Layers },
          { id: 'SupplierInvoiceMatching', label: '3-Way Invoice Matching 📑', icon: FileCheck },
          { id: 'SupplierPaymentSchedule', label: 'Outflow Payment Schedule 📅', icon: Calendar },
          { id: 'SupplierPaymentHistory', label: 'Supplier Payment Ledger 📜', icon: History },
          { id: 'TaxGstCompliance', label: 'Tax/GST Reconciliation 📑', icon: Percent },
          { id: 'SupplierDisputeResolution', label: 'Supplier Dispute Desk ⚖️', icon: Scale },
          { id: 'AdvancePaymentRetention', label: 'Advances & Retentions 🔒', icon: Lock },
          { id: 'SupplierPaymentAnalytics', label: 'Payment Analytics 📊', icon: BarChart2 },
          { id: 'AutoReconciliation', label: 'Bank Auto-Reconciliation 🏦', icon: CheckCircle2 },
          { id: 'TechnicianHomeMyJobs', label: 'Technician Jobs Hub 🧰', icon: Wrench },
          { id: 'JobDetailSiteInfo', label: 'Job Site Specs 🔍', icon: Eye },
          { id: 'InstallationSopChecklist', label: 'Installation SOP Checklist 🔨', icon: Hammer },
          { id: 'PhotoVideoEvidenceCapture', label: 'Media Evidence Gallery 📸', icon: Camera },
          { id: 'TechnicianCheckInCheckOut', label: 'Technician Site GPS Check-In 📍', icon: MapPin },
          { id: 'SafetyComplianceChecklist', label: 'Safety Compliance Checklist 🛡️', icon: ShieldCheck },
          { id: 'IssueBlockerReporting', label: 'Issue & Blocker Reports 🚨', icon: AlertTriangle },
          { id: 'MaterialUsageLogging', label: 'Material Usage Logging 📋', icon: ClipboardList },
          { id: 'AutomationHealth', label: 'Automation Health ⚙️', icon: Cpu },
          { id: 'MasterAutomationRulesDashboard', label: 'Master Automation Rules ⚡', icon: Zap },
          { id: 'WorkflowTriggerBuilder', label: 'Workflow Trigger Builder 🛠️', icon: Sliders },
          { id: 'NotificationTemplatesChannels', label: 'Notification Channels 🔔', icon: Bell },
          { id: 'EscalationMatrixConfig', label: 'Escalation Matrix ⛓️', icon: GitCommit },
          { id: 'SlaTimerBreachAlert', label: 'SLA Timers & Breaches ⏱️', icon: Clock },
          { id: 'SystemHealthBotMonitoring', label: 'System Health & Bots 💻', icon: Cpu },
          { id: 'AuditLogAutomatedActions', label: 'Automation Audit Log 📜', icon: FileText },
          { id: 'ManualOverrideConsole', label: 'Manual Override Console 🎛️', icon: Sliders },
          { id: 'CompanyProfileBrandingSettings', label: 'Company Profile & Branding 🏢', icon: Building },
          { id: 'UserRolePermissionManagement', label: 'User Roles & Permissions 🛡️', icon: Shield },
          { id: 'SinglePersonMonitorControlPanel', label: 'Single-Person Monitor 🎛️', icon: Activity },
          { id: 'DataPrivacyConsentManagement', label: 'Data Privacy & Consent 🔒', icon: Lock },
          { id: 'SecuritySessionManagement', label: 'Security & Active Sessions 🛡️', icon: Shield },
          { id: 'BackupDataExport', label: 'Backup & Data Export 💾', icon: Database },
          { id: 'SaaSOpsSubscriptionBilling', label: 'SaaS Ops & Billing 💳', icon: CreditCard },
          { id: 'LegalContractTemplatesRepository', label: 'Legal Templates Repository ⚖️', icon: Scale },
          { id: 'HelpFaqSupport', label: 'Help & Support Desk ❓', icon: HelpCircle },
          { id: 'AppVersionChangelogFeedback', label: 'App Version & Changelog 📱', icon: Info },
          { id: 'Partners', label: 'Directory', icon: Users },
          { id: 'Settings', label: 'Control Unit', icon: Settings }
        ];
      case 'surveyor':
        return [
          { id: 'Home', label: 'Capture Portal', icon: Building },
          { id: 'LeadFollowUp', label: 'Follow-Ups 📅', icon: Calendar },
          { id: 'Incentives', label: 'History', icon: Users },
          { id: 'Settings', label: 'Settings', icon: Settings }
        ];
      case 'technician':
        return [
          { id: 'TechnicianHomeMyJobs', label: 'My Assigned Jobs 🧰', icon: Wrench },
          { id: 'JobDetailSiteInfo', label: 'Site Specs & Materials 🔍', icon: Eye },
          { id: 'InstallationSopChecklist', label: 'Installation SOP Checklist 🔨', icon: Hammer },
          { id: 'PhotoVideoEvidenceCapture', label: 'Media Evidence Gallery 📸', icon: Camera },
          { id: 'TechnicianCheckInCheckOut', label: 'Site Check-In / Out 📍', icon: MapPin },
          { id: 'SafetyComplianceChecklist', label: 'Safety Compliance Checklist 🛡️', icon: ShieldCheck },
          { id: 'IssueBlockerReporting', label: 'Issue & Blocker Reports 🚨', icon: AlertTriangle },
          { id: 'MaterialUsageLogging', label: 'Material Usage Logging 📋', icon: ClipboardList },
          { id: 'LiveShipmentTracking', label: 'Shipment GPS Tracking 🚚', icon: MapPin },
          { id: 'SiteDeliveryChecklist', label: 'Site Unboxing Checklist 📋', icon: ClipboardCheck },
          { id: 'MaterialReceivedConfirmation', label: 'Material Receipt Sign-off ✍️', icon: FileCheck },
          { id: 'DamagedMissingPartsReport', label: 'Report Damaged/Missing Parts 🚨', icon: AlertTriangle },
          { id: 'Settings', label: 'Settings', icon: Settings }
        ];
      case 'customer':
        return [
          { id: 'CustomerHomeDashboard', label: 'Customer Home 🏠', icon: Building },
          { id: 'ProjectStatusTracker', label: 'Installation Tracker ⏱️', icon: Clock },
          { id: 'CustomerDocumentVault', label: 'Document Vault 📁', icon: FileText },
          { id: 'CustomerPaymentInstallments', label: 'Payments & Installments 💳', icon: CreditCard },
          { id: 'CustomerSupportTicket', label: 'Support Desk & SOS 🧰', icon: Wrench },
          { id: 'CustomerLiveSupportChat', label: 'Live Support Chat 💬', icon: MessageSquare },
          { id: 'CustomerAmcBooking', label: 'AMC & Maintenance Booking 📅', icon: Calendar },
          { id: 'CustomerFeedbackRating', label: 'Ratings & Review ⭐', icon: Award },
          { id: 'CustomerReferralProgram', label: 'Referral & Rewards 🎁', icon: Gift },
          { id: 'CustomerNotificationCenter', label: 'Notification Center 🔔', icon: Bell },
          { id: 'LiveShipmentTracking', label: 'Track My Delivery 🚚', icon: MapPin },
          { id: 'MaterialReceivedConfirmation', label: 'Material Receipt Sign-off ✍️', icon: FileCheck },
          { id: 'OnlinePaymentCheckout', label: 'Digital Checkout 💳', icon: Lock },
          { id: 'InvoiceGenerator', label: 'Tax Invoices 📄', icon: FileText },
          { id: 'QuotePreview', label: 'My Quotation 👁️', icon: Eye },
          { id: 'QuoteNegotiationThread', label: 'Live Negotiation 💬', icon: MessageSquare },
          { id: 'Settings', label: 'Preferences', icon: Settings }
        ];

      case 'supplier':
        return [
          { id: 'Home', label: 'Catalog Engine', icon: Truck },
          { id: 'SupplierDirectory', label: 'Supplier Directory 🏢', icon: Building },
          { id: 'SupplierCatalogPricing', label: 'Catalog & Pricing 🏷️', icon: Tag },
          { id: 'PurchaseOrderGenerator', label: 'Purchase Orders 📦', icon: FileText },
          { id: 'SupplierOrderStatusTracking', label: 'PO Tracking 🚚', icon: Truck },
          { id: 'ManufacturerProductionStatus', label: 'Production Status 🏭', icon: Hammer },
          { id: 'SupplierRatingScorecard', label: 'Quality Scorecard 🏆', icon: Award },
          { id: 'SupplierContractSla', label: 'SLA Agreement 📄', icon: Shield },
          { id: 'SupplierCommThreads', label: 'Supplier Threads 💬', icon: MessageSquare },
          { id: 'SupplierPaymentTerms', label: 'Payment Terms 💳', icon: DollarSign },
          { id: 'SupplierInvoiceMatching', label: 'Upload Tax Invoices 📑', icon: FileCheck },
          { id: 'SupplierPaymentHistory', label: 'My Payment Ledger 📜', icon: History },
          { id: 'SupplierDisputeResolution', label: 'Payment Dispute Desk ⚖️', icon: Scale },
          { id: 'DeliveryScheduling', label: 'Delivery Scheduling 📅', icon: Calendar },
          { id: 'LiveShipmentTracking', label: 'Shipment GPS Tracking 🚚', icon: MapPin },
          { id: 'Settings', label: 'Settings', icon: Settings }
        ];

      default:
        return [{ id: 'Home', label: 'Overview', icon: LayoutDashboard }];
    }
  };

  // Localized nav labels, shared by the desktop sidebar, mobile bottom nav and mobile "More" menu
  const TAB_LABEL_OVERRIDES: Record<string, { en: string; mr: string; hi: string }> = {
    Home: { en: 'Overview', mr: 'मुख्य डॅशबोर्ड', hi: 'मुख्य डैशबोर्ड' },
    LeadAssignment: { en: 'Lead Assignment', mr: 'लीड वाटप', hi: 'लीड असाइनमेंट' },
    LeadMerge: { en: 'Merge Studio ⛓️', mr: 'विलीनीकरण स्टुडिओ ⛓️', hi: 'विलय स्टूडियो ⛓️' },
    LeadScoring: { en: 'Lead Scoring 📈', mr: 'लीड स्कोअरिंग 📈', hi: 'लीड स्कोरिंग 📈' },
    LeadFollowUp: { en: 'Follow-Ups 📅', mr: 'फॉलो-अप नियोजक 📅', hi: 'फॉलो-अप शेड्यूल 📅' },
    LeadSource: { en: 'Source & Campaigns 📊', mr: 'स्त्रोत व मोहीम 📊', hi: 'स्रोत व अभियान 📊' },
    LeadLost: { en: 'Disqualify Lead 🚨', mr: 'अयोग्य नियुक्त 🚨', hi: 'अयोग्य घोषित 🚨' },
    LeadMigrate: { en: 'Bulk Import/Export 📊', mr: 'थोक आयात/निर्यात 📊', hi: 'थोक आयात/निर्यात 📊' },
    CommTemplates: { en: 'Comm Templates 💬', mr: 'संप्रेषण टेम्पलेट्स 💬', hi: 'संचार टेम्प्लेट 💬' },
    CommSequences: { en: 'Comm Sequences ⚙️', mr: 'संप्रेषण अनुक्रम ⚙️', hi: 'संचार अनुक्रम ⚙️' },
    CommWhatsApp: { en: 'WhatsApp Console 💬', mr: 'व्हॉट्सॲप कन्सोल 💬', hi: 'व्हाट्सएप कंसोल 💬' },
    CommCalls: { en: 'Auto-Dialer & Logs 📞', mr: 'ऑटो-डायल व लॉग्स 📞', hi: 'ऑटो-डायलिर व लॉग्स 📞' },
    CommSMS: { en: 'SMS Broadcast ✉️', mr: 'एसएमएस ब्रॉडकास्ट ✉️', hi: 'एसएमएस प्रसारण ✉️' },
    CommBot: { en: 'AI Bot Config 🤖', mr: 'एआय बोट सेटिंग्स 🤖', hi: 'एआई बोट सेटिंग्स 🤖' },
    CommInbox: { en: 'Reply Inbox 📥', mr: 'उत्तर इनबॉक्स 📥', hi: 'उत्तर इनबॉक्स 📥' },
    CommCompliance: { en: 'Compliance & DND 🛡️', mr: 'अनुपालन आणि डीएनडी 🛡️', hi: 'अनुपालन और डीएनडी 🛡️' },
    QuotePreview: { en: 'Quote Preview 👁️', mr: 'कोट पूर्वावलोकन 👁️', hi: 'कोट पूर्वावलोकन 👁️' },
    QuoteCompare: { en: 'Compare Packages ⚖️', mr: 'पॅकेज तुलना ⚖️', hi: 'पैकेज तुलना ⚖️' },
    QuoteHistory: { en: 'Quote History ⏳', mr: 'आवृत्ती इतिहास ⏳', hi: 'संस्करण इतिहास ⏳' },
    QuoteDiscount: { en: 'Discount Approval 🏷️', mr: 'सवलत आणि मंजुरी 🏷️', hi: 'छूट और अनुमोदन 🏷️' },
    QuoteDelivery: { en: 'E-Delivery Hub 📨', mr: 'ई-वितरण केंद्र 📨', hi: 'ई-वितरण केंद्र 📨' },
    QuoteAnalytics: { en: 'Quote Win/Loss 📈', mr: 'कोटेशन विश्लेषण 📈', hi: 'कोटेशन विश्लेषण 📈' },
    QuotePricingRules: { en: 'Pricing & Margin ⚙️', mr: 'किंमत आणि नफा ⚙️', hi: 'मूल्य और मार्जिन ⚙️' },
    QuoteNegotiationBot: { en: 'Negotiation Bot 🤖', mr: 'ऑटो-नेगोशिएशन बॉट 🤖', hi: 'ऑटो-नेगोशिएशन बोट 🤖' },
    QuoteNegotiationThread: { en: 'Live Negotiation 💬', mr: 'थेट संभाषण 💬', hi: 'लाइव बातचीत 💬' },
    QuoteCounterOfferApproval: { en: 'Counter Approvals ⚖️', mr: 'काउंटर मंजुरी ⚖️', hi: 'काउंटर स्वीकृतियां ⚖️' },
    QuoteDealTermsFinalization: { en: 'Deal Finalization 🤝', mr: 'करार निश्चिती 🤝', hi: 'सौदा फाइनल 🤝' },
    QuoteDigitalContract: { en: 'Contract Generator 📄', mr: 'करारनामा निर्माता 📄', hi: 'अनुबंध जनरेटर 📄' },
    QuoteESignature: { en: 'E-Sign Capture ✍️', mr: 'ई-स्वाक्षरी रेकॉर्ड ✍️', hi: 'ई-हस्ताक्षर कैप्चर ✍️' },
    QuoteDealClosure: { en: 'Deal Closure 🏆', mr: 'सौदा समाप्ती घोषणा 🏆', hi: 'सौदा बंद पुष्टिकरण 🏆' },
    CommRules: { en: 'Stage Trigger Rules ⚙️', mr: 'स्टेज ट्रिगर नियम ⚙️', hi: 'स्टेज ट्रिगर नियम ⚙️' },
    CommAnalytics: { en: 'Comm Analytics 📊', mr: 'संप्रेषण विश्लेषण 📊', hi: 'संचार विश्लेषण 📊' },
    QuoteSpecs: { en: 'Quotation Specs ⚙️', mr: 'कोटेशन तपशील ⚙️', hi: 'कोटेशन विनिर्देश ⚙️' },
    QuotePricing: { en: 'Cost & Profit 💰', mr: 'खर्च आणि नफा 💰', hi: 'लागत और लाभ 💰' },
    QuoteBranding: { en: 'Quote Branding 🎨', mr: 'कोट ब्रँडिंग 🎨', hi: 'कोट ब्रांडिंग 🎨' },
    LiveMap: { en: 'Live Operations', mr: 'थेट ऑपरेशन्स', hi: 'लाइव संचालन' },
    RouteOpt: { en: 'Route Match 🗺️', mr: 'मार्ग जुळणी 🗺️', hi: 'रूट मैच 🗺️' },
    SOSDesk: { en: 'SOS Desk 🚨', mr: 'तात्काळ डेस्क 🚨', hi: 'आपातकालीन डेस्क 🚨' },
    LiveFeed: { en: 'Live Feed', mr: 'थेट फीड', hi: 'लाइव फीड' },
    SurveyorAudit: { en: 'Surveyor Audit', mr: 'सर्वेक्षक ऑडिट', hi: 'सर्वेक्षक ऑडिट' },
    TechnicianAudit: { en: 'Technician Audit', mr: 'तंत्रज्ञ ऑडिट', hi: 'तकनीशियन ऑडिट' },
    Territories: { en: 'Territory Control', mr: 'प्रदेश नियंत्रण', hi: 'क्षेत्र नियंत्रण' },
    Heatmap: { en: 'Lead Heatmap', mr: 'लीड हीटमॅप', hi: 'लीड हीटमैप' },
    SiteVerify: { en: 'Geo-Verification', mr: 'भू-पडताळणी', hi: 'भू-सत्यापन' },
    Funnel: { en: 'Sales Funnel', mr: 'विक्री फनेल', hi: 'बिक्री फ़नल' },
    RevenueProfit: { en: 'Revenue & Profit', mr: 'महसूल आणि नफा', hi: 'राजस्व और लाभ' },
    FinancialCashFlow: { en: 'Cash Flow & Aging 💵', mr: 'रोख प्रवाह आणि थकीत 💵', hi: 'नकदी प्रवाह व येन 💵' },
    AlertsExceptions: { en: 'Exceptions & Alerts ⚠️', mr: 'अलर्ट आणि अपवाद ⚠️', hi: 'अलर्ट और अपवाद ⚠️' },
    CustomReport: { en: 'Custom Report Builder 📊', mr: 'अहवाल निर्माता 📊', hi: 'रिपोर्ट निर्माता 📊' },
    Leaderboard: { en: 'Worker Leaderboard 🏆', mr: 'कामगिरी रँकिंग 🏆', hi: 'प्रदर्शन सूचकांक 🏆' },
    Conversion: { en: 'Region Conversions 📈', mr: 'प्रदेश रूपांतरण 📈', hi: 'क्षेत्र रूपांतरण 📈' },
    SupplierScorecard: { en: 'Supplier SLA 🏆', mr: 'विक्रेता कामगिरी 🏆', hi: 'आपूर्तिकर्ता स्कोरकार्ड 🏆' },
    AutomationHealth: { en: 'Automation Health ⚙️', mr: 'स्वयंचलित प्रणाली ⚙️', hi: 'स्वचालन नियंत्रण ⚙️' },
    Partners: { en: 'Directory', mr: 'भागीदार निर्देशिका', hi: 'भागीदार निर्देशिका' },
    Settings: { en: 'Control Unit', mr: 'नियंत्रण युनिट', hi: 'नियंत्रण इकाई' },
  };

  const getTabLabel = (tab: { id: string; label: string }): string => {
    const override = TAB_LABEL_OVERRIDES[tab.id];
    if (!override) return tab.label;
    return override[appLanguage] || override.en;
  };

  return (
    <div className="min-h-screen bg-alabaster flex flex-col font-sans select-none selection:bg-antiquegold/30 antialiased relative">
      <AnimatePresence>
        {/* =========================================================
            SPLASH INTRO SCREEN
            ========================================================= */}
        {showSplash && (
          <motion.div
            key="splash"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: "easeInOut" }}
            className="fixed inset-0 z-50 bg-[#F8F6F1] flex flex-col items-center justify-between p-8 text-charcoal"
          >
            {/* Top Empty Space for vertical rhythm */}
            <div className="h-10" />

            {/* Visual Anchor: Logo & Vertical Ascension Line Anim */}
            <div className="flex flex-col items-center justify-center space-y-8 max-w-sm w-full">
              {/* Animated Ascension Line Motif */}
              <div className="relative h-32 w-1 bg-[#e5dfd4] rounded-full overflow-hidden">
                <motion.div
                  className="absolute bottom-0 left-0 right-0 bg-antiquegold rounded-full"
                  initial={{ height: "0%" }}
                  animate={{ height: "100%" }}
                  transition={{ duration: 1.8, ease: "easeInOut" }}
                />
                
                {/* Floating Elevator Cabin indicator node */}
                <motion.div
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-royalemerald border border-antiquegold flex items-center justify-center shadow-md"
                  initial={{ y: 0, opacity: 0 }}
                  animate={{ y: [0, -128], opacity: [0, 1, 1, 1] }}
                  transition={{ duration: 1.8, ease: "easeInOut" }}
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                </motion.div>
              </div>

              {/* Wordmark Reveal */}
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.2, duration: 0.8, ease: "easeOut" }}
                className="text-center space-y-3"
              >
                <h1 className="font-serif text-3xl font-extrabold tracking-tight text-charcoal flex flex-col leading-none">
                  <span className="text-[10px] uppercase tracking-widest text-antiquegold font-extrabold mb-2 font-sans">ESTABLISHED 1994</span>
                  <span className="font-serif text-3xl tracking-wide font-black text-[#0E4B3D]">ALL INDIA</span>
                  <span className="font-serif text-2xl tracking-widest font-light text-[#B8873D]">ELEVATORS</span>
                </h1>
                <div className="h-[1px] w-16 bg-[#B8873D]/35 mx-auto" />
                <p className="text-xs font-semibold tracking-wider text-warmgray uppercase">Authorized Mobility Aggregator</p>
              </motion.div>
            </div>

            {/* Bottom Credit Line & Tagline (Fades in) */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.6, duration: 0.8 }}
              className="text-center space-y-1.5 pb-8"
            >
              <p className="text-[9px] uppercase tracking-widest font-extrabold text-warmgray">Owner & Director</p>
              <p className="font-serif text-sm font-extrabold text-[#0E4B3D]">Mr. Prashant Vasant Wable, Founder</p>
              <p className="text-[9px] font-mono text-[#B8873D]/80">ISO 9001:2015 Safety Certified • v1.0.1</p>
            </motion.div>
          </motion.div>
        )}

        {/* =========================================================
            MAIN LAYOUT & AUTH SHIELD / ONBOARDING CAROUSEL
            ========================================================= */}
        {!showSplash && (
          <motion.div
            key="main"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex-1 flex flex-col"
          >
            {showCarousel ? (
              /* =========================================================
                 3-CARD VALUE-PROP ONBOARDING CAROUSEL
                 ========================================================= */
              <div className="flex-1 flex items-center justify-center p-4 bg-[#F8F6F1]">
                <div className="w-full max-w-lg bg-white rounded-3xl border border-[rgba(184,135,61,0.18)] p-6 md:p-8 space-y-6 shadow-diffuse relative overflow-hidden">
                  
                  {/* Background Accents */}
                  <div className="absolute top-0 right-0 w-32 h-32 bg-royalemerald/5 rounded-full blur-3xl -z-10" />
                  <div className="absolute bottom-0 left-0 w-32 h-32 bg-antiquegold/5 rounded-full blur-3xl -z-10" />

                  {/* Header Steps */}
                  <div className="flex items-center justify-between border-b border-[#e5dfd4] pb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-royalemerald text-white flex items-center justify-center">
                        <Building className="w-4 h-4" />
                      </div>
                      <span className="font-serif text-sm font-bold text-charcoal">AIEC Onboarding</span>
                    </div>
                    <span className="text-xs font-mono text-antiquegold font-semibold">Step {carouselStep + 1} of 3</span>
                  </div>

                  {/* Onboarding Steps Visual Stage */}
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={carouselStep}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.3 }}
                      className="space-y-6 py-2"
                    >
                      {carouselStep === 0 && (
                        <div className="space-y-4">
                          <div className="w-14 h-14 bg-royalemerald/10 text-royalemerald rounded-2xl flex items-center justify-center mx-auto shadow-xs">
                            <MapPin className="w-7 h-7" />
                          </div>
                          <div className="text-center space-y-2">
                            <h3 className="font-serif text-lg font-bold text-charcoal">1. On-site GPS Lead Capture</h3>
                            <p className="text-xs text-warmgray leading-relaxed max-w-sm mx-auto">
                              Authorized field surveyors map high-rise structures, upload physical lift shaft dimensions, and automatically geo-locate with GPS grounding to protect territory.
                            </p>
                          </div>
                          <div className="p-3.5 bg-alabaster rounded-xl border border-[rgba(184,135,61,0.1)] text-center font-mono text-[10px] text-warmgray space-y-1">
                            <div className="flex justify-between text-charcoal font-semibold">
                              <span>GROUNDING INDEX</span>
                              <span className="text-success">CONNECTED</span>
                            </div>
                            <div className="flex justify-between">
                              <span>LATITUDE / LONGITUDE</span>
                              <span>18.5204° N, 73.8567° E (Pune HQ)</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {carouselStep === 1 && (
                        <div className="space-y-4">
                          <div className="w-14 h-14 bg-antiquegold/10 text-antiquegold rounded-2xl flex items-center justify-center mx-auto shadow-xs">
                            <Layers className="w-7 h-7" />
                          </div>
                          <div className="text-center space-y-2">
                            <h3 className="font-serif text-lg font-bold text-charcoal">2. Premium Cabin Customizer</h3>
                            <p className="text-xs text-warmgray leading-relaxed max-w-sm mx-auto">
                              Let clients specify high-efficiency drives, cabin capacities, and choose premium golden and glass wall finishes. Acceptances sync directly onto the Golden Ascension Line.
                            </p>
                          </div>
                          <div className="p-3.5 bg-alabaster rounded-xl border border-[rgba(184,135,61,0.1)] text-center font-mono text-[10px] text-warmgray space-y-1">
                            <div className="flex justify-between text-charcoal font-semibold">
                              <span>DESIGN PRESET</span>
                              <span className="text-antiquegold">EMPEROR GOLD</span>
                            </div>
                            <div className="flex justify-between">
                              <span>WALL PANELING</span>
                              <span>Mirror Finish Gold + Glass Clad</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {carouselStep === 2 && (
                        <div className="space-y-4">
                          <div className="w-14 h-14 bg-success/10 text-success rounded-2xl flex items-center justify-center mx-auto shadow-xs">
                            <Award className="w-7 h-7" />
                          </div>
                          <div className="text-center space-y-2">
                            <h3 className="font-serif text-lg font-bold text-charcoal">3. Floor-by-Floor SOP & Payouts</h3>
                            <p className="text-xs text-warmgray leading-relaxed max-w-sm mx-auto">
                              Installation partners check off structural safety milestones. Approved clearances trigger automatic commission releases and direct partner payouts instantly.
                            </p>
                          </div>
                          <div className="p-3.5 bg-alabaster rounded-xl border border-[rgba(184,135,61,0.1)] text-center font-mono text-[10px] text-warmgray space-y-1">
                            <div className="flex justify-between text-charcoal font-semibold">
                              <span>QC DISBURSEMENT</span>
                              <span className="text-success">COMPLETED</span>
                            </div>
                            <div className="flex justify-between">
                              <span>COM. RELEASE SCHEDULE</span>
                              <span>₹25,000 Surveyor Ledger Released</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>

                  {/* Progress dots & Actions */}
                  <div className="space-y-4 pt-2">
                    {/* Dots indicator */}
                    <div className="flex justify-center gap-2">
                      {[0, 1, 2].map((i) => (
                        <button
                          key={i}
                          onClick={() => setCarouselStep(i)}
                          className={`w-2.5 h-2.5 rounded-full transition-all cursor-pointer ${
                            carouselStep === i ? 'bg-antiquegold w-6' : 'bg-gray-300'
                          }`}
                        />
                      ))}
                    </div>

                    {/* CTA Buttons */}
                    <div className="flex gap-2">
                      {carouselStep > 0 && (
                        <Button
                          variant="secondary"
                          className="flex-1"
                          onClick={() => setCarouselStep(prev => prev - 1)}
                        >
                          Back
                        </Button>
                      )}
                      <Button
                        variant="primary"
                        className="flex-1"
                        onClick={() => {
                          if (carouselStep < 2) {
                            setCarouselStep(prev => prev + 1);
                          } else {
                            // Onboarding completed
                            localStorage.setItem('aiec_first_launch_flag', 'false');
                            setShowCarousel(false);
                            // Chain trigger What's New if the version was updated
                            const lastVersion = localStorage.getItem('aiec_app_version');
                            if (lastVersion !== '1.0.1') {
                              setShowWhatsNew(true);
                            }
                          }
                        }}
                      >
                        <span>{carouselStep === 2 ? 'Get Started & Sign In' : 'Continue'}</span>
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                </div>
              </div>
            ) : !currentUser ? (
              /* =========================================================
                 LOGIN SCREEN
                 ========================================================= */
              <div className="flex-1 flex flex-col md:flex-row items-center justify-center p-4 md:p-8 bg-[#F8F6F1] relative overflow-hidden">
                
                {/* Background decorative patterns */}
                <div className="absolute top-0 right-0 w-96 h-96 bg-[#0E4B3D]/5 rounded-full blur-3xl -z-10" />
                <div className="absolute bottom-0 left-0 w-96 h-96 bg-[#B8873D]/5 rounded-full blur-3xl -z-10" />

                {showForgotReset ? (
                  <ForgotPasswordReset onBackToLogin={() => setShowForgotReset(false)} />
                ) : (
                  <div className="w-full max-w-4xl flex flex-col md:flex-row items-stretch bg-white rounded-3xl border border-[rgba(184,135,61,0.18)] shadow-diffuse overflow-hidden">
                  
                  {/* Left Side: Brand Visual & The Ascension Line Elevator motif */}
                  <div className="w-full md:w-[40%] bg-[#D4AF37] text-[#231700] p-6 md:p-8 flex flex-col justify-between relative overflow-hidden shrink-0">
                    <div className="absolute inset-0 bg-gradient-to-br from-[#FFF5C6] via-[#D4AF37] to-[#8C6412] -z-10" />
                    
                    {/* The Ascension Line Elevator Rail Motif */}
                    <div className="absolute right-6 top-8 bottom-8 w-0.5 bg-gradient-to-b from-transparent via-[#231700]/30 to-transparent flex flex-col justify-between items-center py-8">
                      <div className="w-3.5 h-3.5 rounded-full bg-[#231700] ring-2 ring-white/40" />
                      <motion.div 
                        animate={{ y: [0, 160, 0] }}
                        transition={{ repeat: Infinity, duration: 5, ease: "easeInOut" }}
                        className="w-5 h-5 rounded-full bg-[#231700] ring-4 ring-[#231700]/20 shadow-lg flex items-center justify-center text-[8px] font-mono font-bold text-white"
                      >
                        ↑
                      </motion.div>
                      <div className="w-3.5 h-3.5 rounded-full bg-[#231700] ring-2 ring-white/40" />
                    </div>

                    <div className="space-y-6 max-w-[85%] text-left">
                      <div className="w-10 h-10 bg-[#231700]/10 text-[#231700] rounded-xl flex items-center justify-center border border-[#231700]/20">
                        <Building className="w-5 h-5 text-[#231700] stroke-[1.5]" />
                      </div>
                      <div className="space-y-2">
                        <h2 className="font-serif text-2xl font-bold tracking-tight text-[#231700] leading-tight">
                          {appTranslations[appLanguage].title}
                        </h2>
                        <p className="text-[10px] text-[#533900] uppercase tracking-widest font-mono font-bold">
                          {appTranslations[appLanguage].subtitle}
                        </p>
                      </div>
                      <p className="text-xs text-[#231700]/85 leading-relaxed font-sans">
                        {appTranslations[appLanguage].description}
                      </p>
                    </div>

                    <div className="pt-8 space-y-1 md:block hidden text-left">
                      <p className="text-[8px] uppercase tracking-wider text-[#231700]/60 font-mono">
                        {appTranslations[appLanguage].foundingDirector}
                      </p>
                      <p className="font-serif text-xs font-bold text-[#4E3400]">Mr. Prashant Vasant Wable</p>
                      <p className="text-[9px] text-[#231700]/50 font-mono">{appTranslations[appLanguage].hq}</p>
                    </div>
                  </div>

                  {/* Right Side: Tabbed Interface (Try Demo vs Secure Login) */}
                  <div className="flex-1 p-6 md:p-8 flex flex-col justify-between bg-white space-y-6 text-left">
                    <div className="space-y-4">
                      
                      {/* Language Switcher Bar - EXTREMELY VISIBLE AT THE VERY TOP */}
                      <div className="flex flex-col xs:flex-row justify-between items-start xs:items-center gap-2 bg-[#F8F6F1] p-3 rounded-2xl border border-[rgba(184,135,61,0.15)] shadow-inner">
                        <div className="flex items-center gap-1.5 text-[10px] font-mono font-extrabold text-[#B8873D]">
                          <Globe className="w-3.5 h-3.5" />
                          <span>{appTranslations[appLanguage].langLabel}</span>
                        </div>
                        <div className="flex gap-1 self-stretch xs:self-auto">
                          <button
                            type="button"
                            onClick={() => setAppLanguage('en')}
                            className={`flex-1 xs:flex-none px-2.5 py-1 text-[10px] font-bold rounded-lg cursor-pointer transition-all ${
                              appLanguage === 'en'
                                ? 'bg-[#B8873D] text-white font-extrabold shadow-sm'
                                : 'bg-white text-warmgray hover:text-charcoal border border-[rgba(184,135,61,0.1)]'
                            }`}
                          >
                            English
                          </button>
                          <button
                            type="button"
                            onClick={() => setAppLanguage('mr')}
                            className={`flex-1 xs:flex-none px-2.5 py-1 text-[10px] font-bold rounded-lg cursor-pointer transition-all ${
                              appLanguage === 'mr'
                                ? 'bg-[#B8873D] text-white font-extrabold shadow-sm'
                                : 'bg-white text-warmgray hover:text-charcoal border border-[rgba(184,135,61,0.1)]'
                            }`}
                          >
                            मराठी
                          </button>
                          <button
                            type="button"
                            onClick={() => setAppLanguage('hi')}
                            className={`flex-1 xs:flex-none px-2.5 py-1 text-[10px] font-bold rounded-lg cursor-pointer transition-all ${
                              appLanguage === 'hi'
                                ? 'bg-[#B8873D] text-white font-extrabold shadow-sm'
                                : 'bg-white text-warmgray hover:text-charcoal border border-[rgba(184,135,61,0.1)]'
                            }`}
                          >
                            हिन्दी
                          </button>
                        </div>
                      </div>

                      {/* Tabs at the Top */}
                      <div className="p-1 flex bg-[#F8F6F1] rounded-2xl border border-[rgba(184,135,61,0.1)]">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveAuthTab('demo');
                            setErrorMsg('');
                          }}
                          className={`flex-1 py-3 rounded-xl text-xs font-bold tracking-wider uppercase transition-all cursor-pointer ${
                            activeAuthTab === 'demo'
                              ? 'bg-white text-[#B8873D] shadow-xs border border-[rgba(184,135,61,0.12)]'
                              : 'text-warmgray hover:text-charcoal'
                          }`}
                        >
                          {appTranslations[appLanguage].tryDemoMode}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveAuthTab('phone');
                            setErrorMsg('');
                          }}
                          className={`flex-1 py-3 rounded-xl text-xs font-bold tracking-wider uppercase transition-all cursor-pointer ${
                            activeAuthTab === 'phone'
                              ? 'bg-white text-[#B8873D] shadow-xs border border-[rgba(184,135,61,0.12)]'
                              : 'text-warmgray hover:text-charcoal'
                          }`}
                        >
                          {appTranslations[appLanguage].secureLogin}
                        </button>
                      </div>

                      {/* Display Mode content */}
                      {activeAuthTab === 'demo' ? (
                        <div className="space-y-4">
                          <div>
                            <h3 className="font-serif text-lg font-bold text-charcoal">{appTranslations[appLanguage].aggregatorSandboxes}</h3>
                            <p className="text-xs text-warmgray">{appTranslations[appLanguage].sandboxDesc}</p>
                          </div>

                          <div className="grid grid-cols-1 gap-2 max-h-[340px] overflow-y-auto pr-1">
                            <button
                              type="button"
                              onClick={() => {
                                const newDemoPartner: User = {
                                  id: `demo_partner_${Date.now()}`,
                                  role: 'technician',
                                  name: 'Guest Partner (HQ Demo)',
                                  phone: '+91 91111 22222',
                                  status: 'active',
                                  onboardingCompleted: true,
                                  primer_shown_flag: true,
                                  isDemo: true,
                                  avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'
                                };
                                DbManager.addUser(newDemoPartner);
                                setCurrentUser(newDemoPartner);
                                localStorage.setItem('aiec_session_token', `session_${newDemoPartner.id}`);
                                setActiveTab('Home');
                              }}
                              className="w-full p-3 bg-antiquegold/10 hover:bg-antiquegold/20 border border-antiquegold/25 rounded-xl flex items-center justify-between text-left transition-all hover:translate-x-1 cursor-pointer"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-antiquegold text-white flex items-center justify-center shrink-0">
                                  <Sparkles className="w-4 h-4 animate-pulse" />
                                </div>
                                <div className="truncate">
                                  <h4 className="font-bold text-xs text-[#B8873D] flex items-center gap-1.5">
                                    <span>{appTranslations[appLanguage].firstTimeOnboarding}</span>
                                    <span className="text-[8px] bg-antiquegold/20 text-[#B8873D] px-1.5 py-0.5 rounded-full font-mono font-bold">PROMPT 004</span>
                                  </h4>
                                  <p className="text-[10px] text-warmgray truncate">{appTranslations[appLanguage].selectRole}</p>
                                </div>
                              </div>
                              <ChevronRight className="w-4 h-4 text-antiquegold shrink-0" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDemoBypass('admin')}
                              className="w-full p-3 bg-alabaster hover:bg-[#edeae2] border border-[rgba(184,135,61,0.1)] rounded-xl flex items-center justify-between text-left transition-all hover:translate-x-1 cursor-pointer"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-[#0E4B3D]/10 text-[#0E4B3D] flex items-center justify-center shrink-0">
                                  <Shield className="w-4 h-4" />
                                </div>
                                <div className="truncate">
                                  <h4 className="font-bold text-xs text-charcoal flex items-center gap-1.5">
                                    <span>{appTranslations[appLanguage].masterAdmin}</span>
                                    <span className="text-[8px] bg-[#0E4B3D]/10 text-[#0E4B3D] px-1.5 py-0.5 rounded-full font-mono font-bold">HQ</span>
                                  </h4>
                                  <p className="text-[10px] text-warmgray truncate">{appTranslations[appLanguage].ownerMonitor}</p>
                                </div>
                              </div>
                              <ChevronRight className="w-4 h-4 text-warmgray shrink-0" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDemoBypass('surveyor')}
                              className="w-full p-3 bg-alabaster hover:bg-[#edeae2] border border-[rgba(184,135,61,0.1)] rounded-xl flex items-center justify-between text-left transition-all hover:translate-x-1 cursor-pointer"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-[#B8873D]/10 text-[#B8873D] flex items-center justify-center shrink-0">
                                  <MapPin className="w-4 h-4" />
                                </div>
                                <div className="truncate">
                                  <h4 className="font-bold text-xs text-charcoal flex items-center gap-1.5">
                                    <span>Amit Sharma</span>
                                    <span className="text-[8px] bg-[#B8873D]/10 text-[#B8873D] px-1.5 py-0.5 rounded-full font-mono font-bold">Surveyor</span>
                                  </h4>
                                  <p className="text-[10px] text-warmgray truncate">Log high-rise shafts, map GPS coordinates</p>
                                </div>
                              </div>
                              <ChevronRight className="w-4 h-4 text-warmgray shrink-0" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDemoBypass('technician')}
                              className="w-full p-3 bg-alabaster hover:bg-[#edeae2] border border-[rgba(184,135,61,0.1)] rounded-xl flex items-center justify-between text-left transition-all hover:translate-x-1 cursor-pointer"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-[#0E4B3D]/10 text-[#0E4B3D] flex items-center justify-center shrink-0">
                                  <Hammer className="w-4 h-4" />
                                </div>
                                <div className="truncate">
                                  <h4 className="font-bold text-xs text-charcoal flex items-center gap-1.5">
                                    <span>Rajesh Patel</span>
                                    <span className="text-[8px] bg-[#0E4B3D]/10 text-[#0E4B3D] px-1.5 py-0.5 rounded-full font-mono font-bold">Partner</span>
                                  </h4>
                                  <p className="text-[10px] text-warmgray truncate">Floor-by-floor safety checklists & installation</p>
                                </div>
                              </div>
                              <ChevronRight className="w-4 h-4 text-warmgray shrink-0" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDemoBypass('customer')}
                              className="w-full p-3 bg-alabaster hover:bg-[#edeae2] border border-[rgba(184,135,61,0.1)] rounded-xl flex items-center justify-between text-left transition-all hover:translate-x-1 cursor-pointer"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-[#2F8F5B]/10 text-[#2F8F5B] flex items-center justify-center shrink-0">
                                  <UserIcon className="w-4 h-4" />
                                </div>
                                <div className="truncate">
                                  <h4 className="font-bold text-xs text-charcoal flex items-center gap-1.5">
                                    <span>Rohan Deshmukh</span>
                                    <span className="text-[8px] bg-[#2F8F5B]/10 text-[#2F8F5B] px-1.5 py-0.5 rounded-full font-mono font-bold">Client</span>
                                  </h4>
                                  <p className="text-[10px] text-warmgray truncate">Track progress on Golden Ascension Line</p>
                                </div>
                              </div>
                              <ChevronRight className="w-4 h-4 text-warmgray shrink-0" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDemoBypass('supplier')}
                              className="w-full p-3 bg-alabaster hover:bg-[#edeae2] border border-[rgba(184,135,61,0.1)] rounded-xl flex items-center justify-between text-left transition-all hover:translate-x-1 cursor-pointer"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-warning/10 text-warning flex items-center justify-center shrink-0">
                                  <Truck className="w-4 h-4" />
                                </div>
                                <div className="truncate">
                                  <h4 className="font-bold text-xs text-charcoal flex items-center gap-1.5">
                                    <span>Sun Manufacturing</span>
                                    <span className="text-[8px] bg-warning/10 text-warning px-1.5 py-0.5 rounded-full font-mono font-bold">Supplier</span>
                                  </h4>
                                  <p className="text-[10px] text-warmgray truncate">Fulfill purchase orders & custom cabins</p>
                                </div>
                              </div>
                              <ChevronRight className="w-4 h-4 text-warmgray shrink-0" />
                            </button>
                          </div>
                          
                          <div className="p-3 bg-[#F8F6F1] rounded-xl border border-dashed border-[#e6dfd4] text-[10px] text-warmgray leading-relaxed">
                            💡 <strong>Demo Protection:</strong> Demo Mode triggers a transient sandbox. Irreversible financial actions (releasing real payments or payouts) are completely disabled.
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {/* Secure login sub-tabs */}
                          <div className="flex border-b border-[#e6dfd4]">
                            <button
                              type="button"
                              onClick={() => {
                                setLoginMethod('phone');
                                setErrorMsg('');
                              }}
                              className={`pb-2 px-4 text-xs font-bold transition-all border-b-2 cursor-pointer ${
                                loginMethod === 'phone' ? 'border-[#B8873D] text-[#B8873D]' : 'border-transparent text-warmgray hover:text-charcoal'
                              }`}
                            >
                              🇮🇳 Mobile OTP
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setLoginMethod('email');
                                setErrorMsg('');
                              }}
                              className={`pb-2 px-4 text-xs font-bold transition-all border-b-2 cursor-pointer ${
                                loginMethod === 'email' ? 'border-[#B8873D] text-[#B8873D]' : 'border-transparent text-warmgray hover:text-charcoal'
                              }`}
                            >
                              ✉️ Email & Password
                            </button>
                          </div>

                          {errorMsg && (
                            <div className="p-3 bg-error/10 border border-error/20 text-error text-xs rounded-xl font-medium leading-tight">
                              {errorMsg}
                            </div>
                          )}

                          {loginMethod === 'phone' ? (
                            /* PHONE OTP FLOW */
                            <div>
                              {/* Simulated Incoming SMS Push Alert */}
                              <AnimatePresence>
                                {simulateSmsToast && (
                                  <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    onClick={() => {
                                      setOtp6Digits(['1', '2', '3', '4', '5', '6']);
                                      triggerInstantVerification('123456');
                                    }}
                                    className="mb-4 p-3 bg-[#0E4B3D]/95 text-white rounded-2xl border border-[#B8873D]/30 shadow-lg cursor-pointer hover:bg-[#0E4B3D] transition-all flex items-start gap-3 text-left"
                                  >
                                    <div className="w-8 h-8 rounded-lg bg-[#B8873D] text-white flex items-center justify-center font-mono font-bold text-sm shrink-0">
                                      💬
                                    </div>
                                    <div className="space-y-0.5">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-bold text-antiquegold uppercase tracking-wider">SMS Gateway Retriever</span>
                                        <span className="text-[9px] text-white/50 font-mono">Just Now</span>
                                      </div>
                                      <p className="text-[11px] leading-tight text-white/90">
                                        Your AIEC mobile access OTP code is <strong className="text-antiquegold font-mono font-extrabold tracking-wider bg-white/10 px-1.5 py-0.5 rounded text-xs">123456</strong>. Valid for 2 mins.
                                      </p>
                                      <span className="text-[9px] text-[#B8873D] font-bold block animate-pulse">⚡ Tap to Auto-Read & Verify Instantly</span>
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>

                              {!otpSent ? (
                                <form onSubmit={handlePhoneSubmit} className="space-y-4">
                                  <div className="space-y-1.5">
                                    <label className="block text-[10px] font-bold text-charcoal uppercase tracking-wider">
                                      {appTranslations[appLanguage].enterMobile}
                                    </label>
                                    <div className="flex gap-2">
                                      {/* Interactive Country Selector */}
                                      <div className="relative shrink-0">
                                        <select
                                          value={countryCode}
                                          onChange={(e) => setCountryCode(e.target.value)}
                                          className="h-full px-3 py-2.5 bg-[#F8F6F1] border border-[rgba(184,135,61,0.15)] rounded-xl text-xs font-semibold text-charcoal focus:outline-none focus:ring-1 focus:ring-antiquegold cursor-pointer"
                                        >
                                          <option value="+91">🇮🇳 +91</option>
                                          <option value="+1">🇺🇸 +1</option>
                                          <option value="+44">🇬🇧 +44</option>
                                          <option value="+971">🇦🇪 +971</option>
                                          <option value="+65">🇸🇬 +65</option>
                                        </select>
                                      </div>

                                      <div className="relative flex-1">
                                        <input
                                          type="tel"
                                          required
                                          placeholder="98765 43210"
                                          value={loginPhone}
                                          onChange={(e) => setLoginPhone(e.target.value.replace(/\D/g, ''))}
                                          className="w-full px-4 py-2.5 bg-alabaster border border-[rgba(184,135,61,0.15)] rounded-xl text-sm font-sans focus:outline-none focus:ring-1 focus:ring-antiquegold text-charcoal font-semibold"
                                        />
                                      </div>
                                    </div>

                                    {/* Country Confirmation / Intl routing */}
                                    {countryCode !== '+91' && (
                                      <p className="text-[10px] font-medium text-[#B8873D] flex items-center gap-1">
                                        🌐 <span>International Route: OTP will route with country code {countryCode}. Standard carrier rates apply.</span>
                                      </p>
                                    )}

                                    <div className="flex justify-between items-start gap-2">
                                      <p className="text-[10px] text-warmgray flex-1">
                                        {appTranslations[appLanguage].enterNumHelp}
                                      </p>
                                      <button
                                        type="button"
                                        onClick={() => setShowForgotReset(true)}
                                        className="text-[10px] text-antiquegold hover:text-royalemerald font-bold transition-all cursor-pointer hover:underline text-right shrink-0"
                                      >
                                        {appTranslations[appLanguage].accRecovery}
                                      </button>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      id="remember-me"
                                      checked={rememberMe}
                                      onChange={(e) => setRememberMe(e.target.checked)}
                                      className="w-4 h-4 accent-antiquegold rounded cursor-pointer"
                                    />
                                    <label htmlFor="remember-me" className="text-xs text-warmgray select-none cursor-pointer">
                                      {appTranslations[appLanguage].rememberMe}
                                    </label>
                                  </div>

                                  <Button variant="emerald" type="submit" fullWidth className="py-3 bg-[#0E4B3D] text-white">
                                    <span>{appTranslations[appLanguage].otpButton}</span>
                                    <ArrowRight className="w-4 h-4" />
                                  </Button>
                                </form>
                              ) : (
                                <form onSubmit={handleOtpVerify} className="space-y-4 relative">
                                  {/* Dynamic Verification Overlays */}
                                  {verificationStatus === 'verifying' && (
                                    <div className="absolute inset-0 bg-white/95 z-20 flex flex-col items-center justify-center text-center space-y-3 rounded-2xl">
                                      <div className="w-10 h-10 border-4 border-[#B8873D]/20 border-t-[#B8873D] rounded-full animate-spin" />
                                      <div className="space-y-1">
                                        <p className="text-xs font-bold text-charcoal">Elevating connection safely...</p>
                                        <p className="text-[10px] text-warmgray font-mono">Handshaking AIEC OTP Gateway</p>
                                      </div>
                                    </div>
                                  )}

                                  {verificationStatus === 'success' && (
                                    <div className="absolute inset-0 bg-white/95 z-20 flex flex-col items-center justify-center text-center space-y-2 rounded-2xl">
                                      <motion.div
                                        initial={{ scale: 0.5, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        className="w-12 h-12 bg-success/10 text-success rounded-full flex items-center justify-center"
                                      >
                                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                      </motion.div>
                                      <div className="space-y-0.5">
                                        <p className="text-xs font-bold text-success">🔒 Verification Successful!</p>
                                        <p className="text-[9px] text-warmgray font-mono font-bold uppercase tracking-wider">Connecting Partner Session...</p>
                                      </div>
                                    </div>
                                  )}

                                  {/* Header description with Change Number link */}
                                  <div className="p-3 bg-alabaster rounded-2xl border border-[rgba(184,135,61,0.12)] space-y-1 text-center">
                                    <p className="text-xs font-semibold text-charcoal">
                                      Verification Code Sent to {countryCode} {loginPhone}
                                    </p>
                                    <p className="text-[10px] text-warmgray">
                                      Not your number?{' '}
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setOtpSent(false);
                                          setErrorMsg('');
                                          setIsExpired(false);
                                        }}
                                        className="text-[#B8873D] hover:text-[#0E4B3D] underline font-bold cursor-pointer transition-colors"
                                      >
                                        Change number
                                      </button>
                                    </p>
                                  </div>

                                  {/* Expiration warning block */}
                                  {isExpired ? (
                                    <div className="p-3 bg-error/10 border border-error/20 text-error rounded-xl space-y-1 text-left">
                                      <p className="text-xs font-bold">⚠️ Security Token Expired</p>
                                      <p className="text-[10px] leading-tight text-error/80">
                                        The verification code has expired due to session inactivity. Please request a new code.
                                      </p>
                                    </div>
                                  ) : (
                                    <div className="text-center">
                                      <p className="text-[10px] text-warmgray">
                                        Use secure bypass PIN <strong>123456</strong> or <strong>1234</strong>
                                      </p>
                                    </div>
                                  )}

                                  <div className="space-y-2">
                                    <label className="block text-[10px] font-bold text-center text-charcoal uppercase tracking-wider">
                                      6-Digit Verification OTP
                                    </label>
                                    
                                    {/* 6 Auto-Advancing digit inputs */}
                                    <div className="flex justify-between gap-2 max-w-xs mx-auto">
                                      {otp6Digits.map((digit, idx) => (
                                        <input
                                          key={idx}
                                          id={`otp-input-${idx}`}
                                          type="text"
                                          inputMode="numeric"
                                          pattern="[0-9]*"
                                          maxLength={1}
                                          value={digit}
                                          disabled={cooldownTime > 0 || isExpired || verificationStatus === 'verifying'}
                                          onChange={(e) => handleOtpDigitChange(idx, e.target.value)}
                                          onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                                          className={`w-11 h-11 text-center bg-alabaster border-2 rounded-xl text-lg font-mono font-bold transition-all focus:outline-none focus:ring-1 focus:ring-antiquegold ${
                                            isExpired
                                              ? 'border-error/20 text-error/50 bg-error/5'
                                              : 'border-[rgba(184,135,61,0.15)] text-charcoal focus:border-antiquegold focus:ring-antiquegold'
                                          }`}
                                        />
                                      ))}
                                    </div>

                                    {cooldownTime > 0 && (
                                      <div className="text-center text-xs text-[#B23B3B] font-bold font-mono animate-pulse">
                                        ⏱️ Cooldown: {cooldownTime} seconds remaining
                                      </div>
                                    )}
                                  </div>

                                  <div className="flex gap-2">
                                    <Button
                                      variant="secondary"
                                      type="button"
                                      className="flex-1 text-xs"
                                      onClick={() => {
                                        setOtpSent(false);
                                        setErrorMsg('');
                                        setIsExpired(false);
                                      }}
                                    >
                                      Back
                                    </Button>
                                    <Button
                                      variant="primary"
                                      type="submit"
                                      className="flex-1 text-xs"
                                      disabled={cooldownTime > 0 || isExpired || verificationStatus === 'verifying'}
                                    >
                                      Verify OTP
                                    </Button>
                                  </div>

                                  {/* Resend Action block */}
                                  <div className="text-center pt-2 border-t border-[#e6dfd4]">
                                    {resendCountdown > 0 ? (
                                      <p className="text-[11px] text-warmgray font-medium">
                                        Resend code in <span className="font-mono font-bold text-[#B8873D]">{resendCountdown}s</span>
                                      </p>
                                    ) : (
                                      <div className="space-y-1">
                                        <button
                                          type="button"
                                          disabled={resendCount >= 5}
                                          onClick={handleResendOtp}
                                          className={`text-xs font-bold underline transition-colors cursor-pointer ${
                                            resendCount >= 5
                                              ? 'text-warmgray/50 cursor-not-allowed no-underline'
                                              : 'text-[#B8873D] hover:text-[#0E4B3D]'
                                          }`}
                                        >
                                          {resendCount >= 5 ? 'Resend limit reached (5/5)' : 'Resend Verification SMS'}
                                        </button>
                                        <p className="text-[9px] text-warmgray font-mono">
                                          Resend attempts: {resendCount}/5 (capped per 10 mins)
                                        </p>
                                      </div>
                                    )}
                                  </div>

                                  {/* Debug helper: Simulate app background / expiry */}
                                  <div className="bg-[#F8F6F1] p-2.5 rounded-xl border border-dashed border-[#e6dfd4] flex items-center justify-between text-left">
                                    <span className="text-[9px] text-warmgray font-mono font-bold uppercase">🧪 Sandbox Tools:</span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setIsExpired(true);
                                        setOtp6Digits(Array(6).fill(''));
                                      }}
                                      className="text-[9px] bg-error/10 hover:bg-error/20 text-error font-bold px-2 py-1 rounded transition-all cursor-pointer"
                                    >
                                      Simulate Expiration
                                    </button>
                                  </div>
                                </form>
                              )}
                            </div>
                          ) : (
                            /* EMAIL PASSWORD FALLBACK FLOW */
                            <form onSubmit={handleEmailSubmit} className="space-y-4">
                              <div className="space-y-1">
                                <label className="block text-[10px] font-bold text-charcoal uppercase tracking-wider">Authorized Email Address</label>
                                <div className="relative">
                                  <span className="absolute left-4 top-2.5 text-warmgray text-sm">✉️</span>
                                  <input
                                    type="email"
                                    required
                                    value={loginEmail}
                                    onChange={(e) => setLoginEmail(e.target.value)}
                                    placeholder="admin@aiec.com"
                                    className="w-full pl-10 pr-4 py-2 bg-alabaster border border-[rgba(184,135,61,0.15)] rounded-xl text-sm focus:outline-none text-charcoal font-semibold"
                                  />
                                </div>
                              </div>

                              <div className="space-y-1">
                                <label className="block text-[10px] font-bold text-charcoal uppercase tracking-wider">
                                  {appTranslations[appLanguage].enterPassword}
                                </label>
                                <div className="relative">
                                  <span className="absolute left-4 top-2.5 text-warmgray text-sm">🔒</span>
                                  <input
                                    type="password"
                                    required
                                    value={loginPassword}
                                    onChange={(e) => setLoginPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full pl-10 pr-4 py-2 bg-alabaster border border-[rgba(184,135,61,0.15)] rounded-xl text-sm focus:outline-none tracking-widest text-charcoal"
                                  />
                                </div>
                                <div className="flex justify-between items-center text-[10px] text-warmgray">
                                  <span>{appTranslations[appLanguage].defaultFallback} <strong>password123</strong></span>
                                  <button
                                    type="button"
                                    onClick={() => setShowForgotReset(true)}
                                    className="text-antiquegold hover:text-royalemerald font-bold transition-all cursor-pointer hover:underline"
                                  >
                                    {appTranslations[appLanguage].forgotPass}
                                  </button>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  id="remember-me-email"
                                  checked={rememberMe}
                                  onChange={(e) => setRememberMe(e.target.checked)}
                                  className="w-4 h-4 accent-antiquegold rounded cursor-pointer"
                                />
                                <label htmlFor="remember-me-email" className="text-xs text-warmgray select-none cursor-pointer">
                                  {appTranslations[appLanguage].rememberMe}
                                </label>
                              </div>

                              <Button variant="primary" type="submit" fullWidth className="py-3">
                                <span>{appTranslations[appLanguage].passwordButton}</span>
                                <ArrowRight className="w-4 h-4" />
                              </Button>
                            </form>
                          )}

                          {/* Social login Google Sign-In divider */}
                          <div className="relative flex py-2 items-center">
                            <div className="flex-grow border-t border-[#e6dfd4]"></div>
                            <span className="flex-shrink mx-4 text-warmgray font-mono text-[9px] uppercase tracking-widest">or sign in with</span>
                            <div className="flex-grow border-t border-[#e6dfd4]"></div>
                          </div>

                          <button
                            type="button"
                            onClick={handleGoogleSignIn}
                            className="w-full py-3 bg-white hover:bg-alabaster border border-[#e6dfd4] rounded-xl flex items-center justify-center gap-3 transition-all cursor-pointer font-bold text-xs text-charcoal"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24">
                              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                            </svg>
                            <span>Continue with Google</span>
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="text-center font-mono text-[9px] text-warmgray border-t border-[#e6dfd4] pt-4">
                      ALL INDIA ELEVATORS COMPANY SECURITY ARCHITECTURE • v1.0.1
                    </div>
                  </div>

                </div>
              )}
            </div>
            ) : currentUser.role === ('pending_selection' as any) && !currentUser.isDemo ? (
              /* =========================================================
                 ROLE SELECTION & ONBOARDING WIZARD SCREEN
                 ========================================================= */
              <div className="flex-1 flex items-center justify-center p-4 bg-[#F8F6F1]">
                <RoleSelectionWizard 
                  user={currentUser}
                  onComplete={(updatedUser) => {
                    setCurrentUser(updatedUser);
                    window.dispatchEvent(new Event('aiec_db_update'));
                  }}
                  onSignOut={handleLogout}
                />
              </div>
            ) : (currentUser.role === 'surveyor' || currentUser.role === 'technician' || currentUser.role === 'customer') && !currentUser.primer_shown_flag && !currentUser.isDemo ? (
              /* =========================================================
                 PERMISSIONS PRIMER SCREEN — MOBILE PRIVACY CONJECTURES
                 ========================================================= */
              <div className="flex-1 flex items-center justify-center p-4 bg-[#F8F6F1]">
                <PermissionsPrimer 
                  user={currentUser}
                  onComplete={(updatedUser) => {
                    setCurrentUser(updatedUser);
                    window.dispatchEvent(new Event('aiec_db_update'));
                  }}
                  onSkip={() => {
                    const updatedUser: User = {
                      ...currentUser,
                      primer_shown_flag: true,
                      primer_shown_timestamp: new Date().toISOString()
                    };
                    DbManager.updateUser(updatedUser);
                    setCurrentUser(updatedUser);
                    window.dispatchEvent(new Event('aiec_db_update'));
                  }}
                />
              </div>
            ) : currentUser.role === 'surveyor' && !currentUser.onboardingCompleted && !currentUser.isDemo ? (
              /* =========================================================
                 SURVEYOR ONBOARDING — PROFILE & DOCUMENT UPLOAD SCREEN
                 ========================================================= */
              <div className="flex-1 flex items-center justify-center p-4 bg-[#F8F6F1]">
                <SurveyorOnboarding 
                  user={currentUser}
                  onComplete={(updatedUser) => {
                    setCurrentUser(updatedUser);
                    window.dispatchEvent(new Event('aiec_db_update'));
                  }}
                  onSignOut={handleLogout}
                />
              </div>
            ) : currentUser.role === 'technician' && !currentUser.onboardingCompleted && !currentUser.isDemo ? (
              /* =========================================================
                 TECHNICIAN ONBOARDING — PROFILE & SKILL CERTIFICATION SCREEN
                 ========================================================= */
              <div className="flex-1 flex items-center justify-center p-4 bg-[#F8F6F1]">
                <TechnicianOnboarding 
                  user={currentUser}
                  onComplete={(updatedUser) => {
                    setCurrentUser(updatedUser);
                    window.dispatchEvent(new Event('aiec_db_update'));
                  }}
                  onSignOut={handleLogout}
                />
              </div>
            ) : currentUser.role === 'supplier' && !currentUser.onboardingCompleted && !currentUser.isDemo ? (
              /* =========================================================
                 SUPPLIER ONBOARDING — COMPANY KYC SCREEN
                 ========================================================= */
              <div className="flex-1 flex items-center justify-center p-4 bg-[#F8F6F1]">
                <SupplierOnboarding 
                  user={currentUser}
                  onComplete={(updatedUser) => {
                    setCurrentUser(updatedUser);
                    window.dispatchEvent(new Event('aiec_db_update'));
                  }}
                  onSignOut={handleLogout}
                />
              </div>
            ) : currentUser.role === 'customer' && !currentUser.onboardingCompleted && !currentUser.isDemo ? (
              /* =========================================================
                 CUSTOMER QUICK SIGNUP (lead-conversion auto-created)
                 ========================================================= */
              <div className="flex-1 flex items-center justify-center p-4 bg-[#F8F6F1]">
                <CustomerQuickSignup 
                  user={currentUser}
                  onComplete={(updatedUser) => {
                    setCurrentUser(updatedUser);
                    window.dispatchEvent(new Event('aiec_db_update'));
                  }}
                  onSignOut={handleLogout}
                />
              </div>
            ) : currentUser.status === 'pending' && !currentUser.isDemo ? (
              /* =========================================================
                 PENDING APPROVAL HOLDING SCREEN
                 ========================================================= */
              <div className="flex-1 flex items-center justify-center p-4 bg-[#F8F6F1]">
                <div className="w-full max-w-lg bg-white rounded-3xl border border-[rgba(184,135,61,0.2)] p-6 md:p-8 space-y-6 shadow-diffuse text-center relative overflow-hidden">
                  
                  {/* Decorative Ascension Line behind text on the left */}
                  <div className="absolute left-6 top-12 bottom-12 w-0.5 bg-gradient-to-b from-transparent via-[#B8873D]/30 to-transparent flex flex-col justify-between items-center py-4">
                    <div className="w-2 h-2 rounded-full bg-[#B8873D]" />
                    <motion.div 
                      animate={{ y: [0, 100, 0] }}
                      transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                      className="w-2.5 h-2.5 rounded-full bg-[#B8873D] ring-4 ring-[#B8873D]/30 shadow-md"
                    />
                    <div className="w-2 h-2 rounded-full bg-[#B8873D]" />
                  </div>

                  <div className="pl-6 space-y-5">
                    <div className="w-14 h-14 bg-antiquegold/10 text-antiquegold rounded-2xl flex items-center justify-center mx-auto shadow-xs">
                      <Shield className="w-7 h-7 stroke-[1.5] animate-pulse" />
                    </div>

                    <div className="space-y-1 text-center">
                      <span className="text-[9px] font-mono font-bold text-antiquegold uppercase tracking-widest block">HQ SECURE LEDGER PROVISIONING</span>
                      <h3 className="font-serif text-xl font-bold text-charcoal">Onboarding Review Initiated</h3>
                      <p className="text-xs text-warmgray">Your partner profile is logged in and awaiting security credentials.</p>
                    </div>

                    {/* Step Tracker with Ascension Line motif */}
                    <div className="bg-[#F8F6F1] p-4 rounded-2xl border border-[rgba(184,135,61,0.1)] text-left space-y-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-5 h-5 rounded-full bg-[#0E4B3D] text-white flex items-center justify-center text-[10px] font-bold">✓</div>
                        <div className="text-xs">
                          <p className="font-bold text-charcoal">Mobile Authentication Verified</p>
                          <p className="text-[10px] text-warmgray">{currentUser.phone} Device Signature Confirmed</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5">
                        <div className="w-5 h-5 rounded-full bg-[#0E4B3D] text-white flex items-center justify-center text-[10px] font-bold">✓</div>
                        <div className="text-xs">
                          <p className="font-bold text-charcoal">Requested Platform Role Submitted</p>
                          <p className="text-[10px] text-[#B8873D] font-bold uppercase tracking-wider">Role Option: {currentUser.role}</p>
                        </div>
                      </div>

                      <div className="flex items-start gap-2.5">
                        <div className="w-5 h-5 rounded-full bg-antiquegold/20 border border-antiquegold text-antiquegold flex items-center justify-center text-[10px] font-bold animate-pulse mt-0.5">⏱</div>
                        <div className="text-xs">
                          <p className="font-bold text-charcoal">Director Security Clearance & Territory Lock</p>
                          <p className="text-[10px] text-warmgray">Mr. Prashant Vasant Wable is reviewing safety telemetry & mapping coordinates.</p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 font-mono text-[10px] text-warmgray text-left bg-alabaster/40 p-3 rounded-xl border border-dashed border-[#e6dfd4]">
                      <div className="flex justify-between">
                        <span>REGISTERED NAME</span>
                        <span className="text-charcoal font-bold">{currentUser.name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>OFFICE ADDRESS</span>
                        <span className="text-charcoal">Kothrud Industrial Area, Pune</span>
                      </div>
                      <div className="flex justify-between">
                        <span>HQ TELEMETRY STATUS</span>
                        <span className="text-success font-semibold">🔒 ENCRYPTED GATES LINK</span>
                      </div>
                    </div>

                    <div className="flex gap-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          const resetUser: User = {
                            ...currentUser,
                            role: 'pending_selection' as any,
                            status: 'pending'
                          };
                          DbManager.updateUser(resetUser);
                          setCurrentUser(resetUser);
                        }}
                        className="flex-1 py-2.5 bg-alabaster hover:bg-[#edeae2] border border-[#e6dfd4] rounded-xl text-xs font-bold text-charcoal cursor-pointer transition-all"
                      >
                        Change Requested Role
                      </button>
                      
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="flex-1 py-2.5 bg-error/10 hover:bg-error/15 text-error text-xs font-bold rounded-xl transition-all cursor-pointer"
                      >
                        Sign Out / Exit
                      </button>
                    </div>
                  </div>

                </div>
              </div>
            ) : (
              /* =========================================================
                 AUTHENTICATED ROLE-AWARE SHELL
                 ========================================================= */
              <div className="flex-1 flex flex-col md:flex-row relative">
                
                {/* 1. DESKTOP SIDEBAR (Reflow of navigation matching design system guidelines) */}
                <aside className="hidden md:flex w-64 h-screen sticky top-0 bg-white border-r border-[rgba(184,135,61,0.12)] p-6 flex-col justify-between shrink-0 shadow-diffuse">
                  <div className="space-y-6 flex-1 overflow-y-auto pr-1">
                    {/* Header Brand */}
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-royalemerald text-white flex items-center justify-center">
                        <Building className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-serif text-sm font-extrabold text-charcoal">AIEC Platform</h3>
                        <p className="text-[10px] text-antiquegold uppercase font-extrabold tracking-wider">Aggregator Hub</p>
                      </div>
                    </div>

                    {/* Global Language Selector */}
                    <div className="bg-[#F8F6F1] p-2.5 rounded-xl border border-[rgba(184,135,61,0.12)] space-y-1.5">
                      <div className="flex items-center gap-1.5 text-[8px] font-mono font-extrabold text-[#B8873D]">
                        <Globe className="w-3.5 h-3.5" />
                        <span>{appTranslations[appLanguage].langLabel}</span>
                      </div>
                      <div className="flex gap-1">
                        {(['en', 'mr', 'hi'] as const).map((lng) => (
                          <button
                            key={lng}
                            type="button"
                            onClick={() => setAppLanguage(lng)}
                            className={`flex-1 py-1 text-[9px] font-bold rounded-lg cursor-pointer transition-all ${
                              appLanguage === lng
                                ? 'bg-[#B8873D] text-white font-extrabold shadow-xs'
                                : 'bg-white text-warmgray hover:text-charcoal'
                            }`}
                          >
                            {lng === 'en' ? 'EN' : lng === 'mr' ? 'मराठी' : 'हिंदी'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Navigation Items */}
                    <nav className="space-y-1">
                      {getTabsByRole(currentUser.role).map((tab) => {
                        const Icon = tab.icon;
                        const isSelected = activeTab === tab.id;
                        return (
                          <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-[#0E4B3D]/10 text-royalemerald'
                                : 'text-warmgray hover:text-charcoal hover:bg-alabaster'
                            }`}
                          >
                            <Icon className={`w-4 h-4 ${isSelected ? 'text-royalemerald' : 'text-warmgray'}`} />
                            <span>{getTabLabel(tab)}</span>
                          </button>
                        );
                      })}
                    </nav>
                  </div>

                  {/* Footer profile & logout */}
                  <div className="space-y-4 pt-4 border-t border-dashed border-[#e6dfd4]">
                    <div className="flex items-center gap-3">
                      <img src={currentUser.avatarUrl} alt={currentUser.name} className="w-10 h-10 rounded-full border border-antiquegold object-cover" />
                      <div className="truncate">
                        <h4 className="text-xs font-bold text-charcoal">{currentUser.name}</h4>
                        <p className="text-[9px] uppercase font-bold text-warmgray">{currentUser.role}</p>
                      </div>
                    </div>
                    <Button variant="danger" fullWidth className="py-2.5 text-xs font-bold" onClick={handleLogout}>
                      <LogOut className="w-4 h-4" />
                      <span>Log Out</span>
                    </Button>
                  </div>
                </aside>

                {/* 2. MOBILE HEADER & NAVIGATION SHELL */}
                <header className="md:hidden bg-white border-b border-[rgba(184,135,61,0.1)] p-4 flex items-center justify-between sticky top-0 z-40 shadow-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-royalemerald text-white flex items-center justify-center">
                      <Building className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-serif text-sm font-bold text-charcoal">AIEC Mobile</h3>
                      <p className="text-[8px] uppercase tracking-wider text-warmgray font-bold">{currentUser.role} mode</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {/* Small mobile switcher */}
                    <div className="flex bg-[#F8F6F1] p-0.5 rounded-lg border border-[rgba(184,135,61,0.1)]">
                      {(['en', 'mr', 'hi'] as const).map((lng) => (
                        <button
                          key={lng}
                          type="button"
                          onClick={() => setAppLanguage(lng)}
                          className={`px-2 py-1 text-[9px] font-bold rounded-md cursor-pointer transition-all ${
                            appLanguage === lng
                              ? 'bg-[#B8873D] text-white font-extrabold shadow-xs'
                              : 'text-warmgray hover:text-charcoal'
                          }`}
                        >
                          {lng === 'en' ? 'EN' : lng === 'mr' ? 'मराठी' : 'हिंदी'}
                        </button>
                      ))}
                    </div>

                    <button 
                      onClick={handleLogout}
                      className="p-2 rounded-lg bg-error/10 text-error hover:bg-error/15 cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  </div>
                </header>

                {/* 3. SCROLLABLE SCREEN STAGE CONTENT AREA */}
                <main className="flex-1 overflow-y-auto p-4 md:p-8 max-w-7xl mx-auto w-full pb-24 md:pb-8">
                  {renderTabContent()}
                </main>

                {/* 4. MOBILE BOTTOM TAB NAVIGATION (curated primary tabs + "More" for everything else) */}
                {(() => {
                  const allTabs = getTabsByRole(currentUser.role);
                  const needsMore = allTabs.length > 5;
                  const primaryTabs = needsMore ? allTabs.slice(0, 4) : allTabs;
                  return (
                    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-[rgba(184,135,61,0.12)] py-2 flex justify-around items-center z-40 shadow-lg">
                      {primaryTabs.map((tab) => {
                        const Icon = tab.icon;
                        const isSelected = activeTab === tab.id;
                        return (
                          <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex flex-col items-center gap-1 cursor-pointer transition-all min-w-0 px-1 ${
                              isSelected ? 'text-royalemerald scale-110' : 'text-warmgray'
                            }`}
                          >
                            <Icon className="w-5 h-5 shrink-0" />
                            <span className="text-[9px] font-bold truncate max-w-[64px]">{getTabLabel(tab)}</span>
                          </button>
                        );
                      })}
                      {needsMore && (
                        <button
                          onClick={() => setShowMobileMoreMenu(true)}
                          className={`flex flex-col items-center gap-1 cursor-pointer transition-all min-w-0 px-1 ${
                            showMobileMoreMenu || !primaryTabs.some(t => t.id === activeTab) ? 'text-royalemerald' : 'text-warmgray'
                          }`}
                        >
                          <Grid className="w-5 h-5 shrink-0" />
                          <span className="text-[9px] font-bold">More</span>
                        </button>
                      )}
                    </nav>
                  );
                })()}

                {/* 5. MOBILE "MORE" MENU — every screen for this role, searchable (bottom nav can't hold 100+ items) */}
                <AnimatePresence>
                  {showMobileMoreMenu && (
                    <>
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => { setShowMobileMoreMenu(false); setMobileNavSearch(''); }}
                        className="md:hidden fixed inset-0 z-[110] bg-charcoal/30 backdrop-blur-xs"
                      />
                      <motion.div
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        transition={{ type: 'tween', duration: 0.25 }}
                        className="md:hidden fixed inset-x-0 bottom-0 z-[111] bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[80vh]"
                      >
                        <div className="w-12 h-1.5 bg-[#e5dfd4] rounded-full mx-auto mt-3 mb-2 shrink-0" />
                        <div className="px-4 pb-3 flex items-center justify-between shrink-0">
                          <h3 className="font-serif text-base font-bold text-charcoal">All Screens ({getTabsByRole(currentUser.role).length})</h3>
                          <button onClick={() => { setShowMobileMoreMenu(false); setMobileNavSearch(''); }} className="p-1.5 rounded-lg hover:bg-alabaster text-warmgray">
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                        <div className="px-4 pb-3 shrink-0">
                          <div className="relative">
                            <Search className="w-4 h-4 text-warmgray absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                              type="text"
                              value={mobileNavSearch}
                              onChange={(e) => setMobileNavSearch(e.target.value)}
                              placeholder="Search screens..."
                              className="w-full bg-[#F8F6F1] border border-[rgba(184,135,61,0.15)] rounded-xl pl-9 pr-3 py-2.5 text-sm focus:ring-1 focus:ring-antiquegold focus:outline-none"
                            />
                          </div>
                        </div>
                        <div className="flex-1 overflow-y-auto px-4 pb-8 grid grid-cols-3 gap-2">
                          {getTabsByRole(currentUser.role)
                            .filter(tab => getTabLabel(tab).toLowerCase().includes(mobileNavSearch.toLowerCase()))
                            .map((tab) => {
                              const Icon = tab.icon;
                              const isSelected = activeTab === tab.id;
                              return (
                                <button
                                  key={tab.id}
                                  onClick={() => {
                                    setActiveTab(tab.id);
                                    setShowMobileMoreMenu(false);
                                    setMobileNavSearch('');
                                  }}
                                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl text-center cursor-pointer transition-all ${
                                    isSelected ? 'bg-[#0E4B3D]/10 text-royalemerald' : 'bg-[#F8F6F1] text-warmgray hover:bg-alabaster'
                                  }`}
                                >
                                  <Icon className={`w-5 h-5 shrink-0 ${isSelected ? 'text-royalemerald' : 'text-warmgray'}`} />
                                  <span className="text-[10px] font-bold leading-tight line-clamp-2">{getTabLabel(tab)}</span>
                                </button>
                              );
                            })}
                        </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>

              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* =========================================================
          WHAT'S NEW DISMISSIBLE SHEET
          ========================================================= */}
      <AnimatePresence>
        {showWhatsNew && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
            <motion.div
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="w-full max-w-lg bg-white rounded-t-3xl md:rounded-3xl border-t border-x md:border border-[rgba(184,135,61,0.2)] p-6 md:p-8 space-y-6 shadow-2xl overflow-hidden relative text-left"
            >
              {/* Gold Top line design element for bottom sheet drag indicator */}
              <div className="w-12 h-1.5 bg-[#e5dfd4] rounded-full mx-auto md:hidden mb-2" />

              <div className="text-center space-y-2">
                <div className="w-12 h-12 bg-antiquegold/10 text-antiquegold rounded-2xl flex items-center justify-center mx-auto shadow-xs">
                  <Sparkles className="w-6 h-6 stroke-[1.5]" />
                </div>
                <div>
                  <h3 className="font-serif text-xl font-bold text-charcoal">What's New in v1.0.1</h3>
                  <p className="text-xs text-warmgray uppercase tracking-wider font-mono">Platform Update Released</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-royalemerald/10 text-royalemerald flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-charcoal">Premium Alabaster Theme</h4>
                    <p className="text-[11px] text-warmgray leading-normal">A luxurious, high-contrast, eye-safe design system featuring Royal White base and gold accents.</p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-royalemerald/10 text-royalemerald flex items-center justify-center shrink-0">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-charcoal">GPS Grounding & Auto-Verification</h4>
                    <p className="text-[11px] text-warmgray leading-normal">Field surveyors can now geo-tag sites automatically with accurate GPS verification coordinates.</p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#0E4B3D]/10 text-royalemerald flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-charcoal">Real-Time Session Persistence</h4>
                    <p className="text-[11px] text-warmgray leading-normal">Remembers active partner credentials securely. Returning users bypass login screens with zero taps.</p>
                  </div>
                </div>
              </div>

              <Button
                variant="emerald"
                fullWidth
                onClick={() => {
                  localStorage.setItem('aiec_app_version', '1.0.1');
                  setShowWhatsNew(false);
                }}
              >
                <span>Acknowledge & Continue</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
