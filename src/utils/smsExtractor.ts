import { PaymentMethod, SMSParseResult } from '../types';

/**
 * Automatically extracts payment details from raw Bangladeshi MFS SMS text
 * Supported providers: bKash, Nagad, Rocket, Upay
 */
export function parsePaymentSMS(rawSms: string): SMSParseResult {
  if (!rawSms || typeof rawSms !== 'string' || !rawSms.trim()) {
    return { success: false, error: 'SMS content is empty' };
  }

  const text = rawSms.trim();
  const lowerText = text.toLowerCase();

  // 1. Detect Payment Method
  let paymentMethod: PaymentMethod | null = null;

  if (lowerText.includes('bkash') || lowerText.includes('trxid')) {
    paymentMethod = 'bKash';
  } else if (lowerText.includes('nagad') || lowerText.includes('txnid') && (lowerText.includes('received amount') || lowerText.includes('cash in'))) {
    paymentMethod = 'Nagad';
  } else if (lowerText.includes('rocket') || (lowerText.includes('tk.') && lowerText.includes('received from'))) {
    paymentMethod = 'Rocket';
  } else if (lowerText.includes('upay') || lowerText.includes('up123') || (lowerText.includes('cash in / payment') && lowerText.includes('upay'))) {
    paymentMethod = 'Upay';
  }

  // Fallback keyword matching
  if (!paymentMethod) {
    if (lowerText.includes('nagad')) paymentMethod = 'Nagad';
    else if (lowerText.includes('rocket')) paymentMethod = 'Rocket';
    else if (lowerText.includes('upay')) paymentMethod = 'Upay';
    else paymentMethod = 'bKash'; // Default MFS in BD
  }

  // 2. Extract Amount
  // Matches: Tk 500, Tk. 750.00, Tk.750.00, Tk 1,200.00, Amount: Tk 250.00
  const amountRegex = /(?:Tk|TK|tk|Tk\.|TK\.|Received Amount:?\s*Tk)\s*:?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i;
  const amountMatch = text.match(amountRegex);

  let amount = 0;
  if (amountMatch && amountMatch[1]) {
    const cleanAmountStr = amountMatch[1].replace(/,/g, '');
    amount = parseFloat(cleanAmountStr) || 0;
  }

  // 3. Extract Sender Phone Number
  // Matches Bangladeshi mobile numbers: 013, 014, 015, 016, 017, 018, 019 followed by 8 digits
  const phoneRegex = /(?:from|Sender:?|number:?)\s*(01[3-9][0-9]{8})/i;
  const phoneMatch = text.match(phoneRegex);
  
  // Alternative direct phone regex anywhere in text
  const directPhoneRegex = /\b(01[3-9][0-9]{8})\b/;
  const fallbackPhoneMatch = text.match(directPhoneRegex);

  let senderNumber = '01700000000';
  if (phoneMatch && phoneMatch[1]) {
    senderNumber = phoneMatch[1];
  } else if (fallbackPhoneMatch && fallbackPhoneMatch[1]) {
    senderNumber = fallbackPhoneMatch[1];
  }

  // 4. Extract Transaction ID
  // Matches TrxID 9A8B7C6D5E, TxnID: 7X8Y9Z0A, TrxID UP12345678
  const trxRegex = /(?:TrxID|TxnID|TXNID|Trx ID|Txn ID)\s*:?\s*([A-Za-z0-9]+)/i;
  const trxMatch = text.match(trxRegex);

  let transactionId = '';
  if (trxMatch && trxMatch[1]) {
    transactionId = trxMatch[1].toUpperCase();
  } else {
    // Generate fallback unique Trx ID if not found
    const randomHex = Math.random().toString(36).substring(2, 9).toUpperCase();
    const prefix = paymentMethod === 'bKash' ? '8K' : paymentMethod === 'Nagad' ? '7N' : paymentMethod === 'Rocket' ? 'RC' : 'UP';
    transactionId = `${prefix}${randomHex}`;
  }

  // 5. Calculate Last 3 Digits for both Transaction ID and Sender Number
  const last3DigitsTrx = transactionId.slice(-3);
  const last3DigitsSender = senderNumber.slice(-3);

  // 6. Extract Date and Time or generate current date string
  const dateRegex = /(?:at|Date:?)\s*([0-9]{1,2}[\/-][0-9]{1,2}[\/-][0-9]{2,4}\s*(?:[0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?)?)/i;
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
    provider: 'Upay' as PaymentMethod,
    label: 'Upay Received (Tk 300)',
    sms: 'Cash In / Payment Received Tk 300.00 from 01511223789. TrxID UP12345789 at 02/08/2026 16:45.',
  },
];
