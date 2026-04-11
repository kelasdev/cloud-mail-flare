import type { RequestEvent } from '@sveltejs/kit';
import type { EmailDetailDto, EmailDto, UserDto } from '$lib/types/dto';
import {
  getEmailByIdFromDb,
  getUserArchivedEmailCountFromDb,
  getUserByIdFromDb,
  getUserInboxFromDb,
  getUsersFromDb
} from '$lib/server/db';

export async function getUsers(event: RequestEvent): Promise<UserDto[]> {
  return getUsersFromDb(event.platform?.env?.DB);
}

export async function getUserInbox(event: RequestEvent, userId: string): Promise<EmailDto[]> {
  return getUserInboxFromDb(event.platform?.env?.DB, userId);
}

export async function getUserArchivedEmailCount(event: RequestEvent, userId: string): Promise<number> {
  return getUserArchivedEmailCountFromDb(event.platform?.env?.DB, userId);
}

export async function getUserById(event: RequestEvent, userId: string): Promise<UserDto | null> {
  return getUserByIdFromDb(event.platform?.env?.DB, userId);
}

export async function getUserEmailById(
  event: RequestEvent,
  userId: string,
  emailId: string
): Promise<EmailDetailDto | null> {
  return getEmailByIdFromDb(event.platform?.env?.DB, userId, emailId);
}
