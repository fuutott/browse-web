import { z } from "zod";

export const downloadLimit = Number.parseInt(process.env.DEFAULT_LIMIT ?? "40000") ?? 40000;

export const RequestPayloadSchema = z.object({
  url: z.string().url(),
  headers: z.record(z.string()).optional(),
  max_length: z.number().int().min(0).optional().default(downloadLimit),
  start_index: z.number().int().min(0).optional().default(0),
  findInPage: z.array(z.string()).optional(),
  maxLinks: z.number().int().min(0).max(200).optional(),
});

// Make sure TypeScript treats the fields as optional with defaults
export type RequestPayload = {
  url: string;
  headers?: Record<string, string>;
  max_length?: number;
  start_index?: number;
  findInPage?: string[];
  maxLinks?: number;
};

export type WebsiteResult = {
  url: string;
  title: string;
  h1: string;
  h2: string;
  h3: string;
  links?: [string, string][]; // [label, url] pairs
  content?: string;
};
