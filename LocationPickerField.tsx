import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, LocateFixed, MapPin } from 'lucide-react';
import { Language } from '../types/database';
import {
  DEFAULT_MAX_SERVICE_RADIUS_KM,
  FAYOUM_SERVICE_ZONES,
  isValidCoordinatePair,
  isWithinServiceArea,
  requestBrowserLocation,
} from '../utils/geo';

interface LocationPickerFieldProps {
  lang: Language;
  titleAr: string;
  titleEn: string;
  addressLabelAr?: string;
  addressLabelEn?: string;
  address?: string;
  onAddressChange?: (nextAddress: string) => void;
  addressPlaceholderAr?: string;
  addressPlaceholderEn?: string;
  latitude: number | null;
  longitude: number | null;
  onCoordinatesChange: (lat: number | null, lng: number | null, suggestedZoneText?: string) => void;
  maxRadiusKm?: number;
  compact?: boolean;
}

export const LocationPickerField: React.FC<LocationPickerFieldProps> = ({
  lang,
  titleAr,
  titleEn,
  addressLabelAr,
  addressLabelEn,
  address,
  onAddressChange,
  addressPlaceholderAr,
  addressPlaceholderEn,
  latitude,
  longitude,
  onCoordinatesChange,
  maxRadiusKm = DEFAULT_MAX_SERVICE_RADIUS_KM,
  compact = false,
}) => {
  const [detecting, setDetecting] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [showManualCoords, setShowManualCoords] = useState(false);

  const hasCoords = isValidCoordinatePair(latitude, longitude);
  const areaCheck = isWithinServiceArea(latitude, longitude, maxRadiusKm);

  const handleDetectGps = async () => {
    setDetecting(true);
    setGpsError(null);
    const res = await requestBrowserLocation();
    setDetecting(false);

    if (res.ok === true) {
      const check = isWithinServiceArea(res.lat, res.lng, maxRadiusKm);
      const zoneLabel = check.nearestZone
        ? lang === 'ar'
          ? check.nearestZone.name_ar
          : check.nearestZone.name_en
        : undefined;
      onCoordinatesChange(res.lat, res.lng, zoneLabel);
      return;
    }

    if (res.reason === 'permission_denied') {
      setGpsError(
        lang === 'ar'
          ? 'تم رفض إذن تحديد الموقع. اختر أقرب منطقة في الفيوم يدوياً أو أدخل الإحداثيات.'
          : 'Location permission was denied. Select a Fayoum zone manually or enter coordinates.'
      );
    } else if (res.reason === 'timeout') {
      setGpsError(
        lang === 'ar'
          ? 'انتهت مهلة تحديد الموقع. جرّب اختيار المنطقة يدوياً.'
          : 'GPS request timed out. Please select your zone manually.'
      );
    } else {
      setGpsError(
        lang === 'ar'
          ? 'تعذر الوصول إلى GPS من المتصفح. اختر أقرب منطقة في الفيوم يدوياً.'
          : 'Browser GPS is unavailable. Select your Fayoum zone manually.'
      );
    }
    setShowManualCoords(true);
  };

  const handleSelectZone = (zoneId: string) => {
    const zone = FAYOUM_SERVICE_ZONES.find((z) => z.id === zoneId);
    if (!zone) return;
    setGpsError(null);
    onCoordinatesChange(
      zone.lat,
      zone.lng,
      lang === 'ar' ? zone.name_ar : zone.name_en
    );
    if (onAddressChange && (!address || !address.trim())) {
      onAddressChange(lang === 'ar' ? zone.name_ar : zone.name_en);
    }
  };

  return (
    <div
      className={`rounded-2xl border border-[#245B45]/15 bg-[#FFF8EC]/65 ${
        compact ? 'p-3.5 space-y-3' : 'p-4 space-y-3.5'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-extrabold text-[#245B45]">
          <MapPin className="w-4 h-4 text-[#E97858] shrink-0" />
          <span>{lang === 'ar' ? titleAr : titleEn}</span>
        </div>

        <button
          type="button"
          disabled={detecting}
          onClick={() => void handleDetectGps()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#245B45] hover:bg-[#1A4433] text-white text-xs font-bold disabled:opacity-50 cursor-pointer transition-colors"
        >
          <LocateFixed className={`w-3.5 h-3.5 ${detecting ? 'animate-spin' : ''}`} />
          <span>
            {detecting
              ? lang === 'ar'
                ? 'جاري التحديد...'
                : 'Detecting...'
              : lang === 'ar'
              ? 'تحديد موقعي GPS'
              : 'Use My GPS'}
          </span>
        </button>
      </div>

      {onAddressChange && (
        <div>
          {(addressLabelAr || addressLabelEn) && (
            <label className="block text-[11px] font-bold text-[#5C6861] mb-1">
              {lang === 'ar' ? addressLabelAr : addressLabelEn}
            </label>
          )}
          <input
            type="text"
            value={address ?? ''}
            onChange={(e) => onAddressChange(e.target.value)}
            placeholder={lang === 'ar' ? addressPlaceholderAr : addressPlaceholderEn}
            className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#245B45]/20 text-sm"
          />
        </div>
      )}

      {/* Fayoum Service Zone Selector (Real manual location fallback / quick selection) */}
      <div>
        <label className="block text-[11px] font-bold text-[#5C6861] mb-1">
          {lang === 'ar'
            ? 'اختر أقرب نقطة / حي في نطاق الفيوم (بديل يدوي دقيق)'
            : 'Select Fayoum Zone / Landmark (Manual Location Fallback)'}
        </label>
        <select
          value=""
          onChange={(e) => handleSelectZone(e.target.value)}
          className="w-full px-3 py-2 rounded-xl bg-white border border-[#245B45]/20 text-xs font-semibold text-[#29332E]"
        >
          <option value="">
            {lang === 'ar'
              ? 'اختر منطقة لتثبيت الإحداثيات...'
              : 'Choose a Fayoum zone to set coordinates...'}
          </option>
          {FAYOUM_SERVICE_ZONES.map((z) => (
            <option key={z.id} value={z.id}>
              {lang === 'ar' ? z.name_ar : z.name_en} ({z.lat.toFixed(4)}, {z.lng.toFixed(4)})
            </option>
          ))}
        </select>
      </div>

      {/* Status Indicator */}
      {hasCoords ? (
        <div
          className={`p-2.5 rounded-xl text-xs flex flex-wrap items-center justify-between gap-2 border ${
            areaCheck.valid
              ? 'bg-[#245B45]/8 border-[#245B45]/20 text-[#245B45]'
              : 'bg-[#E97858]/12 border-[#E97858]/35 text-[#9E3F24]'
          }`}
        >
          <div className="flex items-center gap-1.5 font-bold">
            {areaCheck.valid ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>
              {areaCheck.valid
                ? lang === 'ar'
                  ? `داخل نطاق خدمة لقمة (${areaCheck.nearestZone?.name_ar ?? 'الفيوم'})`
                  : `Within LOKMA service area (${areaCheck.nearestZone?.name_en ?? 'Fayoum'})`
                : lang === 'ar'
                ? `خارج نطاق التغطية الحالي (${areaCheck.distanceFromCenterKm} كم > ${maxRadiusKm} كم)`
                : `Outside supported service radius (${areaCheck.distanceFromCenterKm} km > ${maxRadiusKm} km)`}
            </span>
          </div>
          <span className="font-mono text-[11px] tabular-nums opacity-80">
            {Number(latitude).toFixed(5)}, {Number(longitude).toFixed(5)}
          </span>
        </div>
      ) : (
        <div className="text-[11px] text-[#5C6861]">
          {lang === 'ar'
            ? 'لم يتم تثبيت إحداثيات جغرافية بعد. اضغط «تحديد موقعي GPS» أو اختر منطقة بالفيوم.'
            : 'No GPS coordinates set yet. Tap "Use My GPS" or select a Fayoum zone.'}
        </div>
      )}

      {gpsError && (
        <div className="p-2.5 rounded-xl bg-[#E97858]/12 border border-[#E97858]/30 text-[11px] font-semibold text-[#9E3F24]">
          {gpsError}
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setShowManualCoords((s) => !s)}
          className="text-[11px] font-bold text-[#245B45] hover:underline cursor-pointer"
        >
          {showManualCoords
            ? lang === 'ar'
              ? 'إخفاء إدخال الإحداثيات يدوياً'
              : 'Hide manual lat/lng'
            : lang === 'ar'
            ? 'تعديل خط العرض والطول يدوياً'
            : 'Enter lat/lng manually'}
        </button>

        {hasCoords && (
          <button
            type="button"
            onClick={() => onCoordinatesChange(null, null)}
            className="text-[11px] font-bold text-[#5C6861] hover:text-[#9E3F24] cursor-pointer"
          >
            {lang === 'ar' ? 'مسح الإحداثيات' : 'Clear coordinates'}
          </button>
        )}
      </div>

      {showManualCoords && (
        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <div>
            <label className="block text-[11px] font-bold text-[#5C6861] mb-1">
              {lang === 'ar' ? 'خط العرض (Latitude)' : 'Latitude'}
            </label>
            <input
              type="number"
              step="0.0001"
              value={latitude ?? ''}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === '') {
                  onCoordinatesChange(null, longitude);
                  return;
                }
                const nextLat = Number(raw);
                if (Number.isFinite(nextLat)) {
                  onCoordinatesChange(nextLat, longitude);
                }
              }}
              placeholder="29.3185"
              className="w-full px-3 py-1.5 rounded-lg bg-white border border-[#245B45]/20 text-xs tabular-nums"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-[#5C6861] mb-1">
              {lang === 'ar' ? 'خط الطول (Longitude)' : 'Longitude'}
            </label>
            <input
              type="number"
              step="0.0001"
              value={longitude ?? ''}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === '') {
                  onCoordinatesChange(latitude, null);
                  return;
                }
                const nextLng = Number(raw);
                if (Number.isFinite(nextLng)) {
                  onCoordinatesChange(latitude, nextLng);
                }
              }}
              placeholder="30.8405"
              className="w-full px-3 py-1.5 rounded-lg bg-white border border-[#245B45]/20 text-xs tabular-nums"
            />
          </div>
        </div>
      )}
    </div>
  );
};
