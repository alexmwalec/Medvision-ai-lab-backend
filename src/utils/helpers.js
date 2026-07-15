export const formatDate = (date) => {
  if (!date) return null;
  const d = new Date(date);
  return d.toISOString().split("T")[0];
};

export const generateId = () => {
  return crypto.randomUUID();
};

export const successResponse = (data, message = "Success") => ({
  success: true,
  message,
  data,
});

export const errorResponse = (message, status = 400) => ({
  success: false,
  error: message,
  status,
});