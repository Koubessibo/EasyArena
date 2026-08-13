export interface ISmsProvider {
  send(phone: string, message: string): Promise<void>;
}

export const SMS_PROVIDER = 'SMS_PROVIDER';
