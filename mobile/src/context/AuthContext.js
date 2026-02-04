import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { DEFAULT_SERVER_URL } from "../config";
import { createApiClient } from "../services/api";

const STORAGE_KEY = "inventoryMobile.auth";
const DEVICE_STORAGE_KEY = "inventoryMobile.deviceId";

const generateDeviceId = () => {
  if (typeof Crypto.randomUUID === "function") {
    return `device-${Crypto.randomUUID()}`;
  }
  const bytes = Crypto.getRandomBytes(16);
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `device-${hex}`;
};

const AuthContext = createContext(null);

const isValidServerUrl = (value) => {
  if (!value || typeof value !== "string") {
    return false;
  }
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

const extractAuthResponse = (rawResponse) => {
  const containers = [rawResponse, rawResponse?.data, rawResponse?.result, rawResponse?.payload, rawResponse?.body];
  for (const candidate of containers) {
    if (!candidate || typeof candidate !== "object") {
      continue;
    }

    const nestedTokens =
      candidate.tokens ??
      candidate.tokenPair ??
      candidate.authTokens ??
      candidate.data?.tokens ??
      candidate.payload?.tokens ??
      null;

    const accessToken =
      nestedTokens?.access_token ??
      nestedTokens?.accessToken ??
      candidate.access_token ??
      candidate.accessToken ??
      candidate.token ??
      candidate.jwt ??
      null;

    const refreshToken =
      nestedTokens?.refresh_token ??
      nestedTokens?.refreshToken ??
      candidate.refresh_token ??
      candidate.refreshToken ??
      null;

    const user =
      candidate.user ??
      candidate.account ??
      candidate.profile ??
      candidate.data?.user ??
      candidate.payload?.user ??
      null;

    if (accessToken) {
      return { accessToken, refreshToken, user };
    }
  }

  return { accessToken: null, refreshToken: null, user: null };
};

export const AuthProvider = ({ children }) => {
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL);
  const [token, setToken] = useState(null);
  const [refreshToken, setRefreshToken] = useState(null);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deviceId, setDeviceId] = useState(null);

  useEffect(() => {
    const loadStoredCredentials = async () => {
      try {
        let storedDeviceId = await SecureStore.getItemAsync(DEVICE_STORAGE_KEY);
        if (!storedDeviceId) {
          storedDeviceId = generateDeviceId();
          await SecureStore.setItemAsync(DEVICE_STORAGE_KEY, storedDeviceId);
        }
        setDeviceId(storedDeviceId);

        const stored = await SecureStore.getItemAsync(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (isValidServerUrl(parsed.serverUrl)) {
            setServerUrl(parsed.serverUrl);
          } else if (parsed.serverUrl) {
            console.warn("Ignoring invalid stored server URL", parsed.serverUrl);
          }
          if (parsed.accessToken || parsed.token) {
            setToken(parsed.accessToken ?? parsed.token);
          }
          if (parsed.refreshToken) {
            setRefreshToken(parsed.refreshToken);
          }
          if (parsed.user) {
            setUser(parsed.user);
          }
        }
      } catch (loadError) {
        console.warn("Failed to load credentials", loadError);
      } finally {
        setIsLoading(false);
      }
    };

    loadStoredCredentials();
  }, []);

  const api = useMemo(() => createApiClient(serverUrl), [serverUrl]);

  const persistCredentials = useCallback(
    async (nextServerUrl, nextAccessToken, nextRefreshToken, nextUser) => {
      try {
        if (!isValidServerUrl(nextServerUrl)) {
          throw new Error(`Invalid server URL: ${nextServerUrl ?? "<empty>"}`);
        }
        await SecureStore.setItemAsync(
          STORAGE_KEY,
          JSON.stringify({
            serverUrl: nextServerUrl,
            accessToken: nextAccessToken,
            refreshToken: nextRefreshToken,
            user: nextUser
          })
        );
      } catch (persistError) {
        console.warn("Failed to persist credentials", persistError);
      }
    },
    []
  );

  const ensureDeviceId = useCallback(async () => {
    if (deviceId) {
      return deviceId;
    }
    let storedDeviceId = await SecureStore.getItemAsync(DEVICE_STORAGE_KEY);
    if (!storedDeviceId) {
      storedDeviceId = generateDeviceId();
      await SecureStore.setItemAsync(DEVICE_STORAGE_KEY, storedDeviceId);
    }
    setDeviceId(storedDeviceId);
    return storedDeviceId;
  }, [deviceId]);

  const login = useCallback(
    async ({ url, username, password }) => {
      setError(null);
      const targetUrl = url || serverUrl;
      if (!isValidServerUrl(targetUrl)) {
        const sanitized = targetUrl ?? "<empty>";
        const errorMessage = `Invalid server URL: ${sanitized}. Please enter an http(s) URL to the backend API.`;
        setError(errorMessage);
        throw new Error(errorMessage);
      }
      const client = createApiClient(targetUrl);
      const activeDeviceId = await ensureDeviceId();
      try {
        const response = await client.login({ username, password, deviceId: activeDeviceId });
        console.log("AuthContext.login response", response);
        const { accessToken, refreshToken: nextRefreshToken, user: nextUser } = extractAuthResponse(response);
        if (!accessToken) {
          console.warn("Login response missing access token", response);
          throw new Error("Missing access token in login response.");
        }
        setServerUrl(targetUrl);
        setToken(accessToken);
        setRefreshToken(nextRefreshToken);
        setUser(nextUser ?? response?.user ?? null);
        await persistCredentials(targetUrl, accessToken, nextRefreshToken, nextUser ?? response?.user ?? null);
        return response;
      } catch (loginError) {
        console.error("AuthContext.login failed", loginError);
        const message = loginError?.message || "Unable to sign in.";
        setError(message);
        throw loginError;
      }
    },
    [ensureDeviceId, persistCredentials, serverUrl]
  );

  const logout = useCallback(async () => {
    setToken(null);
    setRefreshToken(null);
    setUser(null);
    setError(null);
    try {
      await SecureStore.deleteItemAsync(STORAGE_KEY);
    } catch (logoutError) {
      console.warn("Failed to clear credentials", logoutError);
    }
  }, []);

  const value = useMemo(
    () => ({
      api,
      serverUrl,
      setServerUrl,
      token,
      refreshToken,
      user,
      isLoading,
      error,
      deviceId,
      setError,
      clearError: () => setError(null),
      login,
      logout,
      setServerUrl,
      setToken
    }),
    [api, serverUrl, token, refreshToken, user, isLoading, error, deviceId, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};
