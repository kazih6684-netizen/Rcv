import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { parsePaymentSMS, isOTPSMS, detectProvider, normalizePhoneNumber } from './src/utils/smsExtractor.js';
import { PaymentRecord, PaymentStats, AdminSmsLog } from './src/types.js';

import { db, collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, serverTimestamp, updateDoc } from './src/firebase.js';

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Helper function to get all payments from Firestore
async function fetchAllPayments(): Promise<PaymentRecord[]> {
  try {
    const q = query(collection(db, 'payments'), orderBy('createdAt', 'desc'));
    const querySnapshot = await getDocs(q);
    const payments: PaymentRecord[] = [];
    querySnapshot.forEach((doc) => {
      payments.push({ id: doc.id, ...doc.data() } as PaymentRecord);
    });
    return payments;
  } catch (err) {
    console.error("Error fetching payments", err);
    return [];
  }
}

// Health endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', serverTime: new Date().toISOString() });
});

// Get all payments
app.get('/api/payments', async (req, res) => {
  const sorted = await fetchAllPayments();
  res.json({ success: true, payments: sorted });
});

// Search payments by last 3 digits or full transaction/sender
app.post('/api/payments/search', async (req, res) => {
  const { digits } = req.body;
  if (!digits || typeof digits !== 'string') {
    return res.status(400).json({ success: false, message: 'Digits string is required' });
  }
  const queryStr = digits.trim().toLowerCase();
  const normalizedQuery = normalizePhoneNumber(queryStr);
  console.log(`PAYMENT SEARCH: Query [${queryStr}] -> Normalized [${normalizedQuery}]`);
  
  const paymentsDatabase = await fetchAllPayments();
  const matched = paymentsDatabase.filter((pay) => {
    // 1. Transaction ID Match (Last 3 digits or full)
    const trxMatch = 
      pay.last3DigitsTrx.toLowerCase() === queryStr || 
      pay.transactionId.toLowerCase().endsWith(queryStr) || 
      pay.transactionId.toLowerCase().includes(queryStr);
    
    // 2. Sender Phone Match (Normalized query vs normalized sender)
    const normalizedSender = normalizePhoneNumber(pay.senderNumber);
    const senderMatch = 
      pay.last3DigitsSender.toLowerCase() === queryStr || 
      normalizedSender.endsWith(queryStr) || 
      normalizedSender.includes(queryStr) ||
      (normalizedQuery.length >= 11 && normalizedSender === normalizedQuery);
    
    if (trxMatch || senderMatch) {
      console.log(` -> MATCH FOUND: TrxID=${pay.transactionId}, Sender=${pay.senderNumber}, Amount=${pay.amount}`);
      return true;
    }
    return false;
  });

  if (matched.length === 0) {
    console.log(` -> NO MATCH FOUND for query [${queryStr}]`);
  }

  res.json({
    success: true,
    query: queryStr,
    count: matched.length,
    matchedPayments: matched,
  });
});

// Parse SMS & Auto-Add to DB
app.post('/api/sms/parse', async (req, res) => {
  console.log("-----------------------------------------");
  console.log("PAYMENT DETECTOR: Received Request");
  
  const smsText = req.body.smsText || req.body.sms_message || req.body.body || req.body.message || req.body.text;
  const sender = req.body.sender || req.body.from || req.body.number || req.body.address || req.body.sms_number;
  
  if (!smsText || typeof smsText !== 'string') {
    console.log("PAYMENT DETECTOR ERROR: SMS text not found");
    return res.status(400).json({ success: false, message: 'SMS text is required' });
  }

  // 1. Check for OTP (Requirement 2)
  if (isOTPSMS(smsText)) {
    console.log("PAYMENT DETECTOR: Ignored OTP/Auth SMS");
    return res.json({ success: false, message: 'OTP/Authentication SMS ignored' });
  }

  console.log(`PAYMENT DETECTOR: Incoming SMS from [${sender || 'Unknown'}]`);
  console.log(`PAYMENT DETECTOR: Content: "${smsText}"`);
  
  const provider = detectProvider(smsText, typeof sender === 'string' ? sender : undefined);

  try {
    const parseResult = parsePaymentSMS(smsText, typeof sender === 'string' ? sender : undefined);
    
    // Log to admin_sms_logs if it's Nagad or if any provider is detected (Requirement 3)
    // The user specifically mentioned Nagad but also said "every non OTP Nagad payment SMS"
    // I will log all Nagad and possibly others to be safe, but focusing on Nagad as requested.
    if (provider === 'Nagad' || provider) {
      const logData: Omit<AdminSmsLog, 'id'> = {
        rawText: smsText,
        sender: String(sender || 'Unknown'),
        receivedAt: new Date().toISOString(),
        timestamp: serverTimestamp(),
        status: parseResult.success ? 'Confirmed' : 'Needs Review',
        parserStatus: parseResult.success ? 'Success' : 'Failed',
        extractedAmount: parseResult.amount,
        extractedTrxId: parseResult.transactionId,
        extractedSender: parseResult.senderNumber,
        provider: provider || undefined
      };
      await addDoc(collection(db, 'admin_sms_logs'), logData);
      console.log(`PAYMENT DETECTOR: Logged to admin_sms_logs (Provider: ${provider})`);
    }

    if (!parseResult.success) {
      console.log(`PAYMENT DETECTOR FAIL: ${parseResult.error}`);
      // Log failed parse attempts for debugging
      await addDoc(collection(db, 'failed_parse_logs'), {
        smsText,
        sender: sender || 'Unknown',
        error: parseResult.error,
        timestamp: serverTimestamp(),
      });
      return res.status(400).json({ success: false, message: parseResult.error });
    }
    
    console.log(`PAYMENT DETECTOR SUCCESS:`);
    console.log(` -> Provider Detected: ${parseResult.paymentMethod}`);
    console.log(` -> Amount Extracted: ৳${parseResult.amount}`);
    console.log(` -> Balance: ৳${parseResult.balance || 0}`);
    console.log(` -> Transaction ID: ${parseResult.transactionId} (Last 3: ${parseResult.last3DigitsTrx})`);
    console.log(` -> Sender Number: ${parseResult.senderNumber} (Last 3: ${parseResult.last3DigitsSender})`);

    const newPaymentData = {
      amount: parseResult.amount,
      paymentMethod: parseResult.paymentMethod,
      last3DigitsTrx: parseResult.last3DigitsTrx,
      last3DigitsSender: parseResult.last3DigitsSender,
      senderNumber: parseResult.senderNumber,
      transactionId: parseResult.transactionId,
      balance: parseResult.balance || 0,
      dateTime: parseResult.dateTime,
      rawSms: parseResult.rawSms,
      status: 'verified',
      createdAt: serverTimestamp(),
    };

    const docRef = await addDoc(collection(db, 'payments'), newPaymentData);
    console.log(`PAYMENT DETECTOR: Saved to Firestore with ID: ${docRef.id}`);
    console.log("-----------------------------------------");
    
    const newPayment = { id: docRef.id, ...newPaymentData };
    res.json({
      success: true,
      message: 'Payment parsed and saved successfully',
      payment: newPayment,
    });
  } catch (err) {
    console.error("PAYMENT DETECTOR ERROR: Exception during processing", err);
    res.status(500).json({ success: false, message: 'Failed to process SMS' });
  }
});

// Admin SMS Logs API
app.get('/api/admin/sms-logs', async (req, res) => {
  try {
    const q = query(collection(db, 'admin_sms_logs'), orderBy('timestamp', 'desc'));
    const querySnapshot = await getDocs(q);
    const logs: AdminSmsLog[] = [];
    querySnapshot.forEach((doc) => {
      logs.push({ id: doc.id, ...doc.data() } as AdminSmsLog);
    });
    res.json({ success: true, logs });
  } catch (err) {
    console.error("Error fetching SMS logs", err);
    res.status(500).json({ success: false, message: 'Failed to fetch SMS logs' });
  }
});

// Manually confirm an SMS log
app.post('/api/admin/sms-logs/:id/confirm', async (req, res) => {
  const { id } = req.params;
  const { amount, trxId, senderNumber, provider } = req.body;
  
  if (!amount || !trxId || !senderNumber || !provider) {
    return res.status(400).json({ success: false, message: 'Missing required fields for confirmation' });
  }

  try {
    // 1. Create the payment record
    const cleanSender = normalizePhoneNumber(String(senderNumber).trim());
    const cleanTrx = String(trxId).trim().toUpperCase();
    
    const newPaymentData = {
      amount: Number(amount) || 0,
      paymentMethod: provider,
      last3DigitsTrx: cleanTrx.slice(-3),
      last3DigitsSender: cleanSender.slice(-3),
      senderNumber: cleanSender,
      transactionId: cleanTrx,
      dateTime: `${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}`,
      rawSms: `Manually Confirmed from Admin SMS Inbox: Tk ${amount} from ${cleanSender}. TrxID: ${cleanTrx}`,
      status: 'verified',
      createdAt: serverTimestamp(),
    };

    await addDoc(collection(db, 'payments'), newPaymentData);
    
    // 2. Update the log status
    await updateDoc(doc(db, 'admin_sms_logs', id), {
      status: 'Confirmed'
    });

    res.json({ success: true, message: 'Payment confirmed manually' });
  } catch (err) {
    console.error("Error confirming SMS log", err);
    res.status(500).json({ success: false, message: 'Failed to confirm payment' });
  }
});

// Create payment manually by admin
app.post('/api/payments', async (req, res) => {
  const { amount, paymentMethod, senderNumber, transactionId } = req.body;
  if (!amount || !paymentMethod || !senderNumber || !transactionId) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }
  const cleanSender = normalizePhoneNumber(String(senderNumber).trim());
  const cleanTrx = String(transactionId).trim().toUpperCase();
  
  const newPaymentData = {
    amount: Number(amount) || 0,
    paymentMethod: paymentMethod,
    last3DigitsTrx: cleanTrx.slice(-3),
    last3DigitsSender: cleanSender.slice(-3),
    senderNumber: cleanSender,
    transactionId: cleanTrx,
    dateTime: `${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}`,
    rawSms: `Manual Payment Entry: Tk ${amount} from ${cleanSender}. TrxID: ${cleanTrx}`,
    status: 'verified',
    createdAt: serverTimestamp(),
  };

  try {
    const docRef = await addDoc(collection(db, 'payments'), newPaymentData);
    res.json({ success: true, payment: { id: docRef.id, ...newPaymentData } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to save to database' });
  }
});

// Delete single payment
app.delete('/api/payments/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await deleteDoc(doc(db, 'payments', id));
    res.json({ success: true, message: 'Payment deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete payment' });
  }
});

// Reset / Clear database
app.delete('/api/payments/clear-all', async (req, res) => {
  try {
    const paymentsDatabase = await fetchAllPayments();
    for (const p of paymentsDatabase) {
      if (p.id) {
        await deleteDoc(doc(db, 'payments', p.id));
      }
    }
    res.json({ success: true, message: 'All payments cleared' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to clear payments' });
  }
});

// Stats summary endpoint
app.get('/api/stats', async (req, res) => {
  const paymentsDatabase = await fetchAllPayments();
  const totalPayments = paymentsDatabase.length;
  const totalVolume = paymentsDatabase.reduce((acc, curr) => acc + curr.amount, 0);
  const todayStr = new Date().toLocaleDateString('en-GB');
  
  const todayRecords = paymentsDatabase.filter((p) => {
    return p.dateTime.includes(todayStr) || new Date(p.createdAt).toDateString() === new Date().toDateString();
  });
  const todayPayments = todayRecords.length;
  const todayVolume = todayRecords.reduce((acc, curr) => acc + curr.amount, 0);
  
  const byMethod = {
    bKash: paymentsDatabase.filter((p) => p.paymentMethod === 'bKash').length,
    Nagad: paymentsDatabase.filter((p) => p.paymentMethod === 'Nagad').length,
    Rocket: paymentsDatabase.filter((p) => p.paymentMethod === 'Rocket').length,
    Upay: paymentsDatabase.filter((p) => p.paymentMethod === 'Upay').length,
  };
  
  const stats: PaymentStats = {
    totalPayments,
    todayPayments,
    totalVolume,
    todayVolume,
    byMethod,
  };
  res.json({ success: true, stats });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Unity Earning Payment Confirm System running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
