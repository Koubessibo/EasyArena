export enum Role {
  CLIENT = 'client',
  OWNER = 'owner',
  VENDOR = 'vendor',
  ADMIN = 'admin',
  FIELD_ADMIN = 'field_admin',
  CONTROLLER = 'controller',
}

export enum UserStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  PENDING = 'pending',
}

export enum SportType {
  FOOTBALL = 'football',
  BASKETBALL = 'basketball',
  TENNIS = 'tennis',
  PADEL = 'padel',
  HANDBALL = 'handball',
  VOLLEYBALL = 'volleyball',
  OTHER = 'other',
}

export enum FieldStatus {
  AVAILABLE = 'available',
  MAINTENANCE = 'maintenance',
  INACTIVE = 'inactive',
}

export enum DayOfWeek {
  MONDAY = 'monday',
  TUESDAY = 'tuesday',
  WEDNESDAY = 'wednesday',
  THURSDAY = 'thursday',
  FRIDAY = 'friday',
  SATURDAY = 'saturday',
  SUNDAY = 'sunday',
}

export enum BookingStatus {
  PENDING_PAYMENT = 'pending_payment',
  CONFIRMED = 'confirmed',
  CANCELLATION_PENDING = 'cancellation_pending',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

export enum PaymentMethod {
  MOBILE_MONEY = 'mobile_money',
  CARD = 'card',
}

export enum MobileOperator {
  WAVE = 'WAVE',
  ORANGE_MONEY = 'ORANGE_MONEY',
  FREE_MONEY = 'FREE_MONEY',
}

export enum PaymentStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
}

export enum ArticleCategory {
  FOOTWEAR = 'footwear',
  CLOTHING = 'clothing',
  EQUIPMENT = 'equipment',
  OTHER = 'other',
}

export enum ArticleStatus {
  IN_STOCK = 'in_stock',
  OUT_OF_STOCK = 'out_of_stock',
  HIDDEN = 'hidden',
}

export enum TransactionType {
  BOOKING_CREDIT = 'BOOKING_CREDIT',
  TICKET_CREDIT = 'TICKET_CREDIT',
  WITHDRAWAL_DEBIT = 'WITHDRAWAL_DEBIT',
  REFUND_CREDIT = 'REFUND_CREDIT',
  REFUND_DEBIT = 'REFUND_DEBIT',
  FEE_DEBIT = 'FEE_DEBIT',
}

export enum TransactionDirection {
  CREDIT = 'CREDIT',
  DEBIT = 'DEBIT',
}

export enum TransactionSourceType {
  PAYMENT = 'PAYMENT',
  WITHDRAWAL = 'WITHDRAWAL',
  REFUND = 'REFUND',
}

export enum WithdrawalMethod {
  MOBILE_MONEY = 'mobile_money',
  BANK_TRANSFER = 'bank_transfer',
}

export enum WithdrawalStatus {
  PENDING_VALIDATION = 'pending_validation',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  PROCESSED = 'processed',
}

export enum CancellationRequestStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum NotificationChannel {
  SMS = 'sms',
  EMAIL = 'email',
  IN_APP = 'in_app',
}

export enum NotificationStatus {
  SENT = 'sent',
  FAILED = 'failed',
}

/**
 * Niveau d'urgence d'une notification in-app.
 * - ACTION  : une décision est attendue de l'utilisateur (badge rouge, toast persistant).
 * - INFO    : simple information, badge classique.
 * - DIGEST  : agrégé, jamais de badge urgent (ex: résumé quotidien super-admin).
 */
export enum NotificationPriority {
  ACTION = 'action',
  INFO = 'info',
  DIGEST = 'digest',
}

/**
 * Typologie métier des notifications. Sert à l'icône, au filtre, au lien
 * de navigation et aux préférences utilisateur (opt-out par type).
 * Ne jamais réutiliser une valeur existante pour un autre événement.
 */
export enum NotificationType {
  // ── Réservations ────────────────────────────────────────────────
  BOOKING_NEW = 'booking_new',
  BOOKING_CONFIRMED = 'booking_confirmed',
  BOOKING_CANCELLED = 'booking_cancelled',
  BOOKING_REFUND_OK = 'booking_refund_ok',
  BOOKING_REFUND_FAILED = 'booking_refund_failed',
  BOOKING_RATED = 'booking_rated',

  // ── Annulations (cycle de vie de la demande) ────────────────────
  CANCELLATION_REQUESTED = 'cancellation_requested',
  CANCELLATION_APPROVED = 'cancellation_approved',
  CANCELLATION_REJECTED = 'cancellation_rejected',

  // ── Paiements ───────────────────────────────────────────────────
  PAYMENT_OK = 'payment_ok',
  PAYMENT_FAILED = 'payment_failed',

  // ── Boutique / commandes ────────────────────────────────────────
  ORDER_NEW = 'order_new',
  ORDER_PAID = 'order_paid',
  ORDER_SHIPPED = 'order_shipped',
  ORDER_DELIVERED = 'order_delivered',
  ORDER_CANCELLED = 'order_cancelled',
  STOCK_LOW = 'stock_low',

  // ── Événements & billetterie ────────────────────────────────────
  TICKET_PURCHASED = 'ticket_purchased',
  TICKET_VALIDATED = 'ticket_validated',
  EVENT_REMINDED = 'event_reminded',
  EVENT_CANCELLED = 'event_cancelled',
  SCAN_SUCCESS = 'scan_success',
  SCAN_FAILED = 'scan_failed',
  SHIFT_SUMMARY = 'shift_summary',

  // ── Abonnements ─────────────────────────────────────────────────
  SUBSCRIPTION_REMINDER = 'subscription_reminder',
  SUBSCRIPTION_DUE = 'subscription_due',
  SUBSCRIPTION_SUSPENDED = 'subscription_suspended',
  SUBSCRIPTION_REACTIVATED = 'subscription_reactivated',
  SUBSCRIPTION_EXPIRED = 'subscription_expired',

  // ── Argent : retraits & commissions ─────────────────────────────
  COMMISSION_EARNED = 'commission_earned',
  COMMISSION_UNLOCKED = 'commission_unlocked',
  WITHDRAWAL_REQUESTED = 'withdrawal_requested',
  WITHDRAWAL_APPROVED = 'withdrawal_approved',
  WITHDRAWAL_REJECTED = 'withdrawal_rejected',
  WITHDRAWAL_PAID = 'withdrawal_paid',
  WITHDRAWAL_FAILED = 'withdrawal_failed',

  // ── Partenaire : terrain, staff, opérations ─────────────────────
  FIELD_STATUS_CHANGED = 'field_status_changed',
  FIELD_CREATED = 'field_created',
  STAFF_INVITED = 'staff_invited',
  STAFF_PERMISSIONS_CHANGED = 'staff_permissions_changed',
  SCHEDULE_ASSIGNED = 'schedule_assigned',

  // ── Compte & sécurité ───────────────────────────────────────────
  ACCOUNT_SUSPENDED = 'account_suspended',
  ACCOUNT_PIN_CHANGED = 'account_pin_changed',
  ACCOUNT_CREATED = 'account_created',

  // ── Back-office super-admin ─────────────────────────────────────
  ENROLLMENT_NEW = 'enrollment_new',
  SECURITY_ALERT = 'security_alert',
  SYSTEM_ALERT = 'system_alert',
  KPI_DIGEST = 'kpi_digest',

  // ── Marketing (opt-in, jamais prioritaire) ──────────────────────
  PROMO = 'promo',
}

export enum SubscriptionStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  EXPIRED = 'expired',
}

export enum InstallmentStatus {
  PENDING = 'pending',
  PAID = 'paid',
  FAILED = 'failed',
  OVERDUE = 'overdue',
}

export enum SponsorType {
  CLIENT = 'CLIENT',
  AMBASSADOR = 'AMBASSADOR',
}

export enum SponsorshipCommissionStatus {
  PENDING = 'PENDING',
  AVAILABLE = 'AVAILABLE',
  CANCELLED = 'CANCELLED',
  CREDITED = 'CREDITED',
}
