import axios from "axios";
import { useAuthStore } from "../store/auth.js";

export const api = axios.create({
  baseURL: "/api"
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error?.response?.data?.message || error.message;
    if (message) {
      error.message = message;
    }
    if (error?.response) {
      error.status = error.response.status;
      error.data = error.response.data;
    }
    return Promise.reject(error);
  }
);
