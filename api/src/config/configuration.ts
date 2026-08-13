import * as Joi from 'joi';

export const validationSchema = Joi.object({
  APP_PORT: Joi.number().default(3000),
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),

  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),

  JWT_ACCESS_SECRET: Joi.string().required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().required(),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

  OTP_EXPIRES_IN_SECONDS: Joi.number().default(300),
  OTP_LENGTH: Joi.number().default(6),

  PAYMENT_PROVIDER_NAME: Joi.string().valid('samirpay', 'mock').default('mock'),
  SAMIRPAY_API_KEY: Joi.string().when('PAYMENT_PROVIDER_NAME', {
    is: 'samirpay',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  SAMIRPAY_SECRET_KEY: Joi.string().when('PAYMENT_PROVIDER_NAME', {
    is: 'samirpay',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  SAMIRPAY_WEBHOOK_SECRET: Joi.string().when('PAYMENT_PROVIDER_NAME', {
    is: 'samirpay',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),

  SMS_PROVIDER_NAME: Joi.string().valid('mtarget', 'mock').default('mock'),
  MTARGET_USERNAME: Joi.string().when('SMS_PROVIDER_NAME', {
    is: 'mtarget',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  MTARGET_PASSWORD: Joi.string().when('SMS_PROVIDER_NAME', {
    is: 'mtarget',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  MTARGET_SERVICE_ID: Joi.string().when('SMS_PROVIDER_NAME', {
    is: 'mtarget',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  MTARGET_SENDER: Joi.string().default('EasyArena'),

  SUPER_ADMIN_PHONE: Joi.string().optional(),

  SUPABASE_URL: Joi.string().required(),
  SUPABASE_SERVICE_ROLE_KEY: Joi.string().required(),
  SUPABASE_BUCKET_NAME: Joi.string().required(),
});

export default () => ({
  port: parseInt(process.env.APP_PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  database: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    name: process.env.DB_NAME,
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  otp: {
    expiresInSeconds: parseInt(process.env.OTP_EXPIRES_IN_SECONDS ?? '300', 10),
    length: parseInt(process.env.OTP_LENGTH ?? '6', 10),
  },
  payment: {
    providerName: process.env.PAYMENT_PROVIDER_NAME ?? 'mock',
    samirpay: {
      apiKey: process.env.SAMIRPAY_API_KEY,
      secretKey: process.env.SAMIRPAY_SECRET_KEY,
      webhookSecret: process.env.SAMIRPAY_WEBHOOK_SECRET,
    },
  },
  sms: {
    providerName: process.env.SMS_PROVIDER_NAME ?? 'mock',
    mtarget: {
      username:  process.env.MTARGET_USERNAME,
      password:  process.env.MTARGET_PASSWORD,
      serviceId: process.env.MTARGET_SERVICE_ID,
      sender:    process.env.MTARGET_SENDER ?? 'EasyArena',
    },
  },
  superAdminPhone: process.env.SUPER_ADMIN_PHONE,
  supabase: {
    url: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    bucketName: process.env.SUPABASE_BUCKET_NAME,
  },
});
