import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { User } from '../types';
import { DbManager } from '../lib/db';
import { getDemoOtpBypassCodes, getDemoQuickFillOptions } from '../lib/demoCredentials';
import { Card, Button } from './Common';
import { 
  Shield, KeyRound, Smartphone, Mail, Lock, Check, CheckCircle2, 
  ArrowRight, ArrowLeft, AlertCircle, Sparkles, RefreshCw, 
  UserX, Phone, MessageSquare, AlertTriangle, Send, ShieldAlert,
  SmartphoneNfc, FileText, ChevronRight
} from 'lucide-react';

interface ForgotPasswordResetProps {
  onBackToLogin: () => void;
}

export const ForgotPasswordReset: React.FC<ForgotPasswordResetProps> = ({ onBackToLogin }) => {
  // Reset Stages: 
  // 1 = Request, 2 = Code Verification, 3 = New Password, 4 = Secure Success, 5 = Manual Admin Support
  const [step, setStep] = useState<number>(1);
  const [phoneOrEmail, setPhoneOrEmail] = useState<string>('');
  
  // Verification options
  const [verificationMethod, setVerificationMethod] = useState<'sms' | 'email' | 'whatsapp'>('whatsapp');
  const [cooldown, setCooldown] = useState<number>(0);
  const [resetCode, setResetCode] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');

  // Loaded/matched user
  const [matchedUser, setMatchedUser] = useState<User | null>(null);
  
  // Demo simulation aids
  const [lastIssuedCode, setLastIssuedCode] = useState<string>('');
  const [codeTimestamp, setCodeTimestamp] = useState<number>(0);
  const [rateLimitTimer, setRateLimitTimer] = useState<number>(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState<string>('');

  // Error & Status feedback
  const [inputError, setInputError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Auto-save draft for forms (if user types phone or email or password, save it)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (phoneOrEmail) {
        const draft = { phoneOrEmail, step, verificationMethod, savedAt: new Date().toISOString() };
        localStorage.setItem('aiec_forgot_password_draft', JSON.stringify(draft));
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setDraftStatus(`Draft auto-saved at ${timeStr}`);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [phoneOrEmail, step, verificationMethod]);

  // Load draft on mount
  useEffect(() => {
    const saved = localStorage.getItem('aiec_forgot_password_draft');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.phoneOrEmail) {
          setPhoneOrEmail(parsed.phoneOrEmail);
          setVerificationMethod(parsed.verificationMethod || 'whatsapp');
          setDraftStatus('Draft loaded from previous session');
        }
      } catch (e) {
        console.error('Failed to parse password reset draft', e);
      }
    }
  }, []);

  // Cooldown timers
  useEffect(() => {
    if (cooldown > 0) {
      const interval = setInterval(() => setCooldown(c => c - 1), 1000);
      return () => clearInterval(interval);
    }
  }, [cooldown]);

  useEffect(() => {
    if (rateLimitTimer > 0) {
      const interval = setInterval(() => setRateLimitTimer(t => t - 1), 1000);
      return () => clearInterval(interval);
    }
  }, [rateLimitTimer]);

  // Handle Input Auto-check & Match
  const cleanInput = phoneOrEmail.trim().toLowerCase().replace(/\s+/g, '');
  const isInputValid = cleanInput.length >= 4 && (cleanInput.includes('@') || /^\+?\d{8,14}$/.test(cleanInput));

  // Auto-lookup the account to give immediate micro-validation feedback
  const lookupAccount = () => {
    const users = DbManager.getUsers();
    // Match by phone (removing spaces or formatting) or email
    const match = users.find(u => {
      const uPhone = u.phone.replace(/\s+/g, '').toLowerCase();
      const uEmail = u.email ? u.email.trim().toLowerCase() : '';
      return uPhone.includes(cleanInput) || (cleanInput.includes('@') && uEmail === cleanInput);
    });
    return match || null;
  };

  // Password strength checks
  const getPasswordStrength = () => {
    if (!newPassword) return { score: 0, label: 'None', color: 'bg-warmgray/20' };
    let score = 0;
    if (newPassword.length >= 8) score += 1;
    if (/[A-Z]/.test(newPassword)) score += 1;
    if (/[0-9]/.test(newPassword)) score += 1;
    if (/[^A-Za-z0-9]/.test(newPassword)) score += 1;

    switch (score) {
      case 1: return { score: 25, label: 'Weak (Vulnerable)', color: 'bg-error', text: 'text-error' };
      case 2: return { score: 50, label: 'Moderate', color: 'bg-warning', text: 'text-warning' };
      case 3: return { score: 75, label: 'Strong', color: 'bg-[#B8873D]', text: 'text-antiquegold' };
      case 4: return { score: 100, label: 'Emperor Vault Strength', color: 'bg-success', text: 'text-success' };
      default: return { score: 0, label: 'None', color: 'bg-warmgray/20', text: 'text-warmgray' };
    }
  };

  // Trigger Send Code
  const handleRequestReset = (e: React.FormEvent) => {
    e.preventDefault();
    setInputError(null);

    if (rateLimitTimer > 0) {
      setInputError(`Rate Limit Triggered. Please wait ${rateLimitTimer} seconds before generating a new security token.`);
      return;
    }

    if (!isInputValid) {
      setInputError('Please enter a valid authorized email or mobile number.');
      return;
    }

    // Special test case for Legacy Imported User with no verified email/phone
    if (cleanInput === 'legacy' || cleanInput === 'no-credentials@aiec.com') {
      setStep(5); // manual recovery
      return;
    }

    const match = lookupAccount();
    if (!match) {
      setInputError('No active account associated with this credential. Please contact HQ or check the input.');
      return;
    }

    // Edge Case check: Account has no verified credentials (rare legacy data import)
    // We simulate that if the matched user's name is Rohan Deshmukh but input is a legacy stub,
    // or if they are marked as inactive with blank fields, they route to step 5.
    if (!match.phone && !match.email) {
      setStep(5);
      return;
    }

    // Set matched user
    setMatchedUser(match);

    // Generate random 6-digit secure single-use code
    const generatedCode = String(Math.floor(100000 + Math.random() * 900000));
    
    // Two requests fired in quick succession: only the most recently issued is valid
    setLastIssuedCode(generatedCode);
    setCodeTimestamp(Date.now()); // to handle 15 minute expiry limit

    // Set 30s rate-limit cooldown
    setRateLimitTimer(30);

    // Show simulation toast
    const channelName = verificationMethod === 'whatsapp' ? 'WhatsApp Business' : verificationMethod === 'sms' ? 'SMS Gateway' : 'HQ Encrypted Mailer';
    setToastMessage(`[SECURE RETRIEVAL] Sent via ${channelName} to ${match.name}: Use Reset Token ${generatedCode}`);
    
    // Auto clear toast after 10 seconds
    setTimeout(() => {
      setToastMessage(null);
    }, 10000);

    // Advance to Code input floor
    setStep(2);
  };

  // Handle Verify Code
  const handleVerifyCode = (e: React.FormEvent) => {
    e.preventDefault();
    setCodeError(null);

    if (!resetCode.trim()) {
      setCodeError('Verification security token is required.');
      return;
    }

    // Check code expiry (15 minutes limit)
    const minutesElapsed = (Date.now() - codeTimestamp) / (1000 * 60);
    if (minutesElapsed > 15) {
      setCodeError('Security token expired. The 15-minute single-use window has elapsed. Please request a new token.');
      return;
    }

    // Phase 31/32 finding: a universal six-digit bypass code previously
    // worked for ANY account's password reset, completely UNGATED by
    // environment (a real account-takeover-shaped gap Phase 23 did not
    // cover — that phase only touched src/App.tsx's own login form).
    // Now routed through src/lib/demoCredentials.ts's shared bypass-code
    // pool, which resolves to an empty array (never matches) in a real
    // `VITE_APP_ENV=production` build.
    if (resetCode.trim() !== lastIssuedCode && !getDemoOtpBypassCodes().includes(resetCode.trim())) {
      setCodeError('Invalid verification token. Double-check your WhatsApp, SMS, or Email inbox.');
      return;
    }

    // Single-use code verification - once verified, clear the code
    setStep(3); // Go to password setup floor
  };

  // Handle Save New Password & Invalidate Sessions
  const handleResetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);

    if (newPassword.length < 8) {
      setPasswordError('Vault security requires at least 8 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('Credentials mismatch. Repeat password exactly.');
      return;
    }

    const strength = getPasswordStrength();
    if (strength.score < 50) {
      setPasswordError('Please strengthen your credentials. Select a mixture of upper/lowercase, numbers, and symbols.');
      return;
    }

    if (!matchedUser) return;

    // Check "New password matches the old one". Phase 32: no longer
    // assumes an unset passwordHash implicitly means the demo
    // hardcoded demo seed password value (a stray literal with no real bearing on
    // this check's own purpose) — an unset hash simply has nothing to
    // compare against.
    const currentHash = matchedUser.passwordHash;
    if (currentHash && newPassword === currentHash) {
      setPasswordError('Security Guard: Your new password cannot match your current or previous password. Please choose a new vault token.');
      return;
    }

    // Update password in DB
    const updatedUser: User = {
      ...matchedUser,
      passwordHash: newPassword,
      // Flag session salt to invalidate other active logs
      onboardingCompleted: matchedUser.onboardingCompleted ?? true
    };

    DbManager.updateUser(updatedUser);

    // Provably close all other active sessions:
    // 1. If currently signed-in user is this user, handle session logout
    // 2. We set a sessions invalidated flag on localStorage to close logs across tabs
    localStorage.setItem(`aiec_sessions_invalidated_${matchedUser.id}`, String(Date.now()));
    
    // Clear current session token if it matches
    const currentToken = localStorage.getItem('aiec_session_token');
    if (currentToken === `session_${matchedUser.id}`) {
      localStorage.removeItem('aiec_session_token');
    }

    // Clean up draft
    localStorage.removeItem('aiec_forgot_password_draft');

    setStep(4); // Success floor!
  };

  // Quick helper to fill a pre-seeded credentials for rapid developer evaluation
  const handleSimulateCredentials = (phoneOrEmailVal: string, method: 'whatsapp' | 'sms' | 'email') => {
    setPhoneOrEmail(phoneOrEmailVal);
    setVerificationMethod(method);
    setInputError(null);
  };

  const strength = getPasswordStrength();

  return (
    <div className="w-full max-w-2xl bg-white rounded-3xl border border-[rgba(184,135,61,0.18)] p-6 md:p-8 space-y-6 shadow-diffuse relative overflow-hidden text-left">
      
      {/* Top Banner showing auto-saved draft states */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-alabaster flex">
        <div 
          className="h-full bg-antiquegold transition-all duration-500"
          style={{ width: `${(step / 4) * 100}%` }}
        />
      </div>

      {/* Main Grid: Left is "The Ascension Line" Elevator, Right is interactive form */}
      <div className="flex flex-col md:flex-row gap-6 md:gap-8">
        
        {/* LEFT COLUMN: THE ASCENSION LINE (Elevator-themed step indicator) */}
        <div className="w-full md:w-[150px] bg-[#F8F6F1] p-4 rounded-2xl border border-[rgba(184,135,61,0.12)] flex flex-row md:flex-col justify-between items-center relative shrink-0">
          
          {/* Vertical Track background */}
          <div className="absolute left-1/2 top-4 bottom-4 w-0.5 bg-[#e5dfd4] -translate-x-1/2 hidden md:block" />
          
          {/* Horizontal Track for mobile layout */}
          <div className="absolute top-1/2 left-4 right-4 h-0.5 bg-[#e5dfd4] -translate-y-1/2 block md:hidden" />

          {/* Floor 4: Secured */}
          <div className="flex md:flex-col items-center gap-1 z-10">
            <span className={`text-[9px] font-mono font-bold ${step === 4 ? 'text-success' : 'text-warmgray/60'}`}>4F</span>
            <div className={`w-8 h-8 rounded-full border flex items-center justify-center font-mono text-xs font-bold transition-all ${
              step === 4 ? 'bg-success text-white border-success ring-4 ring-success/20' : step > 4 ? 'bg-[#0E4B3D]/10 text-royalemerald border-[#0E4B3D]' : 'bg-white text-warmgray border-[#e5dfd4]'
            }`}>
              {step > 4 ? '✓' : '🔒'}
            </div>
            <span className="text-[8px] font-bold text-center font-sans tracking-wide leading-tight hidden md:block">SECURED</span>
          </div>

          {/* Floor 3: New Password */}
          <div className="flex md:flex-col items-center gap-1 z-10">
            <span className={`text-[9px] font-mono font-bold ${step === 3 ? 'text-antiquegold' : 'text-warmgray/60'}`}>3F</span>
            <div className={`w-8 h-8 rounded-full border flex items-center justify-center font-mono text-xs font-bold transition-all ${
              step === 3 ? 'bg-antiquegold text-white border-antiquegold ring-4 ring-antiquegold/20' : step > 3 ? 'bg-[#0E4B3D]/10 text-royalemerald border-success' : 'bg-white text-warmgray border-[#e5dfd4]'
            }`}>
              {step > 3 ? '✓' : '🔑'}
            </div>
            <span className="text-[8px] font-bold text-center font-sans tracking-wide leading-tight hidden md:block">NEW PIN</span>
          </div>

          {/* Floor 2: Verification */}
          <div className="flex md:flex-col items-center gap-1 z-10">
            <span className={`text-[9px] font-mono font-bold ${step === 2 ? 'text-antiquegold' : 'text-warmgray/60'}`}>2F</span>
            <div className={`w-8 h-8 rounded-full border flex items-center justify-center font-mono text-xs font-bold transition-all ${
              step === 2 ? 'bg-antiquegold text-white border-antiquegold ring-4 ring-antiquegold/20' : step > 2 ? 'bg-[#0E4B3D]/10 text-royalemerald border-success' : 'bg-white text-warmgray border-[#e5dfd4]'
            }`}>
              {step > 2 ? '✓' : '📲'}
            </div>
            <span className="text-[8px] font-bold text-center font-sans tracking-wide leading-tight hidden md:block">VERIFY</span>
          </div>

          {/* Floor 1: Request */}
          <div className="flex md:flex-col items-center gap-1 z-10">
            <span className={`text-[9px] font-mono font-bold ${step === 1 ? 'text-antiquegold' : 'text-warmgray/60'}`}>1F</span>
            <div className={`w-8 h-8 rounded-full border flex items-center justify-center font-mono text-xs font-bold transition-all ${
              step === 1 ? 'bg-antiquegold text-white border-antiquegold ring-4 ring-antiquegold/20' : step > 1 ? 'bg-[#0E4B3D]/10 text-royalemerald border-success' : 'bg-white text-warmgray border-[#e5dfd4]'
            }`}>
              {step > 1 ? '✓' : '🎯'}
            </div>
            <span className="text-[8px] font-bold text-center font-sans tracking-wide leading-tight hidden md:block">REQUEST</span>
          </div>

        </div>

        {/* RIGHT COLUMN: INTERACTIVE FORM CONTAINER */}
        <div className="flex-1 space-y-6">
          
          {/* Simulated Toast Alerts (e.g. Code Dispatch) */}
          <AnimatePresence>
            {toastMessage && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                onClick={() => {
                  if (step === 2) {
                    setResetCode(lastIssuedCode);
                  }
                }}
                className="p-3.5 bg-[#0E4B3D]/95 border-l-4 border-antiquegold text-white rounded-xl shadow-lg cursor-pointer hover:bg-[#0E4B3D] transition-all flex items-start gap-3"
              >
                <div className="w-8 h-8 rounded-lg bg-[#B8873D] text-white flex items-center justify-center font-mono font-bold shrink-0">
                  💬
                </div>
                <div className="space-y-0.5 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-antiquegold uppercase tracking-wider font-mono">Simulated OTP Delivery Node</span>
                    <span className="text-[9px] text-white/50 font-mono">JUST NOW</span>
                  </div>
                  <p className="text-[11px] leading-tight text-white/90 font-mono font-semibold">
                    {toastMessage}
                  </p>
                  <span className="text-[9px] text-antiquegold font-bold block animate-pulse">⚡ Click to Auto-Fill reset token</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* MAIN STAGE CARDS BY STEP */}
          <AnimatePresence mode="wait">
            
            {/* STEP 1: REQUEST SECURE RECOVERY */}
            {step === 1 && (
              <motion.div
                key="step-1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="border-b border-[#e6dfd4] pb-3 text-left">
                  <span className="text-[10px] font-mono font-extrabold text-royalemerald uppercase tracking-widest flex items-center gap-1">
                    <Shield className="w-3.5 h-3.5 text-antiquegold" /> FORGOT PASSWORD HUB
                  </span>
                  <h3 className="font-serif text-2xl font-bold text-charcoal">Secure Vault Reset</h3>
                  <p className="text-xs text-warmgray mt-0.5">Enter your verified email address or mobile number to dispatch a single-use verification token.</p>
                </div>

                {/* Developer Pre-fills sandbox — Phase 32: routed through
                    demoCredentials.ts so this panel (and the privileged
                    admin identity it reveals) does not exist in a
                    production build's bundle output at all. */}
                {getDemoQuickFillOptions() && (
                  <div className="p-3 bg-alabaster rounded-xl border border-[rgba(184,135,61,0.12)] space-y-2">
                    <span className="text-[9px] font-mono font-bold text-[#B8873D] uppercase tracking-wider block">🧪 Developer Rapid Testing Sandbox</span>
                    <p className="text-[10px] text-warmgray leading-relaxed">Select pre-seeded roles or triggers to inspect validation flows instantly:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {getDemoQuickFillOptions()!.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => handleSimulateCredentials(opt.value, opt.method)}
                          className="px-2 py-1 bg-white hover:bg-[#edeae2] border border-[#e6dfd4] text-[9px] font-bold rounded-lg text-charcoal cursor-pointer"
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <form onSubmit={handleRequestReset} className="space-y-5">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold text-charcoal uppercase tracking-wider">Verified Credential Address</label>
                    <div className="relative">
                      <input
                        type="text"
                        required
                        placeholder="e.g. customer@aiec.com or +91 98765 43214"
                        value={phoneOrEmail}
                        onChange={(e) => {
                          setPhoneOrEmail(e.target.value);
                          setInputError(null);
                        }}
                        className="w-full pl-10 pr-10 py-3 bg-alabaster border border-[rgba(184,135,61,0.15)] rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-antiquegold text-charcoal"
                      />
                      <span className="absolute left-3.5 top-3.5 text-warmgray">
                        {phoneOrEmail.includes('@') ? <Mail className="w-4 h-4" /> : <Smartphone className="w-4 h-4" />}
                      </span>
                      {isInputValid && (
                        <span className="absolute right-3.5 top-3.5 text-success">
                          <CheckCircle2 className="w-4.5 h-4.5 stroke-[2.5]" />
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-warmgray">Our gateway checks database records across all administrative, surveyor, technician, client, and manufacturing accounts.</p>
                  </div>

                  {/* Verification Channel Selector */}
                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold text-charcoal uppercase tracking-wider">Select Desired Security Channel</label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setVerificationMethod('whatsapp')}
                        className={`p-2.5 rounded-xl border flex flex-col items-center gap-1 transition-all cursor-pointer ${
                          verificationMethod === 'whatsapp'
                            ? 'border-antiquegold bg-[#B8873D]/5 text-charcoal font-bold'
                            : 'border-[#e6dfd4] text-warmgray hover:bg-alabaster'
                        }`}
                      >
                        <MessageSquare className="w-4 h-4 text-success" />
                        <span className="text-[10px]">WhatsApp</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setVerificationMethod('sms')}
                        className={`p-2.5 rounded-xl border flex flex-col items-center gap-1 transition-all cursor-pointer ${
                          verificationMethod === 'sms'
                            ? 'border-antiquegold bg-[#B8873D]/5 text-charcoal font-bold'
                            : 'border-[#e6dfd4] text-warmgray hover:bg-alabaster'
                        }`}
                      >
                        <SmartphoneNfc className="w-4 h-4 text-royalemerald" />
                        <span className="text-[10px]">SMS Pin</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setVerificationMethod('email')}
                        className={`p-2.5 rounded-xl border flex flex-col items-center gap-1 transition-all cursor-pointer ${
                          verificationMethod === 'email'
                            ? 'border-antiquegold bg-[#B8873D]/5 text-charcoal font-bold'
                            : 'border-[#e6dfd4] text-warmgray hover:bg-alabaster'
                        }`}
                      >
                        <Mail className="w-4 h-4 text-antiquegold" />
                        <span className="text-[10px]">Email OTP</span>
                      </button>
                    </div>
                  </div>

                  {inputError && (
                    <div className="p-3.5 bg-error/10 border border-error/20 rounded-xl flex gap-2.5 items-start text-error text-xs font-semibold">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{inputError}</span>
                    </div>
                  )}

                  {rateLimitTimer > 0 && (
                    <div className="p-3 bg-warning/10 text-warning border border-warning/15 text-[10px] font-mono font-bold rounded-lg text-center animate-pulse">
                      ⏱️ Rate Limit Cooldown Active: Wait {rateLimitTimer}s to request again
                    </div>
                  )}

                  {/* STICKY BOTTOM ACTION BAR OR INLINE PRIMARY BUTTON */}
                  <div className="pt-2 flex justify-between items-center gap-4">
                    <button
                      type="button"
                      onClick={onBackToLogin}
                      className="text-xs font-bold text-warmgray hover:text-charcoal flex items-center gap-1 cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" /> Back to Login
                    </button>
                    
                    <button
                      type="submit"
                      disabled={!isInputValid || rateLimitTimer > 0}
                      className="px-5 py-3 bg-royalemerald hover:bg-[#0b3c31] disabled:bg-warmgray/35 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-md cursor-pointer transition-all"
                    >
                      <span>Dispatch Security Token</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </form>
              </motion.div>
            )}

            {/* STEP 2: CODE VERIFICATION */}
            {step === 2 && (
              <motion.div
                key="step-2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="border-b border-[#e6dfd4] pb-3">
                  <span className="text-[10px] font-mono font-extrabold text-antiquegold uppercase tracking-widest block">2ND FLOOR: AUTHENTICATION DECK</span>
                  <h3 className="font-serif text-2xl font-bold text-charcoal">Verify Security Token</h3>
                  <p className="text-xs text-warmgray mt-0.5">
                    We dispatched a single-use 6-digit verification code to your verified{' '}
                    <strong className="text-charcoal">{verificationMethod === 'email' ? 'Email inbox' : 'Mobile Device'}</strong>.
                  </p>
                </div>

                <form onSubmit={handleVerifyCode} className="space-y-5">
                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold text-charcoal uppercase tracking-wider text-center">6-Digit Secure Token</label>
                    <div className="max-w-xs mx-auto">
                      <input
                        type="text"
                        required
                        maxLength={6}
                        placeholder="6-digit code"
                        value={resetCode}
                        onChange={(e) => {
                          setResetCode(e.target.value.replace(/\D/g, ''));
                          setCodeError(null);
                        }}
                        className="w-full tracking-widest text-center text-xl font-mono font-bold bg-alabaster border-2 border-[rgba(184,135,61,0.18)] focus:border-antiquegold rounded-xl py-3 focus:outline-none"
                      />
                    </div>
                    <p className="text-[9px] text-warmgray text-center">
                      Security policy: This code remains valid for exactly <strong className="text-charcoal">15 minutes</strong> and will immediately self-destruct upon verification.
                    </p>
                  </div>

                  {codeError && (
                    <div className="p-3.5 bg-error/10 border border-error/20 rounded-xl flex gap-2.5 items-start text-error text-xs font-semibold">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{codeError}</span>
                    </div>
                  )}

                  <div className="pt-2 flex justify-between items-center gap-4">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="text-xs font-bold text-warmgray hover:text-charcoal flex items-center gap-1 cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" /> Request again
                    </button>

                    <button
                      type="submit"
                      disabled={resetCode.length < 4}
                      className="px-5 py-3 bg-royalemerald hover:bg-[#0b3c31] disabled:bg-warmgray/35 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-md cursor-pointer transition-all"
                    >
                      <span>Verify Security Token</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </form>
              </motion.div>
            )}

            {/* STEP 3: RESET PASSWORD */}
            {step === 3 && (
              <motion.div
                key="step-3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="border-b border-[#e6dfd4] pb-3">
                  <span className="text-[10px] font-mono font-extrabold text-antiquegold uppercase tracking-widest block">3RD FLOOR: DEPLOY VAULT KEY</span>
                  <h3 className="font-serif text-2xl font-bold text-charcoal">Configure New Password</h3>
                  <p className="text-xs text-warmgray mt-0.5">Establish your high-efficiency security password. For your protection, do not reuse passwords from external platforms.</p>
                </div>

                <form onSubmit={handleResetPassword} className="space-y-5">
                  
                  {/* Account detail matched banner */}
                  {matchedUser && (
                    <div className="p-3 bg-[#0E4B3D]/5 border border-[#0E4B3D]/10 rounded-xl flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#0E4B3D]/15 text-royalemerald flex items-center justify-center font-bold font-serif text-xs">
                        {matchedUser.name[0]}
                      </div>
                      <div className="text-left">
                        <p className="text-xs font-bold text-charcoal">{matchedUser.name}</p>
                        <p className="text-[9px] text-warmgray uppercase tracking-widest font-mono font-semibold">{matchedUser.role} Account Hub • Pune Division</p>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-bold text-charcoal uppercase tracking-wider">New Password</label>
                      <div className="relative">
                        <input
                          type="password"
                          required
                          value={newPassword}
                          onChange={(e) => {
                            setNewPassword(e.target.value);
                            setPasswordError(null);
                          }}
                          placeholder="At least 8 characters"
                          className="w-full pl-9 pr-4 py-2.5 bg-alabaster border border-[rgba(184,135,61,0.15)] rounded-xl text-xs font-semibold focus:outline-none"
                        />
                        <Lock className="w-4 h-4 text-warmgray absolute left-3 top-3" />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-bold text-charcoal uppercase tracking-wider">Confirm New Password</label>
                      <div className="relative">
                        <input
                          type="password"
                          required
                          value={confirmPassword}
                          onChange={(e) => {
                            setConfirmPassword(e.target.value);
                            setPasswordError(null);
                          }}
                          placeholder="At least 8 characters"
                          className="w-full pl-9 pr-4 py-2.5 bg-alabaster border border-[rgba(184,135,61,0.15)] rounded-xl text-xs font-semibold focus:outline-none"
                        />
                        <Lock className="w-4 h-4 text-warmgray absolute left-3 top-3" />
                      </div>
                    </div>
                  </div>

                  {/* Live Password Strength Meter */}
                  <div className="space-y-2 bg-alabaster p-3.5 rounded-xl border border-[#e6dfd4]">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="font-bold text-charcoal uppercase tracking-wide">Live Strength Indicator:</span>
                      <span className={`font-bold uppercase tracking-wider font-mono ${strength.text}`}>
                        {strength.label}
                      </span>
                    </div>

                    {/* Colored Progress Bar */}
                    <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-300 ${strength.color}`}
                        style={{ width: `${strength.score}%` }}
                      />
                    </div>

                    {/* Micro Validation check criteria */}
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1 pt-1 text-[9px] text-warmgray font-medium">
                      <div className="flex items-center gap-1.5">
                        <span className={newPassword.length >= 8 ? "text-success" : "text-warmgray/45"}>
                          {newPassword.length >= 8 ? "✓" : "○"}
                        </span>
                        <span>8+ Characters</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={/[A-Z]/.test(newPassword) ? "text-success" : "text-warmgray/45"}>
                          {/[A-Z]/.test(newPassword) ? "✓" : "○"}
                        </span>
                        <span>Capital Letter</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={/[0-9]/.test(newPassword) ? "text-success" : "text-warmgray/45"}>
                          {/[0-9]/.test(newPassword) ? "✓" : "○"}
                        </span>
                        <span>Contains a Number</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={/[^A-Za-z0-9]/.test(newPassword) ? "text-success" : "text-warmgray/45"}>
                          {/[^A-Za-z0-9]/.test(newPassword) ? "✓" : "○"}
                        </span>
                        <span>Special Character</span>
                      </div>
                    </div>
                  </div>

                  {passwordError && (
                    <div className="p-3.5 bg-error/10 border border-error/20 rounded-xl flex gap-2.5 items-start text-error text-xs font-semibold">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{passwordError}</span>
                    </div>
                  )}

                  {/* Security Assurance Disclaimer */}
                  <div className="p-3 bg-royalemerald/5 border border-royalemerald/15 rounded-xl text-[10px] text-royalemerald leading-normal flex gap-2.5">
                    <ShieldAlert className="w-4 h-4 text-antiquegold shrink-0 mt-0.5" />
                    <span>
                      <strong>SECURITY PROTOCOL:</strong> Clicking reset will immediately terminate, invalidate, and lock all other active browser, mobile, or regional terminal sessions globally.
                    </span>
                  </div>

                  <div className="pt-2 flex justify-between items-center gap-4">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="text-xs font-bold text-warmgray hover:text-charcoal flex items-center gap-1 cursor-pointer"
                    >
                      Cancel
                    </button>

                    <button
                      type="submit"
                      disabled={newPassword.length < 8 || newPassword !== confirmPassword || strength.score < 50}
                      className="px-5 py-3 bg-royalemerald hover:bg-[#0b3c31] disabled:bg-warmgray/35 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-md cursor-pointer transition-all"
                    >
                      <span>Deploy New Vault Key</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>

                </form>
              </motion.div>
            )}

            {/* STEP 4: SECURED SUCCESS */}
            {step === 4 && (
              <motion.div
                key="step-4"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="text-center py-6 space-y-6"
              >
                <div className="w-16 h-16 bg-success/10 text-success rounded-full flex items-center justify-center mx-auto ring-8 ring-success/5">
                  <Check className="w-8 h-8 stroke-[3]" />
                </div>

                <div className="space-y-2 max-w-md mx-auto">
                  <h3 className="font-serif text-2xl font-bold text-charcoal">Security Ledger Realigned</h3>
                  <p className="text-xs text-warmgray">
                    Your password vault has been successfully re-anchored. For absolute security,{' '}
                    <strong className="text-royalemerald font-semibold">all other open browser sessions across all devices have been terminated.</strong>
                  </p>
                </div>

                <div className="p-3.5 bg-alabaster rounded-xl border border-[rgba(184,135,61,0.12)] space-y-1 text-left font-mono text-[10px] text-warmgray max-w-sm mx-auto">
                  <div className="flex justify-between text-charcoal font-semibold">
                    <span>SECURITY STATE:</span>
                    <span className="text-success">SAFE & VALIDATED</span>
                  </div>
                  <div className="flex justify-between">
                    <span>CONCURRENT SESSIONS:</span>
                    <span>0 TERMINATED (ALL VOID)</span>
                  </div>
                  <div className="flex justify-between">
                    <span>ENCRYPTION ALGORITHM:</span>
                    <span>SHA-256 SALT HARDENED</span>
                  </div>
                </div>

                <div className="pt-2 max-w-xs mx-auto">
                  <Button variant="emerald" onClick={onBackToLogin} fullWidth className="py-3 bg-[#0E4B3D] text-white">
                    <span>Return and Sign In</span>
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </motion.div>
            )}

            {/* STEP 5: MANUAL ADMIN SUPPORT (EDGE CASE PATH) */}
            {step === 5 && (
              <motion.div
                key="step-5"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-6 text-left"
              >
                <div className="border-b border-[#e6dfd4] pb-3">
                  <span className="text-[10px] font-mono font-bold text-error uppercase tracking-widest block flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> UNVERIFIED ACCOUNT DISCOVERY
                  </span>
                  <h3 className="font-serif text-2xl font-bold text-charcoal">Manual Support Recovery</h3>
                  <p className="text-xs text-warmgray mt-0.5 font-medium">This legacy or pre-seeded profile contains no registered mobile coordinates or email routes to complete automated recovery.</p>
                </div>

                <div className="p-4 bg-alabaster border border-[rgba(184,135,61,0.18)] rounded-2xl space-y-3">
                  <p className="text-xs text-charcoal leading-relaxed font-semibold">
                    Because this is an imported legacy account record, please coordinate with Mr. Prashant Vasant Wable's HQ Operations Support to link your device credentials manually.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="p-3 bg-white rounded-xl border border-[#e6dfd4] space-y-1">
                      <span className="text-[8px] uppercase tracking-wider text-warmgray font-mono block">HQ REGIONAL HOTLINE</span>
                      <p className="text-xs font-bold text-charcoal">+91 98765 43210</p>
                      <p className="text-[9px] text-warmgray">Pune HQ Operations Center</p>
                    </div>

                    <div className="p-3 bg-white rounded-xl border border-[#e6dfd4] space-y-1">
                      <span className="text-[8px] uppercase tracking-wider text-warmgray font-mono block">SUPPORT DISPATCH EMAIL</span>
                      <p className="text-xs font-bold text-charcoal">support@allindiaelevators.com</p>
                      <p className="text-[9px] text-warmgray">Usually responds within 15 minutes</p>
                    </div>
                  </div>
                </div>

                <div className="p-3.5 bg-warning/5 border border-warning/15 rounded-xl text-[10px] text-warning font-semibold leading-normal flex gap-2">
                  <AlertCircle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                  <span>Verify your ID documents (Aadhaar, PAN, or construction contractor certificate) when initiating administrative reset requests.</span>
                </div>

                <div className="pt-2 flex justify-between items-center">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="text-xs font-bold text-warmgray hover:text-charcoal flex items-center gap-1 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" /> Search another account
                  </button>

                  <Button variant="emerald" onClick={onBackToLogin} className="bg-[#0E4B3D] text-white">
                    <span>Back to Gateway</span>
                  </Button>
                </div>
              </motion.div>
            )}

          </AnimatePresence>

          {/* Footer Metadata */}
          <div className="border-t border-[#e6dfd4]/60 pt-4 flex items-center justify-between text-[9px] text-warmgray font-mono">
            <span>{draftStatus || 'Device vault active'}</span>
            <span>SECURE GATEWAY CERTIFICATE #AIEC-PWD-771</span>
          </div>

        </div>

      </div>

    </div>
  );
};
