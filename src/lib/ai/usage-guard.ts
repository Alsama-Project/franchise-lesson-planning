import 'server-only';
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { dailyLimit, inputSize, MAX_AI_INPUT_CHARS, type AiFeature } from './ai-limits';

/**
 * Call just before an AI route calls a model. Returns a response to send back when the
 * request is refused (input too large → 413, daily allowance used → 429), or null to
 * go ahead. The allowance is taken (one use recorded) only when it returns null.
 * `inputs` are the request values that end up in the prompt.
 */
export async function guardAiRequest(
  supabase: SupabaseClient,
  feature: AiFeature,
  inputs: unknown[],
): Promise<NextResponse | null> {
  if (inputSize(inputs) > MAX_AI_INPUT_CHARS) {
    return NextResponse.json(
      { error: 'This request is too long for the AI. Shorten the text and try again.', code: 'ai_input_too_long' },
      { status: 413 },
    );
  }
  const { data: ok, error } = await supabase.rpc('take_ai_quota', {
    p_feature: feature,
    p_daily_limit: dailyLimit(feature),
  });
  if (error || ok !== true) {
    return NextResponse.json(
      { error: 'You have reached today’s limit for this AI feature. You can use it again tomorrow.', code: 'ai_daily_limit' },
      { status: 429 },
    );
  }
  return null;
}
