// The background trip task: nothing defines or runs it in a browser.
export function defineTask() {}
export async function isTaskRegisteredAsync() {
  return false;
}
export async function unregisterAllTasksAsync() {}
