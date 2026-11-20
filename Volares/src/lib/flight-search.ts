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

const sizeRank: Record<AirportSize, number> = {
  Pequeno: 0,
  Medio: 1,
  Grande: 2,
};

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
  const query = `*[
    _type == "flight" &&
    status in ["scheduled", "confirming", "confirmed"] &&
    route->originAirport->code == $originCode &&
    route->destinationAirport->code == $destinationCode &&
    dateTime(departureTime) >= dateTime($departureStart) &&
    dateTime(departureTime) < dateTime($departureEnd) &&
    availableSeats >= $passengerCount &&
    (!defined($aircraftModel) || aircraft->modelo == $aircraftModel)
  ] | order(departureTime asc) [0...30] {
    _id,
    "airlineName": airline->name,
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
    "originCode": route->originAirport->code,
    "originCity": route->originAirport->city,
    "destinationCode": route->destinationAirport->code,
    "destinationCity": route->destinationAirport->city
  }`;

  return getSanityClient().fetch<FlightResult[]>(query, {
    originCode,
    destinationCode,
    departureStart,
    departureEnd,
    passengerCount,
    aircraftModel,
  });
}

export async function fetchFeaturedRoutes() {
  const query = `*[
    _type == "flight" &&
    status in ["scheduled", "confirming", "confirmed"] &&
    dateTime(departureTime) >= dateTime(now()) &&
    defined(route->originAirport->code) &&
    defined(route->destinationAirport->code)
  ] | order(departureTime asc) [0...60] {
    "originCode": route->originAirport->code,
    "originCity": route->originAirport->city,
    "destinationCode": route->destinationAirport->code,
    "destinationCity": route->destinationAirport->city
  }`;

  const routes = await getSanityClient().fetch<FeaturedRoute[]>(query);
  const seenRoutes = new Set<string>();

  return routes.filter((route) => {
    const key = `${route.originCode}:${route.destinationCode}`;
    if (seenRoutes.has(key)) return false;
    seenRoutes.add(key);
    return true;
  }).slice(0, 5);
}
