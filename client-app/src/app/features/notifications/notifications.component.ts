import { Component, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIf, NgFor, NgClass } from '@angular/common';

type NotifFilter = 'all' | 'bookings' | 'payments' | 'promotions';
type NotifType = 'booking_confirmed' | 'payment' | 'reminder' | 'promotion' | 'cancellation';

interface Notification {
  id: string;
  type: NotifType;
  title: string;
  message: string;
  time: string;
  day: 'today' | 'yesterday' | 'week';
  isRead: boolean;
}

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [RouterLink, NgIf, NgFor, NgClass],
  templateUrl: './notifications.component.html',
  styleUrl: './notifications.component.scss',
})
export class NotificationsComponent {
  activeFilter = signal<NotifFilter>('all');

  readonly allNotifications = signal<Notification[]>([
    {
      id: 'n1',
      type: 'booking_confirmed',
      title: 'Réservation confirmée',
      message: 'Votre réservation au Green Valley Stadium a été confirmée',
      time: 'Il y a 5 min',
      day: 'today',
      isRead: false,
    },
    {
      id: 'n2',
      type: 'payment',
      title: 'Paiement reçu',
      message: 'Paiement de 27 500 FCFA traité avec succès',
      time: 'Il y a 1h',
      day: 'today',
      isRead: false,
    },
    {
      id: 'n3',
      type: 'reminder',
      title: 'Rappel de match',
      message: 'Votre match commence dans 1 heure !',
      time: 'Il y a 2h',
      day: 'today',
      isRead: true,
    },
    {
      id: 'n4',
      type: 'promotion',
      title: 'Offre spéciale',
      message: '20% de réduction sur les terrains ce weekend',
      time: 'Il y a 4h',
      day: 'today',
      isRead: true,
    },
    {
      id: 'n5',
      type: 'booking_confirmed',
      title: 'Réservation confirmée',
      message: 'Votre réservation à la Salle Basketball Parcelles a été confirmée',
      time: 'Hier 14:30',
      day: 'yesterday',
      isRead: true,
    },
    {
      id: 'n6',
      type: 'cancellation',
      title: 'Réservation annulée',
      message: 'Réservation annulée — remboursement en cours',
      time: 'Hier 10:15',
      day: 'yesterday',
      isRead: true,
    },
    {
      id: 'n7',
      type: 'payment',
      title: 'Paiement confirmé',
      message: 'Paiement de 41 500 FCFA pour Salle Basketball Parcelles',
      time: 'Hier 09:00',
      day: 'yesterday',
      isRead: true,
    },
    {
      id: 'n8',
      type: 'promotion',
      title: 'Nouveaux terrains',
      message: '3 nouveaux terrains disponibles dans votre zone',
      time: 'Lundi',
      day: 'week',
      isRead: true,
    },
    {
      id: 'n9',
      type: 'reminder',
      title: 'Rappel de match',
      message: 'N\'oubliez pas votre session de tennis demain à 9h',
      time: 'Lundi',
      day: 'week',
      isRead: true,
    },
    {
      id: 'n10',
      type: 'booking_confirmed',
      title: 'Réservation confirmée',
      message: 'Votre réservation au Court Tennis Club Plateau a été confirmée',
      time: 'Dimanche',
      day: 'week',
      isRead: true,
    },
  ]);

  readonly filteredNotifications = computed(() => {
    const filter = this.activeFilter();
    if (filter === 'all') return this.allNotifications();

    const typeMap: Record<NotifFilter, NotifType[]> = {
      all: [],
      bookings: ['booking_confirmed', 'cancellation', 'reminder'],
      payments: ['payment'],
      promotions: ['promotion'],
    };

    return this.allNotifications().filter(n => typeMap[filter].includes(n.type));
  });

  readonly todayNotifs = computed(() =>
    this.filteredNotifications().filter(n => n.day === 'today')
  );

  readonly yesterdayNotifs = computed(() =>
    this.filteredNotifications().filter(n => n.day === 'yesterday')
  );

  readonly weekNotifs = computed(() =>
    this.filteredNotifications().filter(n => n.day === 'week')
  );

  readonly unreadCount = computed(() =>
    this.allNotifications().filter(n => !n.isRead).length
  );

  readonly filters: { label: string; value: NotifFilter }[] = [
    { label: 'Toutes', value: 'all' },
    { label: 'Réservations', value: 'bookings' },
    { label: 'Paiements', value: 'payments' },
    { label: 'Promotions', value: 'promotions' },
  ];

  setFilter(filter: NotifFilter): void {
    this.activeFilter.set(filter);
  }

  markAllRead(): void {
    this.allNotifications.update(list =>
      list.map(n => ({ ...n, isRead: true }))
    );
  }

  markRead(id: string): void {
    this.allNotifications.update(list =>
      list.map(n => n.id === id ? { ...n, isRead: true } : n)
    );
  }

  getNotifIcon(type: NotifType): string {
    const icons: Record<NotifType, string> = {
      booking_confirmed: 'check_circle',
      payment: 'payments',
      reminder: 'alarm',
      promotion: 'local_offer',
      cancellation: 'cancel',
    };
    return icons[type];
  }

  getNotifIconClass(type: NotifType): string {
    const classes: Record<NotifType, string> = {
      booking_confirmed: 'notif-icon--green',
      payment: 'notif-icon--blue',
      reminder: 'notif-icon--orange',
      promotion: 'notif-icon--purple',
      cancellation: 'notif-icon--red',
    };
    return classes[type];
  }
}
