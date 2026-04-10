<script lang="ts">
  import type { PageData } from './$types';
  import LoginModal from '$lib/components/organisms/LoginModal.svelte';
  
  export let data: PageData;
</script>

<LoginModal turnstileSiteKey={data.turnstileSiteKey} showSetupTokenField={data.requiresSetupToken} />
