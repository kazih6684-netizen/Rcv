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
