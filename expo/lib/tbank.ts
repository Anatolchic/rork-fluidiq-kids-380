import supabase from './supabase';

export interface TBankInitResult { success: boolean; paymentUrl?: string; paymentId?: string; error?: string; }

export async function initTopupPayment(params: { tutorId: string; amountKopecks: number; email?: string; }): Promise<TBankInitResult> {
  const orderId = `topup_${params.tutorId}_${Date.now()}`;
  const { data, error } = await supabase.functions.invoke('tbank-init-payment', {
    body: { amount: params.amountKopecks, orderId, description: 'Пополнение баланса репетитора', customerEmail: params.email },
  });
  if (error) return { success: false, error: error.message };
  if (!data?.PaymentURL) return { success: false, error: 'Нет URL для оплаты' };
  return { success: true, paymentUrl: data.PaymentURL, paymentId: data.PaymentId };
}
