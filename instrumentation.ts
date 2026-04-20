export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getBraintrustLogger } = await import("@/lib/braintrust");
    getBraintrustLogger();
  }
}
