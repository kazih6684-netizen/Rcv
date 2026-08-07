import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { parsePaymentSMS } from './src/utils/smsExtractor.js';
import { PaymentRecord, PaymentStats } from './src/types.js';

import { db, collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, serverTimestamp } from './src/firebase.js';

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
  const searchLast3 = queryStr.slice(-3); // Extract last 3 digits as verification key
  
  const paymentsDatabase = await fetchAllPayments();
  const matched = paymentsDatabase.filter((pay) => {
    // Last 3 Digits Verification Key Rule:
    // Only accept/approve payment if the last 3 digits match either sender phone number or transaction ID
    const senderLast3 = (pay.last3DigitsSender || pay.senderNumber.slice(-3)).toLowerCase();
    const trxLast3 = (pay.last3DigitsTrx || pay.transactionId.slice(-3)).toLowerCase();
    
    return senderLast3 === queryStr || trxLast3 === queryStr || senderLast3 === searchLast3 || trxLast3 === searchLast3;
  });

  res.json({
    success: true,
    query: queryStr,
    searchLast3,
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
  const isExplicitDemo = Boolean(req.body.isDemo);

  if (!smsText || typeof smsText !== 'string') {
    console.log("PAYMENT DETECTOR ERROR: SMS text not found");
    return res.status(400).json({ success: false, message: 'SMS text is required' });
  }

  // Check if this is a Nagad Demo SMS sample (Rule: Demo SMS are reference only and must NEVER be saved to DB)
  const isNagadDemoSms = 
    isExplicitDemo || 
    smsText.includes('75SD1SNV') || 
    smsText.includes('75SDCB9M');

  console.log(`PAYMENT DETECTOR: Incoming SMS from [${sender || 'Unknown'}] (IsDemo: ${isNagadDemoSms})`);
  console.log(`PAYMENT DETECTOR: Content: "${smsText}"`);
  
  try {
    const parseResult = parsePaymentSMS(smsText, typeof sender === 'string' ? sender : undefined);
    
    if (!parseResult.success) {
      console.log(`PAYMENT DETECTOR FAIL: ${parseResult.error}`);
      await addDoc(collection(db, 'failed_parse_logs'), {
        smsText,
        sender: sender || 'Unknown',
        error: parseResult.error,
        timestamp: serverTimestamp(),
      });
      return res.status(400).json({ success: false, message: parseResult.error });
    }
    
    console.log(`PAYMENT DETECTOR SUCCESS:`);
    console.log(` -> Method: ${parseResult.paymentMethod}`);
    console.log(` -> Amount: ৳${parseResult.amount}`);
    console.log(` -> TrxID: ${parseResult.transactionId} (Last 3: ${parseResult.last3DigitsTrx})`);
    console.log(` -> Sender Phone: ${parseResult.senderNumber} (Last 3: ${parseResult.last3DigitsSender})`);

    const paymentPayload = {
      amount: parseResult.amount,
      paymentMethod: parseResult.paymentMethod,
      last3DigitsTrx: parseResult.last3DigitsTrx,
      last3DigitsSender: parseResult.last3DigitsSender,
      senderNumber: parseResult.senderNumber,
      transactionId: parseResult.transactionId,
      dateTime: parseResult.dateTime,
      rawSms: parseResult.rawSms,
      status: 'verified',
    };

    if (isNagadDemoSms) {
      console.log("PAYMENT DETECTOR: DEMO SMS DETECTED - Reference format only. NOT saved to database.");
      return res.json({
        success: true,
        isDemo: true,
        message: 'Nagad demo SMS reference format parsed successfully (Not saved to database as per rule)',
        payment: {
          id: 'DEMO_REFERENCE_NOT_SAVED',
          ...paymentPayload,
          status: 'demo_reference',
        },
      });
    }

    const docRef = await addDoc(collection(db, 'payments'), {
      ...paymentPayload,
      createdAt: serverTimestamp(),
    });

    console.log(`PAYMENT DETECTOR: Real SMS saved to Firestore with ID: ${docRef.id}`);
    console.log("-----------------------------------------");
    
    const newPayment = { id: docRef.id, ...paymentPayload };
    res.json({
      success: true,
      message: 'Real payment parsed and saved to database successfully',
      payment: newPayment,
    });
  } catch (err) {
    console.error("PAYMENT DETECTOR ERROR: Exception during processing", err);
    res.status(500).json({ success: false, message: 'Failed to process SMS' });
  }
});

// Create payment manually by admin
app.post('/api/payments', async (req, res) => {
  const { amount, paymentMethod, senderNumber, transactionId } = req.body;
  if (!amount || !paymentMethod || !senderNumber || !transactionId) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }
  const cleanSender = String(senderNumber).trim();
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

// Reset / Clear database (MUST be placed BEFORE /api/payments/:id)
app.delete('/api/payments/clear-all', async (req, res) => {
  try {
    const querySnapshot = await getDocs(collection(db, 'payments'));
    console.log(`CLEAR ALL: Deleting ${querySnapshot.docs.length} payment documents...`);
    const deletePromises = querySnapshot.docs.map((docSnap) => deleteDoc(doc(db, 'payments', docSnap.id)));
    await Promise.all(deletePromises);
    res.json({ success: true, message: 'All payments cleared successfully' });
  } catch (err) {
    console.error("Error clearing all payments:", err);
    res.status(500).json({ success: false, message: 'Failed to clear payments' });
  }
});

app.post('/api/payments/clear-all', async (req, res) => {
  try {
    const querySnapshot = await getDocs(collection(db, 'payments'));
    const deletePromises = querySnapshot.docs.map((docSnap) => deleteDoc(doc(db, 'payments', docSnap.id)));
    await Promise.all(deletePromises);
    res.json({ success: true, message: 'All payments cleared successfully' });
  } catch (err) {
    console.error("Error clearing all payments:", err);
    res.status(500).json({ success: false, message: 'Failed to clear payments' });
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
