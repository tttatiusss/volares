import { createClient, type SanityClient } from '@sanity/client';

let sanityClient: SanityClient | null = null;

export function getSanityClient() {
  if (sanityClient) return sanityClient;

  const projectId = process.env.EXPO_PUBLIC_SANITY_PROJECT_ID;
  const dataset = process.env.EXPO_PUBLIC_SANITY_DATASET;
  const apiVersion = process.env.EXPO_PUBLIC_SANITY_API_VERSION ?? '2026-11-20';

  if (!projectId || !dataset) {
    throw new Error(
      'Configure EXPO_PUBLIC_SANITY_PROJECT_ID e EXPO_PUBLIC_SANITY_DATASET.',
    );
  }

  sanityClient = createClient({
    projectId,
    dataset,
    apiVersion,
    useCdn: true,
  });

  return sanityClient;
}
