import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getUserByIdFromDb, softDeleteUserInDb, updateUserInDb } from '$lib/server/db';
import { generateSecurePassword, hashPassword } from '$lib/server/security';

export const GET: RequestHandler = async ({ platform, params }) => {
  const user = await getUserByIdFromDb(platform?.env?.DB, params.userId);
  if (!user) {
    return json({ error: 'User not found' }, { status: 404 });
  }

  return json({ user });
};

export const PATCH: RequestHandler = async ({ platform, params, request, locals }) => {
  if (!locals.authenticated) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return json({ error: 'Expected JSON body' }, { status: 400 });
  }

  const body = (await request.json()) as { email?: string; displayName?: string; password?: string; resetPassword?: boolean };
  const resetPassword = body.resetPassword === true;
  const email = body.email?.trim().toLowerCase();
  const displayName = body.displayName?.trim();
  const password = body.password;

  if (resetPassword) {
    try {
      const generatedPassword = generateSecurePassword(18);
      const passwordHash = await hashPassword(generatedPassword);
      const user = await updateUserInDb(platform?.env?.DB, params.userId, { passwordHash });
      if (!user) {
        return json({ error: 'User not found' }, { status: 404 });
      }

      return json({ ok: true, user, password: generatedPassword });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('DB binding is required')) {
        return json({ error: 'Database is not configured' }, { status: 503 });
      }

      return json({ error: 'Failed to reset password' }, { status: 500 });
    }
  }

  if (email === undefined && displayName === undefined && password === undefined) {
    return json({ error: 'No fields to update' }, { status: 400 });
  }
  if (email !== undefined && !email) {
    return json({ error: 'email cannot be empty' }, { status: 400 });
  }
  if (displayName !== undefined && !displayName) {
    return json({ error: 'displayName cannot be empty' }, { status: 400 });
  }
  if (email && email.length > 254) {
    return json({ error: 'email is too long' }, { status: 400 });
  }
  if (displayName && displayName.length > 120) {
    return json({ error: 'displayName is too long' }, { status: 400 });
  }
  if (password !== undefined && (password.length < 8 || password.length > 128)) {
    return json({ error: 'password must be 8-128 characters' }, { status: 400 });
  }

  if (email) {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
      return json({ error: 'Invalid email format' }, { status: 400 });
    }
  }

  try {
    const passwordHash = password ? await hashPassword(password) : undefined;
    const user = await updateUserInDb(platform?.env?.DB, params.userId, { email, displayName, passwordHash });
    if (!user) {
      return json({ error: 'User not found' }, { status: 404 });
    }

    return json({ ok: true, user });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes('unique') || message.toLowerCase().includes('users.email')) {
      return json({ error: 'Email already exists' }, { status: 409 });
    }
    if (message.includes('DB binding is required')) {
      return json({ error: 'Database is not configured' }, { status: 503 });
    }

    return json({ error: 'Failed to update user' }, { status: 500 });
  }
};

export const DELETE: RequestHandler = async ({ platform, params, request, locals }) => {
  if (!locals.authenticated) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (locals.sessionUserId && locals.sessionUserId === params.userId) {
    return json({ error: 'Cannot delete current active user' }, { status: 400 });
  }

  const confirmation = request.headers.get('x-mailflare-confirm');
  if (confirmation !== 'soft-delete-user' && confirmation !== 'delete-user') {
    return json({ error: 'Missing delete confirmation header' }, { status: 400 });
  }

  try {
    const result = await softDeleteUserInDb(platform?.env?.DB, params.userId);
    if (!result.deleted && result.reason === 'not_found') {
      return json({ error: 'User not found' }, { status: 404 });
    }
    if (!result.deleted && result.reason === 'protected_owner') {
      return json({ error: 'Owner account cannot be soft deleted' }, { status: 400 });
    }
    if (!result.deleted && result.reason === 'already_deleted') {
      return json({ ok: true, alreadyDeleted: true });
    }

    return json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('DB binding is required')) {
      return json({ error: 'Database is not configured' }, { status: 503 });
    }

    return json({ error: 'Failed to soft delete user' }, { status: 500 });
  }
};
