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

  // 1. Exclude irrelevant SMS (OTP, Failed, Promotional, Outgoing)
  const skipKeywords = ['otp', 'verification code', 'secret code', 'failed', 'cancelled', 'insufficient', 'request', 'you have sent', 'sent to', 'paid to', 'payment to', 'recharge', 'offer', 'bonus'];
  
  // Check if text indicates a successful payment received
  const isPaymentSuccess = 
    lowerText.includes('received') || 
    lowerText.includes('cash in') || 
    lowerText.includes('deposit') || 
    lowerText.includes('money received') || 
    lowerText.includes('receive money') ||
    lowerText.includes('received money') ||
    lowerText.includes('payment received') ||
    lowerText.includes('uddokta') ||
    lowerText.includes('nagad') ||
    lowerText.includes('successful') ||
    lowerText.includes('tk') ||
    lowerText.includes('txnid') ||
    lowerText.includes('trxid');

  if (!isPaymentSuccess) {
    if (skipKeywords.some(kw => lowerText.includes(kw))) {
      return { success: false, error: 'Not a payment received SMS (OTP/Failed/Promo)' };
    }
  }

  // 2. Detect Payment Method
  let paymentMethod: PaymentMethod | null = null;

  // Primary detection by sender shortcode
  if (lowerSender.includes('bkash') || lowerSender === '16247') paymentMethod = 'bKash';
  else if (lowerSender.includes('nagad') || lowerSender === '16167') paymentMethod = 'Nagad';
  else if (lowerSender.includes('rocket') || lowerSender === '16216' || lowerSender.includes('nexuspay')) paymentMethod = 'Rocket';
  else if (lowerSender.includes('upay') || lowerSender === '16268') paymentMethod = 'Upay';

  // Secondary detection by explicit keywords in body
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

  // Tertiary identification by structural signatures if provider name is not explicitly mentioned in the SMS text
  if (!paymentMethod) {
    // Nagad SMS Signatures:
    // - Format 1: "Money Received." + "Amount: Tk ..." + "Sender: ..." + "TxnID: ..."
    // - Format 2: "Cash In Received." + "Amount: Tk ..." + "Uddokta: ..." + "TxnID: ..."
    // - Uses "TxnID:" / "TxnID" (bKash uses "TrxID")
    // - Uses "Uddokta:" or "Sender:" or "Ref:"
    const hasNagadKeywords = 
      lowerText.includes("txnid") || 
      lowerText.includes("txn id") || 
      lowerText.includes("uddokta") || 
      lowerText.includes("ref:") ||
      lowerText.includes("money received") ||
      lowerText.includes("cash in received");

    const hasBkashKeywords = 
      lowerText.includes("trxid") || 
      lowerText.includes("trx id") ||
      lowerText.includes("bkash");

    const hasRocketKeywords = 
      lowerText.includes("dutch-bangla") || 
      lowerText.includes("nexuspay") ||
      (lowerText.startsWith("tk.") && lowerText.includes("received from"));

    if (hasNagadKeywords && !hasBkashKeywords && !hasRocketKeywords) {
      paymentMethod = "Nagad";
    } else if (hasBkashKeywords) {
      paymentMethod = "bKash";
    } else if (hasRocketKeywords) {
      paymentMethod = "Rocket";
    } else if (lowerText.includes("txnid") || lowerText.includes("uddokta") || lowerText.includes("sender:")) {
      paymentMethod = "Nagad";
    } else {
      paymentMethod = "bKash"; // Default fallback
    }
  }

  // 3. Extract Amount
  // Enhanced regex to capture various formats:
  // Matches: Amount: Tk 500.00, Amount: Tk 480.00, Received Amount: 500, Tk 500, Cash In Received Tk 480, ৳500, etc.
  const amountRegex = /(?:Amount|Received Amount|Cash In|Money Received|Tk|TK|tk|BDT|৳)\s*[:.#-]?\s*(?:Tk|BDT|৳)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i;
  const amountMatch = text.match(amountRegex);
  
  let amount = 0;
  if (amountMatch && amountMatch[1]) {
    amount = parseFloat(amountMatch[1].replace(/,/g, '')) || 0;
  } else {
    // Fallback: [Number] Tk/BDT (e.g., 500 Tk, 500.00 TK, 500 ৳)
    const fallbackAmountRegex = /([0-9,]+(?:\.[0-9]{1,2})?)\s*(?:Tk|TK|tk|BDT|৳)/i;
    const fallbackMatch = text.match(fallbackAmountRegex);
    if (fallbackMatch && fallbackMatch[1]) {
      amount = parseFloat(fallbackMatch[1].replace(/,/g, '')) || 0;
    }
  }

  // 4. Extract Transaction ID
  // Matches: TxnID: 75SD1SNV, TxnID: 75SDCB9M, TrxID 9A8B7C6D5E, TxnID 7X8Y9Z0A, TxID: ..., etc.
  const trxRegex = /(?:TrxID|TxnID|TXNID|Trx ID|Txn ID|TxnId|Txn Id|Transaction ID|TransactionID|ID|Trx|Txn|TxID|Tx ID)\s*[:.#-]?\s*([A-Z0-9]{6,16})/i;
  const trxMatch = text.match(trxRegex);

  let transactionId = '';
  if (trxMatch && trxMatch[1]) {
    transactionId = trxMatch[1].toUpperCase();
  }

  // 5. Extract Sender / Uddokta Number
  let senderNumber = '';
  // Pattern 1: Search for numbers in "from", "Sender", "Uddokta", "Customer", "A/C", "Agent", "Mobile", "By", "Ref"
  const fromMatch = text.match(/(?:from|Sender|Uddokta|Customer|A\/C|Agent|Mobile|By|Account|Ref|From|number)\s*[:.*-]?\s*(?:\+?88)?(01[3-9][0-9Xx*]{3,11}[0-9]{2,4})/i);
  if (fromMatch && fromMatch[1]) {
    senderNumber = fromMatch[1].trim();
  } else {
    // Pattern 2: Search for any 11 digit or masked phone number starting with 01 anywhere in text
    const genericPhoneMatch = text.match(/(?:\+?88)?(01[3-9][0-9Xx*]{8,11})\b/i);
    if (genericPhoneMatch) {
      senderNumber = genericPhoneMatch[1];
    }
  }

  // Clean up sender number
  if (!senderNumber) senderNumber = "Unknown";

  // Calculate numeric digits for last3DigitsSender to properly match even if phone has mask characters (* or X)
  const digitsOnlySender = senderNumber.replace(/[^0-9]/g, '');
  const last3DigitsSender = digitsOnlySender.length >= 3 ? digitsOnlySender.slice(-3) : (senderNumber.slice(-3) || '000');
  const last3DigitsTrx = transactionId.slice(-3);

  // Extract Date & Time
  // Supports formats like: "at 02/08/2026 14:30", "Date: 02/08/2026", "07/08/2026 20:14", "07/08/2026 20:50"
  const dateRegex = /(?:at|Date:?|^|\s)\s*([0-3]?[0-9][\/-][0-1]?[0-9][\/-][0-9]{2,4}(?:\s+[0-2]?[0-9]:[0-5][0-9](?::[0-5][0-9])?(?:\s*(?:am|pm|AM|PM))?)?)/im;
  const dateMatch = text.match(dateRegex);

  const now = new Date();
  const formattedNow = `${now.toLocaleDateString('en-GB')} ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
  const dateTime = dateMatch && dateMatch[1] && dateMatch[1].length >= 8 ? dateMatch[1].trim() : formattedNow;

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
    provider: 'Nagad' as PaymentMethod,
    label: 'Nagad Money Received (Tk 500)',
    sms: `Money Received.
Amount: Tk 500.00
Sender: 01819017575
Ref: N/A
TxnID: 75SD1SNV
Balance: Tk 7889.23
07/08/2026 20:14`,
  },
  {
    provider: 'Nagad' as PaymentMethod,
    label: 'Nagad Cash In Received (Tk 480)',
    sms: `Cash In Received.
Amount: Tk 480.00
Uddokta: 01940803280
TxnID: 75SDCB9M
Balance: 8369.23
07/08/2026 20:50`,
  },
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
    label: 'Nagad Single Line (Tk 250)',
    sms: 'Received Amount: Tk 250.00. Sender: 01911223123. TxnID: 7X8Y9Z123. Date: 02/08/2026 15:10.',
  },
  {
    provider: 'Rocket' as PaymentMethod,
    label: 'Rocket Cash In (Tk 750)',
    sms: 'Tk.750.00 received from 01611223456. TxnID: 3B4C5D456. Date:02-AUG-26 15:12.',
  },
  {
    provider: 'Upay' as PaymentMethod,
    label: 'Upay Received (Tk 300)',
    sms: 'Cash In / Payment Received Tk 300.00 from 01511223789. TrxID UP12345789 at 02/08/2026 16:45.',
  },
];
