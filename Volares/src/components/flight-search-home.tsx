import { Image } from 'expo-image';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandAssets } from '@/constants/brand';
import { ProfileSection, type ProfileDetails } from '@/components/profile-section';
import {
  ReservationsSection,
  type ReservationDetails,
} from '@/components/reservations-section';
import {
  type Airport,
  type Aircraft,
  type FeaturedRoute,
  type FlightResult,
  calculateFlightQuote,
  createSampleFlightResults,
  fetchFeaturedRoutes,
  fetchFlightCatalog,
  fetchFlightResults,
  getCompatibleAircraft,
} from '@/lib/flight-search';
import { getSupabaseClient } from '@/lib/supabase';

const colors = {
  blue: '#3593FC',
  navy: '#171078',
  pink: '#EF3B91',
  text: '#20243A',
  muted: '#777D91',
  border: '#E4E8F0',
  surface: '#F6F8FC',
  background: '#3593FC',
  panel: '#FFFFFF',
  white: '#FFFFFF',
  error: '#C73547',
};

type PickerTarget = 'origin' | 'destination' | null;
type HomeTab = 'home' | 'reservations' | 'profile';
type CalendarTarget = 'departure' | null;
type FlightSortMode = 'best' | 'cheapest' | 'fastest';
const sampleFeaturedRouteCodes: [string, string][] = [
  ['SBSP', 'SBRJ'],
  ['SBSP', 'SBGL'],
  ['SBSP', 'SBKP'],
  ['SBJD', 'SBRJ'],
  ['SBMT', 'SBKP'],
];
type PickerIconProps = {
  name: SymbolViewProps['name'];
  color?: string;
  size?: number;
};

function AppSymbol({ name, color = colors.muted, size = 20 }: PickerIconProps) {
  return <SymbolView name={name} tintColor={color} size={size} />;
}

function PaperPlaneIcon({ size }: { size: number }) {
  return (
    <Image
      accessibilityLabel="Avião de papel"
      contentFit="contain"
      source={BrandAssets.paperPlane}
      style={{ width: size, height: size }}
    />
  );
}

function getLocalDateInput() {
  return formatLocalDateInput(new Date());
}

function formatLocalDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDateFromInput(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

function getCalendarDays(month: Date) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const dayCount = new Date(year, monthIndex + 1, 0).getDate();

  return Array.from({ length: 42 }, (_, index) => {
    const day = index - firstWeekday + 1;
    return day > 0 && day <= dayCount ? new Date(year, monthIndex, day, 12) : null;
  });
}

function formatDepartureDate(value: string) {
  const date = getDateFromInput(value);
  const month = date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
  return `${String(date.getDate()).padStart(2, '0')} ${month} ${date.getFullYear()}`;
}

function formatWeekday(value: string) {
  return getDateFromInput(value).toLocaleDateString('pt-BR', { weekday: 'long' });
}

function getDateWindow(dateValue: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    throw new Error('Informe a data no formato AAAA-MM-DD.');
  }

  const [year, month, day] = dateValue.split('-').map(Number);
  const start = new Date(year, month - 1, day);
  if (
    start.getFullYear() !== year ||
    start.getMonth() !== month - 1 ||
    start.getDate() !== day
  ) {
    throw new Error('A data informada não é válida.');
  }

  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatPrice(price: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(price);
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return hours > 0 ? `${hours}h ${String(remainingMinutes).padStart(2, '0')}m` : `${minutes} min`;
}

function getAircraftTypeLabel(type: Aircraft['tipo'] | null) {
  switch (type) {
    case 'helicopter':
      return 'Helicóptero';
    case 'piston':
      return 'Pistão';
    case 'turboprop':
      return 'Turboélice';
    case 'jet':
      return 'Jato';
    default:
      return 'Aeronave';
  }
}

function getUserMetadataText(metadata: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export function FlightSearchHome() {
  const [loading, setLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [searchError, setSearchError] = useState('');
  const [airports, setAirports] = useState<Airport[]>([]);
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [origin, setOrigin] = useState<Airport | null>(null);
  const [destination, setDestination] = useState<Airport | null>(null);
  const [departureDate, setDepartureDate] = useState(getLocalDateInput);
  const [calendarTarget, setCalendarTarget] = useState<CalendarTarget>(null);
  const [calendarSelectedDate, setCalendarSelectedDate] = useState(departureDate);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [passengerCount, setPassengerCount] = useState(1);
  const [selectedAircraftModel, setSelectedAircraftModel] = useState<string | null>(null);
  const [airportPickerTarget, setAirportPickerTarget] = useState<PickerTarget>(null);
  const [aircraftPickerOpen, setAircraftPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [flights, setFlights] = useState<FlightResult[]>([]);
  const [selectedDepartureFlightId, setSelectedDepartureFlightId] = useState<string | null>(null);
  const [detailFlightId, setDetailFlightId] = useState<string | null>(null);
  const [flightSortMode, setFlightSortMode] = useState<FlightSortMode>('best');
  const [featuredRoutes, setFeaturedRoutes] = useState<FeaturedRoute[]>([]);
  const [featuredRoutesError, setFeaturedRoutesError] = useState('');
  const [activeTab, setActiveTab] = useState<HomeTab>('home');
  const [profile, setProfile] = useState<ProfileDetails | null>(null);
  const [profileError, setProfileError] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [reservations, setReservations] = useState<ReservationDetails[]>([]);
  const [reservationsLoading, setReservationsLoading] = useState(false);
  const [reservationsError, setReservationsError] = useState('');
  const [openReservationReference, setOpenReservationReference] = useState<string | null>(null);
  const [clearingReservations, setClearingReservations] = useState(false);
  const todayValue = getLocalDateInput();
  const calendarMinimumValue = todayValue;
  const calendarMinimumDate = getDateFromInput(calendarMinimumValue);
  const calendarDays = getCalendarDays(calendarMonth);
  const calendarMonthLabel = calendarMonth.toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });
  const canGoToPreviousMonth =
    calendarMonth.getFullYear() > calendarMinimumDate.getFullYear() ||
    (calendarMonth.getFullYear() === calendarMinimumDate.getFullYear() &&
      calendarMonth.getMonth() > calendarMinimumDate.getMonth());

  useEffect(() => {
    let active = true;

    async function loadHome() {
      try {
        const supabase = getSupabaseClient();
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw new Error(sessionError.message);
        if (!sessionData.session) {
          router.replace('/');
          return;
        }

        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError) throw new Error(userError.message);
        if (!userData.user) {
          router.replace('/');
          return;
        }

        const authUser = userData.user;
        setCurrentUserId(authUser.id);
        void fetchFeaturedRoutes()
          .then((routes) => {
            if (active) setFeaturedRoutes(routes);
          })
          .catch((error: unknown) => {
            if (active) {
              setFeaturedRoutesError(
                error instanceof Error
                  ? error.message
                  : 'Não foi possível carregar as rotas em destaque.',
              );
            }
          });
        const metadata = authUser.user_metadata;
        const authProfile: ProfileDetails = {
          firstName: getUserMetadataText(metadata, 'first_name'),
          lastName: getUserMetadataText(metadata, 'last_name'),
          email: authUser.email ?? '',
          createdAt: null,
          avatarUrl: getUserMetadataText(metadata, 'avatar_url', 'picture') || null,
        };
        setProfile(authProfile);

        const [profileResult, catalog] = await Promise.all([
          supabase
            .from('users')
            .select('first_name,last_name,email,created_at')
            .eq('id', authUser.id)
            .maybeSingle(),
          fetchFlightCatalog(),
        ]);
        if (!active) return;
        if (profileResult.error) {
          setProfileError(profileResult.error.message);
        } else if (profileResult.data) {
          setProfile({
            firstName: profileResult.data.first_name || authProfile.firstName,
            lastName: profileResult.data.last_name || authProfile.lastName,
            email: profileResult.data.email || authProfile.email,
            createdAt: profileResult.data.created_at,
            avatarUrl: authProfile.avatarUrl,
          });
        } else {
          setProfileError('Cadastro não encontrado na tabela de usuários.');
        }
        setAirports(catalog.airports);
        setAircraft(catalog.aircraft);
      } catch (error) {
        if (active) {
          setCatalogError(
            error instanceof Error ? error.message : 'Não foi possível carregar o catálogo.',
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadHome();
    return () => {
      active = false;
    };
  }, []);

  const compatibleAircraft = useMemo(
    () => getCompatibleAircraft(aircraft, origin, destination, passengerCount),
    [aircraft, origin, destination, passengerCount],
  );
  const availableFeaturedRoutes = useMemo(
    () => {
      const suggestions: {
        route: FeaturedRoute;
        routeOrigin: Airport;
        routeDestination: Airport;
      }[] = [];
      const seenRoutes = new Set<string>();

      function addRoute(route: FeaturedRoute, isSample: boolean) {
        if (suggestions.length >= 5) return;
        const key = `${route.originCode}:${route.destinationCode}`;
        if (seenRoutes.has(key)) return;

        const routeOrigin = airports.find((airport) => airport.code === route.originCode);
        const routeDestination = airports.find(
          (airport) => airport.code === route.destinationCode,
        );
        if (!routeOrigin || !routeDestination) return;

        seenRoutes.add(key);
        suggestions.push({
          route: { ...route, isSample },
          routeOrigin,
          routeDestination,
        });
      }

      featuredRoutes.forEach((route) => addRoute(route, false));
      sampleFeaturedRouteCodes.forEach(([originCode, destinationCode]) => {
        const routeOrigin = airports.find((airport) => airport.code === originCode);
        const routeDestination = airports.find((airport) => airport.code === destinationCode);
        if (routeOrigin && routeDestination) {
          addRoute(
            {
              originCode,
              originCity: routeOrigin.city,
              destinationCode,
              destinationCity: routeDestination.city,
            },
            true,
          );
        }
      });

      return suggestions;
    },
    [airports, featuredRoutes],
  );
  const sortedDepartureFlights = useMemo(() => {
    return [...flights].sort((first, second) => {
      if (flightSortMode === 'cheapest') {
        return (
          calculateFlightQuote(first, passengerCount).perPassenger -
          calculateFlightQuote(second, passengerCount).perPassenger
        );
      }
      if (flightSortMode === 'fastest') return first.duration - second.duration;
      return (
        new Date(first.departureTime).getTime() - new Date(second.departureTime).getTime()
      );
    });
  }, [flights, flightSortMode, passengerCount]);
  const detailFlight = detailFlightId
    ? flights.find((flight) => flight._id === detailFlightId) ?? null
    : null;
  const selectedAircraft = compatibleAircraft.find(
    (item) => item.modelo === selectedAircraftModel,
  );
  const maxPassengers = Math.max(1, ...aircraft.map((item) => item.assentos));

  const filteredAirports = useMemo(() => {
    const targetCode = airportPickerTarget === 'origin' ? destination?.code : origin?.code;
    const normalizedSearch = pickerSearch.trim().toLocaleLowerCase('pt-BR');

    return airports.filter((airport) => {
      if (airport.code === targetCode) return false;
      if (!normalizedSearch) return true;
      return [
        airport.code,
        airport.name,
        airport.city,
        airport.state,
        airport.porte,
      ].some((value) => value.toLocaleLowerCase('pt-BR').includes(normalizedSearch));
    });
  }, [airports, airportPickerTarget, destination?.code, origin?.code, pickerSearch]);

  async function reloadCatalog() {
    setLoading(true);
    setCatalogError('');
    try {
      const catalog = await fetchFlightCatalog();
      setAirports(catalog.airports);
      setAircraft(catalog.aircraft);
    } catch (error) {
      setCatalogError(
        error instanceof Error ? error.message : 'Não foi possível carregar o catálogo.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function searchFlights() {
    if (!origin || !destination) {
      setSearchError('Selecione os aeroportos de origem e destino.');
      return;
    }
    if (origin.code === destination.code) {
      setSearchError('Origem e destino precisam ser diferentes.');
      return;
    }
    setSearchError('');
    setSearching(true);
    setHasSearched(true);
    setFlights([]);
    setDetailFlightId(null);
    setSelectedDepartureFlightId(null);

    try {
      const departureWindow = getDateWindow(departureDate);
      const departureSearch = fetchFlightResults({
        originCode: origin.code,
        destinationCode: destination.code,
        departureStart: departureWindow.start,
        departureEnd: departureWindow.end,
        passengerCount,
        aircraftModel: selectedAircraft?.modelo ?? null,
      });
      const realResults = await departureSearch;
      setFlights(
        realResults.length > 0
          ? realResults
          : createSampleFlightResults({
              originCode: origin.code,
              originCity: origin.city,
              destinationCode: destination.code,
              destinationCity: destination.city,
              departureDate,
              passengerCount,
              aircraftModel: selectedAircraft?.modelo ?? null,
              aircraftSeats: selectedAircraft?.assentos ?? null,
            }),
      );
    } catch {
      setFlights(
        createSampleFlightResults({
          originCode: origin.code,
          originCity: origin.city,
          destinationCode: destination.code,
          destinationCity: destination.city,
          departureDate,
          passengerCount,
          aircraftModel: selectedAircraft?.modelo ?? null,
          aircraftSeats: selectedAircraft?.assentos ?? null,
        }),
      );
    } finally {
      setSearching(false);
    }
  }

  function openCalendar(target: Exclude<CalendarTarget, null>) {
    const minimumDate = todayValue;
    const selectedDate = departureDate;
    const dateToShow = selectedDate < minimumDate ? minimumDate : selectedDate;
    const date = getDateFromInput(dateToShow);

    setCalendarSelectedDate(dateToShow);
    setCalendarMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    setCalendarTarget(target);
  }

  function confirmCalendarDate() {
    if (calendarTarget === 'departure') setDepartureDate(calendarSelectedDate);
    setHasSearched(false);
    setCalendarTarget(null);
  }

  function swapAirports() {
    setOrigin(destination);
    setDestination(origin);
    setSelectedAircraftModel(null);
    setHasSearched(false);
    setFlights([]);
    setDetailFlightId(null);
    setSearchError('');
  }

  function chooseAirport(airport: Airport) {
    if (airportPickerTarget === 'origin') {
      setOrigin(airport);
    } else if (airportPickerTarget === 'destination') {
      setDestination(airport);
    }
    setSelectedAircraftModel(null);
    setHasSearched(false);
    setFlights([]);
    setDetailFlightId(null);
    setAirportPickerTarget(null);
    setPickerSearch('');
    setSearchError('');
  }

  function showTab(tab: HomeTab) {
    setActiveTab(tab);
    if (tab === 'reservations') {
      void loadReservations();
    }
  }

  async function loadReservations() {
    if (!currentUserId) {
      setReservationsError('Não foi possível identificar sua conta.');
      setReservationsLoading(false);
      return;
    }

    setReservationsLoading(true);
    setReservationsError('');
    try {
      const { data, error } = await getSupabaseClient()
        .from('reservations')
        .select(
          'id,flight_id,departure_date,passenger_count,total_price,currency,status,booking_reference',
        )
        .eq('user_id', currentUserId)
        .order('departure_date', { ascending: false });

      if (error) throw new Error(error.message);

      setReservations(
        (data ?? []).map((row) => ({
          id: row.id,
          flightId: row.flight_id,
          departureDate: row.departure_date,
          passengerCount: row.passenger_count,
          totalPrice: Number(row.total_price),
          currency: row.currency.trim(),
          status: row.status,
          bookingReference: row.booking_reference,
        })),
      );
    } catch (error) {
      setReservationsError(
        error instanceof Error ? error.message : 'Não foi possível carregar suas reservas.',
      );
    } finally {
      setReservationsLoading(false);
    }
  }

  async function saveReservation(
    flight: FlightResult,
    passengerCount: number,
    bookingCode: string,
  ) {
    if (!currentUserId) return;

    const totalPrice = calculateFlightQuote(flight, passengerCount).total;
    const reservation: ReservationDetails = {
      id: `demo-${flight._id}-${Date.now()}`,
      flightId: flight._id,
      departureDate: flight.departureTime,
      passengerCount,
      totalPrice,
      currency: 'BRL',
      status: 'confirmed',
      bookingReference: bookingCode,
    };

    setReservations((current) => [reservation, ...current]);

    try {
      const { error } = await getSupabaseClient()
        .from('reservations')
        .insert({
          user_id: currentUserId,
          flight_id: flight._id,
          departure_date: flight.departureTime,
          passenger_count: passengerCount,
          total_price: totalPrice,
          currency: 'BRL',
          status: 'confirmed',
          booking_reference: bookingCode,
        });

      if (error) throw new Error(error.message);
      await loadReservations();
    } catch (error) {
      setReservationsError(
        error instanceof Error
          ? error.message
          : 'Não foi possível salvar a reserva no servidor.',
      );
    }
  }

  function confirmClearReservations() {
    Alert.alert(
      'Limpar reservas',
      'Todas as suas reservas serão removidas. Deseja continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Limpar', style: 'destructive', onPress: () => void clearReservations() },
      ],
    );
  }

  async function clearReservations() {
    if (!currentUserId) {
      setReservationsError('Não foi possível identificar sua conta.');
      return;
    }

    setClearingReservations(true);
    setReservationsError('');
    try {
      const { error } = await getSupabaseClient()
        .from('reservations')
        .delete()
        .eq('user_id', currentUserId);
      if (error) throw new Error(error.message);
      setReservations([]);
      setOpenReservationReference(null);
    } catch (error) {
      setReservationsError(
        error instanceof Error
          ? error.message
          : 'Não foi possível limpar suas reservas.',
      );
    } finally {
      setClearingReservations(false);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    setSignOutError('');
    try {
      const { error } = await getSupabaseClient().auth.signOut();
      if (error) {
        setSignOutError(error.message);
        return;
      }
      router.replace('/');
    } catch (error) {
      setSignOutError(
        error instanceof Error ? error.message : 'Não foi possível encerrar sua sessão.',
      );
    } finally {
      setSigningOut(false);
    }
  }

  async function handleDeleteAccount() {
    setDeletingAccount(true);
    setDeleteAccountError('');
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.functions.invoke('delete-account');
      if (error) {
        setDeleteAccountError(error.message);
        return;
      }

      const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
      if (signOutError) {
        setDeleteAccountError(
          `A conta foi excluída, mas não foi possível limpar esta sessão: ${signOutError.message}`,
        );
        return;
      }

      router.replace('/');
    } catch (error) {
      setDeleteAccountError(
        error instanceof Error ? error.message : 'Não foi possível excluir sua conta.',
      );
    } finally {
      setDeletingAccount(false);
    }
  }

  return (
    <SafeAreaView
      style={[styles.safeRoot, activeTab !== 'home' && styles.innerPageSafeRoot]}
      edges={['top']}>
      <View style={[styles.screen, activeTab !== 'home' && styles.innerPageScreen]}>
        {activeTab === 'home' ? (
          <View style={styles.header}>
            <Image
              accessibilityLabel="Volares"
              contentFit="contain"
              source={BrandAssets.logo}
              style={styles.logo}
            />
            <Text style={styles.headerCaption}> Te leva ao céu</Text>
          </View>
        ) : null}

        <View style={[styles.panel, activeTab !== 'home' && styles.panelFullScreen]}>
          {loading ? (
            <View style={styles.centerState}>
              <ActivityIndicator color={colors.blue} size="large" />
              <Text style={styles.stateText}>Preparando sua busca...</Text>
            </View>
          ) : catalogError && activeTab === 'home' ? (
            <View style={styles.centerState}>
              <AppSymbol
                name={{ ios: 'exclamationmark.triangle', android: 'warning', web: 'warning' }}
                color={colors.error}
                size={30}
              />
              <Text style={styles.stateTitle}>Não foi possível carregar os dados</Text>
              <Text style={styles.stateText}>{catalogError}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => void reloadCatalog()}
                style={styles.retryButton}>
                <Text style={styles.searchButtonText}>Tentar novamente</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {activeTab === 'profile' ? (
                <ScrollView
                  contentContainerStyle={styles.scrollContent}
                  showsVerticalScrollIndicator={false}>
                  {profile ? (
                    <ProfileSection
                      onSignOut={() => void handleSignOut()}
                      profile={profile}
                      profileError={profileError}
                      signOutError={signOutError}
                      signingOut={signingOut}
                      deleteAccountError={deleteAccountError}
                      deletingAccount={deletingAccount}
                      onDeleteAccount={() => void handleDeleteAccount()}
                    />
                  ) : (
                    <View style={styles.centerState}>
                      <Text style={styles.stateText}>Carregando seu perfil...</Text>
                    </View>
                  )}
                </ScrollView>
              ) : activeTab === 'reservations' ? (
                <ScrollView
                  contentContainerStyle={styles.scrollContent}
                  showsVerticalScrollIndicator={false}>
                  <ReservationsSection
                    error={reservationsError}
                    loading={reservationsLoading}
                    onBrowseFlights={() => showTab('home')}
                    onRetry={() => void loadReservations()}
                    onClearReservations={confirmClearReservations}
                    clearingReservations={clearingReservations}
                    initialReservationReference={openReservationReference}
                    onInitialReservationOpened={() => setOpenReservationReference(null)}
                    reservations={reservations}
                  />
                </ScrollView>
              ) : (
              <ScrollView
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}>
                <View style={styles.content}>
                  {detailFlight ? (
                    <FlightDetails
                      flight={detailFlight}
                      passengerCount={passengerCount}
                      profile={profile}
                      onBack={() => setDetailFlightId(null)}
                      onCompleteReceipt={(bookingCode) => {
                        setDetailFlightId(null);
                        setOpenReservationReference(bookingCode);
                        setActiveTab('reservations');
                        void loadReservations();
                      }}
                      onPaymentSuccess={(_paymentMethod, bookingCode) =>
                        void saveReservation(detailFlight, passengerCount, bookingCode)
                      }
                    />
                  ) : !hasSearched ? (
                    <>
                  <Text style={styles.title}>Para onde vamos voar?</Text>
                  <Text style={styles.subtitle}>
                    Escolha sua rota e encontre o voo.
                  </Text>

                  <View style={styles.searchFormCard}>
                    <View style={styles.searchFormContent}>
                      <View style={styles.routeFields}>
                        <AirportField
                          label="Origem"
                          airport={origin}
                          placeholder="Cidade, aeroporto ou local"
                          onPress={() => setAirportPickerTarget('origin')}
                        />
                        <View style={styles.routeSwapRow}>
                          <View style={styles.routeSwapLine} />
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Inverter origem e destino"
                            onPress={swapAirports}
                            style={({ pressed }) => [
                              styles.routeSwapButton,
                              pressed && styles.pressed,
                            ]}>
                            <AppSymbol
                              name={{
                                ios: 'arrow.up.arrow.down',
                                android: 'swap_vert',
                                web: 'swap_vert',
                              }}
                              color={colors.blue}
                              size={19}
                            />
                          </Pressable>
                          <View style={styles.routeSwapLine} />
                        </View>
                        <AirportField
                          label="Destino"
                          airport={destination}
                          placeholder="Cidade, aeroporto ou local"
                          onPress={() => setAirportPickerTarget('destination')}
                        />
                      </View>

                      <View style={styles.detailsRow}>
                        <DateField
                          label="Partida"
                          onPress={() => openCalendar('departure')}
                          value={departureDate}
                        />
                      </View>

                      <View style={styles.passengerRow}>
                        <View style={styles.passengerLabelWrap}>
                          <AppSymbol
                            name={{ ios: 'person.2', android: 'group', web: 'group' }}
                            color={colors.blue}
                            size={19}
                          />
                          <Text style={styles.passengerCount}>
                            {passengerCount} {passengerCount === 1 ? 'passageiro' : 'passageiros'}
                          </Text>
                        </View>
                        <View style={styles.passengerControl}>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Diminuir passageiros"
                            disabled={passengerCount <= 1}
                            onPress={() => {
                              setPassengerCount((count) => Math.max(1, count - 1));
                              setSelectedAircraftModel(null);
                              setHasSearched(false);
                            }}
                            style={styles.counterButton}>
                            <Text style={styles.counterButtonText}>−</Text>
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Aumentar passageiros"
                            disabled={passengerCount >= maxPassengers}
                            onPress={() => {
                              setPassengerCount((count) => Math.min(maxPassengers, count + 1));
                              setSelectedAircraftModel(null);
                              setHasSearched(false);
                            }}
                            style={styles.counterButton}>
                            <Text style={styles.counterButtonText}>+</Text>
                          </Pressable>
                        </View>
                      </View>

                      <Text style={styles.sectionLabel}>Aeronave</Text>
                      <Pressable
                        accessibilityRole="button"
                        disabled={!origin || !destination || compatibleAircraft.length === 0}
                        onPress={() => {
                          setPickerSearch('');
                          setAircraftPickerOpen(true);
                        }}
                        style={({ pressed }) => [
                          styles.selector,
                          pressed && styles.pressed,
                          (!origin || !destination || compatibleAircraft.length === 0) &&
                            styles.selectorDisabled,
                        ]}>
                        <View style={styles.aircraftIconBadge}>
                          <PaperPlaneIcon size={28} />
                        </View>
                        <View style={styles.selectorTextWrap}>
                          <Text style={styles.selectorValue}>
                            {selectedAircraft?.modelo ?? 'Qualquer aeronave compatível'}
                          </Text>
                          <Text style={styles.selectorHint}>
                            {origin && destination
                              ? `${compatibleAircraft.length} opções · compatíveis com o porte ${origin.porte === 'Pequeno' || destination.porte === 'Pequeno' ? 'Pequeno' : origin.porte === 'Medio' || destination.porte === 'Medio' ? 'Medio' : 'Grande'}`
                              : 'Escolha origem e destino primeiro'}
                          </Text>
                        </View>
                        <AppSymbol
                          name={{ ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }}
                          color={colors.muted}
                          size={18}
                        />
                      </Pressable>

                      {selectedAircraft ? (
                        <View style={styles.aircraftSummary}>
                          <Text style={styles.aircraftSummaryText}>
                            {getAircraftTypeLabel(selectedAircraft.tipo)} ·{' '}
                            {selectedAircraft.assentos} assentos · porte mínimo{' '}
                            {selectedAircraft.porte_minimo}
                          </Text>
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => {
                              setSelectedAircraftModel(null);
                              setHasSearched(false);
                            }}>
                            <Text style={styles.clearText}>Remover</Text>
                          </Pressable>
                        </View>
                      ) : null}

                      {searchError ? <Text style={styles.errorText}>{searchError}</Text> : null}
                    </View>

                    <Pressable
                      accessibilityRole="button"
                      disabled={!origin || !destination || searching}
                      onPress={() => void searchFlights()}
                      style={({ pressed }) => [
                        styles.searchButton,
                        pressed && styles.pressed,
                        (!origin || !destination || searching) && styles.buttonDisabled,
                      ]}>
                      {searching ? (
                        <ActivityIndicator color={colors.white} />
                      ) : (
                        <Text style={styles.searchButtonText}>Buscar voos</Text>
                      )}
                    </Pressable>
                  </View>

                  <View style={styles.featuredRoutesSection}>
                    <View style={styles.featuredRoutesHeader}>
                      <Text style={styles.featuredRoutesTitle}>Rotas em destaque</Text>
                      <Text style={styles.featuredRoutesSubtitle}>
                        Sugestões de rota; voos sujeitos à disponibilidade
                      </Text>
                    </View>
                    {featuredRoutesError ? (
                      <Text style={styles.featuredRoutesError}>
                        Não foi possível atualizar as rotas: {featuredRoutesError}
                      </Text>
                    ) : null}
                    {availableFeaturedRoutes.length === 0 ? (
                      <Text style={styles.featuredRoutesEmpty}>
                        As sugestões de rota aparecerão quando os aeroportos estiverem carregados.
                      </Text>
                    ) : (
                      availableFeaturedRoutes.map(({ route, routeOrigin, routeDestination }) => (
                        <Pressable
                          key={`${route.originCode}-${route.destinationCode}`}
                          accessibilityRole="button"
                          onPress={() => {
                            setOrigin(routeOrigin);
                            setDestination(routeDestination);
                            setSelectedAircraftModel(null);
                            setHasSearched(false);
                            setFlights([]);
                            setSearchError('');
                          }}
                          style={({ pressed }) => [
                            styles.featuredRouteButton,
                            pressed && styles.pressed,
                          ]}>
                          <PaperPlaneIcon size={17} />
                          <View style={styles.featuredRouteCopy}>
                            <Text numberOfLines={1} style={styles.featuredRouteText}>
                              {routeOrigin.city} ({routeOrigin.code}) → {routeDestination.city} (
                              {routeDestination.code})
                            </Text>
                            {route.isSample ? (
                              <Text style={styles.sampleRouteNote}>Rota de demonstração</Text>
                            ) : null}
                          </View>
                          <AppSymbol
                            name={{
                              ios: 'chevron.right',
                              android: 'chevron_right',
                              web: 'chevron_right',
                            }}
                            color={colors.muted}
                            size={16}
                          />
                        </Pressable>
                      ))
                    )}
                  </View>

                  </>
                  ) : null}

                  {!detailFlight && hasSearched ? (
                    <>
                      <View style={styles.resultsTopBar}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Voltar à busca"
                          onPress={() => {
                            setHasSearched(false);
                            setSelectedDepartureFlightId(null);
                          }}
                          style={({ pressed }) => [
                            styles.resultsBackButton,
                            pressed && styles.pressed,
                          ]}>
                          <AppSymbol
                            name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
                            color={colors.navy}
                            size={21}
                          />
                        </Pressable>
                        <View style={styles.resultsRouteTitle}>
                          <Text numberOfLines={1} style={styles.resultsRouteText}>
                            {origin?.city ?? origin?.code ?? 'Origem'} →{' '}
                            {destination?.city ?? destination?.code ?? 'Destino'}
                          </Text>
                          <Text numberOfLines={1} style={styles.resultsRouteMeta}>
                            {formatDepartureDate(departureDate)} · {passengerCount}{' '}
                            {passengerCount === 1 ? 'passageiro' : 'passageiros'}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.sortTabs}>
                        {([
                          ['best', 'Melhor'],
                          ['cheapest', 'Mais barato'],
                          ['fastest', 'Mais rápido'],
                        ] as [FlightSortMode, string][]).map(([mode, label]) => (
                          <Pressable
                            key={mode}
                            accessibilityRole="button"
                            accessibilityState={{ selected: flightSortMode === mode }}
                            onPress={() => setFlightSortMode(mode)}
                            style={[
                              styles.sortTab,
                              flightSortMode === mode && styles.sortTabSelected,
                            ]}>
                            <Text
                              style={[
                                styles.sortTabText,
                                flightSortMode === mode && styles.sortTabTextSelected,
                              ]}>
                              {label}
                            </Text>
                          </Pressable>
                        ))}
                      </View>

                      <View style={styles.resultsHeader}>
                        <View>
                          <Text style={styles.resultsTitle}>Resultados da busca</Text>
                          <Text style={styles.resultsSubtitle}>
                            {`${flights.length} ${flights.length === 1 ? 'opção encontrada' : 'opções encontradas'}`}
                          </Text>
                        </View>
                        <View style={[styles.aircraftIconBadge, styles.resultsPlaneBadge]}>
                          <PaperPlaneIcon size={22} />
                        </View>
                      </View>

                      {searching ? (
                        <View style={styles.inlineState}>
                          <ActivityIndicator color={colors.blue} />
                          <Text style={styles.stateText}>Buscando voos...</Text>
                        </View>
                      ) : !searchError ? (
                        <>
                          <FlightResultsGroup
                            flights={sortedDepartureFlights}
                            date={departureDate}
                            onSelect={(flightId) => {
                              setSelectedDepartureFlightId(flightId);
                              setDetailFlightId(flightId);
                            }}
                            passengerCount={passengerCount}
                            selectedFlightId={selectedDepartureFlightId}
                            title="Partidas"
                          />
                        </>
                      ) : null}
                    </>
                  ) : null}
                </View>
              </ScrollView>
              )}

              {detailFlightId ? null : <SafeAreaView edges={['bottom']} style={styles.bottomSafeArea}>
                <View style={styles.bottomBar}>
                  <BottomTab
                    active={activeTab === 'home'}
                    label="Home"
                    icon={{ ios: 'house.fill', android: 'home', web: 'home' }}
                    onPress={() => showTab('home')}
                  />
                  <BottomTab
                    active={activeTab === 'reservations'}
                    label="Reservas"
                    icon={{
                      ios: 'ticket',
                      android: 'confirmation_number',
                      web: 'confirmation_number',
                    }}
                    onPress={() => showTab('reservations')}
                  />
                  <BottomTab
                    active={activeTab === 'profile'}
                    label="Perfil"
                    icon={{
                      ios: 'person.crop.circle',
                      android: 'account_circle',
                      web: 'account_circle',
                    }}
                    onPress={() => showTab('profile')}
                  />
                </View>
              </SafeAreaView>}
            </>
          )}
        </View>
      </View>

      <Modal
        animationType="slide"
        onRequestClose={() => setCalendarTarget(null)}
        transparent
        visible={calendarTarget !== null}>
        <View style={styles.modalBackdrop}>
          <View style={styles.calendarModalPanel}>
            <View style={styles.modalHeading}>
              <View>
                <Text style={styles.modalTitle}>Data de partida</Text>
                <Text style={styles.modalSubtitle}>Escolha quando quer viajar</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Fechar calendário"
                onPress={() => setCalendarTarget(null)}
                style={styles.closeButton}>
                <Text style={styles.closeButtonText}>×</Text>
              </Pressable>
            </View>

            <View style={styles.calendarMonthHeader}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Mês anterior"
                accessibilityState={{ disabled: !canGoToPreviousMonth }}
                disabled={!canGoToPreviousMonth}
                onPress={() =>
                  setCalendarMonth(
                    (month) => new Date(month.getFullYear(), month.getMonth() - 1, 1),
                  )
                }
                style={({ pressed }) => [
                  styles.calendarNavigationButton,
                  !canGoToPreviousMonth && styles.calendarNavigationButtonDisabled,
                  pressed && styles.pressed,
                ]}>
                <AppSymbol
                  name={{ ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' }}
                  color={canGoToPreviousMonth ? colors.navy : colors.muted}
                  size={18}
                />
              </Pressable>
              <Text style={styles.calendarMonthTitle}>{calendarMonthLabel}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Próximo mês"
                onPress={() =>
                  setCalendarMonth(
                    (month) => new Date(month.getFullYear(), month.getMonth() + 1, 1),
                  )
                }
                style={({ pressed }) => [
                  styles.calendarNavigationButton,
                  pressed && styles.pressed,
                ]}>
                <AppSymbol
                  name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
                  color={colors.navy}
                  size={18}
                />
              </Pressable>
            </View>

            <View style={styles.calendarGrid}>
              {['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'].map((weekday, index) => (
                <View key={`${weekday}-${index}`} style={styles.calendarCell}>
                  <Text style={styles.calendarWeekday}>{weekday}</Text>
                </View>
              ))}
              {calendarDays.map((date, index) => {
                if (!date) {
                  return <View key={`empty-${index}`} style={styles.calendarCell} />;
                }

                const dateValue = formatLocalDateInput(date);
                const isSelected = dateValue === calendarSelectedDate;
                const isToday = dateValue === todayValue;
                const isBeforeMinimum = dateValue < calendarMinimumValue;
                return (
                  <View key={dateValue} style={styles.calendarCell}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={formatDepartureDate(dateValue)}
                      accessibilityState={{ selected: isSelected, disabled: isBeforeMinimum }}
                      disabled={isBeforeMinimum}
                      onPress={() => setCalendarSelectedDate(dateValue)}
                      style={({ pressed }) => [
                        styles.calendarDay,
                        isToday && !isSelected && styles.calendarDayToday,
                        isSelected && styles.calendarDaySelected,
                        isBeforeMinimum && styles.calendarDayPast,
                        pressed && !isBeforeMinimum && styles.pressed,
                      ]}>
                      <Text
                        style={[
                          styles.calendarDayText,
                          isSelected && styles.calendarDayTextSelected,
                          isBeforeMinimum && styles.calendarDayTextPast,
                        ]}>
                        {date.getDate()}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>

            <View style={styles.calendarFooter}>
              <View style={styles.calendarSelection}>
                <Text style={styles.calendarSelectionLabel}>PARTIDA SELECIONADA</Text>
                <Text style={styles.calendarSelectionDate}>
                  {formatDepartureDate(calendarSelectedDate)}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={confirmCalendarDate}
                style={({ pressed }) => [
                  styles.calendarDoneButton,
                  pressed && styles.pressed,
                ]}>
                <Text style={styles.calendarDoneText}>Pronto</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        onRequestClose={() => setAirportPickerTarget(null)}
        transparent
        visible={airportPickerTarget !== null}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalPanel}>
            <View style={styles.modalHeading}>
              <View>
                <Text style={styles.modalTitle}>
                  {airportPickerTarget === 'origin' ? 'Aeroporto de origem' : 'Aeroporto de destino'}
                </Text>
                <Text style={styles.modalSubtitle}>Busque por código, nome ou cidade</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Fechar seleção"
                onPress={() => setAirportPickerTarget(null)}
                style={styles.closeButton}>
                <Text style={styles.closeButtonText}>×</Text>
              </Pressable>
            </View>
            <View style={styles.modalSearchShell}>
              <AppSymbol
                name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
                color={colors.muted}
                size={18}
              />
              <TextInput
                accessibilityLabel="Buscar aeroporto"
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setPickerSearch}
                placeholder="Ex.: SBMT, São Paulo"
                placeholderTextColor="#A0A5B5"
                style={styles.modalSearchInput}
                value={pickerSearch}
              />
            </View>
            <FlatList
              data={filteredAirports}
              keyExtractor={(item) => item.code}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <Text style={styles.modalEmptyText}>Nenhum aeroporto encontrado.</Text>
              }
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => chooseAirport(item)}
                  style={({ pressed }) => [styles.airportOption, pressed && styles.pressed]}>
                  <View style={styles.airportCodeBadge}>
                    <Text style={styles.airportCodeText}>{item.code}</Text>
                  </View>
                  <View style={styles.airportOptionCopy}>
                    <Text style={styles.airportOptionName}>{item.name}</Text>
                    <Text style={styles.airportOptionDetail}>
                      {item.city}, {item.state} · Porte {item.porte}
                    </Text>
                  </View>
                  <AppSymbol
                    name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
                    color={colors.muted}
                    size={16}
                  />
                </Pressable>
              )}
            />
          </View>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        onRequestClose={() => setAircraftPickerOpen(false)}
        transparent
        visible={aircraftPickerOpen}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalPanel}>
            <View style={styles.modalHeading}>
              <View>
                <Text style={styles.modalTitle}>Escolha uma aeronave</Text>
                <Text style={styles.modalSubtitle}>
                  Consideramos o aeroporto com porte mais restritivo.
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Fechar seleção"
                onPress={() => setAircraftPickerOpen(false)}
                style={styles.closeButton}>
                <Text style={styles.closeButtonText}>×</Text>
              </Pressable>
            </View>
            <View style={styles.modalSearchShell}>
              <AppSymbol
                name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
                color={colors.muted}
                size={18}
              />
              <TextInput
                accessibilityLabel="Buscar aeronave"
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setPickerSearch}
                placeholder="Buscar por modelo ou tipo"
                placeholderTextColor="#A0A5B5"
                style={styles.modalSearchInput}
                value={pickerSearch}
              />
            </View>
            <FlatList
              data={compatibleAircraft.filter((item) =>
                `${item.modelo} ${getAircraftTypeLabel(item.tipo)}`
                  .toLocaleLowerCase('pt-BR')
                  .includes(pickerSearch.trim().toLocaleLowerCase('pt-BR')),
              )}
              keyExtractor={(item) => item.modelo}
              keyboardShouldPersistTaps="handled"
              ListHeaderComponent={
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setSelectedAircraftModel(null);
                    setAircraftPickerOpen(false);
                    setHasSearched(false);
                  }}
                  style={styles.anyAircraftOption}>
                  <Text style={styles.anyAircraftTitle}>Qualquer aeronave compatível</Text>
                  <Text style={styles.airportOptionDetail}>
                    A busca mostrará todos os modelos disponíveis para a rota.
                  </Text>
                </Pressable>
              }
              ListEmptyComponent={
                <Text style={styles.modalEmptyText}>
                  Nenhuma aeronave disponível para essa quantidade de passageiros e rota.
                </Text>
              }
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setSelectedAircraftModel(item.modelo);
                    setAircraftPickerOpen(false);
                    setHasSearched(false);
                  }}
                  style={({ pressed }) => [styles.airportOption, pressed && styles.pressed]}>
                  <View style={styles.aircraftIconBadge}>
                    <PaperPlaneIcon size={24} />
                  </View>
                  <View style={styles.airportOptionCopy}>
                    <Text style={styles.airportOptionName}>{item.modelo}</Text>
                    <Text style={styles.airportOptionDetail}>
                      {getAircraftTypeLabel(item.tipo)} · {item.assentos} assentos · porte mínimo{' '}
                      {item.porte_minimo}
                    </Text>
                  </View>
                </Pressable>
              )}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function FlightDetails({
  flight,
  passengerCount,
  profile,
  onBack,
  onCompleteReceipt,
  onPaymentSuccess,
}: {
  flight: FlightResult;
  passengerCount: number;
  profile: ProfileDetails | null;
  onBack: () => void;
  onCompleteReceipt: (bookingCode: string) => void;
  onPaymentSuccess: (paymentMethod: 'credit' | 'debit' | 'pix' | 'miles', bookingCode: string) => void;
}) {
  type PaymentMethod = 'credit' | 'debit' | 'pix' | 'miles';
  const [paymentSheetOpen, setPaymentSheetOpen] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | null>(null);
  const [paymentRequested, setPaymentRequested] = useState(false);
  const [paymentStage, setPaymentStage] = useState<'method' | 'processing' | 'success'>('method');
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptMethod, setReceiptMethod] = useState<PaymentMethod>('credit');
  const [receiptCode, setReceiptCode] = useState('');
  const [milesBalance, setMilesBalance] = useState(1637);
  const [passengerPhotoFailed, setPassengerPhotoFailed] = useState(false);
  const passengerName =
    `${profile?.firstName ?? ''} ${profile?.lastName ?? ''}`.trim() || 'Passageiro Volares';
  const passengerPhotoSource =
    profile?.avatarUrl && !passengerPhotoFailed
      ? { uri: profile.avatarUrl }
      : BrandAssets.profilePlaceholder;
  const quote = calculateFlightQuote(flight, passengerCount);
  const taxes = quote.taxes;
  const total = quote.total;

  return (
    <>
    <View style={styles.flightDetailsContent}>
      <View style={styles.detailsHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Voltar aos resultados"
          onPress={onBack}
          style={({ pressed }) => [styles.detailsBackButton, pressed && styles.pressed]}>
          <AppSymbol
            name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
            color={colors.navy}
            size={21}
          />
        </Pressable>
        <Text style={styles.detailsTitle}>Detalhes do voo</Text>
        <View style={styles.detailsHeaderSpacer} />
      </View>

      <View style={styles.detailsHeroCard}>
        <View style={styles.detailsHeroTop}>
          <View style={styles.detailsPilotRow}>
            <View style={styles.detailsPilotAvatarFrame}>
              {flight.pilotPhotoUrl ? (
                <Image
                  accessibilityLabel={flight.pilotName ? `Piloto ${flight.pilotName}` : 'Piloto Volares'}
                  contentFit="cover"
                  source={{ uri: flight.pilotPhotoUrl }}
                  style={styles.detailsPilotAvatar}
                />
              ) : (
                <Image
                  accessibilityLabel="Piloto Volares"
                  contentFit="cover"
                  source={BrandAssets.pilotPlaceholder}
                  style={styles.detailsPilotAvatar}
                />
              )}
            </View>
            <View>
              <Text numberOfLines={1} style={styles.detailsPilotName}>
                {flight.pilotName ?? 'Piloto Volares'}
              </Text>
              <Text numberOfLines={1} style={styles.detailsAirlineName}>
                {flight.airlineName ?? 'Volares'}
              </Text>
            </View>
          </View>

          <View style={styles.detailsPassengerRow}>
            <View style={styles.detailsPassengerAvatarFrame}>
              <Image
                accessibilityLabel={`Passageiro ${passengerName}`}
                contentFit="cover"
                onError={() => setPassengerPhotoFailed(true)}
                source={passengerPhotoSource}
                style={styles.detailsPassengerAvatar}
              />
            </View>
            <View style={styles.detailsPassengerCopy}>
              <Text numberOfLines={1} style={styles.detailsPassengerName}>
                {passengerName}
              </Text>
              <Text style={styles.detailsPassengerLabel}>Passageiro</Text>
            </View>
          </View>
        </View>

        <View style={styles.detailsRouteRow}>
          <View style={styles.detailsEndpoint}>
            <Text style={styles.detailsAirportCode}>{flight.originCode ?? '—'}</Text>
            <Text numberOfLines={1} style={styles.detailsCity}>{flight.originCity ?? 'Origem'}</Text>
            <Text style={styles.detailsTime}>{formatTime(flight.departureTime)}</Text>
          </View>
          <View style={styles.detailsHeroDuration}>
            <Text style={styles.detailsDurationText}>{formatDuration(flight.duration)}</Text>
            <View style={styles.detailsDurationLine}>
              <View style={styles.detailsDurationDot} />
              <View style={styles.detailsDurationDash} />
              <View style={styles.detailsHeroPlane}>
                <PaperPlaneIcon size={17} />
              </View>
              <View style={styles.detailsDurationDash} />
              <View style={styles.detailsDurationDot} />
            </View>
          </View>
          <View style={[styles.detailsEndpoint, styles.detailsEndpointEnd]}>
            <Text style={styles.detailsAirportCode}>{flight.destinationCode ?? '—'}</Text>
            <Text numberOfLines={1} style={styles.detailsCity}>{flight.destinationCity ?? 'Destino'}</Text>
            <Text style={styles.detailsTime}>{formatTime(flight.arrivalTime)}</Text>
          </View>
        </View>

        <View style={styles.detailsDateChip}>
          <AppSymbol
            name={{ ios: 'calendar', android: 'calendar_month', web: 'calendar_month' }}
            color={colors.white}
            size={16}
          />
          <Text style={styles.detailsDateText}>
            {new Date(flight.departureTime).toLocaleDateString('pt-BR', {
              weekday: 'short',
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}
          </Text>
        </View>
      </View>

      <Text style={styles.detailsSectionTitle}>Detalhes da viagem</Text>
      <View style={styles.detailsTimelineCard}>
        <View style={styles.detailsTimelineItem}>
          <View style={styles.detailsTimelineDot} />
          <View style={styles.detailsTimelineCopy}>
            <Text style={styles.detailsTimelineTime}>{formatTime(flight.departureTime)}</Text>
            <Text style={styles.detailsTimelineCity}>{flight.originCity ?? 'Origem'}</Text>
            <Text style={styles.detailsTimelineHint}>Partida privada</Text>
          </View>
        </View>
        <View style={styles.detailsTimelineAircraft}>
          <View style={styles.detailsTimelineIcon}>
            <PaperPlaneIcon size={18} />
          </View>
          <View>
            <Text style={styles.detailsTimelineDuration}>
              {formatDuration(flight.duration)} · Direto
            </Text>
            <Text style={styles.detailsTimelineHint}>
              {flight.aircraftModel ?? 'Aeronave'}
            </Text>
          </View>
        </View>
        <View style={styles.detailsTimelineItem}>
          <View style={[styles.detailsTimelineDot, styles.detailsTimelineDotArrival]} />
          <View style={styles.detailsTimelineCopy}>
            <Text style={styles.detailsTimelineTime}>{formatTime(flight.arrivalTime)}</Text>
            <Text style={styles.detailsTimelineCity}>{flight.destinationCity ?? 'Destino'}</Text>
            <Text style={styles.detailsTimelineHint}>Chegada privada</Text>
          </View>
        </View>
      </View>

      <Text style={styles.detailsSectionTitle}>Informações do voo</Text>
      <View style={styles.detailsInfoCard}>
        <View style={styles.detailsInfoRow}>
          <AppSymbol
            name={{ ios: 'person.2', android: 'groups', web: 'groups' }}
            color={colors.blue}
            size={20}
          />
          <Text style={styles.detailsInfoLabel}>Passageiros</Text>
          <Text style={styles.detailsInfoValue}>{passengerCount}</Text>
        </View>
        <View style={styles.detailsInfoDivider} />
        <View style={styles.detailsInfoRow}>
          <AppSymbol
            name={{ ios: 'airplane', android: 'flight', web: 'flight' }}
            color={colors.blue}
            size={20}
          />
          <Text style={styles.detailsInfoLabel}>Aeronave</Text>
          <Text numberOfLines={1} style={styles.detailsInfoValue}>{flight.aircraftModel ?? 'Aeronave'}</Text>
        </View>
      </View>

      <View style={styles.detailsPriceCard}>
        <Text style={styles.detailsPriceTitle}>Resumo do valor</Text>
        <View style={styles.detailsPriceRow}>
          <Text style={styles.detailsPriceLabel}>Aeronave completa</Text>
          <Text style={styles.detailsPriceValue}>{formatPrice(quote.charterBase * 0.82)}</Text>
        </View>
        <View style={styles.detailsPriceRow}>
          <Text style={styles.detailsPriceLabel}>Divisão base por passageiro</Text>
          <Text style={styles.detailsPriceValue}>{formatPrice(quote.basePerPassenger)}</Text>
        </View>
        {quote.discount > 0 ? (
          <View style={styles.detailsPriceRow}>
            <Text style={styles.detailsPriceLabel}>
              Desconto por compartilhar · {Math.round(quote.sharingDiscountRate * 100)}%
            </Text>
            <Text style={styles.detailsSavingsValue}>− {formatPrice(quote.discount)}</Text>
          </View>
        ) : null}
        <View style={styles.detailsPriceRow}>
          <Text style={styles.detailsPriceLabel}>Valor por passageiro</Text>
          <Text style={styles.detailsPriceValue}>{formatPrice(quote.perPassenger)}</Text>
        </View>
        <View style={styles.detailsPriceRow}>
          <Text style={styles.detailsPriceLabel}>Taxas e tarifas (8%)</Text>
          <Text style={styles.detailsPriceValue}>{formatPrice(taxes)}</Text>
        </View>
        <View style={styles.detailsPriceDivider} />
        <View style={styles.detailsPriceRow}>
          <Text style={styles.detailsPriceTotalLabel}>Total</Text>
          <Text style={styles.detailsPriceTotal}>{formatPrice(total)}</Text>
        </View>
      </View>

      <View style={styles.detailsPayBar}>
        <View>
          <Text style={styles.detailsPayLabel}>Valor total</Text>
          <Text style={styles.detailsPayValue}>{formatPrice(total)}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setSelectedPaymentMethod(null);
            setPaymentStage('method');
            setPaymentRequested(false);
            setPaymentSheetOpen(true);
          }}
          style={({ pressed }) => [styles.detailsPayButton, pressed && styles.pressed]}>
          <Text style={styles.detailsPayButtonText}>
            {paymentRequested ? 'Voo solicitado' : 'Voar agora'}
          </Text>
          <AppSymbol
            name={{ ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' }}
            color={colors.white}
            size={18}
          />
        </Pressable>
      </View>
    </View>
    <Modal
      animationType="slide"
      onRequestClose={() => setPaymentSheetOpen(false)}
      transparent
      visible={paymentSheetOpen}>
      <View style={styles.modalBackdrop}>
        <View style={styles.paymentSheet}>
          <View style={styles.paymentHandle} />
          {paymentStage === 'method' ? (
            <>
              <View style={styles.paymentSheetHeader}>
                <View>
                  <Text style={styles.paymentSheetTitle}>Forma de pagamento</Text>
                  <Text style={styles.paymentSheetSubtitle}>
                    Escolha como você quer pagar
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Fechar pagamento"
                  onPress={() => setPaymentSheetOpen(false)}
                  style={styles.closeButton}>
                  <Text style={styles.closeButtonText}>×</Text>
                </Pressable>
              </View>

              <View style={styles.paymentTotalCard}>
                <Text style={styles.paymentTotalLabel}>Total do voo</Text>
                <Text style={styles.paymentTotalValue}>{formatPrice(total)}</Text>
              </View>

              {([
                ['credit', 'Cartão de crédito', 'Parcelamento disponível', 'creditcard'],
                ['debit', 'Cartão de débito', 'Débito à vista', 'creditcard'],
                ['pix', 'Pix', 'Pagamento instantâneo', 'qrcode'],
                ['miles', 'Milhas Volares', `${formatPrice(milesBalance)} disponíveis`, 'loyalty'],
              ] as const).map(([method, title, subtitle, icon]) => {
                const insufficientMiles =
                  method === 'miles' && milesBalance < total;
                return (
                  <Pressable
                    key={method}
                    accessibilityRole="button"
                    accessibilityState={{
                      selected: selectedPaymentMethod === method,
                      disabled: insufficientMiles,
                    }}
                    disabled={insufficientMiles}
                    onPress={() => setSelectedPaymentMethod(method)}
                    style={({ pressed }) => [
                      styles.paymentMethod,
                      selectedPaymentMethod === method && styles.paymentMethodSelected,
                      insufficientMiles && styles.paymentMethodDisabled,
                      pressed && styles.pressed,
                    ]}>
                    <View style={styles.paymentMethodIcon}>
                      <AppSymbol
                        name={{
                          ios: method === 'miles' ? 'star.circle' : icon,
                          android: method === 'miles' ? 'loyalty' : icon === 'qrcode' ? 'qr_code_2' : 'credit_card',
                          web: method === 'miles' ? 'loyalty' : icon === 'qrcode' ? 'qr_code_2' : 'credit_card',
                        }}
                        color={selectedPaymentMethod === method ? colors.white : colors.blue}
                        size={21}
                      />
                    </View>
                    <View style={styles.paymentMethodCopy}>
                      <Text style={styles.paymentMethodTitle}>{title}</Text>
                      <Text style={styles.paymentMethodSubtitle}>
                        {insufficientMiles ? 'Saldo insuficiente para este voo' : subtitle}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.paymentRadio,
                        selectedPaymentMethod === method && styles.paymentRadioSelected,
                      ]}>
                      {selectedPaymentMethod === method ? (
                        <View style={styles.paymentRadioInner} />
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}

              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: selectedPaymentMethod === null }}
                disabled={selectedPaymentMethod === null}
                onPress={() => {
                  if (!selectedPaymentMethod) return;
                  setPaymentStage('processing');
                  setTimeout(() => {
                    if (selectedPaymentMethod === 'miles') {
                      setMilesBalance((balance) => Math.max(0, balance - total));
                    }
                    setPaymentRequested(true);
                    setReceiptMethod(selectedPaymentMethod);
                    const bookingCode = `VLR${String(Date.now()).slice(-7)}${selectedPaymentMethod === 'miles' ? 'M' : 'P'}`;
                    setReceiptCode(bookingCode);
                    onPaymentSuccess(selectedPaymentMethod, bookingCode);
                    setPaymentStage('success');
                    setPaymentSheetOpen(false);
                    setReceiptOpen(true);
                  }, 900);
                }}
                style={({ pressed }) => [
                  styles.paymentContinueButton,
                  selectedPaymentMethod === null && styles.paymentContinueDisabled,
                  pressed && styles.pressed,
                ]}>
                <Text style={styles.paymentContinueText}>Continuar</Text>
                <AppSymbol
                  name={{ ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' }}
                  color={colors.white}
                  size={18}
                />
              </Pressable>
            </>
          ) : paymentStage === 'processing' ? (
            <View style={styles.paymentProcessing}>
              <ActivityIndicator color={colors.blue} size="large" />
              <Text style={styles.paymentProcessingTitle}>Processando pagamento...</Text>
              <Text style={styles.paymentProcessingSubtitle}>
                Não feche esta tela
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
    <Modal
      animationType="slide"
      onRequestClose={() => setReceiptOpen(false)}
      transparent
      visible={receiptOpen}>
      <View style={styles.receiptBackdrop}>
        <View style={styles.receiptSheet}>
          <View style={styles.receiptHandle} />
          <View style={styles.receiptHeader}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fechar comprovante"
              onPress={() => setReceiptOpen(false)}
              style={styles.detailsBackButton}>
              <AppSymbol
                name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
                color={colors.navy}
                size={21}
              />
            </Pressable>
            <Text style={styles.receiptTitle}>Comprovante de voo</Text>
            <View style={styles.detailsHeaderSpacer} />
          </View>

          <View style={styles.receiptStatusIcon}>
            <AppSymbol
              name={{ ios: 'checkmark', android: 'check', web: 'check' }}
              color={colors.white}
              size={30}
            />
          </View>
          <Text style={styles.receiptStatusTitle}>Pagamento aprovado</Text>
          <Text style={styles.receiptStatusSubtitle}>Sua reserva foi confirmada</Text>

          <View style={styles.receiptHeroCard}>
            <View style={styles.receiptPeopleRow}>
              <View style={styles.receiptPilotRow}>
                <View style={styles.detailsPilotAvatarFrame}>
                  {flight.pilotPhotoUrl ? (
                    <Image
                      accessibilityLabel={flight.pilotName ? `Piloto ${flight.pilotName}` : 'Piloto Volares'}
                      contentFit="cover"
                      source={{ uri: flight.pilotPhotoUrl }}
                      style={styles.detailsPilotAvatar}
                    />
                  ) : (
                    <Image
                      accessibilityLabel="Piloto Volares"
                      contentFit="cover"
                      source={BrandAssets.pilotPlaceholder}
                      style={styles.detailsPilotAvatar}
                    />
                  )}
                </View>
                <View>
                  <Text style={styles.receiptPersonName}>
                    {flight.pilotName ?? 'Piloto Volares'}
                  </Text>
                  <Text style={styles.receiptPersonRole}>Piloto</Text>
                </View>
              </View>
              <View style={styles.receiptPassengerRow}>
                <View style={styles.detailsPassengerAvatarFrame}>
                  <Image
                    accessibilityLabel={`Passageiro ${passengerName}`}
                    contentFit="cover"
                    source={passengerPhotoSource}
                    style={styles.detailsPassengerAvatar}
                  />
                </View>
                <View>
                  <Text numberOfLines={1} style={styles.receiptPersonName}>
                    {passengerName}
                  </Text>
                  <Text style={styles.receiptPersonRole}>Passageiro</Text>
                </View>
              </View>
            </View>

            <View style={styles.receiptRouteRow}>
              <View>
                <Text style={styles.receiptAirportCode}>{flight.originCode ?? '—'}</Text>
                <Text numberOfLines={1} style={styles.receiptCity}>{flight.originCity ?? 'Origem'}</Text>
                <Text style={styles.receiptTime}>{formatTime(flight.departureTime)}</Text>
              </View>
              <View style={styles.receiptDuration}>
                <Text style={styles.receiptDurationText}>{formatDuration(flight.duration)}</Text>
                <View style={styles.receiptDurationLine}>
                  <View style={styles.receiptDurationDot} />
                  <View style={styles.receiptDurationDash} />
                  <View style={styles.receiptDurationPlane}>
                    <PaperPlaneIcon size={15} />
                  </View>
                  <View style={styles.receiptDurationDash} />
                  <View style={styles.receiptDurationDot} />
                </View>
              </View>
              <View style={styles.receiptEndpointRight}>
                <Text style={styles.receiptAirportCode}>{flight.destinationCode ?? '—'}</Text>
                <Text numberOfLines={1} style={styles.receiptCity}>{flight.destinationCity ?? 'Destino'}</Text>
                <Text style={styles.receiptTime}>{formatTime(flight.arrivalTime)}</Text>
              </View>
            </View>
          </View>

          <View style={styles.receiptInfoCard}>
            <View style={styles.receiptInfoRow}>
              <Text style={styles.receiptInfoLabel}>Forma de pagamento</Text>
              <Text style={styles.receiptInfoValue}>
                {receiptMethod === 'credit'
                  ? 'Cartão de crédito'
                  : receiptMethod === 'debit'
                    ? 'Cartão de débito'
                    : receiptMethod === 'pix'
                      ? 'Pix'
                      : 'Milhas Volares'}
              </Text>
            </View>
            <View style={styles.receiptInfoDivider} />
            <View style={styles.receiptInfoRow}>
              <Text style={styles.receiptInfoLabel}>Localizador</Text>
              <Text style={styles.receiptInfoValue}>{receiptCode}</Text>
            </View>
            <View style={styles.receiptInfoDivider} />
            <View style={styles.receiptInfoRow}>
              <Text style={styles.receiptInfoLabel}>Aeronave</Text>
              <Text numberOfLines={1} style={styles.receiptInfoValue}>
                {flight.aircraftModel ?? 'Aeronave'}
              </Text>
            </View>
            <View style={styles.receiptInfoDivider} />
            <View style={styles.receiptInfoRow}>
              <Text style={styles.receiptInfoLabel}>Passageiros</Text>
              <Text style={styles.receiptInfoValue}>{passengerCount}</Text>
            </View>
            <View style={styles.receiptInfoDivider} />
            <View style={styles.receiptInfoRow}>
              <Text style={styles.receiptInfoLabel}>Total pago</Text>
              <Text style={styles.receiptTotalValue}>{formatPrice(total)}</Text>
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setReceiptOpen(false);
              onCompleteReceipt(receiptCode);
            }}
            style={({ pressed }) => [
              styles.receiptDoneButton,
              pressed && styles.pressed,
            ]}>
            <Text style={styles.receiptDoneText}>Concluir</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
    </>
  );
}

function AirportField({
  label,
  airport,
  placeholder,
  onPress,
}: {
  label: string;
  airport: Airport | null;
  placeholder: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.routeField}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.airportPickerButton, pressed && styles.pressed]}>
        <View style={styles.selectorTextWrap}>
          {airport ? (
            <>
              <Text numberOfLines={1} style={styles.airportValue}>
                {airport.code} · {airport.name}
              </Text>
              <Text numberOfLines={1} style={styles.selectorHint}>
                {airport.city}, {airport.state} · {airport.porte}
              </Text>
            </>
          ) : (
            <Text style={styles.placeholderText}>{placeholder}</Text>
          )}
        </View>
      </Pressable>
    </View>
  );
}

function DateField({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.detailColumn}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Selecionar data de ${label.toLocaleLowerCase('pt-BR')}, ${formatDepartureDate(value)}`}
        onPress={onPress}
        style={({ pressed }) => [styles.datePickerButton, pressed && styles.pressed]}>
        <View style={styles.datePickerCopy}>
          <Text numberOfLines={1} style={styles.datePickerValue}>
            {formatDepartureDate(value)}
          </Text>
          <Text numberOfLines={1} style={styles.datePickerHint}>
            {formatWeekday(value)}
          </Text>
        </View>
        <AppSymbol
          name={{ ios: 'calendar', android: 'calendar_month', web: 'calendar_month' }}
          color={colors.blue}
          size={20}
        />
      </Pressable>
    </View>
  );
}

function FlightResultsGroup({
  flights,
  date,
  title,
  selectedFlightId,
  onSelect,
  passengerCount,
}: {
  flights: FlightResult[];
  date: string;
  title: string;
  selectedFlightId: string | null;
  onSelect: (flightId: string) => void;
  passengerCount: number;
}) {
  return (
    <View style={styles.resultsLegSection}>
      <View style={styles.resultsLegHeader}>
        <Text style={styles.resultsLegTitle}>{title}</Text>
        <Text style={styles.resultsLegDate}>{formatDepartureDate(date)}</Text>
      </View>
      {flights.length > 0 ? (
        flights.map((flight) => (
          <FlightCard
            key={flight._id}
            flight={flight}
            onSelect={() => onSelect(flight._id)}
            selected={selectedFlightId === flight._id}
            passengerCount={passengerCount}
          />
        ))
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Nenhum voo encontrado</Text>
          <Text style={styles.stateText}>Tente outra data ou remova o filtro de aeronave.</Text>
        </View>
      )}
    </View>
  );
}

function FlightCard({
  flight,
  onSelect,
  selected,
  passengerCount,
}: {
  flight: FlightResult;
  onSelect: () => void;
  selected: boolean;
  passengerCount: number;
}) {
  const pilotPhotoSource = flight.pilotPhotoUrl
    ? { uri: flight.pilotPhotoUrl }
    : BrandAssets.pilotPlaceholder;
  const quote = calculateFlightQuote(flight, passengerCount);

  return (
    <View style={[styles.flightCard, selected && styles.flightCardSelected]}>
      <View style={styles.flightCardTop}>
        <View style={styles.flightCarrier}>
          <View style={styles.pilotAvatarFrame}>
            <Image
              accessibilityLabel={flight.pilotName ? `Piloto ${flight.pilotName}` : 'Piloto Volares'}
              contentFit="cover"
              source={pilotPhotoSource}
              style={styles.pilotAvatar}
            />
          </View>
          <View style={styles.flightCarrierCopy}>
            <Text numberOfLines={1} style={styles.carrierName}>
              {flight.pilotName?.trim() ? `Piloto ${flight.pilotName}` : 'Piloto Volares'}
            </Text>
            <Text numberOfLines={1} style={styles.flightAircraftDetail}>
              {flight.aircraftModel ?? 'Aeronave'} · {flight.availableSeats} assentos disponíveis
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.flightRoute}>
        <View style={styles.flightEndpoint}>
          <Text style={styles.flightTime}>{formatTime(flight.departureTime)}</Text>
          <Text style={styles.flightAirportCode}>{flight.originCode ?? '—'}</Text>
          <Text numberOfLines={1} style={styles.flightCity}>
            {flight.originCity ?? 'Origem'}
          </Text>
        </View>
        <View style={styles.flightDuration}>
          <Text style={styles.flightDurationText}>{formatDuration(flight.duration)}</Text>
          <View style={styles.durationLine}>
            <View style={styles.durationDot} />
            <View style={styles.durationDash} />
            <View style={styles.durationPlaneBadge}>
                <PaperPlaneIcon size={14} />
            </View>
            <View style={styles.durationDash} />
            <View style={styles.durationDot} />
          </View>
        </View>
        <View style={[styles.flightEndpoint, styles.destinationTime]}>
          <Text style={styles.flightTime}>{formatTime(flight.arrivalTime)}</Text>
          <Text style={styles.flightAirportCode}>{flight.destinationCode ?? '—'}</Text>
          <Text numberOfLines={1} style={styles.flightCity}>
            {flight.destinationCity ?? 'Destino'}
          </Text>
        </View>
      </View>

      <View style={styles.flightDivider} />
      <View style={styles.flightBottom}>
        <View style={styles.flightPriceBlock}>
          <Text style={styles.flightPriceLabel}>
            {passengerCount > 1 ? 'Por passageiro, em média' : 'Valor por passageiro'}
          </Text>
          <Text style={styles.flightPrice}>{formatPrice(quote.perPassenger)}</Text>
          {quote.discount > 0 ? (
            <Text style={styles.flightSavingsText}>
              Economia compartilhada: {formatPrice(quote.discount)}
            </Text>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected }}
          onPress={onSelect}
          style={({ pressed }) => [
            styles.selectFlightButton,
            selected && styles.selectFlightButtonSelected,
            pressed && styles.pressed,
          ]}>
          <Text
            style={[
              styles.selectFlightButtonText,
              selected && styles.selectFlightButtonTextSelected,
            ]}>
            Voar
          </Text>
          <AppSymbol
            name={
              selected
                ? { ios: 'checkmark', android: 'check', web: 'check' }
                : { ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' }
            }
            color={selected ? colors.blue : colors.white}
            size={16}
          />
        </Pressable>
      </View>
    </View>
  );
}

function BottomTab({
  active,
  label,
  icon,
  onPress,
}: {
  active: boolean;
  label: string;
  icon: SymbolViewProps['name'];
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.bottomTab, pressed && styles.pressed]}>
      <AppSymbol name={icon} color={active ? colors.blue : colors.muted} size={21} />
      <Text style={[styles.bottomTabLabel, active && styles.bottomTabLabelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeRoot: {
    flex: 1,
    backgroundColor: colors.background,
  },
  innerPageSafeRoot: {
    backgroundColor: colors.white,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  innerPageScreen: {
    backgroundColor: colors.white,
  },
  header: {
    minHeight: 118,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.blue,
    paddingHorizontal: 24,
    paddingTop: 6,
    paddingBottom: 20,
  },
  logo: {
    width: 156,
    height: 52,
  },
  headerCaption: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
    opacity: 0.95,
  },
  panel: {
    flex: 1,
    backgroundColor: colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  panelFullScreen: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  scrollContent: {
    paddingBottom: 28,
  },
  content: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  eyebrow: {
    color: colors.pink,
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
  sectionLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 14,
    marginBottom: 4,
  },
  searchFormCard: {
    borderWidth: 3,
    borderColor: colors.blue,
    borderRadius: 32,
    backgroundColor: colors.panel,
    marginTop: 18,
    overflow: 'hidden',
  },
  searchFormContent: {
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 14,
  },
  routeFields: {
    flexDirection: 'column',
  },
  routeField: {
    minWidth: 0,
    paddingVertical: 8,
  },
  fieldLabel: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 2,
  },
  airportPickerButton: {
    minHeight: 48,
    justifyContent: 'center',
    paddingVertical: 2,
  },
  selector: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  selectorTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  selectorValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  airportValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '500',
  },
  selectorHint: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 2,
  },
  placeholderText: {
    flex: 1,
    color: colors.muted,
    fontSize: 18,
  },
  selectorDisabled: {
    backgroundColor: colors.surface,
    opacity: 0.8,
  },
  routeSwapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 2,
  },
  routeSwapLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  routeSwapButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.blue,
    borderRadius: 20,
    backgroundColor: '#F1FAFD',
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    marginTop: 12,
    paddingVertical: 6,
  },
  passengerRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  passengerLabelWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  detailColumn: {
    flex: 1,
    minWidth: 0,
  },
  detailDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginHorizontal: 12,
    marginVertical: 4,
  },
  datePickerButton: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  datePickerCopy: {
    flex: 1,
    minWidth: 0,
  },
  datePickerValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  datePickerHint: {
    color: colors.muted,
    fontSize: 10,
    marginTop: 2,
  },
  passengerControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  counterButton: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: colors.surface,
  },
  counterButtonText: {
    color: colors.navy,
    fontSize: 20,
    fontWeight: '700',
  },
  passengerCount: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  aircraftSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 8,
  },
  aircraftSummaryText: {
    flex: 1,
    color: colors.muted,
    fontSize: 11,
  },
  clearText: {
    color: colors.blue,
    fontSize: 12,
    fontWeight: '700',
  },
  searchButton: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.blue,
    paddingHorizontal: 20,
  },
  searchButtonText: {
    color: colors.white,
    fontSize: 20,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 1,
  },
  pressed: {
    opacity: 0.78,
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 12,
  },
  featuredRoutesSection: {
    marginTop: 24,
  },
  featuredRoutesHeader: {
    marginBottom: 10,
  },
  featuredRoutesTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  featuredRoutesSubtitle: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 3,
  },
  featuredRoutesError: {
    color: colors.error,
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 8,
  },
  featuredRoutesEmpty: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  featuredRouteButton: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.white,
    marginBottom: 9,
    paddingHorizontal: 13,
  },
  featuredRouteCopy: {
    flex: 1,
    minWidth: 0,
  },
  featuredRouteText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  sampleRouteNote: {
    color: colors.muted,
    fontSize: 9,
    marginTop: 2,
  },
  resultsTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 4,
    marginBottom: 14,
  },
  resultsBackButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  resultsRouteTitle: {
    flex: 1,
    minWidth: 0,
  },
  resultsRouteText: {
    color: colors.navy,
    fontSize: 17,
    fontWeight: '800',
  },
  resultsRouteMeta: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 3,
  },
  sortTabs: {
    flexDirection: 'row',
    gap: 7,
    marginBottom: 12,
  },
  sortTab: {
    flex: 1,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.white,
  },
  sortTabSelected: {
    borderColor: colors.blue,
    backgroundColor: '#EAF6FC',
  },
  sortTabText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  sortTabTextSelected: {
    color: colors.blue,
  },
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 28,
    marginBottom: 12,
  },
  resultsTitle: {
    color: colors.navy,
    fontSize: 19,
    fontWeight: '800',
  },
  resultsSubtitle: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 3,
  },
  resultsLegSection: {
    marginBottom: 8,
  },
  resultsLegHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 9,
  },
  resultsLegTitle: {
    color: colors.navy,
    fontSize: 15,
    fontWeight: '800',
  },
  resultsLegDate: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  flightCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    backgroundColor: colors.white,
    marginBottom: 12,
    padding: 16,
  },
  flightCardSelected: {
    borderColor: colors.blue,
    backgroundColor: '#F7FBFF',
  },
  flightCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  flightCarrier: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pilotAvatarFrame: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.blue,
    borderRadius: 21,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  pilotAvatar: {
    width: '100%',
    height: '100%',
  },
  carrierName: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  flightCarrierCopy: {
    flex: 1,
    minWidth: 0,
  },
  flightRoute: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  flightEndpoint: {
    minWidth: 62,
  },
  flightTime: {
    color: colors.navy,
    fontSize: 20,
    fontWeight: '800',
  },
  flightAirportCode: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },
  flightCity: {
    maxWidth: 100,
    color: colors.muted,
    fontSize: 10,
    marginTop: 2,
  },
  destinationTime: {
    alignItems: 'flex-end',
  },
  flightDuration: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  flightDurationText: {
    color: colors.muted,
    fontSize: 10,
    marginBottom: 5,
  },
  durationLine: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  durationDot: {
    width: 5,
    height: 5,
    borderWidth: 1,
    borderColor: colors.blue,
    borderRadius: 4,
  },
  durationDash: {
    flex: 1,
    height: 1,
    backgroundColor: '#C8D7EA',
  },
  flightDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 14,
  },
  flightBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  flightAircraftDetail: {
    color: colors.muted,
    fontSize: 10,
    marginTop: 3,
  },
  flightPriceBlock: {
    alignItems: 'flex-start',
  },
  flightPrice: {
    color: colors.blue,
    fontSize: 20,
    fontWeight: '800',
  },
  flightPriceLabel: {
    color: colors.muted,
    fontSize: 10,
    marginBottom: 2,
  },
  flightSavingsText: {
    color: '#287A4B',
    fontSize: 9,
    fontWeight: '700',
    marginTop: 2,
  },
  selectFlightButton: {
    minHeight: 44,
    minWidth: 116,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.blue,
    borderRadius: 12,
    backgroundColor: colors.blue,
    paddingHorizontal: 12,
  },
  selectFlightButtonSelected: {
    backgroundColor: '#EAF6FC',
  },
  selectFlightButtonText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '800',
  },
  selectFlightButtonTextSelected: {
    color: colors.blue,
  },
  flightDetailsContent: {
    width: '100%',
  },
  detailsHeader: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  detailsBackButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailsHeaderSpacer: {
    width: 40,
  },
  detailsTitle: {
    color: colors.navy,
    fontSize: 18,
    fontWeight: '800',
  },
  detailsHeroCard: {
    borderRadius: 24,
    backgroundColor: colors.blue,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 18,
  },
  detailsHeroTop: {
    alignItems: 'flex-end',
  },
  detailsPilotRow: {
    position: 'absolute',
    left: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailsPilotAvatarFrame: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    borderColor: colors.white,
    overflow: 'hidden',
  },
  detailsPilotAvatar: {
    width: '100%',
    height: '100%',
  },
  detailsPilotName: {
    maxWidth: 120,
    color: colors.white,
    fontSize: 11,
    fontWeight: '800',
  },
  detailsAirlineName: {
    color: '#DCEEFF',
    fontSize: 9,
    marginTop: 2,
  },
  detailsPassengerRow: {
    width: 150,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailsPassengerAvatarFrame: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    borderColor: colors.white,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  detailsPassengerAvatar: {
    width: '100%',
    height: '100%',
  },
  detailsPassengerCopy: {
    flex: 1,
  },
  detailsPassengerName: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '800',
  },
  detailsPassengerLabel: {
    color: '#DCEEFF',
    fontSize: 9,
    marginTop: 2,
  },
  detailsRouteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 24,
  },
  detailsEndpoint: {
    minWidth: 68,
  },
  detailsEndpointEnd: {
    alignItems: 'flex-end',
  },
  detailsAirportCode: {
    color: colors.white,
    fontSize: 30,
    fontWeight: '900',
  },
  detailsCity: {
    maxWidth: 80,
    color: '#EAF4FF',
    fontSize: 11,
    marginTop: 2,
  },
  detailsTime: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '800',
    marginTop: 5,
  },
  detailsHeroDuration: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  detailsDurationText: {
    color: '#EAF4FF',
    fontSize: 10,
    marginBottom: 6,
  },
  detailsDurationLine: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailsDurationDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.white,
  },
  detailsDurationDash: {
    flex: 1,
    height: 1,
    backgroundColor: '#A9CEFA',
  },
  detailsHeroPlane: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailsDateChip: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.14)',
    marginTop: 18,
    paddingHorizontal: 12,
  },
  detailsDateText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  detailsSectionTitle: {
    color: colors.navy,
    fontSize: 16,
    fontWeight: '800',
    marginTop: 22,
    marginBottom: 8,
  },
  detailsTimelineCard: {
    borderRadius: 16,
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  detailsTimelineItem: {
    flexDirection: 'row',
    gap: 12,
  },
  detailsTimelineDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.blue,
    marginTop: 5,
  },
  detailsTimelineDotArrival: {
    backgroundColor: '#35C2A1',
  },
  detailsTimelineCopy: {
    flex: 1,
  },
  detailsTimelineTime: {
    color: colors.navy,
    fontSize: 17,
    fontWeight: '800',
  },
  detailsTimelineCity: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  detailsTimelineHint: {
    color: colors.muted,
    fontSize: 10,
    marginTop: 3,
  },
  detailsTimelineAircraft: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
    marginLeft: 4,
    paddingLeft: 16,
  },
  detailsTimelineIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailsTimelineDuration: {
    color: colors.blue,
    fontSize: 12,
    fontWeight: '800',
  },
  detailsInfoCard: {
    borderRadius: 16,
    backgroundColor: colors.white,
    paddingHorizontal: 16,
  },
  detailsInfoRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  detailsInfoLabel: {
    flex: 1,
    color: colors.muted,
    fontSize: 12,
  },
  detailsInfoValue: {
    maxWidth: 180,
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  detailsInfoDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  detailsPriceCard: {
    borderRadius: 16,
    backgroundColor: colors.white,
    marginTop: 16,
    padding: 16,
  },
  detailsPriceTitle: {
    color: colors.navy,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 12,
  },
  detailsPriceRow: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  detailsPriceLabel: {
    color: colors.muted,
    fontSize: 11,
  },
  detailsPriceValue: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  detailsSavingsValue: {
    color: '#287A4B',
    fontSize: 12,
    fontWeight: '800',
  },
  detailsPriceDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: 8,
  },
  detailsPriceTotalLabel: {
    color: colors.navy,
    fontSize: 14,
    fontWeight: '800',
  },
  detailsPriceTotal: {
    color: colors.blue,
    fontSize: 19,
    fontWeight: '900',
  },
  detailsPayBar: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 16,
  },
  detailsPayLabel: {
    color: colors.muted,
    fontSize: 10,
  },
  detailsPayValue: {
    color: colors.navy,
    fontSize: 20,
    fontWeight: '900',
  },
  detailsPayButton: {
    minHeight: 52,
    minWidth: 150,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    backgroundColor: colors.blue,
    paddingHorizontal: 14,
  },
  detailsPayButtonText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '800',
  },
  paymentSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 18,
  },
  paymentHandle: {
    width: 42,
    height: 4,
    alignSelf: 'center',
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 12,
  },
  paymentSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  paymentSheetTitle: {
    color: colors.navy,
    fontSize: 18,
    fontWeight: '800',
  },
  paymentSheetSubtitle: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 3,
  },
  paymentTotalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    backgroundColor: '#EFF6FF',
    marginTop: 16,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  paymentTotalLabel: {
    color: colors.muted,
    fontSize: 12,
  },
  paymentTotalValue: {
    color: colors.navy,
    fontSize: 18,
    fontWeight: '900',
  },
  paymentMethodDisabled: {
    opacity: 0.55,
  },
  paymentMethod: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    marginTop: 8,
    paddingHorizontal: 12,
  },
  paymentMethodSelected: {
    borderColor: colors.blue,
    backgroundColor: '#F7FBFF',
  },
  paymentMethodIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
  },
  paymentMethodCopy: {
    flex: 1,
  },
  paymentMethodTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  paymentMethodSubtitle: {
    color: colors.muted,
    fontSize: 10,
    marginTop: 3,
  },
  paymentRadio: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 10,
  },
  paymentRadioSelected: {
    borderColor: colors.blue,
  },
  paymentRadioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.blue,
  },
  paymentContinueButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    backgroundColor: colors.blue,
    marginTop: 14,
  },
  paymentContinueDisabled: {
    opacity: 0.45,
  },
  paymentContinueText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '800',
  },
  paymentProcessing: {
    minHeight: 300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentProcessingTitle: {
    color: colors.navy,
    fontSize: 17,
    fontWeight: '800',
    marginTop: 16,
  },
  paymentProcessingSubtitle: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 6,
  },
  paymentSuccess: {
    minHeight: 300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentSuccessIcon: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 32,
    backgroundColor: '#35C2A1',
  },
  paymentSuccessTitle: {
    color: colors.navy,
    fontSize: 20,
    fontWeight: '900',
    marginTop: 14,
  },
  paymentSuccessSubtitle: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 6,
  },
  paymentMilesRemaining: {
    color: colors.blue,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 10,
  },
  receiptBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(20, 29, 52, 0.45)',
  },
  receiptSheet: {
    maxHeight: '94%',
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 18,
  },
  receiptHandle: {
    width: 42,
    height: 4,
    alignSelf: 'center',
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 6,
  },
  receiptHeader: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  receiptTitle: {
    color: colors.navy,
    fontSize: 17,
    fontWeight: '800',
  },
  receiptStatusIcon: {
    width: 58,
    height: 58,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 29,
    backgroundColor: '#35C2A1',
  },
  receiptStatusTitle: {
    color: colors.navy,
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 10,
  },
  receiptStatusSubtitle: {
    color: colors.muted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
  receiptHeroCard: {
    borderRadius: 20,
    backgroundColor: colors.blue,
    marginTop: 14,
    padding: 16,
  },
  receiptPeopleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  receiptPilotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  receiptPassengerRow: {
    maxWidth: 150,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  receiptPersonName: {
    maxWidth: 92,
    color: colors.white,
    fontSize: 10,
    fontWeight: '800',
  },
  receiptPersonRole: {
    color: '#DCEEFF',
    fontSize: 9,
    marginTop: 2,
  },
  receiptRouteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
  },
  receiptEndpointRight: {
    alignItems: 'flex-end',
  },
  receiptAirportCode: {
    color: colors.white,
    fontSize: 27,
    fontWeight: '900',
  },
  receiptCity: {
    maxWidth: 82,
    color: '#EAF4FF',
    fontSize: 10,
    marginTop: 2,
  },
  receiptTime: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '800',
    marginTop: 4,
  },
  receiptDuration: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  receiptDurationText: {
    color: '#EAF4FF',
    fontSize: 9,
    marginBottom: 5,
  },
  receiptDurationLine: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
  },
  receiptDurationDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.white,
  },
  receiptDurationDash: {
    flex: 1,
    height: 1,
    backgroundColor: '#A9CEFA',
  },
  receiptDurationPlane: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiptInfoCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    marginTop: 12,
    paddingHorizontal: 14,
  },
  receiptInfoRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  receiptInfoLabel: {
    color: colors.muted,
    fontSize: 11,
  },
  receiptInfoValue: {
    maxWidth: 180,
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  receiptInfoDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  receiptTotalValue: {
    color: colors.blue,
    fontSize: 15,
    fontWeight: '900',
  },
  receiptDoneButton: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: colors.blue,
    marginTop: 12,
  },
  receiptDoneText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '800',
  },
  emptyState: {
    alignItems: 'center',
    borderRadius: 14,
    backgroundColor: colors.surface,
    marginTop: 4,
    padding: 20,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 5,
  },
  inlineState: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 22,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 28,
  },
  stateTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  stateText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  retryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: colors.blue,
    marginTop: 4,
    paddingHorizontal: 16,
  },
  bottomSafeArea: {
    backgroundColor: colors.white,
  },
  bottomBar: {
    minHeight: 58,
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 7,
  },
  bottomTab: {
    minWidth: 82,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  bottomTabLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '600',
  },
  bottomTabLabelActive: {
    color: colors.blue,
    fontWeight: '800',
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(20, 29, 52, 0.4)',
  },
  modalPanel: {
    maxHeight: '88%',
    minHeight: '55%',
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 12,
  },
  calendarModalPanel: {
    maxHeight: '88%',
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 16,
  },
  calendarMonthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 6,
  },
  calendarNavigationButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  calendarNavigationButtonDisabled: {
    opacity: 0.45,
  },
  calendarMonthTitle: {
    color: colors.navy,
    fontSize: 17,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 5,
  },
  calendarCell: {
    width: '14.2857%',
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarWeekday: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: '800',
  },
  calendarDay: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
  },
  calendarDayToday: {
    borderWidth: 1,
    borderColor: colors.blue,
  },
  calendarDaySelected: {
    backgroundColor: colors.blue,
  },
  calendarDayPast: {
    opacity: 0.38,
  },
  calendarDayText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  calendarDayTextSelected: {
    color: colors.white,
    fontWeight: '800',
  },
  calendarDayTextPast: {
    color: colors.muted,
  },
  calendarFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    marginTop: 12,
    paddingTop: 12,
  },
  calendarSelection: {
    flex: 1,
  },
  calendarSelectionLabel: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  calendarSelectionDate: {
    color: colors.navy,
    fontSize: 14,
    fontWeight: '800',
    marginTop: 3,
    textTransform: 'capitalize',
  },
  calendarDoneButton: {
    minHeight: 42,
    minWidth: 82,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: colors.blue,
    paddingHorizontal: 14,
  },
  calendarDoneText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '800',
  },
  modalHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 14,
  },
  modalTitle: {
    color: colors.navy,
    fontSize: 18,
    fontWeight: '800',
  },
  modalSubtitle: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 3,
  },
  closeButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    backgroundColor: colors.surface,
  },
  closeButtonText: {
    color: colors.text,
    fontSize: 25,
    lineHeight: 28,
  },
  modalSearchShell: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    marginBottom: 10,
    paddingHorizontal: 12,
  },
  modalSearchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
    paddingVertical: 10,
  },
  modalEmptyText: {
    color: colors.muted,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 24,
  },
  airportOption: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    paddingVertical: 9,
  },
  airportCodeBadge: {
    minWidth: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  airportCodeText: {
    color: colors.navy,
    fontSize: 11,
    fontWeight: '800',
  },
  airportOptionCopy: {
    flex: 1,
    minWidth: 0,
  },
  airportOptionName: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  airportOptionDetail: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },
  aircraftIconBadge: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: colors.blue,
  },
  resultsPlaneBadge: {
    marginLeft: 8,
  },
  durationPlaneBadge: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    backgroundColor: colors.blue,
  },
  anyAircraftOption: {
    borderRadius: 12,
    backgroundColor: colors.surface,
    marginBottom: 8,
    padding: 12,
  },
  anyAircraftTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
});
