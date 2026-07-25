function validateAnalyzeRequest(body, file) {
  const errors = [];

  if (!file) errors.push('Image file is required');
  if (!body.name || !body.name.trim()) errors.push('Patient name is required');
  if (!body.age || isNaN(Number(body.age))) errors.push('Valid age is required');
  if (!body.gender) errors.push('Gender is required');
  if (!body.date) errors.push('Scan date is required');

  return errors;
}

module.exports = { validateAnalyzeRequest };
