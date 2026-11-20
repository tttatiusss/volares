import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { BrandAssets } from '@/constants/brand';

export type ReservationDetails = {
  id: string;
  flightId: string;
  departureDate: string;
  passengerCount: number;
  totalPrice: number;
  currency: string;
  status: string;
  bookingReference: string;
};

type ReservationsSectionProps = {
  reservations: ReservationDetails[];
  loading: boolean;
  error: string;
  onRetry: () => void;
  onBrowseFlights: () => void;
};

const colors = {
  blue: '#3593FC',
  navy: '#171078',
  text: '#20243A',
  muted: '#777D91',
  border: '#E4E8F0',
  surface: '#F6F8FC',
  white: '#FFFFFF',
  error: '#C73547',
};

const statusLabels: Record<string, string> = {
  pending: 'Pendente',
  confirmed: 'Confirmada',
  cancelled: 'Cancelada',
  completed: 'Concluída',
  expired: 'Expirada',
};

function formatDeparture(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Data indisponível';
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatPrice(value: number, currency: string) {
  try {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency,
    }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString('pt-BR')}`;
  }
}

function PaperPlaneIcon() {
  return (
    <Image
      accessibilityLabel="Avião de papel"
      contentFit="contain"
      source={BrandAssets.paperPlane}
      style={styles.planeIcon}
    />
  );
}

function ReservationCard({ reservation }: { reservation: ReservationDetails }) {
  return (
    <View style={styles.reservationCard}>
      <View style={styles.cardHeading}>
        <View>
          <Text style={styles.referenceLabel}>LOCALIZADOR</Text>
          <Text style={styles.reference}>{reservation.bookingReference}</Text>
        </View>
        <View style={styles.statusBadge}>
          <Text style={styles.statusText}>
            {statusLabels[reservation.status] ?? reservation.status}
          </Text>
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.detailRow}>
        <SymbolView
          name={{ ios: 'calendar', android: 'calendar_month', web: 'calendar_month' }}
          tintColor={colors.blue}
          size={18}
        />
        <View style={styles.detailCopy}>
          <Text style={styles.detailLabel}>Partida</Text>
          <Text style={styles.detailValue}>{formatDeparture(reservation.departureDate)}</Text>
        </View>
      </View>
      <View style={styles.detailRow}>
        <View style={styles.planeIconBadge}>
          <PaperPlaneIcon />
        </View>
        <View style={styles.detailCopy}>
          <Text style={styles.detailLabel}>Código do voo</Text>
          <Text numberOfLines={1} style={styles.detailValue}>
            {reservation.flightId}
          </Text>
        </View>
      </View>

      <View style={styles.cardFooter}>
        <Text style={styles.passengerCount}>
          {reservation.passengerCount}{' '}
          {reservation.passengerCount === 1 ? 'passageiro' : 'passageiros'}
        </Text>
        <Text style={styles.totalPrice}>
          {formatPrice(reservation.totalPrice, reservation.currency)}
        </Text>
      </View>
    </View>
  );
}

export function ReservationsSection({
  reservations,
  loading,
  error,
  onRetry,
  onBrowseFlights,
}: ReservationsSectionProps) {
  return (
    <View style={styles.content}>
      <Text style={styles.eyebrow}>SUA CONTA</Text>
      <Text style={styles.title}>Minhas reservas</Text>
      <Text style={styles.subtitle}>Acompanhe os detalhes dos seus voos.</Text>

      {loading ? (
        <View style={styles.state}>
          <ActivityIndicator color={colors.blue} size="large" />
          <Text style={styles.stateText}>Carregando suas reservas...</Text>
        </View>
      ) : error ? (
        <View style={styles.state}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={onRetry}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
            <Text style={styles.primaryButtonText}>Tentar novamente</Text>
          </Pressable>
        </View>
      ) : reservations.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <PaperPlaneIcon />
          </View>
          <Text style={styles.emptyTitle}>Você ainda não tem reservas</Text>
          <Text style={styles.stateText}>
            Quando reservar um voo, os detalhes aparecerão aqui.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={onBrowseFlights}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
            <Text style={styles.primaryButtonText}>Buscar voos</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.list}>
          {reservations.map((reservation) => (
            <ReservationCard key={reservation.id} reservation={reservation} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 32,
  },
  eyebrow: {
    color: colors.blue,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.25,
  },
  title: {
    color: colors.navy,
    fontSize: 27,
    fontWeight: '800',
    marginTop: 5,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 5,
  },
  state: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 56,
  },
  stateText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    backgroundColor: colors.white,
    marginTop: 24,
    padding: 26,
  },
  emptyIcon: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: '#EFF6FF',
    marginBottom: 14,
  },
  emptyTitle: {
    color: colors.navy,
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
  },
  primaryButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: colors.blue,
    marginTop: 18,
    paddingHorizontal: 22,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.78,
  },
  list: {
    marginTop: 22,
  },
  reservationCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    backgroundColor: colors.white,
    marginBottom: 14,
    padding: 16,
  },
  cardHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 14,
  },
  referenceLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  reference: {
    color: colors.navy,
    fontSize: 16,
    fontWeight: '800',
    marginTop: 3,
  },
  statusBadge: {
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusText: {
    color: colors.blue,
    fontSize: 11,
    fontWeight: '700',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginBottom: 10,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  planeIconBadge: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: colors.blue,
  },
  planeIcon: {
    width: 24,
    height: 24,
  },
  detailCopy: {
    flex: 1,
  },
  detailLabel: {
    color: colors.muted,
    fontSize: 11,
  },
  detailValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    marginTop: 8,
    paddingTop: 13,
  },
  passengerCount: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  totalPrice: {
    color: colors.navy,
    fontSize: 16,
    fontWeight: '800',
  },
});
