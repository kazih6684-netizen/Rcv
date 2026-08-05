import { PaymentMethod, SMSParseResult } from '../types';

export function isOTPSMS(text: string): boolean {
  const lowerText = text.toLowerCase();
  const otpKeywords = [
    'otp', 'verification code', 'secret code', 'login code', 
    'password reset', 'security code', 'authentication code',
    'one time password', 'don\'t share', 'dont share'
  ];
  return otpKeywords.some(kw => lowerText.includes(kw));
}

export function detectProvider(text: string, senderShortcode?: string): PaymentMethod | null {
  const lowerText = text.toLowerCase();
  const lowerSender = (senderShortcode || '').toLowerCase();

  if (lowerSender.includes('bkash')) return 'bKash';
  if (lowerSender.includes('nagad') || lowerSender === '16167') return 'Nagad';
  if (lowerSender.includes('rocket') || lowerSender === '16216' || lowerSender.includes('nexuspay')) return 'Rocket';
  if (lowerSender.includes('upay') || lowerSender === '16268') return 'Upay';

  if (lowerText.includes('bkash')) return 'bKash';
  if (lowerText.includes('nagad') || lowerText.includes('uddokta')) return 'Nagad';
  if (lowerText.includes('rocket') || lowerText.includes('nexuspay')) return 'Rocket';
  if (lowerText.includes('upay')) return 'Upay';

  return null;
}

export function normalizePhoneNumber(rawNumber: string): string {
  if (!rawNumber) return '';
  let cleanDigits = rawNumber.replace(/\D/g, ""); 
  
  // Handle country code
  if (cleanDigits.startsWith('880')) {
    cleanDigits = cleanDigits.slice(2);
  } else if (cleanDigits.startsWith('80')) {
     // Some weird cases
     cleanDigits = '0' + cleanDigits.slice(2);
  }
  
  // If it's a 12-digit Rocket number, the first 11 are usually the mobile number
  if (cleanDigits.length === 12 && cleanDigits.startsWith('01')) {
    return cleanDigits.slice(0, 11);
  }
  
  // For standard 11 digit numbers or longer ones with prefixes
  if (cleanDigits.length >= 11) {
    return cleanDigits.slice(-11);
  }
  
  return cleanDigits;
}

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

  // 1. Detect Provider (Highest Priority: Sender ID)
  let paymentMethod: PaymentMethod | null = null;
  if (lowerSender.includes('bkash')) paymentMethod = 'bKash';
  else if (lowerSender.includes('nagad') || lowerSender === '16167') paymentMethod = 'Nagad';
  else if (lowerSender.includes('rocket') || lowerSender === '16216' || lowerSender.includes('nexuspay')) paymentMethod = 'Rocket';
  else if (lowerSender.includes('upay') || lowerSender === '16268') paymentMethod = 'Upay';

  // Fallback Detection (By Keywords)
  if (!paymentMethod) {
    if (lowerText.includes('bkash')) paymentMethod = 'bKash';
    else if (lowerText.includes('nagad') || lowerText.includes('uddokta')) paymentMethod = 'Nagad';
    else if (lowerText.includes('rocket') || lowerText.includes('nexuspay')) paymentMethod = 'Rocket';
    else if (lowerText.includes('upay')) paymentMethod = 'Upay';
  }

  // 2. Validate if it's a payment message
  const isPaymentReceived = 
    lowerText.includes('received') || 
    lowerText.includes('cash in') || 
    lowerText.includes('deposit') || 
    lowerText.includes('money received') || 
    lowerText.includes('successful') ||
    lowerText.includes('tk');

  if (!isPaymentReceived && !paymentMethod) {
    return { success: false, error: 'Not a recognized payment SMS structure' };
  }

  // 3. Provider-Specific Parsing
  let amount = 0;
  let transactionId = '';
  let senderNumber = '';
  let balance = 0;
  let dateTime = '';

  // Generic Extractors (Fallback)
  const extractAmount = (input: string) => {
    const match = input.match(/(?:Amount|Tk|TK|tk|BDT)\s*[:.-]?\s*(?:Tk|BDT)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i) || 
                  input.match(/([0-9,]+(?:\.[0-9]{1,2})?)\s*(?:Tk|TK|tk|BDT)/i);
    return match ? parseFloat(match[1].replace(/,/g, '')) : 0;
  };

  const extractBalance = (input: string) => {
    const match = input.match(/(?:Balance|Current Balance|New Balance)\s*[:.-]?\s*(?:Tk|BDT)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
    return match ? parseFloat(match[1].replace(/,/g, '')) : 0;
  };

  const extractTrx = (input: string) => {
    const match = input.match(/(?:TrxID|TxnID|TXNID|Trx ID|Txn ID|Trx|Txn|ID)\s*[:.-]?\s*([A-Z0-9]{6,16})/i);
    return match ? match[1].toUpperCase() : '';
  };

  const extractPhone = (input: string) => {
    const match = input.match(/(?:from|Sender|number|A\/C|Uddokta|Agent|Customer|From)\s*[:.*-]?\s*(?:\+?88)?(01[3-9][0-9Xx*]{3,11}[0-9]{0,4})/i) ||
                  input.match(/(?:\+?88)?(01[3-9][0-9]{8,11})\b/);
    return match ? normalizePhoneNumber(match[1]) : '';
  };

  // Specific Logic for Nagad (Requested Improvement)
  if (paymentMethod === 'Nagad') {
    // Nagad Format 1: Money Received. Amount: Tk 20.00 Sender: 019... TxnID: ...
    // Nagad Format 2: Cash In Received. Amount: Tk 160.00 Uddokta: 019... TxnID: ...
    
    // Improved Nagad Specific Extractions
    const amountMatch = text.match(/(?:Amount|received)\s*[:.-]?\s*Tk\s*([0-9,]+(?:\.[0-9]{1,2})?)/i) ||
                        text.match(/(?:Amount|received)\s*[:.-]?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
    
    const senderMatch = text.match(/(?:Sender|Uddokta|from|Agent|From)\s*[:.-]?\s*(?:\+?88)?(01[3-9][0-9Xx*]{3,11}[0-9]{0,4})/i) ||
                        text.match(/(?:Sender|Uddokta|from|Agent|From)\s*[:.-]?\s*(\d{11,12})/i);
    
    const trxMatch = text.match(/(?:TxnID|TrxID|ID|Trx)\s*[:.-]?\s*([A-Z0-9]{6,16})/i);

    if (amountMatch) {
      amount = parseFloat(amountMatch[1].replace(/,/g, ''));
    } else {
      amount = extractAmount(text);
    }

    if (trxMatch) {
      transactionId = trxMatch[1].toUpperCase();
    } else {
      transactionId = extractTrx(text);
    }

    if (senderMatch) {
      senderNumber = normalizePhoneNumber(senderMatch[1]);
    } else {
      senderNumber = extractPhone(text);
    }

    balance = extractBalance(text);
  } else {
    // Default/Generic parsing for others
    amount = extractAmount(text);
    balance = extractBalance(text);
    transactionId = extractTrx(text);
    senderNumber = extractPhone(text);
  }

  // 4. Extract Date/Time
  // Improved date regex to handle Nagad's trailing date without labels
  const dateRegex = /(?:at|Date:?)\s*([0-9]{1,2}[\/-][A-Z0-9]{2,4}[\/-][0-9]{2,4}(?:\s*[0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?\s*(?:am|pm|AM|PM)?)?)/i;
  const nagadTrailingDateRegex = /([0-9]{1,2}[\/-][0-9]{1,2}[\/-][0-9]{2,4}\s+[0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?\s*(?:am|pm|AM|PM)?)$/i;
  
  const dateMatch = text.match(dateRegex) || text.match(nagadTrailingDateRegex);
  const now = new Date();
  const formattedNow = `${now.toLocaleDateString('en-GB')} ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
  dateTime = dateMatch && dateMatch[1] ? dateMatch[1] : formattedNow;

  // 5. Final Validations
  if (amount <= 0) return { success: false, error: 'Could not extract valid Amount' };
  if (!transactionId) return { success: false, error: 'Could not extract Transaction ID' };
  if (!paymentMethod) paymentMethod = 'bKash'; // Default fallback

  // Clean up results
  if (!senderNumber) senderNumber = "Unknown";
  else senderNumber = normalizePhoneNumber(senderNumber);

  const last3DigitsTrx = transactionId.slice(-3);
  const last3DigitsSender = senderNumber.length >= 3 ? senderNumber.slice(-3) : senderNumber;

  return {
    success: true,
    amount,
    paymentMethod,
    last3DigitsTrx,
    last3DigitsSender,
    senderNumber,
    transactionId,
    balance,
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
    provider: 'Nagad' as PaymentMethod,
    label: 'Nagad Cash In (Tk 1,000)',
    sms: 'Cash In Received. Amount: Tk 1,000.00. Uddokta: 01822334455. TxnID: 7X8Y9Z888. Balance: Tk 5,500.00. Date: 04/08/2026 11:45.',
  },
  {
    provider: 'Nagad' as PaymentMethod,
    label: 'Nagad Money Received (Tk 500)',
    sms: 'Money Received. Amount: Tk 500.00. Sender: 01711223344. TxnID: 9B8C7D654. Balance: Tk 10,500.00. Date: 04/08/2026 12:30.',
  },
  {
    provider: 'Nagad' as PaymentMethod,
    label: 'Nagad Non-Payment (OTP - Ignored)',
    sms: 'Your Nagad verification code is 123456. Do not share this code with anyone.',
  },
  {
    provider: 'Nagad' as PaymentMethod,
    label: 'Nagad Money Received (New Pattern)',
    sms: 'Money Received. Amount: Tk 20.00 Sender: 01919012426 Ref: 5 TxnID: 75RYJ6SU Balance: Tk 3494.51 05/08/2026 15:54',
  },
  {
    provider: 'Nagad' as PaymentMethod,
    label: 'Nagad Cash In (New Pattern)',
    sms: 'Cash In Received. Amount: Tk 160.00 Uddokta: 01940803280 TxnID: 75R26F8F Balance: 26509.33 31/07/2026 12:21',
  },
];
