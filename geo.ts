export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface ServiceZone {
  id: string;
  name_ar: string;
  name_en: string;
  lat: number;
  lng: number;
}

// Primary LOKMA campus hub in Fayoum, Egypt
export const FAYOUM_SERVICE_CENTER: GeoPoint = {
  lat: 29.3185,
  lng: 30.8405,
};

export const DEFAULT_MAX_SERVICE_RADIUS_KM = 12;

export const FAYOUM_SERVICE_ZONES: ServiceZone[] = [
  {
    id: 'fayoum_university_main',
    name_ar: 'جامعة الفيوم — الحرم الرئيسي',
    name_en: 'Fayoum University — Main Campus',
    lat: 29.3204,
    lng: 30.8358,
  },
  {
    id: 'student_housing',
    name_ar: 'المدينة الجامعية وسكن الطلبة',
    name_en: 'University Housing & Dorms',
    lat: 29.3235,
    lng: 30.8390,
  },
  {
    id: 'al_masalla',
    name_ar: 'المسلة — محيط الجامعة',
    name_en: 'Al-Masalla — University District',
    lat: 29.3132,
    lng: 30.8442,
  },
  {
    id: 'keman_fares',
    name_ar: 'كيمان فارس',
    name_en: 'Keman Fares',
    lat: 29.3256,
    lng: 30.8312,
  },
  {
    id: 'al_sawaqi',
    name_ar: 'السواقي ووسط البلد',
    name_en: 'Al-Sawaqi & Downtown Fayoum',
    lat: 29.3084,
    lng: 30.8428,
  },
  {
    id: 'al_hadaqa',
    name_ar: 'الحدقة',
    name_en: 'Al-Hadaqa',
    lat: 29.3105,
    lng: 30.8548,
  },
  {
    id: 'al_gomhoria',
    name_ar: 'شارع الجمهورية والمنار',
    name_en: 'Al-Gomhoria & Al-Manar',
    lat: 29.3182,
    lng: 30.8505,
  },
  {
    id: 'baghous',
    name_ar: 'باغوص',
    name_en: 'Baghous',
    lat: 29.3046,
    lng: 30.8364,
  },
];

export function isValidCoordinatePair(
  lat: number | null | undefined,
  lng: number | null | undefined
): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/**
 * Great-circle Haversine distance in kilometers.
 */
export function haversineDistanceKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return Number((R * c).toFixed(2));
}

export function findNearestServiceZone(point: GeoPoint): {
  zone: ServiceZone;
  distanceKm: number;
} {
  let bestZone = FAYOUM_SERVICE_ZONES[0];
  let bestDist = haversineDistanceKm(point, { lat: bestZone.lat, lng: bestZone.lng });

  for (let i = 1; i < FAYOUM_SERVICE_ZONES.length; i += 1) {
    const candidate = FAYOUM_SERVICE_ZONES[i];
    const dist = haversineDistanceKm(point, { lat: candidate.lat, lng: candidate.lng });
    if (dist < bestDist) {
      bestDist = dist;
      bestZone = candidate;
    }
  }

  return { zone: bestZone, distanceKm: bestDist };
}

export function isWithinServiceArea(
  lat: number | null | undefined,
  lng: number | null | undefined,
  maxRadiusKm = DEFAULT_MAX_SERVICE_RADIUS_KM
): {
  valid: boolean;
  distanceFromCenterKm: number | null;
  nearestZone: ServiceZone | null;
} {
  if (!isValidCoordinatePair(lat, lng)) {
    return { valid: false, distanceFromCenterKm: null, nearestZone: null };
  }
  const point: GeoPoint = { lat: Number(lat), lng: Number(lng) };
  const distFromCenter = haversineDistanceKm(point, FAYOUM_SERVICE_CENTER);
  const { zone } = findNearestServiceZone(point);
  return {
    valid: distFromCenter <= maxRadiusKm,
    distanceFromCenterKm: distFromCenter,
    nearestZone: zone,
  };
}

export function estimateDeliveryEtaMinutes(
  distanceKm: number,
  method: 'walking' | 'bicycle' | 'default' = 'default',
  prepMinutes = 0
): number {
  const speedKmh = method === 'walking' ? 4.5 : method === 'bicycle' ? 14 : 15;
  const travelMinutes = Math.max(4, Math.round((distanceKm / speedKmh) * 60));
  return Math.max(5, Math.min(300, Math.round(prepMinutes) + travelMinutes));
}

export type GeolocationFailureReason =
  | 'unsupported'
  | 'permission_denied'
  | 'unavailable'
  | 'timeout';

export function requestBrowserLocation(): Promise<
  | { ok: true; lat: number; lng: number; accuracyMeters: number }
  | { ok: false; reason: GeolocationFailureReason }
> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve({ ok: false, reason: 'unsupported' });
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          ok: true,
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
          accuracyMeters: Math.round(pos.coords.accuracy || 0),
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          resolve({ ok: false, reason: 'permission_denied' });
        } else if (err.code === err.TIMEOUT) {
          resolve({ ok: false, reason: 'timeout' });
        } else {
          resolve({ ok: false, reason: 'unavailable' });
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      }
    );
  });
}
