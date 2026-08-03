import React, { useState } from 'react';
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
} from 'lucide-react';
import { PaymentRecord, PaymentStats, PaymentMethod } from '../types';
import { getProviderBrandColor } from '../utils/smsExtractor';

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
    message?: string;
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


  // Form states for manual entry
  const [newAmount, setNewAmount] = useState<string>('');
  const [newMethod, setNewMethod] = useState<PaymentMethod>('bKash');
  const [newSender, setNewSender] = useState<string>('');
  const [newTrx, setNewTrx] = useState<string>('');
  const [newMessage, setNewMessage] = useState<string>('');
  const [isAdding, setIsAdding] = useState<boolean>(false);

  // Filter logic
  const filteredPayments = payments.filter((p) => {
    const matchesProvider =
      selectedProvider === 'all' || p.paymentMethod === selectedProvider;
    const q = searchQuery.toLowerCase().trim();
    const matchesQuery =
      !q ||
      p.last3DigitsTrx.toLowerCase().includes(q) ||
      p.last3DigitsSender.toLowerCase().includes(q) ||
      p.transactionId.toLowerCase().includes(q) ||
      p.senderNumber.toLowerCase().includes(q) ||
      (p.message && p.message.toLowerCase().includes(q)) ||
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

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAmount || !newSender || !newTrx) return;

    setIsAdding(true);
    const success = await onAddManualPayment({
      amount: parseFloat(newAmount),
      paymentMethod: newMethod,
      senderNumber: newSender.trim(),
      transactionId: newTrx.trim(),
      message: newMessage.trim(),
    });

    if (success) {
      setShowAddModal(false);
      setNewAmount('');
      setNewSender('');
      setNewTrx('');
      setNewMessage('');
    }
    setIsAdding(false);
  };

  const exportCSV = () => {
    const headers = ['ID,Amount,Method,Type,Last3Trx,Last3Sender,SenderNumber,TransactionID,Reference,Balance,DateTime,Status,Message\n'];
    const rows = payments.map(
      (p) =>
        `"${p.id}","${p.amount}","${p.paymentMethod}","${p.transactionType}","${p.last3DigitsTrx}","${p.last3DigitsSender}","${p.senderNumber}","${p.transactionId}","${p.reference}","${p.balance}","${p.dateTime}","${p.status}","${p.message || ''}"\n`
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

      {/* Filter and Search Bar */}
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

        {/* Provider Tabs */}
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
                  <th className="p-3.5">Type</th>
                  <th className="p-3.5">Amount</th>
                  <th className="p-3.5">Ref</th>
                  <th className="p-3.5">Transaction ID</th>
                  <th className="p-3.5">Sender Mobile</th>
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
                      <td className="p-3.5">
                        <span className="text-[10px] uppercase font-bold text-slate-500 px-2 py-0.5 bg-slate-100 rounded">
                          {p.transactionType}
                        </span>
                      </td>
                      <td className="p-3.5 font-extrabold text-slate-900">
                        ৳ {p.amount.toLocaleString('en-BD')}
                      </td>
                      <td className="p-3.5 text-xs text-slate-500 italic">
                        {p.reference}
                      </td>
                      <td className="p-3.5 font-mono text-slate-700 font-bold">{p.transactionId}</td>
                      <td className="p-3.5 font-mono text-slate-700 text-xs">
                        {p.senderNumber}
                      </td>
                      <td className="p-3.5">
                        <div className="max-w-[150px] truncate text-xs text-slate-500 italic" title={p.message}>
                          {p.message || <span className="text-slate-300">No message</span>}
                        </div>
                      </td>
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

      {/* DELETE CONFIRMATION MODAL */}
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

              <div>
                <label className="block font-bold text-slate-700 mb-1">Commit Message (Optional)</label>
                <textarea
                  placeholder="Reason for manual entry or special note..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl"
                  rows={2}
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
