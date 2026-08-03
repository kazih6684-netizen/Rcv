import React from 'react';
import {
  Smartphone,
  Maximize2,
  ShieldCheck,
  Search,
  MessageSquareCode,
  Download,
  Wifi,
  Lock,
  Unlock,
} from 'lucide-react';

interface HeaderProps {
  activeTab: 'search' | 'admin' | 'simulator' | 'apk';
  setActiveTab: (tab: 'search' | 'admin' | 'simulator' | 'apk') => void;
  isAdminLoggedIn: boolean;
  onOpenAdminLogin: () => void;
  firebaseConnected: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  isAdminLoggedIn,
  onOpenAdminLogin,
  firebaseConnected,
}) => {
  return (
    <header id="main-app-header" className="bg-slate-900 text-white shadow-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        {/* Brand & App Title */}
        <div 
          className="flex items-center space-x-3 cursor-pointer group"
          onClick={() => setActiveTab('search')}
          title="Go to Home"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-slate-950 font-bold shadow-lg shadow-emerald-500/20 group-hover:scale-105 transition-transform">
            <Smartphone className="w-6 h-6 text-slate-950" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-base sm:text-lg text-white leading-tight group-hover:text-emerald-400 transition-colors">
                Unity Earning
              </h1>
              <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-emerald-500/30">
                v1.0.4
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block group-hover:text-slate-300 transition-colors">
              Payment Confirm System • bKash • Nagad • Rocket • Upay
            </p>
          </div>
        </div>

        {/* Top Right Actions */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* Download APK Button */}
          <button
            onClick={() => setActiveTab('apk')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-sm ${
              activeTab === 'apk' 
                ? 'bg-emerald-700 text-white border border-emerald-600'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }`}
          >
            <Download className="w-4 h-4" />
            <span className="hidden xs:inline">Download App</span>
          </button>

          {/* Admin Quick Action / Status */}
          <button
            id="admin-auth-header-btn"
            onClick={() => {
              if (!isAdminLoggedIn) {
                onOpenAdminLogin();
              } else {
                setActiveTab('admin');
              }
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition shadow-sm ${
              activeTab === 'admin'
                ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/50'
                : isAdminLoggedIn
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                  : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'
            }`}
          >
            {isAdminLoggedIn ? (
              <>
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Admin Panel</span>
              </>
            ) : (
              <>
                <Lock className="w-3.5 h-3.5 text-slate-400" />
                <span>Admin Login</span>
              </>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
