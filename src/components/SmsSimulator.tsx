import React, { useState } from 'react';
import {
  MessageSquareCode,
  Send,
  Sparkles,
  CheckCircle2,
  Zap,
  Info,
} from 'lucide-react';
import { SAMPLE_SMS_TEMPLATES } from '../utils/smsExtractor';
import { Payment } from '../types';

interface SmsSimulatorProps {
  onParseAndSaveSMS: (rawSms: string) => Promise<Payment | null>;
  smsPermissionGranted: boolean;
  onTogglePermission: () => void;
}

export const SmsSimulator: React.FC<SmsSimulatorProps> = ({
  onParseAndSaveSMS,
  smsPermissionGranted,
  onTogglePermission,
}) => {
  const [rawSmsInput, setRawSmsInput] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleSimulateSMS = async (smsText: string) => {
    const textToProcess = smsText || rawSmsInput;
    if (!textToProcess.trim()) return;

    setIsProcessing(true);
    setResult(null);

    try {
      const savedPayment = await onParseAndSaveSMS(textToProcess);
      if (savedPayment) {
        setResult({
          success: true,
          message: `Successfully processed ${savedPayment.paymentMethod} payment of ৳${savedPayment.amount}. TrxID: ${savedPayment.transactionId}`,
        });
      } else {
        setResult({
          success: false,
          message: 'Failed to process SMS. Check console or Failed Logs for details.',
        });
      }
    } catch (err) {
      setResult({ success: false, message: 'An unexpected error occurred.' });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div id="sms-simulator-container" className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-center gap-3 border-b border-slate-200 pb-4">
        <div className="bg-emerald-100 p-2 rounded-xl">
          <MessageSquareCode className="w-6 h-6 text-emerald-600" />
        </div>
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight">SMS Gateway Simulator</h2>
          <p className="text-xs text-slate-500">Test your MacroDroid pipeline by simulating incoming payment SMS.</p>
        </div>
      </div>

      {/* Preset SMS Templates */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <span>Quick Templates</span>
          </h3>
          <span className="text-xs text-slate-400">Click to test extraction</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {Object.entries(SAMPLE_SMS_TEMPLATES).map(([provider, sms]) => (
            <button
              key={provider}
              onClick={() => {
                setRawSmsInput(sms);
                handleSimulateSMS(sms);
              }}
              className="p-3 text-left rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 transition group space-y-2"
            >
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-800">{provider}</span>
                <Zap className="w-3.5 h-3.5 text-slate-300 group-hover:text-emerald-500" />
              </div>
              <p className="text-[10px] text-slate-500 font-mono line-clamp-2 leading-relaxed">
                {sms}
              </p>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 space-y-4">
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block">
            Manual SMS Input (Raw Text)
          </label>
          <textarea
            value={rawSmsInput}
            onChange={(e) => setRawSmsInput(e.target.value)}
            placeholder="Paste your raw payment SMS here..."
            className="w-full h-32 p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-mono text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none transition"
          />
        </div>

        <button
          onClick={() => handleSimulateSMS(rawSmsInput)}
          disabled={isProcessing || !rawSmsInput.trim()}
          className="w-full py-3 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white rounded-xl text-sm font-bold transition shadow-lg shadow-slate-900/10 flex items-center justify-center gap-2"
        >
          {isProcessing ? 'Processing...' : (
            <>
              <Send className="w-4 h-4" />
              <span>Simulate Incoming SMS</span>
            </>
          )}
        </button>

        {result && (
          <div className={`p-4 rounded-xl border flex gap-3 ${result.success ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
            {result.success ? (
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            ) : (
              <Info className="w-5 h-5 flex-shrink-0" />
            )}
            <p className="text-xs font-bold">{result.message}</p>
          </div>
        )}
      </div>

      <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 flex items-start gap-4">
        <div className="bg-emerald-100 p-2 rounded-lg">
          <Info className="w-4 h-4 text-emerald-600" />
        </div>
        <div className="space-y-1">
          <h4 className="text-sm font-bold text-emerald-900">How the Simulation Works</h4>
          <p className="text-xs text-emerald-700 leading-relaxed">
            This tool sends the raw SMS text to your backend API route exactly as MacroDroid would.
            It tests the entire pipeline: <strong>Provider Detection → Regex Parsing → Firestore Logging → Real-time Sync</strong>.
          </p>
        </div>
      </div>
    </div>
  );
};
