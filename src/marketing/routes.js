export const marketingPaths=['/','/features','/pricing','/about','/contact','/faq','/privacy','/terms','/refunds','/blog'];
export function marketingRoute(path){const normalized=path.replace(/^\/hi(?=\/|$)/,'')||'/';return marketingPaths.includes(normalized)||/^\/blog\/[a-z0-9-]+$/.test(normalized);}
