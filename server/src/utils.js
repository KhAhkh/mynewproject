import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat.js";

dayjs.extend(customParseFormat);

const DISPLAY_FORMAT = "DD-MM-YYYY";
const STORAGE_FORMAT = "YYYY-MM-DD";

export const toStorageDate = (displayDate) => {
  if (!displayDate) return null;
  const parsedDisplay = dayjs(displayDate, DISPLAY_FORMAT, true);
  if (parsedDisplay.isValid()) {
    return parsedDisplay.format(STORAGE_FORMAT);
  }
  const parsedStorage = dayjs(displayDate, STORAGE_FORMAT, true);
  if (parsedStorage.isValid()) {
    return parsedStorage.format(STORAGE_FORMAT);
  }
  return null;
};

export const toDisplayDate = (storageDate) => {
  if (!storageDate) return null;
  const parsed = dayjs(storageDate, STORAGE_FORMAT, true);
  if (parsed.isValid()) return parsed.format(DISPLAY_FORMAT);
  const fallback = dayjs(storageDate);
  return fallback.isValid() ? fallback.format(DISPLAY_FORMAT) : storageDate;
};

export const nowIso = () => new Date().toISOString();

export const formatInvoiceNumber = (prefix, currentNumeric, width = 6) => {
  const number = parseInt(currentNumeric || "0", 10) + 1;
  const padded = number.toString().padStart(width, "0");
  return prefix ? `${prefix}${padded}` : padded;
};
