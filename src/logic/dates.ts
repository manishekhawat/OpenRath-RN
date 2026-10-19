/**
 * The month and weekday names the screens write dates with, in the short and long forms the
 * Android app's SimpleDateFormat patterns ("EEE d MMM", "EEEE", "MMMM") produced. They are kept
 * here so every screen writes a date the same way; English is what the code passes to t(), which
 * gives back the owner's language.
 */

/** "Jan"…"Dec" (MMM). */
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "January"…"December" (MMMM). */
export const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "Sun"…"Sat" (EEE), Sunday first, as Date.getDay() numbers them. */
export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Sunday"…"Saturday" (EEEE). */
export const DAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
