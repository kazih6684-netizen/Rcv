export type PaymentMethod = 'bKash' | 'Nagad' | 'Rocket' | 'Upay';

export interface PaymentRecord {
  id: string;
  amount: number;
  paymentMethod: PaymentMethod;
  last3DigitsTrx: string;
  last3DigitsSender: string;
  senderNumber: string;
  transactionId: string;
  dateTime: string;
  rawSms: string;
  status: 'Success' | 'Pending' | 'Failed';
  createdAt: string;
}

export interface PendingPaymentRequest {
  id: string;
  amount: number;
  last3Digits: string; // The digits user entered to search
  status: 'Pending' | 'Success' | 'Failed';
  createdAt: string;
  matchedPaymentId?: string;
  paymentMethod?: PaymentMethod;
  senderNumber?: string;
  transactionId?: string;
}

export interface RawSmsLog {
  id: string;
  smsText: string;
  receivedAt: string;
  isProcessed: boolean;
  matchedRequestId?: string;
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
