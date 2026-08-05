import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  TrendingUp,
  DollarSign,
  Calendar,
  Search,
  Trash2,
  Plus,
  Download,
  Wifi,
  Smartphone,
  RefreshCw,
  X,
  PlusCircle,
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  Inbox,
  Mail,
  History,
  Eye,
} from 'lucide-react';
import { PaymentRecord, PaymentStats, PaymentMethod, AdminSmsLog } from '../types';
import { getProviderBrandColor, parsePaymentSMS, detectProvider, normalizePhoneNumber } from '../utils/smsExtractor';
import { db, collection, query, orderBy, onSnapshot } from '../firebase';

interface AdminDashboardProps {
  payments: PaymentRecord[];
  stats: PaymentStats | null;
  onRefresh: () => void;
  onDeletePayment: (id: string) => Promise<boolean>;
  onAddManualPayment: (data: {
    amount: number;
    paymentMethod: PaymentMethod;
    senderNumber: string;
    transactionId: string;
  }) => Promise<boolean>;
  onClearAllPayments: () => Promise<boolean>;
  smsPermissionGranted: boolean;
  onToggleSmsPermission: () => void;
  firebaseConnected: boolean;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  payments,
  stats,
  onRefresh,
  onDeletePayment,
  onAddManualPayment,
  onClearAllPayments,
  smsPermissionGranted,
  onToggleSmsPermission,
  firebaseConnected,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedProvider, setSelectedProvider] = useState<string>('all');
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [showClearAllConfirm, setShowClearAllConfirm] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'payments' | 'stats' | 'logs' | 'inbox'>('payments');
  const [failedLogs, setFailedLogs] = useState<any[]>([]);
  const [smsLogs, setSmsLogs] = useState<AdminSmsLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [testSmsText, setTestSmsText] = useState('');
  const [testResult, setTestResult] = useState<any>(null);

  const [selectedLog, setSelectedLog] = useState<AdminSmsLog | null>(null);
  const [isConfirmingLog, setIsConfirmingLog] = useState(false);
  const [manualAmount, setManualAmount] = useState('');
  const [manualTrx, setManualTrx] = useState('');
  const [manualSender, setManualSender] = useState('');

  const [inboxSearch, setInboxSearch] = useState('');


  // Form states for manual entry
  const [newAmount, setNewAmount] = useState<string>('');
  const [newMethod, setNewMethod] = useState<PaymentMethod>('bKash');
  const [newSender, setNewSender] = useState<string>('');
  const [newTrx, setNewTrx] = useState<string>('');
  const [isAdding, setIsAdding] = useState<boolean>(false);

  // Filter logic
  const filteredPayments = payments.filter((p) => {
    const matchesProvider =
      selectedProvider === 'all' || p.paymentMethod === selectedProvider;
    const q = searchQuery.toLowerCase().trim();
    const normalizedQ = normalizePhoneNumber(q);
    const normalizedSender = normalizePhoneNumber(p.senderNumber);
    
    const matchesQuery =
      !q ||
      p.last3DigitsTrx.toLowerCase().includes(q) ||
      p.last3DigitsSender.toLowerCase().includes(q) ||
      p.transactionId.toLowerCase().includes(q) ||
      p.senderNumber.toLowerCase().includes(q) ||
      normalizedSender.includes(q) ||
      (normalizedQ.length >= 11 && normalizedSender === normalizedQ) ||
      p.amount.toString().includes(q);
    return matchesProvider && matchesQuery;
  });

  const handleDeleteConfirm = async (id: string) => {
    const success = await onDeletePayment(id);
    if (success) {
      setIsDeletingId(null);
    }
  };

  const handleClearAllConfirm = async () => {
    const success = await onClearAllPayments();
    if (success) {
      setShowClearAllConfirm(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'logs') {
      setIsLoadingLogs(true);
      const q = query(collection(db, 'failed_parse_logs'), orderBy('timestamp', 'desc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setFailedLogs(logs);
        setIsLoadingLogs(false);
      });
      return () => unsubscribe();
    }
    if (activeTab === 'inbox') {
      setIsLoadingLogs(true);
      const q = query(collection(db, 'admin_sms_logs'), orderBy('timestamp', 'desc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AdminSmsLog));
        setSmsLogs(logs);
        setIsLoadingLogs(false);
      });
      return () => unsubscribe();
    }
  }, [activeTab]);

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAmount || !newSender || !newTrx) return;

    setIsAdding(true);
    const success = await onAddManualPayment({
      amount: parseFloat(newAmount),
      paymentMethod: newMethod,
      senderNumber: newSender.trim(),
      transactionId: newTrx.trim(),
    });

    if (success) {
      setShowAddModal(false);
      setNewAmount('');
      setNewSender('');
      setNewTrx('');
    }
    setIsAdding(false);
  };

  const handleTestSms = () => {
    if (!testSmsText.trim()) return;
    const result = parsePaymentSMS(testSmsText);
    setTestResult(result);
  };

  const handleReviewLog = (log: AdminSmsLog) => {
    setSelectedLog(log);
    setManualAmount(log.extractedAmount?.toString() || '');
    setManualTrx(log.extractedTrxId || '');
    setManualSender(log.extractedSender || log.sender || '');
  };

  const handleConfirmSmsLog = async () => {
    if (!selectedLog || !manualAmount || !manualTrx || !manualSender) return;
    
    setIsConfirmingLog(true);
    try {
      const response = await fetch(`/api/admin/sms-logs/${selectedLog.id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: manualAmount,
          trxId: manualTrx,
          senderNumber: manualSender,
          provider: selectedLog.provider || detectProvider(selectedLog.rawText) || 'Nagad'
        }),
      });
      
      const result = await response.json();
      if (result.success) {
        setSelectedLog(null);
        onRefresh();
      } else {
        alert(result.message || "Failed to confirm payment");
      }
    } catch (err) {
      alert("Error confirming payment");
    } finally {
      setIsConfirmingLog(false);
    }
  };

  const exportCSV = () => {
    const headers = ['ID,Amount,Method,Last3Trx,Last3Sender,SenderNumber,TransactionID,DateTime,Status\n'];
    const rows = payments.map(
      (p) =>
        `"${p.id}","${p.amount}","${p.paymentMethod}","${p.last3DigitsTrx}","${p.last3DigitsSender}","${p.senderNumber}","${p.transactionId}","${p.dateTime}","${p.status}"\n`
    );
    const blob = new Blob([...headers, ...rows], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `UnityEarning_Payments_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <div id="admin-dashboard-container" className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Dashboard Top Title & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-emerald-600" />
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Admin Payment Dashboard
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time control panel for payment confirmations, SMS sync, and Firestore database.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onRefresh}
            className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center gap-1.5"
            title="Refresh database"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
            <span>Sync DB</span>
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-md shadow-emerald-600/20 flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Add Payment</span>
          </button>

          <button
            onClick={() => alert("অ্যান্ড্রয়েড অ্যাপ (APK) এই ওয়েব এনভায়রনমেন্ট থেকে সরাসরি তৈরি করা সম্ভব নয়। এসএমএস রিড করার জন্য আপনাকে Flutter বা Android Studio দিয়ে আলাদা একটি অ্যাপ বানাতে হবে যা SMS Permission নিয়ে Firestore-এ ডাটা সিঙ্ক করবে।")}
            className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-md shadow-blue-600/20 flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" />
            <span>Download Admin App</span>
          </button>

          <button
            onClick={exportCSV}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold transition shadow-sm flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={() => setShowClearAllConfirm(true)}
            className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition shadow-md shadow-rose-600/20 flex items-center gap-1.5"
          >
            <Trash2 className="w-4 h-4" />
            <span>Reset Data</span>
          </button>
        </div>
      </div>

      {/* System Status Banner Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* SMS Permission Status Card */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                smsPermissionGranted ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'
              }`}
            >
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                SMS Permission
              </span>
              <span className="text-sm font-extrabold text-slate-900">
                {smsPermissionGranted ? 'Granted (Reading Payment SMS)' : 'Permission Required'}
              </span>
            </div>
          </div>
          <button
            onClick={onToggleSmsPermission}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              smsPermissionGranted
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100'
                : 'bg-amber-500 text-white hover:bg-amber-600 shadow-sm'
            }`}
          >
            {smsPermissionGranted ? 'Granted ✓' : 'Request Permission'}
          </button>
        </div>

        {/* Firebase Connection Status */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                firebaseConnected ? 'bg-emerald-100 text-emerald-600' : 'bg-teal-100 text-teal-600'
              }`}
            >
              <Wifi className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                Database Status
              </span>
              <span className="text-sm font-extrabold text-slate-900">
                {firebaseConnected ? 'Firebase Firestore Live Sync' : 'Real-time Server Active'}
              </span>
            </div>
          </div>
          <span className="flex items-center gap-1.5 bg-emerald-100 text-emerald-800 text-xs font-bold px-3 py-1 rounded-full">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Connected
          </span>
        </div>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Total Payments */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-200 space-y-1">
          <div className="flex justify-between items-center text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Total Payments</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900">
            {stats ? stats.totalPayments : payments.length}
          </div>
          <span className="text-[11px] text-slate-400">All recorded transactions</span>
        </div>

        {/* Card 2: Today's Payments */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-200 space-y-1">
          <div className="flex justify-between items-center text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Today's Payments</span>
            <Calendar className="w-4 h-4 text-teal-600" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900">
            {stats ? stats.todayPayments : 0}
          </div>
          <span className="text-[11px] text-emerald-600 font-semibold">Received today</span>
        </div>

        {/* Card 3: Total Volume */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-200 space-y-1">
          <div className="flex justify-between items-center text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Total Volume</span>
            <DollarSign className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900">
            ৳ {stats ? stats.totalVolume.toLocaleString('en-BD') : 0}
          </div>
          <span className="text-[11px] text-slate-400">Gross total revenue</span>
        </div>

        {/* Card 4: Today's Volume */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-200 space-y-1">
          <div className="flex justify-between items-center text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Today's Volume</span>
            <DollarSign className="w-4 h-4 text-teal-600" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900">
            ৳ {stats ? stats.todayVolume.toLocaleString('en-BD') : 0}
          </div>
          <span className="text-[11px] text-emerald-600 font-semibold">Today's volume</span>
        </div>
      </div>

      {/* Tab Navigation Container */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200">
        <div className="flex items-center space-x-1 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('payments')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition ${
              activeTab === 'payments' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Payments
          </button>
          <button
            onClick={() => setActiveTab('stats')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition ${
              activeTab === 'stats' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Statistics
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition ${
              activeTab === 'logs' ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Failed Parse Logs
          </button>
          <button
            onClick={() => setActiveTab('inbox')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition ${
              activeTab === 'inbox' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Nagad SMS Inbox
          </button>
        </div>
      </div>

      {activeTab === 'payments' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 space-y-3 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-4">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by last 3 digits, Trx ID, mobile number..."
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            {/* Provider Filter */}
            <div className="flex items-center space-x-1 overflow-x-auto no-scrollbar">
              {['all', 'bKash', 'Nagad', 'Rocket', 'Upay'].map((prov) => (
                <button
                  key={`filter-${prov}`}
                  onClick={() => setSelectedProvider(prov)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition ${
                    selectedProvider === prov
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {prov === 'all' ? 'All Providers' : prov}
                </button>
              ))}
            </div>
          </div>

      {/* Payment Table / List */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-emerald-600" />
            <span>Recorded Payments ({filteredPayments.length})</span>
          </h3>
          <span className="text-xs text-slate-500">Live Synced with Firestore</span>
        </div>

        {filteredPayments.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <AlertTriangle className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="text-slate-600 font-semibold text-sm">No payment records found</p>
            <p className="text-xs text-slate-400">Try adjusting your search filter or add a payment manually.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-100 text-slate-500 uppercase text-[10px] font-bold tracking-wider border-b border-slate-200">
                <tr>
                  <th className="p-3.5">Method</th>
                  <th className="p-3.5">Amount</th>
                  <th className="p-3.5">Last 3 Digits</th>
                  <th className="p-3.5">Transaction ID</th>
                  <th className="p-3.5">Sender Mobile</th>
                  <th className="p-3.5">Date & Time</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                {filteredPayments.map((p) => {
                  const brand = getProviderBrandColor(p.paymentMethod);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/80 transition">
                      <td className="p-3.5">
                        <span
                          className={`px-2.5 py-1 rounded-md text-white text-[11px] font-bold ${brand.bg}`}
                        >
                          {p.paymentMethod}
                        </span>
                      </td>
                      <td className="p-3.5 font-extrabold text-slate-900">
                        ৳ {p.amount.toLocaleString('en-BD')}
                      </td>
                      <td className="p-3.5">
                        <div className="flex gap-1.5 font-mono font-bold">
                          <span className="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded border border-slate-200">
                            Trx: {p.last3DigitsTrx}
                          </span>
                          <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                            Ph: {p.last3DigitsSender}
                          </span>
                        </div>
                      </td>
                      <td className="p-3.5 font-mono text-slate-700 font-bold">{p.transactionId}</td>
                      <td className="p-3.5 font-mono text-slate-700">{p.senderNumber}</td>
                      <td className="p-3.5 text-slate-500 text-xs">{p.dateTime}</td>
                      <td className="p-3.5 text-right">
                        <button
                          onClick={() => setIsDeletingId(p.id)}
                          className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition"
                          title="Delete Payment"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )}

      {activeTab === 'logs' && (
        <div className="space-y-6">
          {/* Test SMS Parser Section */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 bg-emerald-50 border-b border-emerald-100">
              <h3 className="font-bold text-emerald-900 text-sm flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-emerald-600" />
                <span>Test SMS Parser</span>
              </h3>
            </div>
            <div className="p-4 space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Paste SMS Text to Test</label>
                <textarea
                  className="w-full h-32 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  placeholder="Paste your Nagad/bKash SMS here..."
                  value={testSmsText}
                  onChange={(e) => setTestSmsText(e.target.value)}
                />
              </div>
              <button
                onClick={handleTestSms}
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition shadow-md shadow-emerald-600/20"
              >
                Test Parser
              </button>

              {testResult && (
                <div className={`p-4 rounded-xl border ${testResult.success ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                  <h4 className={`text-xs font-black uppercase tracking-widest mb-2 ${testResult.success ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {testResult.success ? '✓ Successfully Parsed' : '✗ Parsing Failed'}
                  </h4>
                  {testResult.success ? (
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <p className="text-slate-500">Method</p>
                        <p className="font-bold text-slate-900">{testResult.paymentMethod}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Amount</p>
                        <p className="font-bold text-slate-900">৳{testResult.amount}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Sender</p>
                        <p className="font-bold text-slate-900 font-mono">{testResult.senderNumber}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Trx ID</p>
                        <p className="font-bold text-slate-900 font-mono">{testResult.transactionId}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-rose-600 text-xs font-bold">Error: {testResult.error}</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Failed Logs Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 bg-red-50 border-b border-red-100 flex justify-between items-center">
              <h3 className="font-bold text-red-900 text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <span>Failed SMS Logs ({failedLogs.length})</span>
              </h3>
              <span className="text-[10px] text-red-600 font-bold uppercase tracking-widest bg-red-100 px-2 py-0.5 rounded-full">
                Debug View
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 uppercase font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3">Time</th>
                    <th className="p-3">Sender</th>
                    <th className="p-3">SMS Content</th>
                    <th className="p-3">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {failedLogs.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-slate-400">No failed logs found. Everything is parsing correctly!</td>
                    </tr>
                  ) : (
                    failedLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50">
                        <td className="p-3 whitespace-nowrap text-slate-500">
                          {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString() : 'Recent'}
                        </td>
                        <td className="p-3 font-mono font-bold text-slate-700">{log.sender}</td>
                        <td className="p-3 max-w-md break-words italic text-slate-600">{log.smsText}</td>
                        <td className="p-3 text-red-500 font-bold">{log.error}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'inbox' && (
        <div className="space-y-6">
          {/* Inbox Counters */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-indigo-50 rounded-2xl p-4 border border-indigo-100 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest block">New SMS (Total)</span>
                <span className="text-2xl font-black text-indigo-900">{smsLogs.length}</span>
              </div>
              <Mail className="w-8 h-8 text-indigo-200" />
            </div>
            <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest block">Pending Review</span>
                <span className="text-2xl font-black text-amber-900">
                  {smsLogs.filter(l => l.status === 'Needs Review').length}
                </span>
              </div>
              <AlertTriangle className="w-8 h-8 text-amber-200" />
            </div>
            <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest block">Confirmed Recently</span>
                <span className="text-2xl font-black text-emerald-900">
                  {smsLogs.filter(l => l.status === 'Confirmed').length}
                </span>
              </div>
              <CheckCircle2 className="w-8 h-8 text-emerald-200" />
            </div>
          </div>

          {/* Search & List */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Inbox className="w-4 h-4 text-indigo-600" />
                <span>Nagad SMS Logs</span>
              </h3>
              <div className="relative flex-1 max-w-md">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search by text, phone, or Trx ID..."
                  className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  value={inboxSearch}
                  onChange={(e) => setInboxSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 uppercase font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3">Received At</th>
                    <th className="p-3">Sender</th>
                    <th className="p-3">SMS Content</th>
                    <th className="p-3">Parsed Info</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {smsLogs.filter(log => {
                    const q = inboxSearch.toLowerCase();
                    return !q || 
                      log.rawText.toLowerCase().includes(q) || 
                      log.sender.toLowerCase().includes(q) || 
                      log.extractedTrxId?.toLowerCase().includes(q) || 
                      log.extractedSender?.toLowerCase().includes(q) ||
                      log.extractedAmount?.toString().includes(q);
                  }).map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/80 transition">
                      <td className="p-3 whitespace-nowrap">
                        <div className="text-slate-900 font-semibold">{new Date(log.receivedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                        <div className="text-[10px] text-slate-500">{new Date(log.receivedAt).toLocaleDateString()}</div>
                      </td>
                      <td className="p-3 font-mono font-bold text-slate-700">{log.sender}</td>
                      <td className="p-3 max-w-xs sm:max-w-md">
                        <p className="text-slate-600 line-clamp-2 italic leading-relaxed">"{log.rawText}"</p>
                      </td>
                      <td className="p-3">
                        {log.extractedAmount ? (
                          <div className="space-y-1">
                            <div className="text-emerald-700 font-bold">৳{log.extractedAmount}</div>
                            <div className="text-[10px] font-mono text-slate-500">{log.extractedTrxId}</div>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Not parsed</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                          log.status === 'Confirmed' ? 'bg-emerald-100 text-emerald-700' : 
                          log.status === 'Needs Review' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {log.status}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        {log.status === 'Needs Review' ? (
                          <button 
                            onClick={() => handleReviewLog(log)}
                            className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[10px] font-bold transition flex items-center gap-1 ml-auto"
                          >
                            <Eye className="w-3 h-3" />
                            Review
                          </button>
                        ) : (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 ml-auto" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* REVIEW MODAL */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-6 relative shadow-2xl overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-indigo-600" />
            <button
              onClick={() => setSelectedLog(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 p-1"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-1">
              <h3 className="font-extrabold text-slate-900 text-lg flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                <span>Manual SMS Review</span>
              </h3>
              <p className="text-xs text-slate-500">Examine the raw SMS and confirm the payment details manually.</p>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Raw SMS Content</div>
              <p className="text-sm font-medium text-slate-700 italic leading-relaxed">"{selectedLog.rawText}"</p>
              <div className="mt-3 text-[10px] font-bold text-indigo-600">Sender: {selectedLog.sender}</div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Amount (Tk)</label>
                <input 
                  type="number"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  value={manualAmount}
                  onChange={(e) => setManualAmount(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Transaction ID</label>
                <input 
                  type="text"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-mono font-bold uppercase focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  value={manualTrx}
                  onChange={(e) => setManualTrx(e.target.value)}
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Sender Mobile</label>
                <input 
                  type="text"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  value={manualSender}
                  onChange={(e) => setManualSender(e.target.value)}
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setSelectedLog(null)}
                className="flex-1 py-3 text-slate-700 bg-slate-100 hover:bg-slate-200 font-bold rounded-xl text-sm transition"
              >
                Discard
              </button>
              <button
                onClick={handleConfirmSmsLog}
                disabled={isConfirmingLog}
                className="flex-2 py-3 px-8 text-white bg-indigo-600 hover:bg-indigo-700 font-bold rounded-xl text-sm transition shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2"
              >
                {isConfirmingLog ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Confirm Payment
              </button>
            </div>
          </div>
        </div>
      )}
      {isDeletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-xs w-full p-5 space-y-4 text-center">
            <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-bold text-slate-900 text-base">Delete Payment Record?</h4>
              <p className="text-xs text-slate-500 mt-1">
                This action cannot be undone. This payment record will be permanently deleted from Firebase.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setIsDeletingId(null)}
                className="w-1/2 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteConfirm(isDeletingId)}
                className="w-1/2 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CLEAR ALL CONFIRMATION MODAL */}
      {showClearAllConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-xs w-full p-5 space-y-4 text-center">
            <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-bold text-slate-900 text-base">Reset All Data?</h4>
              <p className="text-xs text-slate-500 mt-1">
                Are you absolutely sure? This will <strong>permanently delete all payment records</strong> from the database. This action cannot be undone.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowClearAllConfirm(false)}
                className="w-1/2 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleClearAllConfirm}
                className="w-1/2 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl"
              >
                Yes, Delete All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD MANUAL PAYMENT MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 space-y-4 relative shadow-2xl">
            <button
              onClick={() => setShowAddModal(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 p-1"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-1">
              <h3 className="font-extrabold text-slate-900 text-lg flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-emerald-600" />
                <span>Add Manual Payment</span>
              </h3>
              <p className="text-xs text-slate-500">Insert payment record directly into database.</p>
            </div>

            <form onSubmit={handleManualSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Payment Method</label>
                <select
                  value={newMethod}
                  onChange={(e) => setNewMethod(e.target.value as PaymentMethod)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold"
                >
                  <option value="bKash">bKash</option>
                  <option value="Nagad">Nagad</option>
                  <option value="Rocket">Rocket</option>
                  <option value="Upay">Upay</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Received Amount (৳)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="500.00"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Sender Mobile Number</label>
                <input
                  type="text"
                  required
                  placeholder="01712345678"
                  value={newSender}
                  onChange={(e) => setNewSender(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Transaction ID (TrxID)</label>
                <input
                  type="text"
                  required
                  placeholder="9A8B7C650"
                  value={newTrx}
                  onChange={(e) => setNewTrx(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold uppercase"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="w-1/2 py-2.5 text-slate-700 bg-slate-100 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAdding}
                  className="w-1/2 py-2.5 text-white bg-emerald-600 hover:bg-emerald-700 font-bold rounded-xl shadow-md shadow-emerald-600/20"
                >
                  {isAdding ? 'Saving...' : 'Save Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
