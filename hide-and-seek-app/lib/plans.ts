import type { Mode } from "./game";

export type PlanId = "free" | "individual" | "group10" | "group20" | "corp_starter" | "corp_pro" | "corp_enterprise";

export type Plan = {
  id: PlanId;
  name: string;
  audience: "free" | "individual" | "group" | "corporate";
  price: string;
  cadence: string;
  maxPlayers: number;
  modes: Mode[];
  /** How an access code for this plan is consumed. */
  usage: "none" | "subscription" | "single_event" | "annual";
  /** Days an access code stays valid when issued. */
  validDays: number;
  features: string[];
};

const ALL: Mode[] = ["classic", "infection"];

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free", name: "Free", audience: "free", price: "$0", cadence: "", maxPlayers: 6, modes: ["classic"],
    usage: "none", validDays: 0,
    features: ["Classic mode", "Up to 6 players"],
  },
  individual: {
    id: "individual", name: "Individual", audience: "individual", price: "$4.99", cadence: "per month", maxPlayers: 8, modes: ALL,
    usage: "subscription", validDays: 31,
    features: ["Every game mode", "Host unlimited games", "Up to 8 players", "No ads"],
  },
  group10: {
    id: "group10", name: "Group of 10", audience: "group", price: "$19.99", cadence: "per session", maxPlayers: 10, modes: ALL,
    usage: "single_event", validDays: 90,
    features: ["One game session", "Up to 10 players", "Every game mode", "Ideal for parties and families"],
  },
  group20: {
    id: "group20", name: "Group of 20", audience: "group", price: "$34.99", cadence: "per session", maxPlayers: 20, modes: ALL,
    usage: "single_event", validDays: 90,
    features: ["One game session", "Up to 20 players", "Every game mode", "Ideal for camps, schools and clubs"],
  },
  corp_starter: {
    id: "corp_starter", name: "Corporate Starter", audience: "corporate", price: "$750", cadence: "per event", maxPlayers: 50, modes: ALL,
    usage: "single_event", validDays: 180,
    features: ["One team event", "Up to 50 employees", "Every game mode", "Event summary for organisers"],
  },
  corp_pro: {
    id: "corp_pro", name: "Corporate Professional", audience: "corporate", price: "$2,500", cadence: "per event", maxPlayers: 150, modes: ALL,
    usage: "single_event", validDays: 180,
    features: ["One large team event", "Up to 150 employees", "Branded game arena", "Engagement report for leadership"],
  },
  corp_enterprise: {
    id: "corp_enterprise", name: "Corporate Enterprise", audience: "corporate", price: "$6,000 – $24,000", cadence: "per year", maxPlayers: 150, modes: ALL,
    usage: "annual", validDays: 365,
    features: ["Unlimited events for a year", "Up to 150 employees per event", "Onboarding and offsite programmes", "HR analytics and priority support"],
  },
};

export const PLAN_IDS = Object.keys(PLANS) as PlanId[];
export const isPlanId = (v: unknown): v is PlanId => typeof v === "string" && v in PLANS;
