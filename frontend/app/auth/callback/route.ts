import { NextResponse } from 'next/server'
// The client you created from the Server-Side Auth instructions
import { createClient } from '@/lib/supabase/server'

/**
 * Sanitize the `next` redirect parameter to prevent open redirect attacks.
 * Accepts only relative paths starting with `/` — rejects protocol-relative
 * (`//evil.com`) and absolute URLs (`https://evil.com`).
 */
function sanitizeRedirectPath(next: string | null): string {
    const fallback = '/app'
    if (!next) return fallback
    if (!next.startsWith('/') || next.startsWith('//')) return fallback
    if (next.includes('://')) return fallback
    try {
        const url = new URL(next, 'http://localhost')
        if (url.hostname !== 'localhost') return fallback
        return url.pathname + url.search + url.hash
    } catch {
        return fallback
    }
}

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    // Sanitize `next` to prevent open redirect via protocol-relative or absolute URLs
    const next = sanitizeRedirectPath(searchParams.get('next'))

    if (code) {
        const supabase = await createClient()
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error) {
            const forwardedHost = request.headers.get('x-forwarded-host') // original origin before load balancer
            const isLocalEnv = process.env.NODE_ENV === 'development'
            if (isLocalEnv) {
                // we can be sure that there is no load balancer in between, so no need to watch for X-Forwarded-Host
                return NextResponse.redirect(`${origin}${next}`)
            } else if (forwardedHost) {
                return NextResponse.redirect(`https://${forwardedHost}${next}`)
            } else {
                return NextResponse.redirect(`${origin}${next}`)
            }
        }
    }

    // return the user to an error page with instructions
    return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}
