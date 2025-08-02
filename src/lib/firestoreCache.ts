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
 * Domain Types
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

export interface GetItineraryOptions {
  signatureHash?: string;
  variant?: string;
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

export interface PdfJob {
  status: 'PENDING' | 'PROCESSING' | 'COMPLETE' | 'FAILED';
  pdfUrl?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  requestPayload: {
    places: { name: string }[];
    tripLength: number;
    cityName: string;
  };
}

export type JsonObject = Record<string, unknown>;

export interface CacheMeta {
  cacheVersion: number;
  model?: string;
  prompt?: string;
  rawGeminiText?: string;
  placesSignature?: string;
  signatureHash?: string;
  variant?: string;
  summaryLevel?: string;
  responseType?: string;
  source?: 'generated' | 'cache';
  ttlMs?: number;
}

export interface FirestoreItineraryCacheV2 {
  city: string;
  days: number;
  places: EnrichedPlace[];
  itinerary: ItineraryDayCache[];
  guide?: JsonObject;
  assets?: {
    pdfPath?: string;
    pdfSignedUrl?: string;
    coverPhotoUrl?: string;
  };
  meta?: CacheMeta;
  createdAt?: string;
  updatedAt: FirebaseFirestore.Timestamp;
}
export interface PlaceEnrichmentDoc {
  nameKey: string;
  place: EnrichedPlace;
  createdAt?: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

/* ==============================
 * Collections / Constants
 * ============================== */

const ITINERARY_COLLECTION = 'itineraryCache_v2';
const PLACE_COLLECTION = 'placeEnrichment_v1';
const JOBS_COLLECTION = 'pdfJobs';

export const DEFAULT_ITINERARY_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const PLACE_TTL_MS = 365 * 24 * 60 * 60 * 1000;

const PROJECT_ID_SECRET = 'projects/934477100130/secrets/citybreaker-project-id/versions/latest';

/* ==============================
 * Singletons & Initialization
 * ============================== */

let firestore: Firestore | null = null;
let initPromise: Promise<void> | null = null;
let secretsClient: SecretManagerServiceClient | null = null;

async function fetchProjectIdFromSecret(): Promise<string> {
  if (!secretsClient) secretsClient = new SecretManagerServiceClient();
  const [version] = await secretsClient.accessSecretVersion({ name: PROJECT_ID_SECRET });
  const raw = version.payload?.data?.toString();
  if (!raw) throw new Error(`Secret payload is empty for ${PROJECT_ID_SECRET}`);
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const id = parsed['projectId'] || parsed['project_id'];
    if (typeof id === 'string' && id.trim()) return id.trim();
  } catch { /* Not JSON, fall through */ }
  const trimmed = raw.trim();
  if (!trimmed) throw new Error(`Secret ${PROJECT_ID_SECRET} resolved to empty string`);
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
    console.log(`FIRESTORE: Initialized via Secret Manager. project=${projectId}`);
    firestore = db;
  })();
  return initPromise;
}

/* ==============================
 * PDF Job Functions (CORRECTED)
 * ============================== */

export async function createPdfJob(jobId: string, payload: PdfJob['requestPayload']): Promise<void> {
  await ensureFirestore(); // <-- STEP 1: Ensure DB is connected
  const jobRef = (firestore as Firestore).collection(JOBS_COLLECTION).doc(jobId); // <-- STEP 2: Use 'firestore'
  const now = new Date().toISOString();
  await jobRef.set({
    status: 'PENDING',
    createdAt: now,
    updatedAt: now,
    requestPayload: payload,
  });
}

export async function updatePdfJob(jobId: string, data: Partial<Omit<PdfJob, 'createdAt' | 'requestPayload'>>): Promise<void> {
  await ensureFirestore(); // <-- STEP 1: Ensure DB is connected
  const jobRef = (firestore as Firestore).collection(JOBS_COLLECTION).doc(jobId); // <-- STEP 2: Use 'firestore'
  await jobRef.update({ ...data, updatedAt: new Date().toISOString() });
}

export async function getPdfJob(jobId: string): Promise<PdfJob | null> {
  await ensureFirestore(); // <-- STEP 1: Ensure DB is connected
  const doc = await (firestore as Firestore).collection(JOBS_COLLECTION).doc(jobId).get(); // <-- STEP 2: Use 'firestore'
  if (!doc.exists) {
    return null;
  }
  return doc.data() as PdfJob;
}

/* ==============================
 * Keying / Signatures
 * ============================== */

export function normalizeCityKey(city: string): string {
  return (city || '').trim().toLowerCase().replace(/\s+/g, '-');
}

export function computePlacesSignature(places: { name: string }[]): string {
  return (places || []).map((p) => (p?.name || '').trim().toLowerCase()).filter(Boolean).sort().join('|');
}

export function hashSignature(sig: string, length = 12): string {
  return createHash('sha1').update(sig).digest('hex').slice(0, Math.max(4, length));
}

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

export function isItineraryFresh(doc: Pick<FirestoreItineraryCacheV2, 'createdAt' | 'updatedAt'>, ttlMs: number, now = Date.now()): boolean {
  const tsMs = doc.createdAt ? new Date(doc.createdAt).getTime() : doc.updatedAt?.toDate?.().getTime?.() || 0;
  if (!tsMs || Number.isNaN(tsMs)) return false;
  return now - tsMs < ttlMs;
}

/* ==============================
 * Itinerary Cache
 * ============================== */

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
  variant?: string;
}

export async function storeCachedItinerary(
  city: string,
  days: number,
  data: Omit<FirestoreItineraryCacheV2, 'updatedAt'>,
  opts: StoreItineraryOptions = {} // Use the corrected interface
): Promise<void> {
  await ensureFirestore();
  // The key builder must also be aware of the variant
  const key = buildItineraryKey(city, days, opts.signatureHash, opts.variant);

  try {
    const createdAt = data.createdAt ?? new Date().toISOString();
    const payload = cleanUndefined<Omit<FirestoreItineraryCacheV2, 'updatedAt'>>({
      ...data,
      createdAt,
      meta: {
        cacheVersion: data.meta?.cacheVersion ?? 2,
        ...data.meta,
        signatureHash: opts.signatureHash ?? data.meta?.signatureHash,
        variant: opts.variant ?? data.meta?.variant, // Ensure variant is stored in meta
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
 * Per-Place Enrichment Cache
 * ============================== */

function normalizePlaceNameKey(name: string): string {
  return (name || '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '').slice(0, 200);
}

export function placeKeyFromName(name: string): string {
  return `place-${normalizePlaceNameKey(name)}`;
}

export async function getManyPlaceEnrichments(names: string[]): Promise<Map<string, PlaceEnrichmentDoc>> {
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
    await (firestore as Firestore).collection(PLACE_COLLECTION).doc(key).set({
      nameKey: key,
      place,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: Timestamp.now(),
    }, { merge: true });
    console.log(`FIRESTORE: Upserted place enrichment for ${key}`);
  } catch (err) {
    console.error(`FIRESTORE: Failed to upsert place enrichment for ${key}`, err);
  }
}

export function isPlaceFresh(doc: PlaceEnrichmentDoc, now = Date.now()): boolean {
  const updatedMs = doc.updatedAt?.toDate?.().getTime?.() || 0;
  return updatedMs > 0 && now - updatedMs < PLACE_TTL_MS;
}