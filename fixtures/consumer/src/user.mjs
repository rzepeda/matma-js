import { validateEmail } from './validator.mjs';

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

export function createUser(email) {
  const normalized = normalizeEmail(email);
  if (!validateEmail(normalized)) throw new Error('Invalid email');
  return { email: normalized };
}

export async function loadUser(id) {
  const response = await fetch(`/api/users/${id}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.json();
}
