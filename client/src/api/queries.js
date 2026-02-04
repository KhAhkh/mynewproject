import { api } from "./client";

export const fetcher = async ({ queryKey }) => {
  const [key, params] = queryKey;
  const response = await api.get(key, { params });
  return response.data;
};

export const createMutation = (url, method = "post") => async (payload) => {
  const response = await api[method](url, payload);
  return response.data;
};

export const fetchCompanyDirectory = async (search = "") => {
  try {
    const response = await api.get("/companies", {
      params: {
        search: search || undefined,
        limit: 50,
        offset: 0,
      },
    });
    const data = Array.isArray(response.data) ? response.data : [];
    return data.map((company) => ({
      value: company.code,
      label: `${company.code} - ${company.name}`,
      code: company.code,
      name: company.name,
    }));
  } catch (error) {
    console.error("Error fetching companies:", error);
    return [];
  }
};

export const fetchCompanyStatementReport = async (companyCode, startDate, endDate) => {
  const response = await api.get("/reports/sales/company-statement", {
    params: { companyCode, startDate, endDate },
  });
  return response.data;
};
