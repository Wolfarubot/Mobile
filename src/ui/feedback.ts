/**
 * Settings → Submit Feedback: a player's message, sent to a Google Form so every report lands as a row in the
 * Form's Google Sheet (with when it came in). The Form has three "Paragraph" questions: the kind of feedback, the
 * message, and the game details (version, device, progress). Fill in FEEDBACK_FORM with the Form's id and its
 * questions' entry ids to switch it on; until then Send says feedback isn't connected yet.
 */

export const FEEDBACK_KINDS = ['bug', 'qol', 'request', 'other'] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export const FEEDBACK_MAX = 2000;
/** Seconds between two messages from one player. */
export const FEEDBACK_GAP = 30;

/** The Google Form: its id (from its "/d/e/<id>/viewform" link) and each question's "entry.<n>" field name. */
const FEEDBACK_FORM = {
  id: '1FAIpQLSckZbpsFor7JiDy7B5ZbXbtX-J5poq4pNn0oDAnwX0yvyNDUQ',
  kind: 'entry.217714408',
  message: 'entry.220799006',
  details: 'entry.689421967',
};

export const feedbackReady = (): boolean => !!(FEEDBACK_FORM.id && FEEDBACK_FORM.kind && FEEDBACK_FORM.message && FEEDBACK_FORM.details);

let lastSent = 0;

/** Seconds until another message can go (0: now). */
export function feedbackWait(now = Date.now()): number {
  return Math.max(0, Math.ceil(FEEDBACK_GAP - (now - lastSent) / 1000));
}

/**
 * Sends a message. Resolves once it's away; rejects with 'unavailable' (not connected yet), 'wait' (sent one moments
 * ago) or 'network' (no connection). Google Forms doesn't answer cross-site requests, so a request that goes out is
 * taken as delivered.
 */
export async function sendFeedback(kind: FeedbackKind, message: string, details: string): Promise<void> {
  if (!feedbackReady()) throw new Error('unavailable');
  if (feedbackWait() > 0) throw new Error('wait');
  const body = new URLSearchParams({
    [FEEDBACK_FORM.kind]: kind,
    [FEEDBACK_FORM.message]: message.slice(0, FEEDBACK_MAX),
    [FEEDBACK_FORM.details]: details,
  });
  try {
    await fetch(`https://docs.google.com/forms/d/e/${FEEDBACK_FORM.id}/formResponse`, { method: 'POST', mode: 'no-cors', body });
  } catch {
    throw new Error('network');
  }
  lastSent = Date.now();
}
