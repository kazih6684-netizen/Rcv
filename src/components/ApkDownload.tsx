import React from 'react';
import { Download, Smartphone, ShieldCheck, Zap, FileText } from 'lucide-react';

export const ApkDownload: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-8 pb-16">
      <div className="bg-white rounded-3xl overflow-hidden shadow-sm border border-slate-200">
        <div className="p-8 sm:p-12 flex flex-col md:flex-row items-center gap-8">
          
          {/* App Icon/Mockup */}
          <div className="w-32 h-32 sm:w-48 sm:h-48 shrink-0 relative bg-slate-900 rounded-3xl shadow-xl flex items-center justify-center">
            <Smartphone className="w-16 h-16 sm:w-24 sm:h-24 text-emerald-400" />
            <div className="absolute -bottom-3 -right-3 bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-full border-4 border-white shadow-sm">
              v2.1.0
            </div>
          </div>

          {/* App Details */}
          <div className="flex-1 space-y-5 text-center md:text-left">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                Unity Earning App
              </h1>
              <p className="text-slate-500 mt-2 text-sm sm:text-base">
                Download the official Android app to automatically verify your payments. Admin gets real-time SMS sync directly from the device.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-sm font-medium text-slate-600">
              <div className="flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-slate-400" />
                <span>Size: 24.5 MB</span>
              </div>
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <span>100% Secure</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-amber-500" />
                <span>Fast Sync</span>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100">
              <a 
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  alert("নোটিশ: Vercel-এ হোস্ট করার পর এখানে আপনার আসল APK ফাইলের Google Drive বা MediaFire লিংকটি বসাতে হবে।");
                }}
                className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-8 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md shadow-emerald-500/20 transition-all active:scale-95"
              >
                <Download className="w-5 h-5" />
                <span>Download APK Now</span>
              </a>
              <p className="text-xs text-slate-400 mt-3">
                Requires Android 8.0 or later.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
          <h3 className="font-bold text-slate-900 mb-2">How to install?</h3>
          <ol className="text-sm text-slate-600 space-y-2 list-decimal list-inside">
            <li>Click the Download button above.</li>
            <li>Once downloaded, open the APK file.</li>
            <li>If prompted, allow installation from "Unknown Sources" in settings.</li>
            <li>Click Install and open the app.</li>
          </ol>
        </div>
        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
          <h3 className="font-bold text-slate-900 mb-2">Admin Features</h3>
          <ul className="text-sm text-slate-600 space-y-2 list-disc list-inside">
            <li>Login with Admin Number to access full controls.</li>
            <li>Grant SMS permission from the app settings.</li>
            <li>View device information and connection status.</li>
            <li>Automatic background syncing of payment SMS.</li>
          </ul>
        </div>
      </div>
    </div>
  );
};
