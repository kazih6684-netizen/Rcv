import { PaymentMethod, SMSParseResult } from '../types';

/**
 * Automatically extracts payment details from raw Bangladeshi MFS SMS text
 * Supported providers: bKash, Nagad, Rocket, Upay
 */
export function parsePaymentSMS(rawSms: string, senderShortcode?: string): SMSParseResult {
  if (!rawSms || typeof rawSms !== 'string' || !rawSms.trim()) {
    return { success: false, error: 'SMS content is empty' };
  }

  const text = rawSms.trim();
  const lowerText = text.toLowerCase();
  const lowerSender = (senderShortcode || '').toLowerCase();

  // 1. Exclude irrelevant SMS (OTP, Failed, Promotional, etc.)
  const skipKeywords = ['otp', 'verification code', 'secret code', 'failed', 'cancelled', 'insufficient', 'request', 'sent', 'paid to', 'payment to', 'recharge', 'offer', 'bonus'];
  
  // However, we MUST allow "received" or "Cash In" even if some of these words are present (rare)
  const isPaymentSuccess = 
    lowerText.includes('received') || 
    lowerText.includes('cash in') || 
    lowerText.includes('deposit') || 
    lowerText.includes('money received') || 
    lowerText.includes('payment received') ||
    lowerText.includes('npsb received') ||
    lowerText.includes('ibanking deposit');

  if (!isPaymentSuccess) {
    // If it doesn't sound like a "Received" message, check if it's one of the skip keywords
    if (skipKeywords.some(kw => lowerText.includes(kw))) {
      return { success: false, error: 'Not a payment received SMS (OTP/Failed/Promo)' };
    }
  }

  // 2. Detect Payment Method
  let paymentMethod: PaymentMethod | null = null;

  // Primary detection by sender shortcode
  if (lowerSender.includes('bkash')) paymentMethod = 'bKash';
  else if (lowerSender.includes('nagad') || lowerSender === '16167') paymentMethod = 'Nagad';
  else if (lowerSender.includes('rocket') || lowerSender === '16216' || lowerSender.includes('nexuspay')) paymentMethod = 'Rocket';
  else if (lowerSender.includes('upay') || lowerSender === '16268') paymentMethod = 'Upay';

  // Secondary detection by keywords in body
  if (!paymentMethod) {
    if (lowerText.includes("bkash")) {
      paymentMethod = "bKash";
    } else if (lowerText.includes("nagad")) {
      paymentMethod = "Nagad";
    } else if (lowerText.includes("rocket") || lowerText.includes("nexuspay") || lowerText.includes("dutch-bangla")) {
      paymentMethod = "Rocket";
    } else if (lowerText.includes("upay")) {
      paymentMethod = "Upay";
    }
  }

  // Tertiary identification by patterns if name not explicitly mentioned
  if (!paymentMethod) {
    if (lowerText.includes("trxid")) paymentMethod = "bKash";
    else if (lowerText.includes("txnid") && (lowerText.includes("received amount") || lowerText.includes("money received"))) paymentMethod = "Nagad";
    else if (lowerText.includes("txnid") && (lowerText.includes("tk."))) paymentMethod = "Rocket";
    else paymentMethod = "bKash"; // Default
  }

  // 3. Extract Amount
  // Enhanced regex to capture various formats
  // Matches: Tk 500, Tk. 500, Tk500, Amount: Tk 500, Received Amount: 500, etc.
  const amountRegex = /(?:Tk|TK|tk|Tk\.|TK\.|Received Amount:?\s*(?:Tk)?|Amount:?\s*(?:Tk|BDT)?|Cash In\s*(?:Tk)?|Tk\s*:)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i;
  const amountMatch = text.match(amountRegex);
  
  let amount = 0;
  if (amountMatch && amountMatch[1]) {
    amount = parseFloat(amountMatch[1].replace(/,/g, '')) || 0;
  }

  // 4. Extract Transaction ID
  // Matches: TrxID 9A8B7C6D5E, TxnID: 7X8Y9Z0A, TxnId: 123456, ID: 12345
  const trxRegex = /(?:TrxID|TxnID|TXNID|Trx ID|Txn ID|TxnId|Txn Id|ID:?)\s*:?\s*([A-Z0-9]+)/i;
  const trxMatch = text.match(trxRegex);

  let transactionId = '';
  if (trxMatch && trxMatch[1]) {
    transactionId = trxMatch[1].toUpperCase();
  }

  // 5. Extract Sender Number
  let senderNumber = '';
  // Pattern 1: from 017xxxxxxxx
  const fromMatch = text.match(/(?:from|Sender:?|number:?|A\/C:?\*?)\s*:?\s*([0-9Xx*]{3,11}[0-9]{3,4})/i);
  if (fromMatch && fromMatch[1]) {
    senderNumber = fromMatch[1].trim();
  } else {
    // Pattern 2: Search for any 11 digit number starting with 01
    const genericPhoneMatch = text.match(/\b(01[3-9][0-9]{8})\b/);
    if (genericPhoneMatch) {
      senderNumber = genericPhoneMatch[1];
    }
  }

  // 6. Final Validation - If we can't find a TrxID or Amount, it might not be a valid record
  if (!transactionId || amount <= 0) {
    // Try one last desperate search for anything that looks like a TrxID (alpha-numeric, 8+ chars)
    if (!transactionId) {
      const fallbackTrx = text.match(/\b([A-Z0-9]{8,12})\b/);
      if (fallbackTrx) transactionId = fallbackTrx[1];
    }
    
    if (!transactionId || amount <= 0) {
       return { success: false, error: 'Could not extract Transaction ID or Amount' };
    }
  }

  // Clean up sender number
  if (!senderNumber) senderNumber = "Unknown";

  const last3DigitsTrx = transactionId.slice(-3);
  const last3DigitsSender = senderNumber.length >= 3 ? senderNumber.slice(-3) : senderNumber;

  // Extract Date
  const dateRegex = /(?:at|Date:?)\s*([0-9]{1,2}[\/-][A-Z0-9]{2,4}[\/-][0-9]{2,4}(?:\s*[0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?\s*(?:am|pm|AM|PM)?)?)/i;
  const dateMatch = text.match(dateRegex);

  const now = new Date();
  const formattedNow = `${now.toLocaleDateString('en-GB')} ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
  const dateTime = dateMatch && dateMatch[1] ? dateMatch[1] : formattedNow;

  return {
    success: true,
    amount,
    paymentMethod,
    last3DigitsTrx,
    last3DigitsSender,
    senderNumber,
    transactionId,
    dateTime,
    rawSms: text,
  };
}

export function getProviderBrandColor(method: PaymentMethod) {
  switch (method) {
    case 'bKash':
      return {
        bg: 'bg-pink-600',
        lightBg: 'bg-pink-50',
        text: 'text-pink-600',
        border: 'border-pink-200',
        gradient: 'from-pink-600 to-rose-700',
        accentHex: '#E2136E',
      };
    case 'Nagad':
      return {
        bg: 'bg-orange-600',
        lightBg: 'bg-orange-50',
        text: 'text-orange-600',
        border: 'border-orange-200',
        gradient: 'from-orange-500 to-amber-600',
        accentHex: '#F7921E',
      };
    case 'Rocket':
      return {
        bg: 'bg-purple-700',
        lightBg: 'bg-purple-50',
        text: 'text-purple-700',
        border: 'border-purple-200',
        gradient: 'from-purple-600 to-indigo-800',
        accentHex: '#8C3494',
      };
    case 'Upay':
      return {
        bg: 'bg-blue-600',
        lightBg: 'bg-blue-50',
        text: 'text-blue-600',
        border: 'border-blue-200',
        gradient: 'from-blue-600 to-cyan-700',
        accentHex: '#0054A6',
      };
  }
}

export const SAMPLE_SMS_TEMPLATES = [
  {
    provider: 'bKash' as PaymentMethod,
    label: 'bKash Payment (Tk 500)',
    sms: 'You have received Tk 500.00 from 01712345678. Fee Tk 0.00. Balance Tk 1500.00. TrxID 9A8B7C650 at 02/08/2026 14:30',
  },
  {
    provider: 'bKash' as PaymentMethod,
    label: 'bKash Cash In (Tk 1,200)',
    sms: 'You have received deposit of Tk 1200.00 from 01819203890. Fee Tk 0.00. Balance Tk 3200.00. TrxID 8K9M3P890 at 02/08/2026 10:15',
  },
  {
    provider: 'Nagad' as PaymentMethod,
    label: 'Nagad Payment (Tk 250)',
    sms: 'Received Amount: Tk 250.00. Sender: 01911223123. TxnID: 7X8Y9Z123. Date: 02/08/2026 15:10.',
  },
  {
    provider: 'Rocket' as PaymentMethod,
    label: 'Rocket Cash In (Tk 750)',
    sms: 'Tk.750.00 received from 01611223456. TxnID: 3B4C5D456. Date:02-AUG-26 15:12.',
  },
  {
    provider: 'Rocket' as PaymentMethod,
    label: 'Rocket Received (Tk 200) - NexusPay',
    sms: 'Tk200.00 received from A/C:***057 Fee:Tk0, Your A/C Balance: Tk12,256.92 TxnId:6791724661 Date:31-JUL-26 09:26:07 pm. Download https://bit.ly/nexuspay',
  },
  {
    provider: 'Upay' as PaymentMethod,
    label: 'Upay Received (Tk 300)',
    sms: 'Cash In / Payment Received Tk 300.00 from 01511223789. TrxID UP12345789 at 02/08/2026 16:45.',
  },
];
