export type PaymentMethod = 'bKash' | 'Nagad' | 'Rocket' | 'Upay';

export interface AdminSmsLog {
  id?: string;
  smsText: string;
  sender: string;
  timestamp: any;
  receivedAt: string;
}

export interface FailedParseLog {
  id?: string;
  smsText: string;
  sender: string;
  error: string;
  provider?: string;
  debug?: any;
  timestamp: any;
  receivedAt: string;
}

export interface PaymentMatchLog {
  id?: string;
  paymentId: string;
  pendingPaymentId?: string;
  matchType: 'TRX_ID' | 'SENDER_PHONE' | 'AUTO_CONFIRMED' | 'MANUAL';
  matchScore: number;
  details: string;
  timestamp: any;
}

export interface PendingPayment {
  id?: string;
  userId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  last3DigitsTrx?: string;
  last3DigitsSender?: string;
  status: 'PENDING' | 'CONFIRMED' | 'REJECTED';
  createdAt: any;
  confirmedAt?: any;
}

export interface Payment {
  id?: string;
  amount: number;
  paymentMethod: PaymentMethod;
  transactionId: string;
  senderNumber: string;
  last3DigitsTrx: string;
  last3DigitsSender: string;
  timestamp: any;
  dateTime?: string;
  rawSms?: string;
  status: 'UNMATCHED' | 'MATCHED' | 'MANUAL_CONFIRMED';
  debug?: {
    provider?: string;
    extractedAmount?: number;
    extractedTrxID?: string;
    extractedSender?: string;
    matchScore?: number;
  };
}

export interface SMSParseResult {
  success: boolean;
  amount?: number;
  paymentMethod?: PaymentMethod;
  last3DigitsTrx?: string;
  last3DigitsSender?: string;
  senderNumber?: string;
  transactionId?: string;
  dateTime?: string;
  rawSms?: string;
  error?: string;
  debug?: {
    provider?: string;
    extractedAmount?: number;
    extractedTrxID?: string;
    extractedSender?: string;
  };
}

export interface PaymentStats {
  totalPayments: number;
  todayPayments: number;
  totalVolume: number;
  todayVolume: number;
  byMethod: Record<PaymentMethod, number>;
}

export interface AppState {
  isAdminLoggedIn: boolean;
  smsPermissionStatus: 'granted' | 'denied' | 'prompt';
  firebaseConnected: boolean;
  autoSimulate: boolean;
  viewMode: 'mobile' | 'fullscreen';
}
