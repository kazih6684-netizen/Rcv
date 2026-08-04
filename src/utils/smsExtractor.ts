import { SMSParseResult, PaymentMethod } from '../types';

/**
 * Modular SMS Parser with Clean Architecture
 * Dedicated to high-accuracy extraction for bKash, Nagad, and Rocket.
 */

interface ExtractionRules {
  amountRegex: RegExp[];
  trxRegex: RegExp[];
  senderRegex: RegExp[];
}

const PROVIDER_RULES: Record<PaymentMethod, ExtractionRules> = {
  bKash: {
    amountRegex: [
      /Tk\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
      /Amount:\s*Tk\s*([0-9,]+(?:\.[0-9]{1,2})?)/i
    ],
    trxRegex: [
      /TrxID\s*([A-Z0-9]{6,16})/i
    ],
    senderRegex: [
      /(?:from|Sender)\s*([0-9]{11})/i,
      /([0-9]{11})\s*is\s*the\s*sender/i
    ]
  },
  Nagad: {
    amountRegex: [
      /Amount\s*[:]\s*Tk\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
      /Cash In\s*[:]\s*Tk\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
      /Received Amount\s*[:]?\s*(?:Tk)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
      /Tk\s*([0-9,]+(?:\.[0-9]{1,2})?)\s*received/i
    ],
    trxRegex: [
      /TxnID\s*[:]?\s*([A-Z0-9]{6,16})/i,
      /TxID\s*[:]?\s*([A-Z0-9]{6,16})/i
    ],
    senderRegex: [
      /Sender\s*[:]?\s*([0-9]{11})/i,
      /Customer\s*[:]?\s*([0-9]{11})/i,
      /From\s*[:]?\s*([0-9]{11})/i,
      /Mobile\s*[:]?\s*([0-9]{11})/i
    ]
  },
  Rocket: {
    amountRegex: [
      /Tk\.?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
      /Amount\s*[:]\s*Tk\s*([0-9,]+(?:\.[0-9]{1,2})?)/i
    ],
    trxRegex: [
      /TxnID\s*[:]?\s*([A-Z0-9]{6,16})/i,
      /TrxID\s*[:]?\s*([A-Z0-9]{6,16})/i
    ],
    senderRegex: [
      /Sender\s*[:]?\s*([0-9]{11})/i,
      /A\/C\s*[:]?\s*\*?([0-9]{3,11})/i
    ]
  },
  Upay: {
    amountRegex: [/Tk\s*([0-9,]+(?:\.[0-9]{1,2})?)/i],
    trxRegex: [/TxnID\s*([A-Z0-9]{6,16})/i],
    senderRegex: [/from\s*([0-9]{11})/i]
  }
};

/**
 * Detects the payment provider based on sender name or SMS content keywords.
 */
export function detectProvider(sender: string, text: string): { provider: PaymentMethod | null; confidence: number; rule: string } {
  const lowerSender = sender.toLowerCase();
  const lowerText = text.toLowerCase();

  // 1. Explicit Sender ID check (Highest confidence)
  if (lowerSender.includes('bkash')) return { provider: 'bKash', confidence: 1.0, rule: 'Sender ID' };
  if (lowerSender.includes('nagad') || lowerSender === '16167') return { provider: 'Nagad', confidence: 1.0, rule: 'Sender ID' };
  if (lowerSender.includes('rocket') || lowerSender === '16216' || lowerSender.includes('nexuspay')) return { provider: 'Rocket', confidence: 1.0, rule: 'Sender ID' };
  if (lowerSender.includes('upay') || lowerSender === '16268') return { provider: 'Upay', confidence: 1.0, rule: 'Sender ID' };

  // 2. Content keyword check (Medium confidence)
  if (lowerText.includes('bkash') && lowerText.includes('trxid')) return { provider: 'bKash', confidence: 0.8, rule: 'Content Keyword' };
  if (lowerText.includes('nagad') && lowerText.includes('txid')) return { provider: 'Nagad', confidence: 0.8, rule: 'Content Keyword' };
  if (lowerText.includes('rocket') && lowerText.includes('txnid')) return { provider: 'Rocket', confidence: 0.8, rule: 'Content Keyword' };

  // 3. Regex pattern identification (Fallback)
  if (lowerText.includes('trxid')) return { provider: 'bKash', confidence: 0.5, rule: 'Pattern Fallback' };
  if (lowerText.includes('txid') || lowerText.includes('txnid')) return { provider: 'Nagad', confidence: 0.5, rule: 'Pattern Fallback' };

  return { provider: null, confidence: 0, rule: 'None' };
}

/**
 * Orchestrates the extraction process.
 */
export function parsePaymentSMS(text: string, sender: string = ''): SMSParseResult {
  const detection = detectProvider(sender, text);
  
  if (!detection.provider) {
    return { success: false, error: 'Could not detect payment provider' };
  }

  const provider = detection.provider;
  const rules = PROVIDER_RULES[provider];

  // 1. Extract Amount
  let amount = 0;
  for (const regex of rules.amountRegex) {
    const match = text.match(regex);
    if (match && match[1]) {
      amount = parseFloat(match[1].replace(/,/g, '')) || 0;
      if (amount > 0) break;
    }
  }

  // 2. Extract Transaction ID
  let transactionId = '';
  for (const regex of rules.trxRegex) {
    const match = text.match(regex);
    if (match && match[1]) {
      transactionId = match[1].toUpperCase();
      break;
    }
  }

  // 3. Extract Sender Number
  let senderNumber = '';
  for (const regex of rules.senderRegex) {
    const match = text.match(regex);
    if (match && match[1]) {
      senderNumber = match[1].trim();
      break;
    }
  }

  // Fallback for sender if not in text but provided in API
  if (!senderNumber && sender.length >= 11 && /^[0-9+]+$/.test(sender)) {
    senderNumber = sender.replace(/^\+88/, '');
  }

  // 4. Debug and Validation
  const debug = {
    provider,
    extractedAmount: amount,
    extractedTrxID: transactionId,
    extractedSender: senderNumber,
    detectionRule: detection.rule,
    confidence: detection.confidence
  };

  if (!transactionId || amount <= 0) {
    return { success: false, error: 'Incomplete extraction (TrxID or Amount missing)', debug };
  }

  // Clean values for output
  const last3DigitsTrx = transactionId.slice(-3);
  const last3DigitsSender = senderNumber.slice(-3);

  return {
    success: true,
    amount,
    paymentMethod: provider,
    transactionId,
    senderNumber,
    last3DigitsTrx,
    last3DigitsSender,
    rawSms: text,
    debug
  };
}

/**
 * Visual styling helpers for the dashboard.
 */
export function getProviderBrandColor(method: PaymentMethod) {
  switch (method) {
    case 'bKash': return { bg: 'bg-pink-600', text: 'text-pink-600', border: 'border-pink-200' };
    case 'Nagad': return { bg: 'bg-orange-500', text: 'text-orange-500', border: 'border-orange-200' };
    case 'Rocket': return { bg: 'bg-purple-700', text: 'text-purple-700', border: 'border-purple-200' };
    case 'Upay': return { bg: 'bg-blue-500', text: 'text-blue-500', border: 'border-blue-200' };
    default: return { bg: 'bg-slate-500', text: 'text-slate-500', border: 'border-slate-200' };
  }
}

export const SAMPLE_SMS_TEMPLATES = {
  bKash: "You have received Tk 500.00 from 01712345678. TrxID 9A8B7C6D5E at 04/08/2026 14:30. Balance Tk 1500.00.",
  Nagad: "Cash In: Tk 1,200.00 from 01812345678. TxnID: 7X8Y9Z0A at 04/08/2026 15:45. Fee: Tk 0.00. Balance: Tk 2,500.00.",
  Rocket: "Rocket A/C *123 has received Tk. 800.00 from 01912345678. TxnID: 3P2Q1R0S at 04/08/2026 16:10. Balance: Tk 1,800.00."
};
