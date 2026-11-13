import { escapeHtml, page } from '../http';

/**
 * The sign-in form the gateway renders itself: email, password, and two
 * hidden fields — where to return once signed in, and the token the cookie
 * set beside the form must match when it comes back. Inline-styled like
 * every page the gateway serves; a notice above the fields says why the
 * last attempt did not go through.
 */
interface LoginForm {
  returnTo: string;
  csrf: string;
  message?: string;
}

const FIELD =
  'display:block;width:100%;box-sizing:border-box;margin:.25rem 0 1rem;padding:.6rem .75rem;' +
  'border:1px solid #c7ccd1;border-radius:.375rem;font:inherit';
const LABEL = 'display:block;text-align:left;font-weight:500';
const BUTTON =
  'width:100%;padding:.7rem;border:0;border-radius:.375rem;background:#1f5eff;color:#fff;' +
  'font:inherit;font-weight:600;cursor:pointer';
const NOTICE =
  'margin:0 0 1rem;padding:.6rem .75rem;border-radius:.375rem;background:#fde8e8;' +
  'color:#8a1c1c;line-height:1.4';

export function loginPage({ returnTo, csrf, message }: LoginForm): string {
  const notice = message === undefined ? '' : `<p style="${NOTICE}">${escapeHtml(message)}</p>`;
  return page(
    'Sign in',
    [
      notice,
      '<form method="post" action="/auth/login">',
      `<input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}">`,
      `<input type="hidden" name="csrf" value="${escapeHtml(csrf)}">`,
      `<label style="${LABEL}">Email`,
      `<input style="${FIELD}" type="email" name="email" autocomplete="username" required autofocus>`,
      '</label>',
      `<label style="${LABEL}">Password`,
      `<input style="${FIELD}" type="password" name="password" autocomplete="current-password" required>`,
      '</label>',
      `<button style="${BUTTON}" type="submit">Sign in</button>`,
      '</form>',
    ].join(''),
  );
}
