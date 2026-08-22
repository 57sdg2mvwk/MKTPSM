const BASE_URL = "https://marketerum.com/api/v2";

const getApiKey = () => process.env.MARKETERUM_API_KEY;

const request = async (action: string, payload?: Record<string, unknown>) => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("Provider configuration unavailable");
  const body = new URLSearchParams({ key: apiKey, action });
  for (const [name, value] of Object.entries(payload ?? {})) {
    if (value !== undefined && value !== null) body.set(name, String(value));
  }
  const response = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error(`Provider request failed with status ${response.status}`);
  const data = (await response.json()) as unknown;
  if (
    data &&
    !Array.isArray(data) &&
    typeof data === "object" &&
    typeof (data as Record<string, unknown>).error === "string"
  ) {
    throw new Error("Provider rejected the request");
  }
  return data as Record<string, unknown>;
};

export const marketerum = {
  services: () => request("services"),
  add: (payload: Record<string, unknown>) => request("add", payload),
  status: (payload: Record<string, unknown>) => request("status", payload),
  refill: (payload: Record<string, unknown>) => request("refill", payload),
};