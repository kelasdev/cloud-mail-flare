import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
    return {
        turnstileSiteKey: platform?.env?.TURNSTILE_SITE_KEY || '1x00000000000000000000AA'
    };
};
