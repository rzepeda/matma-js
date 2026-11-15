export function validateEmail(email) {
  return typeof email === 'string' && email.includes('@');
}
export function unrelated(value) {
  return value * 2;
}
