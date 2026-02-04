import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";

dayjs.extend(customParseFormat);

const DISPLAY_FORMAT = "DD-MM-YYYY";
const STORAGE_FORMAT = "YYYY-MM-DD";

export const toDisplay = (value) => {
  if (!value) return "";
  const parsed = dayjs(value, [DISPLAY_FORMAT, STORAGE_FORMAT, dayjs.ISO_8601], true);
  return parsed.isValid() ? parsed.format(DISPLAY_FORMAT) : value;
};

export const normalizeDateInput = (value) => {
  const withDashes = value.replace(/[^0-9]/g, "");
  if (withDashes.length >= 8) {
    const day = withDashes.slice(0, 2);
    const month = withDashes.slice(2, 4);
    const year = withDashes.slice(4, 8);
    return `${day}-${month}-${year}`;
  }
  return value;
};

export const validateDisplayDate = (value) => {
  return dayjs(value, DISPLAY_FORMAT, true).isValid();
};
