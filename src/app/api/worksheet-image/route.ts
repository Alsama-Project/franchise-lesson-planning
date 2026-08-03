// GET /api/worksheet-image?storage_path=… — resolve a worksheet image to a
// short-lived signed URL and redirect to it.
//
// URL generation runs SERVER-SIDE through the auth'd, RLS-scoped client — never the
// service-role key and never client-side. The `storage_path` is NOT trusted from
// the query: it is looked up in worksheet_image (the whitelist of real, generated
// images), so an arbitrary path can never be signed. A path with no row, or one
// whose row is blocked (blocked_at set), 404s. Mirrors the posture of
// /api/resources/[id]/file. Re-signs every request; caches nothing.

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STORAGE_BUCKET = 'resources';
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export async function GET(request: NextRequest) {
  const storagePath = request.nextUrl.searchParams.get('storage_path');
  if (!storagePath) {
    return new NextResponse('Missing storage_path.', { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse('Not authenticated.', { status: 401 });

  // Whitelist: only a path recorded as a worksheet_image may be signed.
  const { data: row } = await supabase
    .from('worksheet_image')
    .select('storage_path, blocked_at')
    .eq('storage_path', storagePath)
    .maybeSingle();

  const image = row as { storage_path: string; blocked_at: string | null } | null;
  if (!image) return new NextResponse('Image not found.', { status: 404 });
  if (image.blocked_at) return new NextResponse('Image not available.', { status: 404 });

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(image.storage_path, SIGNED_URL_TTL_SECONDS);

  if (error || !data) {
    return new NextResponse('Could not generate a link for this image.', { status: 502 });
  }

  // no-store: the redirect target is a short-lived signed URL. A cached 302 would
  // keep sending the browser to a URL that has since expired — the exact failure
  // this re-signing route exists to prevent.
  const redirect = NextResponse.redirect(data.signedUrl);
  redirect.headers.set('Cache-Control', 'no-store');
  return redirect;
}
