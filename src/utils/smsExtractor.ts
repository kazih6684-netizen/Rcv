import { PaymentMethod, SMSParseResult, TransactionType } from '../types';

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

  // 1. Detect Provider & Initial Parse
  if (isBKash(text)) return parseBKash(text);
  if (isNagad(text)) return parseNagad(text);
  if (isRocket(text)) return parseRocket(text);
  if (isUpay(text)) return parseUpay(text);

  return { success: false, error: 'Unsupported or non-transactional SMS' };
}

// --- Provider Detection ---

function isBKash(text: string): boolean {
  const t = text.toLowerCase();
  return t.includes('bkash') || t.includes('trxid');
}

function isNagad(text: string): boolean {
  const t = text.toLowerCase();
  return t.includes('nagad') || t.includes('money received') || (t.includes('txnid') && t.includes('amount'));
}

function isRocket(text: string): boolean {
  const t = text.toLowerCase();
  return t.includes('rocket') || t.includes('nexuspay') || (t.includes('received from a/c') && t.includes('txnid'));
}

function isUpay(text: string): boolean {
  const t = text.toLowerCase();
  return t.includes('upay') || t.includes('up123');
}

// --- Parsers ---

function parseBKash(text: string): SMSParseResult {
  // Regex for bKash Received/Cash In/Deposit
  // Example: You have received Tk 20.00 from 01804994687. Ref 5. Fee Tk 0.00. Balance Tk 140.13. TrxID DH383LRWI2 at 03/08/2026 22:18
  // Example: Cash In Tk 599.00 from 01912456050 successful. Fee Tk 0.00. Balance Tk 10,834.55. TrxID DH3333ZG2J at 03/08/2026 16:13.
  
  const amountMatch = text.match(/(?:Tk|TK)\s*([0-9,]+\.[0-9]{2})/i);
  const senderMatch = text.match(/(?:from|Sender:?)\s*([0-9Xx*]+|[A-Za-z\s]+)/i);
  const trxMatch = text.match(/TrxID\s*([A-Z0-9]+)/i);
  const refMatch = text.match(/Ref\s*([^.]+)/i);
  const balanceMatch = text.match(/Balance\s*(?:Tk)?\s*([0-9,]+\.[0-9]{2})/i);
  const dateMatch = text.match(/at\s*([0-9/:\s]+)/i);

  if (!trxMatch || !amountMatch) return { success: false, error: 'Invalid bKash format' };

  let type: TransactionType = 'Received';
  if (text.toLowerCase().includes('cash in')) type = 'Cash In';
  if (text.toLowerCase().includes('deposit')) type = 'Deposit';
  if (text.toLowerCase().includes('npsb')) type = 'NPSB';

  const transactionId = trxMatch[1];
  const senderNumber = senderMatch ? senderMatch[1].trim() : 'Unknown';

  return {
    success: true,
    paymentMethod: 'bKash',
    transactionType: type,
    amount: parseFloat(amountMatch[1].replace(/,/g, '')),
    senderNumber,
    transactionId,
    reference: refMatch ? refMatch[1].trim() : 'N/A',
    balance: balanceMatch ? parseFloat(balanceMatch[1].replace(/,/g, '')) : 0,
    dateTime: dateMatch ? dateMatch[1].trim() : new Date().toLocaleString(),
    last3DigitsTrx: transactionId.slice(-3),
    last3DigitsSender: senderNumber.slice(-3),
    rawSms: text
  };
}

function parseNagad(text: string): SMSParseResult {
  // Example: Money Received. Amount: Tk 22.00 Sender: 01919012426 Ref: 2 TxnID: 75ROHCD9 Balance: Tk 3191.82 03/08/2026 23:11
  
  const amountMatch = text.match(/Amount:\s*(?:Tk)?\s*([0-9,]+\.[0-9]{2})/i);
  const senderMatch = text.match(/(?:Sender|Uddokta):\s*([0-9Xx*]+)/i);
  const trxMatch = text.match(/TxnID:\s*([A-Z0-9]+)/i);
  const refMatch = text.match(/Ref:\s*([^ \n]+)/i);
  const balanceMatch = text.match(/Balance:\s*(?:Tk)?\s*([0-9,]+\.[0-9]{2})/i);
  
  // Date is often at the end for Nagad
  const dateRegex = /([0-9]{2}\/[0-9]{2}\/[0-9]{4}\s*[0-9]{2}:[0-9]{2})/i;
  const dateMatch = text.match(dateRegex);

  if (!trxMatch || !amountMatch) return { success: false, error: 'Invalid Nagad format' };

  let type: TransactionType = 'Received';
  if (text.toLowerCase().includes('cash in')) type = 'Cash In';

  const transactionId = trxMatch[1];
  const senderNumber = senderMatch ? senderMatch[1].trim() : 'Unknown';

  return {
    success: true,
    paymentMethod: 'Nagad',
    transactionType: type,
    amount: parseFloat(amountMatch[1].replace(/,/g, '')),
    senderNumber,
    transactionId,
    reference: refMatch ? refMatch[1].trim() : 'N/A',
    balance: balanceMatch ? parseFloat(balanceMatch[1].replace(/,/g, '')) : 0,
    dateTime: dateMatch ? dateMatch[1].trim() : new Date().toLocaleString(),
    last3DigitsTrx: transactionId.slice(-3),
    last3DigitsSender: senderNumber.slice(-3),
    rawSms: text
  };
}

function parseRocket(text: string): SMSParseResult {
  // Example: Tk480.00 received from A/C:***173 Fee:Tk0, Your A/C Balance: Tk12,056.92 TxnId:6790841460 Date:31-JUL-26 04:50:30 pm.
  // Example: Tk 50.00 received from bKash A/C ***648 through NPSB. Fee: Tk .00. Your A/C Balance: Tk 74.21. TxnID:6800983107 at 03-AUG-26 11:00:07 pm.

  const amountMatch = text.match(/Tk\s*([0-9,]+\.[0-9]{2})/i);
  const senderMatch = text.match(/from\s*(?:bKash\s*)?A\/C\s*:?([*Xx0-9]+)/i);
  const trxMatch = text.match(/TxnID\s*:?\s*([0-9]+)/i);
  const balanceMatch = text.match(/Balance\s*:?\s*Tk\s*([0-9,]+\.[0-9]{2})/i);
  const dateMatch = text.match(/Date\s*:?\s*([0-9A-Z\-\s:]+(?:am|pm))/i);

  if (!trxMatch || !amountMatch) return { success: false, error: 'Invalid Rocket format' };

  let type: TransactionType = 'Received';
  if (text.toLowerCase().includes('npsb')) type = 'NPSB';

  const transactionId = trxMatch[1];
  const senderNumber = senderMatch ? senderMatch[1].trim() : 'Unknown';

  return {
    success: true,
    paymentMethod: 'Rocket',
    transactionType: type,
    amount: parseFloat(amountMatch[1].replace(/,/g, '')),
    senderNumber,
    transactionId,
    reference: 'N/A',
    balance: balanceMatch ? parseFloat(balanceMatch[1].replace(/,/g, '')) : 0,
    dateTime: dateMatch ? dateMatch[1].trim() : new Date().toLocaleString(),
    last3DigitsTrx: transactionId.slice(-3),
    last3DigitsSender: senderNumber.slice(-3),
    rawSms: text
  };
}

function parseUpay(text: string): SMSParseResult {
  const amountMatch = text.match(/Tk\s*([0-9,]+\.[0-9]{2})/i);
  const senderMatch = text.match(/from\s*([0-9Xx*]+)/i);
  const trxMatch = text.match(/TrxID\s*([A-Z0-9]+)/i);
  
  if (!trxMatch || !amountMatch) return { success: false, error: 'Invalid Upay format' };

  const transactionId = trxMatch[1];
  const senderNumber = senderMatch ? senderMatch[1].trim() : 'Unknown';

  return {
    success: true,
    paymentMethod: 'Upay',
    transactionType: 'Received',
    amount: parseFloat(amountMatch[1].replace(/,/g, '')),
    senderNumber,
    transactionId,
    reference: 'N/A',
    balance: 0,
    dateTime: new Date().toLocaleString(),
    last3DigitsTrx: transactionId.slice(-3),
    last3DigitsSender: senderNumber.slice(-3),
    rawSms: text
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
    label: 'bKash Received',
    sms: 'You have received Tk 20.00 from 01804994687. Ref 5. Fee Tk 0.00. Balance Tk 140.13. TrxID DH383LRWI2 at 03/08/2026 22:18',
  },
  {
    provider: 'bKash' as PaymentMethod,
    label: 'bKash Cash In',
    sms: 'Cash In Tk 599.00 from 01912456050 successful. Fee Tk 0.00. Balance Tk 10,834.55. TrxID DH3333ZG2J at 03/08/2026 16:13.',
  },
  {
    provider: 'bKash' as PaymentMethod,
    label: 'bKash Deposit',
    sms: 'You have received deposit from iBanking of Tk 599.00 from Bank Asia Internet Banking. Fee Tk 0.00. Balance Tk 13,332.55. TrxID DH373ELMP7 at 03/08/2026 20:00',
  },
  {
    provider: 'bKash' as PaymentMethod,
    label: 'bKash NPSB',
    sms: 'You have received Tk 50.00 from Nagad 0133XXX6909 through NPSB. Fee Tk 0.00. Balance Tk 349.71. TrxID DH383O7FCM at 03/08/2026 23:25.',
  },
  {
    provider: 'Nagad' as PaymentMethod,
    label: 'Nagad Money Received',
    sms: 'Money Received.\nAmount: Tk 22.00\nSender: 01919012426\nRef: 2\nTxnID: 75ROHCD9\nBalance: Tk 3191.82\n03/08/2026 23:11',
  },
  {
    provider: 'Nagad' as PaymentMethod,
    label: 'Nagad Cash In',
    sms: 'Cash In Received.\nAmount: Tk 160.00\nUddokta: 01940803280\nTxnID: 75R26F8F\nBalance: 26509.33\n31/07/2026 12:21',
  },
  {
    provider: 'Rocket' as PaymentMethod,
    label: 'Rocket Received',
    sms: 'Tk480.00 received from A/C:***173 Fee:Tk0, Your A/C Balance: Tk12,056.92 TxnId:6790841460 Date:31-JUL-26 04:50:30 pm.',
  },
  {
    provider: 'Rocket' as PaymentMethod,
    label: 'Rocket NPSB',
    sms: 'Tk 50.00 received from bKash A/C ***648 through NPSB. Fee: Tk .00. Your A/C Balance: Tk 74.21. TxnID:6800983107 at 03-AUG-26 11:00:07 pm.',
  },
];
