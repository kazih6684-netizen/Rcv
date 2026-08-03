import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { UserSearch } from './components/UserSearch';
import { AdminDashboard } from './components/AdminDashboard';
import { SmsSimulator } from './components/SmsSimulator';
import { AdminLoginModal } from './components/AdminLoginModal';
import { ApkDownload } from './components/ApkDownload';
import { PaymentRecord, PaymentStats, PaymentMethod } from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState<'search' | 'admin' | 'simulator' | 'apk'>('search');
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState<boolean>(false);
  const [showAdminModal, setShowAdminModal] = useState<boolean>(false);
  const [smsPermissionGranted, setSmsPermissionGranted] = useState<boolean>(true);
  const [firebaseConnected, setFirebaseConnected] = useState<boolean>(true);

  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [stats, setStats] = useState<PaymentStats | null>(null);

  // Fetch initial data
  const fetchPayments = async () => {
    try {
      const res = await fetch('/api/payments');
      const data = await res.json();
      if (data.success && Array.isArray(data.payments)) {
        setPayments(data.payments);
      }
    } catch (err) {
      console.error('Failed to fetch payments:', err);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
      if (data.success && data.stats) {
        setStats(data.stats);
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  useEffect(() => {
    fetchPayments();
    fetchStats();
  }, []);

  const handleRefresh = async () => {
    await Promise.all([fetchPayments(), fetchStats()]);
  };

  // Search API Call
  const handleSearch = async (digits: string): Promise<PaymentRecord[]> => {
    try {
      const res = await fetch('/api/payments/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ digits }),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.matchedPayments)) {
        return data.matchedPayments;
      }
      return [];
    } catch (err) {
      console.error('Search request failed', err);
      return [];
    }
  };

  // Delete payment
  const handleDeletePayment = async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/payments/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        await handleRefresh();
        return true;
      }
      return false;
    } catch (err) {
      console.error('Delete request failed', err);
      return false;
    }
  };

  // Manual payment entry
  const handleAddManualPayment = async (dataPayload: {
    amount: number;
    paymentMethod: PaymentMethod;
    senderNumber: string;
    transactionId: string;
  }): Promise<boolean> => {
    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataPayload),
      });
      const data = await res.json();
      if (data.success) {
        await handleRefresh();
        return true;
      }
      return false;
    } catch (err) {
      console.error('Add payment failed', err);
      return false;
    }
  };

  // Parse SMS & Auto Save
  const handleParseAndSaveSMS = async (smsText: string): Promise<PaymentRecord | null> => {
    try {
      const res = await fetch('/api/sms/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ smsText }),
      });
      const data = await res.json();
      if (data.success && data.payment) {
        await handleRefresh();
        return data.payment;
      }
      return null;
    } catch (err) {
      console.error('SMS parse failed', err);
      return null;
    }
  };

  return (
    <div id="unity-earning-app-root" className="min-h-screen bg-slate-900 text-slate-800 flex flex-col font-sans">
      {/* App Header Bar */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isAdminLoggedIn={isAdminLoggedIn}
        onOpenAdminLogin={() => {
          if (isAdminLoggedIn) {
            setActiveTab('admin');
          } else {
            setShowAdminModal(true);
          }
        }}
        firebaseConnected={firebaseConnected}
      />

      {/* Main Content inside Phone Frame or Fullscreen */}
      <main className="flex-1 w-full min-h-screen bg-slate-100">
        <div className="py-4">
          {activeTab === 'search' && (
              <UserSearch onSearch={handleSearch} />
            )}

          {activeTab === 'admin' && (
            isAdminLoggedIn ? (
              <div className="space-y-6 pb-12">
                <AdminDashboard
                  payments={payments}
                  stats={stats}
                  onRefresh={handleRefresh}
                  onDeletePayment={handleDeletePayment}
                  onAddManualPayment={handleAddManualPayment}
                  smsPermissionGranted={smsPermissionGranted}
                  onToggleSmsPermission={() => setSmsPermissionGranted(!smsPermissionGranted)}
                  firebaseConnected={firebaseConnected}
                />
                
                {/* Simulator shown at the bottom of the admin dashboard for testing */}
                <div className="max-w-6xl mx-auto px-4 sm:px-6">
                  <div className="border-t-2 border-dashed border-slate-300 pt-8 mt-4">
                    <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                      <span className="bg-slate-200 text-slate-700 px-2.5 py-1 rounded-lg text-sm">Developer Tools</span>
                      <span>SMS Receiver Simulation</span>
                    </h2>
                    <SmsSimulator
                      onParseAndSaveSMS={handleParseAndSaveSMS}
                      smsPermissionGranted={smsPermissionGranted}
                      onTogglePermission={() => setSmsPermissionGranted(!smsPermissionGranted)}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center space-y-4 max-w-sm mx-auto mt-10 bg-white rounded-2xl shadow-sm border border-slate-200">
                <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto">
                  <span className="text-2xl font-bold">🔒</span>
                </div>
                <h3 className="text-xl font-bold text-slate-900">Admin Authentication Required</h3>
                <p className="text-sm text-slate-500">
                  You must log in to access the dashboard and system settings.
                </p>
                <button
                  onClick={() => setShowAdminModal(true)}
                  className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md transition mt-4"
                >
                  Enter Admin Password
                </button>
              </div>
            )
          )}

          {activeTab === 'apk' && (
            <ApkDownload />
          )}

        </div>
      </main>

      {/* Admin Login Password Modal */}
      <AdminLoginModal
        isOpen={showAdminModal}
        onClose={() => setShowAdminModal(false)}
        onLoginSuccess={() => {
          setIsAdminLoggedIn(true);
          setActiveTab('admin');
        }}
      />
    </div>
  );
}
