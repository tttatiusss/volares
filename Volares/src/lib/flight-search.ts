import { getSanityClient } from '@/lib/sanity';
import { getSupabaseClient } from '@/lib/supabase';

export type AirportSize = 'Pequeno' | 'Medio' | 'Grande';

export type Airport = {
  code: string;
  name: string;
  city: string;
  state: string;
  porte: AirportSize;
};

export type Aircraft = {
  modelo: string;
  tipo: 'helicopter' | 'piston' | 'turboprop' | 'jet';
  assentos: number;
  porte_minimo: AirportSize;
};

export type FlightResult = {
  _id: string;
  airlineName: string | null;
  pilotName: string | null;
  pilotPhotoUrl: string | null;
  departureTime: string;
  arrivalTime: string;
  duration: number;
  price: number;
  currency: string;
  totalSeats: number;
  availableSeats: number;
  status: string;
  aircraftModel: string | null;
  aircraftType: Aircraft['tipo'] | null;
  aircraftSeats: number | null;
  originCode: string | null;
  originCity: string | null;
  destinationCode: string | null;
  destinationCity: string | null;
};

export type FeaturedRoute = {
  originCode: string;
  originCity: string;
  destinationCode: string;
  destinationCity: string;
  isSample?: boolean;
};

export function calculateFlightQuote(flight: FlightResult, passengerCount: number) {
  const passengers = Math.max(1, passengerCount);
  const charterBase = flight.price;
  const seatCapacity = Math.max(passengers, 1, flight.aircraftSeats ?? flight.totalSeats);
  const promotionalCharterBase = charterBase * 0.82;
  const basePerPassenger = promotionalCharterBase / seatCapacity;
  const sharingDiscountRate =
    passengers >= 8 ? 0.25 : passengers >= 6 ? 0.20 : passengers >= 4 ? 0.15 : passengers >= 2 ? 0.10 : 0;
  const sharingDiscount = basePerPassenger * sharingDiscountRate;
  const netPerPassenger = basePerPassenger - sharingDiscount;
  const subtotal = netPerPassenger * passengers;
  const taxes = subtotal * 0.08;
  const total = subtotal + taxes;
  const discount = sharingDiscount * passengers;

  return {
    charterBase,
    basePerPassenger,
    netPerPassenger,
    discount,
    seatCapacity,
    sharingDiscountRate,
    subtotal,
    taxes,
    total,
    perPassenger: total / passengers,
  };
}

export function createSampleFlightResults({
  originCode,
  originCity,
  destinationCode,
  destinationCity,
  departureDate,
  passengerCount,
  aircraftModel,
  aircraftSeats,
}: {
  originCode: string;
  originCity: string;
  destinationCode: string;
  destinationCity: string;
  departureDate: string;
  passengerCount: number;
  aircraftModel: string | null;
  aircraftSeats: number | null;
}) {
  const [year, month, day] = departureDate.split('-').map(Number);
  const schedules = [
    { hour: 6, minute: 15, duration: 55, price: 4800 },
    { hour: 8, minute: 40, duration: 65, price: 5250 },
    { hour: 10, minute: 20, duration: 50, price: 6100 },
    { hour: 12, minute: 30, duration: 70, price: 5750 },
    { hour: 15, minute: 10, duration: 60, price: 6900 },
    { hour: 17, minute: 45, duration: 55, price: 7200 },
    { hour: 20, minute: 5, duration: 75, price: 6500 },
  ];
  const seats = Math.max(aircraftSeats ?? 6, passengerCount);
  const model = aircraftModel ?? 'Embraer Phenom 300';

  return schedules.map((schedule, index) => {
    const departure = new Date(year, month - 1, day, schedule.hour, schedule.minute);
    const arrival = new Date(departure.getTime() + schedule.duration * 60_000);
    return {
      _id: `sample-${originCode}-${destinationCode}-${departureDate}-${index}`,
      airlineName: 'Volares',
      pilotName: null,
      pilotPhotoUrl: null,
      departureTime: departure.toISOString(),
      arrivalTime: arrival.toISOString(),
      duration: schedule.duration,
      price: schedule.price,
      currency: 'BRL',
      totalSeats: seats,
      availableSeats: seats,
      status: 'scheduled',
      aircraftModel: model,
      aircraftType: 'jet',
      aircraftSeats: seats,
      originCode,
      originCity,
      destinationCode,
      destinationCity,
    } satisfies FlightResult;
  });
}

const sizeRank: Record<AirportSize, number> = {
  Pequeno: 0,
  Medio: 1,
  Grande: 2,
};

const iataByIcao: Record<string, string> = {
  SBSP: 'CGH',
  SBRJ: 'SDU',
  SBGL: 'GIG',
  SBKP: 'VCP',
  SBJD: 'JDQ',
  SBMT: 'JHS',
};

const icaoByIata = Object.fromEntries(
  Object.entries(iataByIcao).map(([icao, iata]) => [iata, icao]),
) as Record<string, string>;

function getRouteCode(code: string) {
  return iataByIcao[code] ?? code;
}

export async function fetchFlightCatalog() {
  const supabase = getSupabaseClient();
  const [airportResult, aircraftResult] = await Promise.all([
    supabase
      .from('airports')
      .select('code,name,city,state,porte')
      .eq('private_operations', true)
      .order('city'),
    supabase.from('aircraft').select('modelo,tipo,assentos,porte_minimo').order('modelo'),
  ]);

  if (airportResult.error) {
    throw new Error(`Não foi possível carregar os aeroportos: ${airportResult.error.message}`);
  }
  if (aircraftResult.error) {
    throw new Error(`Não foi possível carregar as aeronaves: ${aircraftResult.error.message}`);
  }

  return {
    airports: (airportResult.data ?? []) as Airport[],
    aircraft: (aircraftResult.data ?? []) as Aircraft[],
  };
}

export function getCompatibleAircraft(
  aircraft: Aircraft[],
  origin: Airport | null,
  destination: Airport | null,
  passengerCount: number,
) {
  if (!origin || !destination) return [];

  const mostRestrictiveAirportRank = Math.min(sizeRank[origin.porte], sizeRank[destination.porte]);
  return aircraft.filter(
    (item) =>
      sizeRank[item.porte_minimo] <= mostRestrictiveAirportRank &&
      item.assentos >= passengerCount,
  );
}

export async function fetchFlightResults({
  originCode,
  destinationCode,
  departureStart,
  departureEnd,
  passengerCount,
  aircraftModel,
}: {
  originCode: string;
  destinationCode: string;
  departureStart: string;
  departureEnd: string;
  passengerCount: number;
  aircraftModel: string | null;
}) {
  const originRouteCode = getRouteCode(originCode);
  const destinationRouteCode = getRouteCode(destinationCode);
  const query = `*[
    _type == "flight" &&
    status in ["scheduled", "confirming", "confirmed"] &&
    route->originAirportCode == $originCode &&
    route->destinationAirportCode == $destinationCode &&
    dateTime(departureTime) >= dateTime($departureStart) &&
    dateTime(departureTime) < dateTime($departureEnd) &&
    availableSeats >= $passengerCount &&
    (!defined($aircraftModel) || aircraft->modelo == $aircraftModel)
  ] | order(departureTime asc) [0...30] {
    _id,
    "airlineName": airline->name,
    "pilotName": pilotName,
    "pilotPhotoUrl": pilotPhoto.asset->url,
    departureTime,
    arrivalTime,
    duration,
    price,
    currency,
    totalSeats,
    availableSeats,
    status,
    "aircraftModel": aircraft->modelo,
    "aircraftType": aircraft->tipo,
    "aircraftSeats": aircraft->assentos,
    "originCode": route->originAirportCode,
    "originCity": route->originCity,
    "destinationCode": route->destinationAirportCode,
    "destinationCity": route->destinationCity
  }`;

  const results = await getSanityClient().fetch<FlightResult[]>(query, {
    originCode: originRouteCode,
    destinationCode: destinationRouteCode,
    departureStart,
    departureEnd,
    passengerCount,
    aircraftModel,
  });
  return results.map((flight) => ({
    ...flight,
    originCode: flight.originCode ? (icaoByIata[flight.originCode] ?? flight.originCode) : null,
    destinationCode: flight.destinationCode
      ? (icaoByIata[flight.destinationCode] ?? flight.destinationCode)
      : null,
  }));
}

export async function fetchFeaturedRoutes() {
  const query = `*[
    _type == "flight" &&
    status in ["scheduled", "confirming", "confirmed"] &&
    dateTime(departureTime) >= dateTime(now()) &&
    defined(route->originAirportCode) &&
    defined(route->destinationAirportCode)
  ] | order(departureTime asc) [0...60] {
    "originCode": route->originAirportCode,
    "originCity": route->originCity,
    "destinationCode": route->destinationAirportCode,
    "destinationCity": route->destinationCity
  }`;

  const routes = await getSanityClient().fetch<FeaturedRoute[]>(query);
  const seenRoutes = new Set<string>();

  return routes
    .map((route) => ({
      ...route,
      originCode: icaoByIata[route.originCode] ?? route.originCode,
      destinationCode: icaoByIata[route.destinationCode] ?? route.destinationCode,
    }))
    .filter((route) => {
      const key = `${route.originCode}:${route.destinationCode}`;
      if (seenRoutes.has(key)) return false;
      seenRoutes.add(key);
      return true;
    })
    .slice(0, 5);
}
