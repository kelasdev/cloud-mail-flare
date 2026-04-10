<script lang="ts">
  import type { PageData } from './$types';
  import AccessCodeModal from '$lib/components/organisms/AccessCodeModal.svelte';

  export let data: PageData;
</script>

<AccessCodeModal turnstileSiteKey={data.turnstileSiteKey} />
