import * as sdk from "../../public/sdk/pcp.js";

export type Signal = { name: string; type: string; source?: "seed" | "accepted" | string; at?: string };
export type Veto = { name: string; type?: string; at?: string; source?: string };
export type HistoryEntry = { at: string; name: string; type: string; liked: boolean; weights?: number[]; qloo?: number | null };

export type Passport = {
  protocol: string;
  id: string;
  created: string;
  updated: string;
  consent: { pii: boolean; share_signals_with: string[] };
  signals: Signal[];
  vetoes: Veto[];
  policy: { model: string; features: string[]; weights: number[]; lr: number; updates: number };
  history: HistoryEntry[];
};

export type Candidate = {
  name: string;
  prior: number;
  qloo: number | null;
  qloo_kind?: "affinity" | "rank" | string | null;
  qloo_match?: string | null;
  qloo_entity_id?: string | null;
  graph?: number | null;
  why?: string | null;
  because?: string | null;
};

export type Row = Candidate & { p_llm: number; x: number[]; logit: number; p: number };

export type Disclosed = {
  protocol: string;
  signals: { name: string; type: string }[];
  vetoes: { name: string; type?: string }[];
  policy: { weights: number[] };
};

export type Sealed = {
  protocol: string;
  encrypted: { alg: string; kdf: string; iterations: number; salt: string; iv: string; data: string };
};

export const PROTOCOL = sdk.PROTOCOL as string;
export const createPassport = sdk.createPassport as unknown as () => Passport;
export const addSignal = sdk.addSignal as unknown as (p: Passport, name: string, type: string, source?: string) => Passport;
export const removeSignal = sdk.removeSignal as unknown as (p: Passport, name: string) => Passport;
export const disclose = sdk.disclose as unknown as (p: Passport) => Disclosed;
export const distribution = sdk.distribution as unknown as (p: Passport, candidates: Candidate[]) => Row[];
export const feedback = sdk.feedback as unknown as (
  p: Passport,
  candidates: Candidate[],
  name: string,
  liked: boolean,
  type: string,
) => Passport;
export const encryptPassport = sdk.encryptPassport as unknown as (p: Passport, passphrase: string) => Promise<Sealed>;
export const importPassport = sdk.importPassport as unknown as (text: string, passphrase?: string) => Promise<Passport>;
export const isEncrypted = sdk.isEncrypted as unknown as (doc: unknown) => boolean;
export const save = sdk.save as unknown as (p: Passport) => void;
export const load = sdk.load as unknown as () => Passport | null;

export const sameName = (a: string, b: string) =>
  a.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() === b.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export const clonePassport = (p: Passport): Passport => JSON.parse(JSON.stringify(p));
