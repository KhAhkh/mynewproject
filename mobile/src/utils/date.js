export const toStorageDate = (date = new Date()) => {
  const target = date instanceof Date ? date : new Date(date);
  const day = String(target.getDate()).padStart(2, "0");
  const month = String(target.getMonth() + 1).padStart(2, "0");
  const year = target.getFullYear();
  return `${day}-${month}-${year}`;
};
