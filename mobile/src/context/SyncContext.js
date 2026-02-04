import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import * as Network from "expo-network";
import * as Location from "expo-location";
import { useAuth } from "./AuthContext";
import { toStorageDate } from "../utils/date";

const QUEUE_KEY = "inventoryMobile:queue";
const BUNDLE_KEY = "inventoryMobile:bundle";

const SyncContext = createContext(null);

const generateReference = () => {
  if (typeof Crypto.randomUUID === "function") {
    return Crypto.randomUUID();
  }
  const random = Crypto.getRandomValues(new Uint8Array(16));
  return Array.from(random, (value) => value.toString(16).padStart(2, "0")).join("");
};

export const SyncProvider = ({ children }) => {
  const { api, token } = useAuth();
  const [queue, setQueue] = useState([]);
  const [bundle, setBundle] = useState(null);
  const [syncStatus, setSyncStatus] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [isOnline, setIsOnline] = useState(true);
  const [syncError, setSyncError] = useState(null);
  const pendingFlush = useRef(false);
  const attemptedInitialFetch = useRef(false);

  useEffect(() => {
    if (!token) {
      setBundle(null);
      setSyncStatus([]);
      setLastSyncAt(null);
      setSyncError(null);
      attemptedInitialFetch.current = false;
    } else {
      attemptedInitialFetch.current = false;
    }
  }, [token]);

  useEffect(() => {
    const loadQueue = async () => {
      try {
        const stored = await AsyncStorage.getItem(QUEUE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          console.log("[Queue] Loaded", parsed.length, "items from storage");
          setQueue(parsed);
        } else {
          console.log("[Queue] No items in storage, starting empty");
          setQueue([]);
        }
      } catch (error) {
        console.warn("Failed to load offline queue", error);
        setQueue([]);
      }
    };

    const loadBundle = async () => {
      try {
        const stored = await AsyncStorage.getItem(BUNDLE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          setBundle(parsed);
          if (parsed?.syncStatus) {
            setSyncStatus(parsed.syncStatus);
          }
          if (parsed?.datasetVersion) {
            setLastSyncAt(parsed.datasetVersion);
          }
        }
      } catch (error) {
        console.warn("Failed to load cached dataset", error);
      }
    };

    loadQueue();
    loadBundle();
  }, []);
  // Track queue changes
  useEffect(() => {
    console.log("[Queue] State updated, now contains", queue?.length || 0, "items");
  }, [queue]);
  useEffect(() => {
    let subscription;
    let cancelled = false;

    const subscribe = async () => {
      try {
        const status = await Network.getNetworkStateAsync();
        if (!cancelled) {
          setIsOnline(Boolean(status?.isInternetReachable));
        }
      } catch (error) {
        console.warn("Failed to detect network state", error);
      }

      subscription = Network.addNetworkStateListener((state) => {
        setIsOnline(Boolean(state?.isInternetReachable));
      });
    };

    subscribe();

    return () => {
      cancelled = true;
      subscription?.remove?.();
    };
  }, []);

  const persistQueue = useCallback(async (nextQueue) => {
    try {
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(nextQueue));
    } catch (error) {
      console.warn("Failed to persist queue", error);
    }
  }, []);

  const persistBundle = useCallback(async (nextBundle) => {
    try {
      await AsyncStorage.setItem(BUNDLE_KEY, JSON.stringify(nextBundle));
    } catch (error) {
      console.warn("Failed to persist bundle", error);
    }
  }, []);

  const captureLocation = useCallback(async () => {
    try {
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        throw new Error("Turn on location services to submit entries.");
      }

      const existingPermission = await Location.getForegroundPermissionsAsync();
      let granted = existingPermission?.status === Location.PermissionStatus.GRANTED;
      if (!granted) {
        const requested = await Location.requestForegroundPermissionsAsync();
        granted = requested?.status === Location.PermissionStatus.GRANTED;
      }
      if (!granted) {
        throw new Error("Location permission is required to submit orders and recoveries.");
      }

      let position = null;
      try {
        position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Highest,
          mayShowUserSettingsDialog: true,
          timeout: 10000,
          maximumAge: 5000
        });
      } catch (error) {
        console.warn("Live GPS lookup failed, falling back to last known position", error);
      }

      if (!position) {
        position = await Location.getLastKnownPositionAsync();
      }

      if (!position?.coords) {
        throw new Error("Unable to capture your current location. Move to an open area and try again.");
      }

      const { latitude, longitude, accuracy } = position.coords;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        throw new Error("Received invalid coordinates from the location provider.");
      }

      const timestamp = position.timestamp
        ? new Date(position.timestamp).toISOString()
        : new Date().toISOString();

      return {
        latitude: Number(latitude),
        longitude: Number(longitude),
        accuracy: Number.isFinite(accuracy) ? Number(accuracy) : null,
        timestamp
      };
    } catch (error) {
      console.warn("Failed to capture location", error);
      throw error instanceof Error
        ? error
        : new Error("Unable to capture location. Check permissions and try again.");
    }
  }, []);

  const refreshBundle = useCallback(async () => {
    if (!token) {
      throw new Error("Authentication required");
    }
    try {
      const data = await api.fetchBundle(token);
      const nextBundle = { ...data, syncStatus: data?.syncStatus ?? [] };
      setBundle(nextBundle);
      setSyncStatus(nextBundle.syncStatus);
      setLastSyncAt(nextBundle.datasetVersion ?? new Date().toISOString());
      setSyncError(null);
      await persistBundle(nextBundle);
      return nextBundle;
    } catch (error) {
      setSyncError(error?.message || "Unable to refresh sync data.");
      throw error;
    }
  }, [api, persistBundle, token]);

  const enqueue = useCallback(
    async (type, payload) => {
      const location = await captureLocation();
      const entry = {
        reference: generateReference(),
        type,
        payload,
        createdAt: new Date().toISOString(),
        location: location || null
      };
      const nextQueue = [...queue, entry];
      console.log("Enqueuing entry:", entry);
      console.log("New queue:", nextQueue);
      setQueue(nextQueue);
      await persistQueue(nextQueue);
      return entry;
    },
    [captureLocation, persistQueue, queue]
  );

  const removeFromQueue = useCallback(
    async (reference) => {
      const nextQueue = queue.filter((entry) => entry.reference !== reference);
      console.log("[Queue] Removing entry:", reference);
      setQueue(nextQueue);
      await persistQueue(nextQueue);
    },
    [persistQueue, queue]
  );

  const queueOrder = useCallback(
    ({ customerCode, items, remarks, date }) => {
      if (!customerCode) {
        throw new Error("Customer is required");
      }
      if (!Array.isArray(items) || items.length === 0) {
        throw new Error("Add at least one item");
      }
      const normalizedItems = items.map((item) => ({
        itemCode: item.itemCode,
        quantity: Number(item.quantity || 0),
        bonus: Number(item.bonus || 0),
        notes: item.notes || ""
      }));
      return enqueue("order", {
        customerCode,
        items: normalizedItems,
        remarks: remarks || "",
        date: date || toStorageDate(new Date())
      });
    },
    [enqueue]
  );

  const queueRecovery = useCallback(
    ({ customerCode, amount, paymentMode = "cash", details, bankCode, slipNo, slipDate, attachmentImage }) => {
      if (!customerCode) {
        throw new Error("Customer is required");
      }
      const numericAmount = Number(amount);
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        throw new Error("Amount must be greater than zero");
      }
      return enqueue("recovery", {
        customerCode,
        amount: numericAmount,
        paymentMode,
        receiptDate: slipDate ? slipDate : toStorageDate(new Date()),
        details: details || "",
        bankCode: bankCode || null,
        slipNo: slipNo || null,
        slipDate: slipDate || null,
        attachmentImage: attachmentImage || null
      });
    },
    [enqueue]
  );

  const flushQueue = useCallback(async () => {
    if (!token) {
      throw new Error("Authentication required");
    }
    if (queue.length === 0) {
      return { orders: [], recoveries: [] };
    }

    if (pendingFlush.current) {
      return null;
    }

    pendingFlush.current = true;
    setSyncing(true);

    try {
      const orders = queue
        .filter((entry) => entry.type === "order")
        .map((entry) => ({
          clientReference: entry.reference,
          payload: entry.payload,
          submittedAt: entry.createdAt,
          location: entry.location || null
        }));

      const recoveries = queue
        .filter((entry) => entry.type === "recovery")
        .map((entry) => ({
          clientReference: entry.reference,
          payload: entry.payload,
          submittedAt: entry.createdAt,
          location: entry.location || null
        }));

      const response = await api.uploadSync(token, { orders, recoveries });
      const successful = new Set();

      const isAcknowledged = (status) =>
        status === "success" || status === "duplicate" || status === "pending";

      for (const item of response.orders ?? []) {
        if (isAcknowledged(item.status)) {
          successful.add(item.reference);
        }
      }
      for (const item of response.recoveries ?? []) {
        if (isAcknowledged(item.status)) {
          successful.add(item.reference);
        }
      }

      const nextQueue = queue.filter((entry) => !successful.has(entry.reference));
      setQueue(nextQueue);
      await persistQueue(nextQueue);

      if (bundle) {
        let updatedBundle = bundle;
        if (Array.isArray(response.updatedBalances) && response.updatedBalances.length > 0) {
          const overrides = new Map(
            response.updatedBalances.map((item) => [item.customerCode, Number(item.outstanding || 0)])
          );
          const nextCustomers = (bundle.customers || []).map((customer) => {
            if (!overrides.has(customer.code)) return customer;
            const raw = overrides.get(customer.code);
            const normalized = typeof raw === "number" ? Number(raw.toFixed(2)) : Number(raw || 0);
            return {
              ...customer,
              outstanding: normalized
            };
          });
          updatedBundle = { ...bundle, customers: nextCustomers };
        }
        if (response.syncStatus) {
          updatedBundle = { ...updatedBundle, syncStatus: response.syncStatus };
        }
        setBundle(updatedBundle);
        await persistBundle(updatedBundle);
      }

      if (response.syncStatus) {
        setSyncStatus(response.syncStatus);
      }
      if (response.datasetVersion) {
        setLastSyncAt(response.datasetVersion);
      }
      setSyncError(null);

      return response;
    } finally {
      pendingFlush.current = false;
      setSyncing(false);
    }
  }, [api, bundle, persistBundle, persistQueue, queue, token]);

  useEffect(() => {
    if (isOnline && token && queue.length > 0 && !syncing) {
      flushQueue().catch((error) => console.warn("Automatic sync failed", error));
    }
  }, [flushQueue, isOnline, queue.length, syncing, token]);

  useEffect(() => {
    if (!token || syncing || !isOnline) {
      return;
    }
    if (bundle || attemptedInitialFetch.current) {
      return;
    }
    attemptedInitialFetch.current = true;
    refreshBundle().catch((error) => {
      console.warn("Initial bundle fetch failed", error);
      attemptedInitialFetch.current = false;
    });
  }, [bundle, isOnline, refreshBundle, syncing, token]);

  const value = useMemo(
    () => ({
      bundle,
      queue,
      syncStatus,
      syncing,
      lastSyncAt,
      isOnline,
      syncError,
      refreshBundle,
      queueOrder,
      queueRecovery,
      flushQueue,
      removeFromQueue
    }),
    [bundle, flushQueue, isOnline, lastSyncAt, queue, queueOrder, queueRecovery, removeFromQueue, syncError, syncStatus, syncing]
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
};

export const useSync = () => {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error("useSync must be used within SyncProvider");
  }
  return context;
};
