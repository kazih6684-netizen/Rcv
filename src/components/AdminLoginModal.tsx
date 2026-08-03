import React, { useState } from 'react';
import { Lock, X, KeyRound, ShieldCheck, AlertCircle } from 'lucide-react';

interface AdminLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: () => void;
}

export const AdminLoginModal: React.FC<AdminLoginModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
}) => {
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === '212650' || password === '01919012426') {
      setError(null);
      setPassword('');
      onLoginSuccess();
      onClose();
    } else {
      setError('Invalid admin password. Please try again.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 relative space-y-5">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 p-1.5 rounded-lg transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center space-y-2">
          <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-extrabold text-slate-900">Admin Authentication</h3>
          <p className="text-xs text-slate-500">
            Enter the admin password to access dashboard settings and payment records.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Admin Password
            </label>
            <div className="relative">
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                placeholder="••••••"
                autoFocus
                className="w-full px-4 py-3 text-center text-lg font-mono font-bold tracking-widest bg-slate-50 border border-slate-300 focus:border-emerald-500 rounded-xl text-slate-900 focus:ring-2 focus:ring-emerald-500/20 outline-none transition"
              />
              <KeyRound className="w-5 h-5 text-slate-400 absolute left-3.5 top-3.5" />
            </div>
          </div>

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-600 flex items-center gap-2 font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="w-1/2 py-2.5 px-4 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="w-1/2 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition flex items-center justify-center gap-1.5"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Login</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
