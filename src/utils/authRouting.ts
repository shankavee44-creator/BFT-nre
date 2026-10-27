/**
 * Binary Funded Trader (BFT) Route Protection & Navigation Guard Engine
 */

export const PUBLIC_ROUTES = ['home', 'rules', 'faq'] as const;
export type PublicRoute = (typeof PUBLIC_ROUTES)[number];

export const PROTECTED_ROUTES = ['terminal', 'dashboard', 'affiliate', 'withdrawals'] as const;
export type ProtectedRoute = (typeof PROTECTED_ROUTES)[number];

export type AppRoute = PublicRoute | ProtectedRoute | string;

/**
 * Checks if a given route requires authentication
 */
export function isRouteProtected(route: string): boolean {
  return (PROTECTED_ROUTES as readonly string[]).includes(route);
}

/**
 * Validates whether the current user state can access a target route
 */
export function canAccessRoute(route: string, isLoggedIn: boolean): boolean {
  if (!isRouteProtected(route)) {
    return true;
  }
  return isLoggedIn === true;
}

/**
 * Resolves the destination route based on current authentication state
 */
export function resolveTargetRoute(requestedRoute: string, isLoggedIn: boolean): {
  allowed: boolean;
  destinationRoute: string;
  shouldPromptAuth: boolean;
  promptMode: 'login' | 'register';
  securityNotice?: string;
} {
  if (!isRouteProtected(requestedRoute)) {
    return {
      allowed: true,
      destinationRoute: requestedRoute,
      shouldPromptAuth: false,
      promptMode: 'login',
    };
  }

  if (isLoggedIn) {
    return {
      allowed: true,
      destinationRoute: requestedRoute,
      shouldPromptAuth: false,
      promptMode: 'login',
    };
  }

  // Route is protected and user is unauthenticated
  const routeNames: Record<string, string> = {
    terminal: 'Live OTC Trading Terminal',
    dashboard: 'Trader Hub & KYC Portal',
    affiliate: 'Affiliate Commission Dashboard',
    withdrawals: 'Withdrawal & Payout Portal',
  };

  const featureName = routeNames[requestedRoute] || 'Trader Area';

  return {
    allowed: false,
    destinationRoute: 'home',
    shouldPromptAuth: true,
    promptMode: 'login',
    securityNotice: `Authentication Required: Please sign in or register a BFT trader account to access the ${featureName}.`,
  };
}

/**
 * Evaluates session token validity
 */
export function validateSessionToken(token: string | null | undefined): boolean {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(atob(parts[1]));
    if (!payload.sub || !payload.exp) return false;
    const nowSeconds = Math.floor(Date.now() / 1000);
    return payload.exp > nowSeconds;
  } catch {
    return false;
  }
}
