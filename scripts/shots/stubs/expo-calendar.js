// The unit's calendar, for the calendar box.
const denied = { status: 'undetermined', granted: false, canAskAgain: true };
export async function getCalendarPermissions() {
  return denied;
}
export async function requestCalendarPermissions() {
  return denied;
}
export async function getCalendars() {
  return [];
}
export async function listEvents() {
  return [];
}
export const EntityTypes = { EVENT: 'event', REMINDER: 'reminder' };
