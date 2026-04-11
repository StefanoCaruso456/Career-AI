import { getBraintrustLogger } from "@/lib/braintrust";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    getBraintrustLogger();
  }
}
