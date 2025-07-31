// src/lib/firestoreCache.ts
import {
  Firestore,
  Timestamp,
  FieldValue,
  getFirestore as getAdminFirestore,
} from 'firebase-admin/firestore';
import {
  getApps,
  initializeApp,
  App,
  applicationDefault,
  AppOptions,
} from 'firebase-admin/app';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { createHash } from 'crypto';

/* ==============================
 * Narrow, reusable domain types
 * ============================== */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface EnrichedPlace {
  name: string;
  placeId?: string;
  photoUrl?: string;
  website?: string;
  googleMapsUrl?: string;
  location?: LatLng;
}

export interface ItineraryActivityCache {
  title?: string;
  description?: string;
  whyVisit?: string;
  insiderTip?: string;
  priceRange?: string;
  audience?: string;
  placeName?: string;
}

export interface ItineraryDayCache {
  title?: string;
  dayPhotoUrl?: string;
  activities?: ItineraryActivityCache[];
}

export type JsonObject = Record<string, unknown>;

/* ==============================
 * V1 (back-compat) cache type
 * ============================== */

export interface FirestoreItineraryCache {
  city: string;
  days: number;
  places: EnrichedPlace[];
  itinerary: ItineraryDayCache[];
  createdAt?: string;
  updatedAt: FirebaseFirestore.Timestamp;
}

/* ==============================
 * V2 expandable cache type
 * ============================== */

export type SummaryLevel = 'standard' | 'extended' | string;
export type Variant = 'basic' | 'pro' | 'extended' | string;

export interface CacheAssets {
  pdfPath?: string;
  pdfSignedUrl?: string;
  coverPhotoUrl?: string;
}

export interface CacheMeta {
  cacheVersion: number;
  model?: string;
  prompt?: string;
  rawGeminiText?: string;

  placesSignature?: string;
  signatureHash?: string;

  variant?: Variant;
  summaryLevel?: SummaryLevel;

  responseType?: 'json' | 'pdf' | 'both' | string;
  source?: 'generated' | 'cache';
  ttlMs?: number;
}

export interface FirestoreItineraryCacheV2 {
  city: string;
  days: number;
  places: EnrichedPlace[];
  itinerary: ItineraryDayCache[];

  // Optional extended/guide payload
  guide?: JsonObject;

  // Optional assets and metadata
  assets?: CacheAssets;
  meta?: CacheMeta;

  createdAt?: string;
  updatedAt: FirebaseFirestore.Timestamp;
}

/* ==============================
 * Place enrichment cache type
 * ============================== */

export interface PlaceEnrichmentDoc {
  nameKey: string;               // normalized key "place-<slug>"
  place: EnrichedPlace;          // single place enrichment payload
  createdAt?: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

/* ==============================
 * Collections / constants
 * ============================== */

export const ITINERARY_COLLECTION = 'itineraryCache_v2';
export const PLACE_COLLECTION = 'placeEnrichment_v1';

export const DEFAULT_ITINERARY_TTL_MS = 31 * 24 * 60 * 60 * 1000; // 31 days
export const PLACE_TTL_MS = 180 * 24 * 60 * 60 * 1000;             // 180 days

// Secret Manager: project ID for firebase-admin
const PROJECT_ID_SECRET =
  'projects/934477100130/secrets/citybreaker-project-id/versions/latest';

/* ==============================
 * Singletons
 * ============================== */

let firestore: Firestore | null = null;
let initPromise: Promise<void> | null = null;
let secretsClient: SecretManagerServiceClient | null = null;

/* ==============================
 * Secret Manager / initialization
 * ============================== */

async function fetchProjectIdFromSecret(): Promise<string> {
  if (!secretsClient) secretsClient = new SecretManagerServiceClient();
  const [version] = await secretsClient.accessSecretVersion({ name: PROJECT_ID_SECRET });
  const raw = version.payload?.data?.toString();
  if (!raw) throw new Error(`Secret payload is empty for ${PROJECT_ID_SECRET}`);

  // Try JSON payload first (allows future extension), then fall back to raw string
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const candidates = [
      parsed['projectId'],
      parsed['project_id'],
      parsed['PROJECT_ID'],
    ];
    for (const c of candidates) {
      if (typeof c === 'string' && c.trim()) {
        return c.trim();
      }
    }
  } catch {
    // not JSON; continue to raw string fallback
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error(`Secret ${PROJECT_ID_SECRET} resolved to empty string`);
  }
  return trimmed;
}

async function ensureFirestore(): Promise<void> {
  if (firestore) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const existing = getApps();
    if (existing.length > 0) {
      firestore = getAdminFirestore(existing[0]);
      return;
    }

    const projectId = await fetchProjectIdFromSecret();
    const opts: AppOptions = { credential: applicationDefault(), projectId };
    const app: App = initializeApp(opts);
    const db = getAdminFirestore(app);
    db.settings({ ignoreUndefinedProperties: true });

    const emulator = process.env.FIRESTORE_EMULATOR_HOST;
    console.log(
      `FIRESTORE: Initialized via Secret Manager. project=${projectId}` +
        (emulator ? ` (emulator=${emulator})` : '')
    );

    firestore = db;
  })();

  return initPromise;
}

/* ==============================
 * Keying / signatures
 * ============================== */

export function normalizeCityKey(city: string): string {
  return (city || '').trim().toLowerCase().replace(/\s+/g, '-');
}

export function computePlacesSignature(places: { name: string }[]): string {
  return (places || [])
    .map((p) => (p?.name || '').trim().toLowerCase())
    .filter((s) => s.length > 0)
    .sort()
    .join('|');
}

export function hashSignature(sig: string, length = 12): string {
  return createHash('sha1').update(sig).digest('hex').slice(0, Math.max(4, length));
}

/**
 * Flexible, namespaced itinerary key:
 *   city-<cityKey>-days-<n>[-sig-<hash>][-v-<variant>]
 */
export function buildItineraryKey(
  city: string,
  days: number,
  signatureHash?: string,
  variant?: string
): string {
  const cityKey = normalizeCityKey(city);
  return (
    `city-${cityKey}-days-${days}` +
    (signatureHash ? `-sig-${signatureHash}` : '') +
    (variant ? `-v-${variant}` : '')
  );
}

/* ==============================
 * Utils
 * ============================== */

function cleanUndefined<T>(obj: T): T {
  if (Array.isArray(obj)) {
    return obj.map((v) => cleanUndefined(v)) as unknown as T;
  }
  if (obj !== null && typeof obj === 'object') {
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (v !== undefined) {
        cleaned[k] = cleanUndefined(v as unknown);
      }
    }
    return cleaned as T;
  }
  return obj;
}

export function isItineraryFresh(
  doc: Pick<FirestoreItineraryCacheV2, 'createdAt' | 'updatedAt'>,
  ttlMs: number,
  now = Date.now()
): boolean {
  const tsMs = doc.createdAt
    ? new Date(doc.createdAt).getTime()
    : doc.updatedAt?.toDate?.().getTime?.() || 0;
  if (!tsMs || Number.isNaN(tsMs)) return false;
  return now - tsMs < ttlMs;
}

/* ==============================
 * Itinerary cache (V2, expandable)
 * ============================== */

export interface GetItineraryOptions {
  signatureHash?: string;
  variant?: Variant;
}

export async function getCachedItinerary(
  city: string,
  days: number,
  opts: GetItineraryOptions = {}
): Promise<FirestoreItineraryCacheV2 | null> {
  await ensureFirestore();
  const key = buildItineraryKey(city, days, opts.signatureHash, opts.variant);
  try {
    const snap = await (firestore as Firestore)
      .collection(ITINERARY_COLLECTION)
      .doc(key)
      .get();
    if (!snap.exists) {
      console.log(`FIRESTORE: Cache miss for ${key}`);
      return null;
    }
    console.log(`FIRESTORE: Cache hit for ${key}`);
    return snap.data() as FirestoreItineraryCacheV2;
  } catch (err) {
    console.error(`FIRESTORE: Failed to get cache for ${key}`, err);
    return null;
  }
}

export interface StoreItineraryOptions {
  signatureHash?: string;
  variant?: Variant;
}

export async function storeCachedItinerary(
  city: string,
  days: number,
  data: Omit<FirestoreItineraryCacheV2, 'updatedAt'>,
  opts: StoreItineraryOptions = {}
): Promise<void> {
  await ensureFirestore();
  const key = buildItineraryKey(city, days, opts.signatureHash, opts.variant);

  try {
    // Ensure createdAt exists (your schema uses ISO string for createdAt)
    const createdAt = data.createdAt ?? new Date().toISOString();

    // IMPORTANT: type this as Omit<…,'updatedAt'> so TS doesn’t require it here.
    const payload = cleanUndefined<Omit<FirestoreItineraryCacheV2, 'updatedAt'>>({
      ...data,
      createdAt,
      meta: {
        // keep any existing meta, but guarantee cacheVersion and overlay variant/signature from opts
        cacheVersion: data.meta?.cacheVersion ?? 2,
        ...data.meta,
        signatureHash: opts.signatureHash ?? data.meta?.signatureHash,
        variant: opts.variant ?? data.meta?.variant,
      },
    });

    await (firestore as Firestore)
      .collection(ITINERARY_COLLECTION)
      .doc(key)
      .set(
        {
          ...payload,
          updatedAt: Timestamp.now(),
        },
        { merge: false }
      );

    console.log(`FIRESTORE: Stored itinerary for ${key}`);
  } catch (err) {
    console.error(`FIRESTORE: Failed to store cache for ${key}`, err);
  }
}

/* ==============================
 * Per-place enrichment cache (shared)
 * ============================== */

function normalizePlaceNameKey(name: string): string {
  return (name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '')
    .slice(0, 200);
}

export function placeKeyFromName(name: string): string {
  return `place-${normalizePlaceNameKey(name)}`;
}

export async function getManyPlaceEnrichments(
  names: string[]
): Promise<Map<string, PlaceEnrichmentDoc>> {
  await ensureFirestore();
  const map = new Map<string, PlaceEnrichmentDoc>();
  const keys = Array.from(new Set((names || []).map(placeKeyFromName)));
  if (keys.length === 0) return map;

  const refs = keys.map((k) => (firestore as Firestore).collection(PLACE_COLLECTION).doc(k));
  const snaps = await (firestore as Firestore).getAll(...refs);
  snaps.forEach((snap, idx) => {
    if (snap.exists) {
      map.set(keys[idx], snap.data() as PlaceEnrichmentDoc);
    }
  });
  return map;
}

export async function upsertPlaceEnrichment(name: string, place: EnrichedPlace): Promise<void> {
  await ensureFirestore();
  const key = placeKeyFromName(name);
  try {
    await (firestore as Firestore).collection(PLACE_COLLECTION).doc(key).set(
      {
        nameKey: key,
        place,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );
    console.log(`FIRESTORE: Upserted place enrichment for ${key}`);
  } catch (err) {
    console.error(`FIRESTORE: Failed to upsert place enrichment for ${key}`, err);
  }
}

export function isPlaceFresh(doc: PlaceEnrichmentDoc, now = Date.now()): boolean {
  const updatedMs = doc.updatedAt?.toDate?.().getTime?.() || 0;
  return updatedMs > 0 && now - updatedMs < PLACE_TTL_MS;
}
