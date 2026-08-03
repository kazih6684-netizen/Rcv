import React, { useState } from 'react';
import {
  Search,
  CheckCircle2,
  XCircle,
  Delete,
  RotateCcw,
  MessageCircle,
  Calendar,
  CreditCard,
  PhoneCall,
  Sparkles,
  ShieldAlert,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { PaymentRecord } from '../types';
import { getProviderBrandColor } from '../utils/smsExtractor';

interface UserSearchProps {
  onSearch: (digits: string) => Promise<PaymentRecord[]>;
}

export const UserSearch: React.FC<UserSearchProps> = ({ onSearch }) => {
  const [query, setQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<PaymentRecord[] | null>(null);
  const [searchedQuery, setSearchedQuery] = useState<string>('');
  const [hasSearched, setHasSearched] = useState<boolean>(false);

  const handleClear = () => {
    setQuery('');
    setSearchResults(null);
    setHasSearched(false);
  };

  const triggerConfetti = () => {
    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#10B981', '#E2136E', '#F7921E', '#8C3494', '#0054A6'],
      });
    } catch {
      // Fallback
    }
  };

  const handleSearchSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    setIsLoading(true);
    setSearchedQuery(query.trim());
    setHasSearched(true);

    try {
      const results = await onSearch(query.trim());
      setSearchResults(results);
      if (results && results.length > 0) {
        triggerConfetti();
      }
    } catch (err) {
      console.error('Search error:', err);
      setSearchResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div id="user-search-container" className="max-w-md mx-auto p-4 sm:p-6 space-y-6">
      {/* Header Banner */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-3.5 py-1.5 rounded-full text-emerald-600 text-xs font-semibold">
          <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
          <span>Instant Payment Verification</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Verify Your Payment
        </h2>
        <p className="text-xs sm:text-sm text-slate-600 max-w-xs mx-auto">
          Enter Transaction ID, Sender Number, Amount, or Reference to confirm your payment.
        </p>
      </div>

      {/* Main Search Input */}
      <div className="bg-white rounded-2xl p-5 shadow-xl border border-slate-200 space-y-5">
        <form onSubmit={handleSearchSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">
              Search Details
            </label>
            <div className="relative">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="TrxID, Sender, or Ref..."
                className="w-full py-3.5 pl-4 pr-12 bg-slate-50 border-2 border-slate-200 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 rounded-xl text-slate-900 placeholder-slate-400 font-bold transition outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1.5 rounded-lg transition"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={!query || isLoading}
            className={`w-full py-4 px-6 rounded-xl text-white font-bold text-base shadow-lg transition flex items-center justify-center space-x-2 ${
              query && !isLoading
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-500/25 active:scale-[0.99]'
                : 'bg-slate-300 cursor-not-allowed text-slate-500 shadow-none'
            }`}
          >
            {isLoading ? (
              <div className="flex items-center space-x-2">
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                <span>Checking Database...</span>
              </div>
            ) : (
              <>
                <Search className="w-5 h-5" />
                <span>Verify Payment</span>
              </>
            )}
          </button>
        </form>

        <div className="grid grid-cols-2 gap-2">
          {['bKash', 'Nagad', 'Rocket', 'Upay'].map((method) => (
            <div key={method} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg border border-slate-100">
              <div className={`w-2 h-2 rounded-full ${getProviderBrandColor(method as any).bg}`}></div>
              <span className="text-[10px] font-bold text-slate-600 uppercase">{method} Supported</span>
            </div>
          ))}
        </div>
      </div>

      {/* SEARCH RESULTS SECTION */}
      {hasSearched && !isLoading && (
        <div id="search-results-section" className="space-y-4 animate-in fade-in slide-in-from-bottom-3 duration-300">
          {searchResults && searchResults.length > 0 ? (
            searchResults.map((record) => {
              const brand = getProviderBrandColor(record.paymentMethod);
              return (
                <div
                  key={record.id}
                  className="bg-white rounded-2xl p-5 shadow-2xl border-2 border-emerald-500 relative overflow-hidden space-y-4"
                >
                  {/* Top Success Badge Banner */}
                  <div className="bg-emerald-50 border-b border-emerald-100 -mx-5 -mt-5 p-4 flex items-center justify-between">
                    <div className="flex items-center space-x-2 text-emerald-800 font-extrabold text-sm sm:text-base">
                      <CheckCircle2 className="w-6 h-6 text-emerald-600 animate-bounce" />
                      <span>Payment Received</span>
                    </div>
                    <span className="bg-emerald-600 text-white font-black text-xs px-3 py-1 rounded-full uppercase tracking-wider">
                      Status: {record.status}
                    </span>
                  </div>

                  {/* Payment Details */}
                  <div className="space-y-3 pt-2">
                    {/* Amount */}
                    <div className="text-center py-2 bg-slate-50 rounded-xl border border-slate-100">
                      <span className="text-xs uppercase font-bold text-slate-600 block">
                        Received Amount
                      </span>
                      <span className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
                        ৳ {record.amount.toLocaleString('en-BD', { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs sm:text-sm">
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                        <span className="text-slate-600 font-semibold flex items-center gap-1">
                          <CreditCard className="w-3.5 h-3.5 text-slate-400" /> Method
                        </span>
                        <div className="flex items-center gap-1.5 font-bold">
                          <span
                            className={`px-2 py-0.5 rounded text-white text-xs font-bold ${brand.bg}`}
                          >
                            {record.paymentMethod}
                          </span>
                        </div>
                      </div>

                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                        <span className="text-slate-600 font-semibold flex items-center gap-1">
                          <Search className="w-3.5 h-3.5 text-slate-400" /> Matched Digits
                        </span>
                        <span className="font-extrabold text-slate-900 text-base">
                          {searchedQuery}
                        </span>
                      </div>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-2 text-xs">
                      <div className="flex justify-between items-center text-slate-600 border-b border-slate-200 pb-2">
                        <span className="font-semibold flex items-center gap-1">
                          <CreditCard className="w-3.5 h-3.5 text-slate-400" /> Sender / Account
                        </span>
                        <span className="font-bold text-slate-900">{record.senderNumber} (Last digits: {record.last3DigitsSender})</span>
                      </div>
                      <div className="flex justify-between items-center text-slate-600 border-b border-slate-200 pb-2">
                        <span className="font-semibold flex items-center gap-1">
                          <ShieldAlert className="w-3.5 h-3.5 text-slate-400" /> Transaction ID
                        </span>
                        <span className="font-bold text-slate-900">{record.transactionId}</span>
                      </div>
                      <div className="flex justify-between items-center text-slate-600">
                        <span className="font-semibold flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" /> Date & Time
                        </span>
                        <span className="font-bold text-slate-900">{record.dateTime}</span>
                      </div>
                      {record.message && (
                        <div className="pt-2 border-t border-slate-200 mt-1">
                          <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Admin Note</span>
                          <p className="text-xs text-slate-700 italic font-medium">"{record.message}"</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="text-center pt-1">
                    <span className="text-[11px] text-emerald-700 font-medium">
                      ✓ Synchronized & verified with Admin Payment Database
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            /* NOT FOUND CARD */
            <div className="bg-white rounded-2xl p-6 shadow-xl border-2 border-rose-200 text-center space-y-4">
              <div className="w-14 h-14 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
                <XCircle className="w-8 h-8" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-extrabold text-slate-900">
                  Payment Not Found
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-medium">
                  "No payment has been received using these last 3 digits ({searchedQuery}). Please contact the administrator."
                </p>
              </div>

              {/* Contact Admin Options */}
              <div className="pt-2 space-y-2">
                <a
                  href={`https://wa.me/8801919012426?text=Hello%20Admin,%20I%20sent%20a%20payment%20with%20last%203%20digits%20(${searchedQuery}).%20Please%20verify.`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md transition"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Contact Admin on WhatsApp</span>
                </a>
                <a
                  href="tel:+8801919012426"
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs flex items-center justify-center gap-2 transition"
                >
                  <PhoneCall className="w-4 h-4 text-slate-500" />
                  <span>Direct Helpline (01919012426)</span>
                </a>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Info Tip */}
      <div className="bg-slate-100/80 rounded-xl p-3 border border-slate-200 text-center">
        <p className="text-[11px] text-slate-600 flex items-center justify-center gap-1">
          <ShieldAlert className="w-3.5 h-3.5 text-slate-400" />
          <span>Supports bKash, Nagad, Rocket & Upay mobile payment confirmations.</span>
        </p>
      </div>
    </div>
  );
};
