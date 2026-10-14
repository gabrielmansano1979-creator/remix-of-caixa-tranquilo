/**
 * Feedback collection is temporarily disabled until its backing table and RLS
 * policies are provisioned in the live Supabase project. Keeping this component
 * inert avoids presenting a form that cannot save its responses.
 */
export function FeedbackPrompt(_props: { createdAt?: string | null }) {
  return null;
}
