import { Image } from 'expo-image';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
type TripType = 'roundTrip' | 'oneWay';
type CalendarTarget = 'departure' | 'return' | null;
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

function getFlightStatusLabel(status: string) {
  const labels: Record<string, string> = {
    scheduled: 'Agendado',
    confirming: 'Em confirmação',
    confirmed: 'Confirmado',
    in_flight: 'Em voo',
    completed: 'Concluído',
    cancelled: 'Cancelado',
  };
  return labels[status] ?? status;
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
  const [returnDate, setReturnDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return formatLocalDateInput(tomorrow);
  });
  const [tripType, setTripType] = useState<TripType>('roundTrip');
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
  const [returnFlights, setReturnFlights] = useState<FlightResult[]>([]);
  const [selectedDepartureFlightId, setSelectedDepartureFlightId] = useState<string | null>(null);
  const [selectedReturnFlightId, setSelectedReturnFlightId] = useState<string | null>(null);
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
  const todayValue = getLocalDateInput();
  const calendarMinimumValue = calendarTarget === 'return' ? departureDate : todayValue;
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
    if (tripType === 'roundTrip' && returnDate < departureDate) {
      setSearchError('A data de volta precisa ser igual ou posterior à partida.');
      return;
    }

    setSearchError('');
    setSearching(true);
    setHasSearched(true);
    setFlights([]);
    setReturnFlights([]);
    setSelectedDepartureFlightId(null);
    setSelectedReturnFlightId(null);

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
      const returnWindow = tripType === 'roundTrip' ? getDateWindow(returnDate) : null;
      const returnSearch = returnWindow
        ? fetchFlightResults({
            originCode: destination.code,
            destinationCode: origin.code,
            departureStart: returnWindow.start,
            departureEnd: returnWindow.end,
            passengerCount,
            aircraftModel: selectedAircraft?.modelo ?? null,
          })
        : Promise.resolve<FlightResult[]>([]);
      const [departureResults, returnResults] = await Promise.all([
        departureSearch,
        returnSearch,
      ]);
      setFlights(departureResults);
      setReturnFlights(returnResults);
    } catch (error) {
      setSearchError(
        error instanceof Error ? error.message : 'Não foi possível buscar os voos.',
      );
    } finally {
      setSearching(false);
    }
  }

  function openCalendar(target: Exclude<CalendarTarget, null>) {
    const minimumDate = target === 'return' ? departureDate : todayValue;
    const selectedDate = target === 'return' ? returnDate : departureDate;
    const dateToShow = selectedDate < minimumDate ? minimumDate : selectedDate;
    const date = getDateFromInput(dateToShow);

    setCalendarSelectedDate(dateToShow);
    setCalendarMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    setCalendarTarget(target);
  }

  function confirmCalendarDate() {
    if (calendarTarget === 'departure') {
      setDepartureDate(calendarSelectedDate);
      if (returnDate < calendarSelectedDate) setReturnDate(calendarSelectedDate);
    } else if (calendarTarget === 'return') {
      setReturnDate(calendarSelectedDate);
    }

    setHasSearched(false);
    setCalendarTarget(null);
  }

  function swapAirports() {
    setOrigin(destination);
    setDestination(origin);
    setSelectedAircraftModel(null);
    setHasSearched(false);
    setFlights([]);
    setReturnFlights([]);
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
    setReturnFlights([]);
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
                    reservations={reservations}
                  />
                </ScrollView>
              ) : (
              <ScrollView
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}>
                <View style={styles.content}>
                  <Text style={styles.title}>Para onde vamos voar?</Text>
                  <Text style={styles.subtitle}>
                    Escolha sua rota e encontre o voo.
                  </Text>

                  <View style={styles.searchFormCard}>
                    <View style={styles.searchFormContent}>
                      <View style={styles.tripTypeToggle}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityState={{ selected: tripType === 'roundTrip' }}
                          onPress={() => {
                            setTripType('roundTrip');
                            setHasSearched(false);
                            setSearchError('');
                          }}
                          style={[
                            styles.tripTypeOption,
                            tripType === 'roundTrip' && styles.tripTypeOptionSelected,
                          ]}>
                          <Text
                            style={[
                              styles.tripTypeText,
                              tripType === 'roundTrip' && styles.tripTypeTextSelected,
                            ]}>
                            Ida e volta
                          </Text>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityState={{ selected: tripType === 'oneWay' }}
                          onPress={() => {
                            setTripType('oneWay');
                            setHasSearched(false);
                            setSearchError('');
                          }}
                          style={[
                            styles.tripTypeOption,
                            tripType === 'oneWay' && styles.tripTypeOptionSelected,
                          ]}>
                          <Text
                            style={[
                              styles.tripTypeText,
                              tripType === 'oneWay' && styles.tripTypeTextSelected,
                            ]}>
                            Somente ida
                          </Text>
                        </Pressable>
                      </View>

                      <View style={styles.routeFields}>
                        <AirportField
                          label="De"
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
                          label="Para"
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
                        {tripType === 'roundTrip' ? (
                          <>
                            <View style={styles.detailDivider} />
                            <DateField
                              label="Volta"
                              onPress={() => openCalendar('return')}
                              value={returnDate}
                            />
                          </>
                        ) : null}
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
                            setReturnFlights([]);
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

                  {hasSearched ? (
                    <>
                      <View style={styles.resultsHeader}>
                        <View>
                          <Text style={styles.resultsTitle}>Resultados da busca</Text>
                          <Text style={styles.resultsSubtitle}>
                            {tripType === 'roundTrip'
                              ? `${flights.length} ida · ${returnFlights.length} volta`
                              : `${flights.length} ${flights.length === 1 ? 'opção encontrada' : 'opções encontradas'}`}
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
                            flights={flights}
                            date={departureDate}
                            onSelect={setSelectedDepartureFlightId}
                            selectedFlightId={selectedDepartureFlightId}
                            title={tripType === 'roundTrip' ? 'Ida' : 'Voos de ida'}
                          />
                          {tripType === 'roundTrip' ? (
                            <FlightResultsGroup
                              flights={returnFlights}
                              date={returnDate}
                              onSelect={setSelectedReturnFlightId}
                              selectedFlightId={selectedReturnFlightId}
                              title="Volta"
                            />
                          ) : null}
                        </>
                      ) : null}
                    </>
                  ) : null}
                </View>
              </ScrollView>
              )}

              <SafeAreaView edges={['bottom']} style={styles.bottomSafeArea}>
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
              </SafeAreaView>
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
                <Text style={styles.modalTitle}>
                  {calendarTarget === 'return' ? 'Data de volta' : 'Data de partida'}
                </Text>
                <Text style={styles.modalSubtitle}>
                  {calendarTarget === 'return'
                    ? 'A volta deve ser na data da partida ou depois'
                    : 'Escolha quando quer viajar'}
                </Text>
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
                <Text style={styles.calendarSelectionLabel}>
                  {calendarTarget === 'return' ? 'VOLTA SELECIONADA' : 'PARTIDA SELECIONADA'}
                </Text>
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
}: {
  flights: FlightResult[];
  date: string;
  title: string;
  selectedFlightId: string | null;
  onSelect: (flightId: string) => void;
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
}: {
  flight: FlightResult;
  onSelect: () => void;
  selected: boolean;
}) {
  return (
    <View style={[styles.flightCard, selected && styles.flightCardSelected]}>
      <View style={styles.flightCardTop}>
        <View style={styles.flightCarrier}>
          <View style={styles.carrierIcon}>
            <PaperPlaneIcon size={14} />
          </View>
          <View style={styles.flightCarrierCopy}>
            <Text numberOfLines={1} style={styles.carrierName}>
              {flight.airlineName ?? 'Voo particular'}
            </Text>
            <Text numberOfLines={1} style={styles.flightAircraftDetail}>
              {flight.aircraftModel ?? 'Aeronave'} · {flight.availableSeats} assentos disponíveis
            </Text>
          </View>
        </View>
        <View style={styles.statusBadge}>
          <Text style={styles.statusText}>{getFlightStatusLabel(flight.status)}</Text>
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
              <PaperPlaneIcon size={11} />
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
          <Text style={styles.flightPriceLabel}>A partir de</Text>
          <Text style={styles.flightPrice}>{formatPrice(flight.price)}</Text>
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
            {selected ? 'Selecionado' : 'Selecionar'}
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
  tripTypeToggle: {
    flexDirection: 'row',
    gap: 8,
    borderRadius: 14,
    backgroundColor: colors.surface,
    padding: 4,
    marginBottom: 12,
  },
  tripTypeOption: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    paddingHorizontal: 8,
  },
  tripTypeOptionSelected: {
    borderWidth: 1,
    borderColor: colors.blue,
    backgroundColor: '#EAF6FC',
  },
  tripTypeText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  tripTypeTextSelected: {
    color: colors.blue,
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
  carrierIcon: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.blue,
    borderRadius: 10,
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
  statusBadge: {
    borderRadius: 12,
    backgroundColor: '#EEF8F3',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  statusText: {
    color: '#287A4B',
    fontSize: 10,
    fontWeight: '700',
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
    width: 22,
    height: 22,
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
