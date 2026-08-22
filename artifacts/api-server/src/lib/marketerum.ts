const BASE_URL = "https://marketerum.com/api/v2";

const getApiKey = () => process.env.MARKETERUM_API_KEY;

const request = async (action: string, payload?: Record<string, unknown>) => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("Provider configuration unavailable");
  const response = await fetch(`${BASE_URL}/${action}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "X-API-Key": apiKey,
    },
    body: JSON.stringify(payload ?? {}),
  });
  if (!response.ok) throw new Error(`Provider request failed with status ${response.status}`);
  return (await response.json()) as Record<string, unknown>;
};

export const marketerum = {
  services: () => request("services"),
  add: (payload: Record<string, unknown>) => request("add", payload),
  status: (payload: Record<string, unknown>) => request("status", payload),
  refill: (payload: Record<string, unknown>) => request("refill", payload),
};