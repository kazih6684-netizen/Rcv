import React, { useState, useEffect } from 'react';
import {
  MessageSquareCode,
  Send,
  Sparkles,
  CheckCircle2,
  Clock,
  Play,
  Pause,
  Zap,
  Info,
  Layers,
} from 'lucide-react';
import { SAMPLE_SMS_TEMPLATES } from '../utils/smsExtractor';
import { PaymentRecord, PaymentMethod } from '../types';

interface SmsSimulatorProps {
  onParseAndSaveSMS: (rawSms: string) => Promise<PaymentRecord | null>;
  smsPermissionGranted: boolean;
  onTogglePermission: () => void;
}

export const SmsSimulator: React.FC<SmsSimulatorProps> = ({
  onParseAndSaveSMS,
  smsPermissionGranted,
  onTogglePermission,
}) => {
  const [rawSmsInput, setRawSmsInput] = useState<string>(SAMPLE_SMS_TEMPLATES[0].sms);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [lastExtracted, setLastExtracted] = useState<PaymentRecord | null>(null);
  const [logs, setLogs] = useState<Array<{ id: string; time: string; text: string; success: boolean }>>([]);

  const handleSimulateSMS = async (smsTextToParse?: string) => {
    const text = smsTextToParse || rawSmsInput;
    if (!text.trim()) return;

    setIsProcessing(true);
    try {
      const record = await onParseAndSaveSMS(text);
      if (record) {
        setLastExtracted(record);
        setLogs((prev) => [
          {
            id: String(Date.now()),
            time: new Date().toLocaleTimeString(),
            text: `[${record.paymentMethod}] Extracted ৳${record.amount} (TrxID: ${record.transactionId})`,
            success: true,
          },
          ...prev.slice(0, 15),
        ]);
      } else {
        setLogs((prev) => [
          {
            id: String(Date.now()),
            time: new Date().toLocaleTimeString(),
            text: `Failed to extract valid payment from SMS`,
            success: false,
          },
          ...prev.slice(0, 15),
        ]);
      }
    } catch (err) {
      console.error('SMS simulation failed', err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div id="sms-simulator-container" className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Top Title Banner */}
      <div className="bg-slate-900 text-white rounded-2xl p-5 sm:p-6 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold border border-emerald-500/30">
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
              <span>Real-Time SMS Receiver Logic</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white">
              SMS Extractor & Live Sync Receiver
            </h2>
            <p className="text-xs text-slate-300 max-w-lg">
              Simulates incoming payment SMS from bKash, Nagad, Rocket, or Upay. Automatically parses fields and syncs with Firebase in real time.
            </p>
          </div>
        </div>
      </div>

      {/* Permission Status */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center ${
              smsPermissionGranted ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'
            }`}
          >
            <MessageSquareCode className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
              Android SMS Broadcast Receiver Status
            </span>
            <span className="text-sm font-extrabold text-slate-900">
              {smsPermissionGranted ? 'Active (Listening to bKash / Nagad / Rocket / Upay)' : 'Inactive / Permission Prompt'}
            </span>
          </div>
        </div>
        <button
          onClick={onTogglePermission}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
            smsPermissionGranted
              ? 'bg-emerald-100 text-emerald-800'
              : 'bg-slate-900 text-white hover:bg-slate-800'
          }`}
        >
          {smsPermissionGranted ? 'Permission Granted ✓' : 'Grant SMS Access'}
        </button>
      </div>

      {/* Preset SMS Templates */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <span>Select Sample Payment SMS</span>
          </h3>
          <span className="text-xs text-slate-400">Click template to test parser</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {SAMPLE_SMS_TEMPLATES.map((tmpl, idx) => (
            <button
              key={`tmpl-${idx}`}
              onClick={() => {
                setRawSmsInput(tmpl.sms);
              }}
              className="p-3 text-left rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/50 transition group space-y-1"
            >
              <div className="flex justify-between items-center text-xs font-bold text-slate-800">
                <span className="group-hover:text-emerald-700">{tmpl.label}</span>
                <span className="bg-slate-100 group-hover:bg-emerald-100 text-slate-600 group-hover:text-emerald-800 px-2 py-0.5 rounded text-[10px]">
                  {tmpl.provider}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-mono line-clamp-1">{tmpl.sms}</p>
            </button>
          ))}
        </div>

        {/* Custom SMS Input Area */}
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
            Raw SMS Text Receiver Input
          </label>
          <textarea
            rows={3}
            value={rawSmsInput}
            onChange={(e) => setRawSmsInput(e.target.value)}
            placeholder="Paste raw SMS message from bKash, Nagad, Rocket, or Upay here..."
            className="w-full p-3 font-mono text-xs bg-slate-50 border border-slate-300 rounded-xl focus:border-emerald-500 focus:outline-none"
          />
          <button
            onClick={() => handleSimulateSMS()}
            disabled={isProcessing || !rawSmsInput.trim()}
            className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 transition"
          >
            {isProcessing ? (
              <span>Extracting Payment Data...</span>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>Process SMS & Save to Firebase</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Extracted Details & Live Logs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Extracted Result Card */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 space-y-3">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2 border-b border-slate-100 pb-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Extracted Payment Result</span>
          </h3>

          {lastExtracted ? (
            <div className="space-y-2 text-xs">
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex justify-between items-center">
                <span className="font-semibold text-emerald-800">Status</span>
                <span className="font-black text-emerald-700 uppercase">✓ Saved to Database</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Method:</span>
                <span className="font-bold text-slate-900">{lastExtracted.paymentMethod}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Extracted Amount:</span>
                <span className="font-extrabold text-slate-900 text-base">
                  ৳ {lastExtracted.amount.toLocaleString('en-BD')}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Last 3 Digits (Trx/Sender):</span>
                <span className="font-mono font-bold text-slate-900">
                  Trx: {lastExtracted.last3DigitsTrx} | Ph: {lastExtracted.last3DigitsSender}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Transaction ID:</span>
                <span className="font-mono font-bold text-slate-900">{lastExtracted.transactionId}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Sender Number:</span>
                <span className="font-mono text-slate-900">{lastExtracted.senderNumber}</span>
              </div>
            </div>
          ) : (
            <div className="p-6 text-center text-xs text-slate-400 space-y-1">
              <Info className="w-6 h-6 text-slate-300 mx-auto" />
              <p>No SMS processed yet. Click a sample template above to test the parser.</p>
            </div>
          )}
        </div>

        {/* Real-time Event Log */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 space-y-3">
          <h3 className="font-bold text-slate-900 text-sm flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-teal-600" />
              <span>Real-Time Broadcast Logs</span>
            </span>
            <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono">
              Live Feed
            </span>
          </h3>

          <div className="space-y-2 max-h-48 overflow-y-auto pr-1 no-scrollbar text-xs font-mono">
            {logs.length === 0 ? (
              <p className="text-slate-400 text-[11px] py-4 text-center">
                Log stream empty. Trigger an SMS to view event logs.
              </p>
            ) : (
              logs.map((log) => (
                <div
                  key={log.id}
                  className={`p-2 rounded-lg border text-[11px] ${
                    log.success
                      ? 'bg-slate-50 border-slate-200 text-slate-700'
                      : 'bg-rose-50 border-rose-200 text-rose-700'
                  }`}
                >
                  <span className="text-slate-400 mr-2">[{log.time}]</span>
                  <span>{log.text}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
