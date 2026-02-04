const envServerUrl =
	process.env.EXPO_PUBLIC_SERVER_URL || process.env.EXPO_PUBLIC_API_URL;

// Allow overriding the backend host via Expo env vars, fallback to network IP
export const DEFAULT_SERVER_URL = envServerUrl || "http://192.168.1.16:4000";
