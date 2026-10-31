import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import type { Readable } from "node:stream";

/**
 * What the catalog needs from the private media bucket (spec §2 "Media bytes"): write a file, learn whether it is
 * already there unchanged, and read it back for `/media/…`. Signed URLs never leave this module because it makes none.
 */
export interface MediaStorage {
  /** Uploads bytes under a key, recording their SHA-256 as object metadata. An existing object is overwritten. */
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  /** The stored object's recorded digest and size, or null when no object has that key. */
  head(key: string): Promise<{ sha256: string | null; byteSize: number } | null>;
  /** The object's bytes as a stream with its content type, or null when no object has that key. */
  get(key: string): Promise<{ body: Readable; contentType: string; byteSize: number } | null>;
}

/** Everything needed to reach the bucket. All five come from the env keys spec §2 names. */
export type MediaStorageConfig = {
  /** The S3 endpoint, e.g. `https://<project-ref>.storage.supabase.co/storage/v1/s3`. */
  endpoint: string;
  /** The signing region: the Supabase project's region. */
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

/** The object-metadata key the stored digest lives under. */
export const SHA256_METADATA_KEY = "sha256";

/** Env key for each {@link MediaStorageConfig} field. */
const ENV_KEYS = {
  endpoint: "MEDIA_ENDPOINT",
  region: "MEDIA_REGION",
  bucket: "MEDIA_BUCKET",
  accessKeyId: "ACCESS_KEY_ID",
  secretAccessKey: "SECRET_ACCESS_KEY",
} as const satisfies Record<keyof MediaStorageConfig, string>;

/**
 * Lowercase hex SHA-256 of some bytes.
 * @param bytes - The bytes to digest
 */
export function sha256Of(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Reads the bucket configuration from the environment.
 * @param env - Defaults to `process.env`
 * @returns The configuration
 * @throws Error naming every missing key
 */
export function mediaStorageConfigFromEnv(env: NodeJS.ProcessEnv = process.env): MediaStorageConfig {
  const missing = Object.values(ENV_KEYS).filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(
      `[storage.ts: mediaStorageConfigFromEnv] Media storage keys are missing || missing=${missing.join(",")} || Copy .env.example to .env and fill them.`,
    );
  }
  return {
    endpoint: env[ENV_KEYS.endpoint]!,
    region: env[ENV_KEYS.region]!,
    bucket: env[ENV_KEYS.bucket]!,
    accessKeyId: env[ENV_KEYS.accessKeyId]!,
    secretAccessKey: env[ENV_KEYS.secretAccessKey]!,
  };
}

/**
 * Opens the private bucket over Supabase's S3-compatible protocol. Path-style addressing is what Supabase documents.
 * @param config - Endpoint, region, bucket and the S3 key pair
 * @returns A {@link MediaStorage}
 */
export function createMediaStorage(config: MediaStorageConfig): MediaStorage {
  const { bucket } = config;
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });

  return {
    async put(key, body, contentType) {
      try {
        await client.send(new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          Metadata: { [SHA256_METADATA_KEY]: sha256Of(body) },
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`[storage.ts: put] Failed to upload a media object || key=${key} bucket=${bucket} || ${message}`);
      }
    },

    async head(key) {
      try {
        const result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return { sha256: result.Metadata?.[SHA256_METADATA_KEY] ?? null, byteSize: result.ContentLength ?? 0 };
      } catch (error) {
        if (isNotFound(error)) return null;
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`[storage.ts: head] Failed to look up a media object || key=${key} bucket=${bucket} || ${message}`);
      }
    },

    async get(key) {
      try {
        const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        if (!result.Body) return null;
        return {
          body: result.Body as Readable,
          contentType: result.ContentType ?? "application/octet-stream",
          byteSize: result.ContentLength ?? 0,
        };
      } catch (error) {
        if (isNotFound(error)) return null;
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`[storage.ts: get] Failed to read a media object || key=${key} bucket=${bucket} || ${message}`);
      }
    },
  };
}

/**
 * Whether an S3 error means "no such object". HEAD answers `NotFound`, GET answers `NoSuchKey`; both are 404s.
 * @param error - What the SDK threw
 */
function isNotFound(error: unknown): boolean {
  const named = error as { name?: string; $metadata?: { httpStatusCode?: number } } | null;
  return named?.name === "NotFound" || named?.name === "NoSuchKey" || named?.$metadata?.httpStatusCode === 404;
}
